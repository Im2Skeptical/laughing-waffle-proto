#include "sim/vassal/detail.hpp"
#include "sim/settlement/site_access.hpp"

#include <numeric>

namespace waffle::sim::vassal::detail {
namespace {

using browser::LifeMapGraph;
using Node = browser::LifeMapGraphNode;
using Edge = browser::LifeMapEdge;
using Config = browser::LifeMapGeneratorConfig;

constexpr std::array families{"patronage"sv, "development"sv, "crossroads"sv, "practiceReform"sv,
    "publicWorks"sv, "crisis"sv, "relic"sv, "specialRelic"sv, "training"sv, "discovery"sv,
    "campaign"sv, "challenge"sv, "neutralMarket"sv, "classMarket"sv, "foodShop"sv, "housingShop"sv, "stockShop"sv};
using Rules = browser::LifeMapDesignNodes;
constexpr std::array rules{&Rules::patronage, &Rules::development, &Rules::crossroads, &Rules::practiceReform,
    &Rules::publicWorks, &Rules::crisis, &Rules::relic, &Rules::specialRelic, &Rules::training, &Rules::discovery,
    &Rules::campaign, &Rules::challenge, &Rules::neutralMarket, &Rules::classMarket, &Rules::foodShop,
    &Rules::housingShop, &Rules::stockShop};

template<class Range, class T>
bool contains(const Range& range, const T& value)
{
    return std::ranges::find(range, value) != std::ranges::end(range);
}

std::string pad(int value)
{
    return (value < 10 ? "0" : "") + std::to_string(value);
}

std::string node_id(int depth, int lane)
{
    return "life-d" + pad(depth + 1) + "-r" + pad(lane + 1);
}

std::string band(const Config& config, double depth)
{
    if (depth < config.earlyDepthCount) return "early";
    return depth < config.earlyDepthCount + config.midDepthCount ? "mid" : "late";
}

struct RouteEdge {
    int depth, from, to;
    bool operator==(const RouteEdge&) const = default;
};

double graph_roll(std::uint32_t& seed) { return core::rng_next_seed_float(seed); }

std::size_t graph_pick(std::uint32_t& seed, std::size_t count)
{
    return static_cast<std::size_t>(graph_roll(seed) * static_cast<double>(count));
}

bool draw_routes(LifeMapGraph& graph, std::uint32_t& seed)
{
    const auto& config = graph.generatorConfig;
    const int lanes = static_cast<int>(config.laneCount);
    const int depths = static_cast<int>(config.normalDepthCount);
    if (lanes < 2 || depths < 2) return false;
    std::vector<std::vector<int>> routes;
    std::vector<RouteEdge> edges;
    const auto find_path = [&](int start, int end, bool randomized) {
        std::vector<int> path{start};
        const auto visit = [&](auto&& self, int depth, int lane) -> bool {
            if (depth == depths - 1) return lane == end;
            std::vector<int> options;
            for (int to = lane - 1; to <= lane + 1; ++to) {
                if (to < 0 || to >= lanes || std::abs(end - to) > depths - depth - 2) continue;
                const bool crossing = std::ranges::any_of(edges, [&](RouteEdge edge) {
                    return edge.depth == depth && ((edge.from < lane && edge.to > to) ||
                        (edge.from > lane && edge.to < to));
                });
                if (!crossing) options.push_back(to);
            }
            if (randomized)
                for (auto size = options.size(); size > 1; --size)
                    std::swap(options[size - 1], options[graph_pick(seed, size)]);
            for (int to : options) {
                path.push_back(to);
                if (self(self, depth + 1, to)) return true;
                path.pop_back();
            }
            return false;
        };
        if (!visit(visit, 0, start) || contains(routes, path)) path.clear();
        return path;
    };
    for (int index = 0; index < config.routeCount; ++index) {
        std::vector<int> starts;
        for (int lane = 0; lane < lanes; ++lane)
            if (index != 1 || lane != routes.front().front()) starts.push_back(lane);
        std::vector<int> path;
        for (int attempt = 0; attempt < 96 && path.empty(); ++attempt) {
            const auto start = starts[graph_pick(seed, starts.size())];
            const auto end = static_cast<int>(graph_pick(seed, lanes));
            path = find_path(start, end, true);
        }
        for (int start : starts) {
            for (int end = 0; end < lanes && path.empty(); ++end) path = find_path(start, end, false);
            if (!path.empty()) break;
        }
        if (path.empty()) return false;
        for (int depth = 0; depth < depths - 1; ++depth) {
            const RouteEdge edge{depth, path[depth], path[depth + 1]};
            if (!contains(edges, edge)) edges.push_back(edge);
        }
        routes.push_back(std::move(path));
    }
    for (int depth = 0; depth < depths; ++depth) {
        for (int lane = 0; lane < lanes; ++lane) {
            if (std::ranges::any_of(routes, [&](const auto& path) { return path[depth] == lane; }))
                graph.nodes.push_back({.id = node_id(depth, lane), .depth = double(depth),
                    .lane = double(lane), .band = band(config, depth)});
        }
    }
    for (auto edge : edges)
        graph.edges.push_back({node_id(edge.depth, edge.from), node_id(edge.depth + 1, edge.to)});
    return !graph.nodes.empty();
}

bool scope_matches(std::string_view scope, std::string_view classId)
{
    return scope == "common" || scope == (classId.empty() ? "unclassed" : classId) ||
        (scope == "specialist" && !classId.empty());
}

bool stage_matches(std::string_view stage, bool founder)
{
    return stage == "any" || (stage == "firstLife" && founder) || (stage == "successor" && !founder);
}

void apply_columns(LifeMapGraph& graph, std::string_view id, std::string_view identity, bool founder)
{
    const auto& config = graph.generatorConfig;
    const auto& design = config.design;
    auto columns = design.enabled ? design.columns : decltype(design.columns){};
    const auto& founding = design.bookends.founding;
    const auto priority = design.enabled ? std::min<std::size_t>(founding.priority, columns.size()) : 0;
    columns.insert(columns.begin() + priority,
        {"founding", "Founding", !design.enabled || founding.enabled, design.enabled ? founding.depth : 0,
            "", "", "specialist", "firstLife"});
    std::vector<double> used;
    const auto replace_depth = [&](Node node) {
        browser::StringArray removed;
        for (const auto& existing : graph.nodes)
            if (existing.depth == node.depth) removed.push_back(existing.id);
        std::erase_if(graph.nodes, [&](const Node& existing) { return contains(removed, existing.id); });
        std::erase_if(graph.edges, [&](const Edge& edge) {
            return contains(removed, edge.fromNodeId) || contains(removed, edge.toNodeId);
        });
        for (const auto& parent : graph.nodes)
            if (parent.depth == node.depth - 1) graph.edges.push_back({parent.id, node.id});
        for (const auto& child : graph.nodes)
            if (child.depth == node.depth + 1) graph.edges.push_back({node.id, child.id});
        graph.nodes.push_back(std::move(node));
    };
    for (const auto& column : columns) {
        if (!column.enabled || !scope_matches(column.scope, identity) ||
            !stage_matches(column.lifeStage, founder) || contains(used, column.depth)) continue;
        used.push_back(column.depth);
        const double depth = column.depth - 1;
        Node node{.depth = depth, .lane = std::floor((config.laneCount - 1) / 2), .band = band(config, depth)};
        if (column.id == "founding") {
            node.id = std::string(id) + "-founding";
            node.bookend = node.generationRuleId = "founding";
            node.band = "founding";
            node.family = identity == "scholar" ? "philosopherFounding" : "warlordFounding";
            graph.foundingNodeId = node.id;
        } else {
            node.id = "life-milestone-" + column.id;
            node.milestoneId = column.id;
        }
        replace_depth(std::move(node));
    }
    if (!design.enabled || design.bookends.legacy.enabled) {
        const auto* fixed = design.enabled ? std::get_if<double>(&design.bookends.legacy.depth) : nullptr;
        const int depth = fixed ? static_cast<int>(*fixed) - 1 : static_cast<int>(config.normalDepthCount);
        graph.bossNodeId = "life-d" + pad(depth + 1) + "-boss";
        replace_depth({.id = graph.bossNodeId, .depth = double(depth), .lane = std::floor((config.laneCount - 1) / 2),
            .band = "legacy", .family = "legacy", .generationRuleId = "legacy", .bookend = "legacy"});
    }
    std::ranges::sort(graph.nodes, [](const Node& a, const Node& b) {
        return std::tie(a.depth, a.lane) < std::tie(b.depth, b.lane);
    });
}

struct StockOutputs {
    browser::StringArray classed, common, unmet;
};

void collect_outputs(browser::StringArray& outputs, const browser::PracticeDefinition& def)
{
    if (def.stockCapacity <= 0) return;
    if (std::ranges::none_of(def.effects, [](const auto& effect) {
        const auto* output = std::get_if<browser::PracticeEffectgenerateStock>(&effect);
        if (!output) return false;
        const auto s = output->seasonAmounts.value_or(browser::SeasonAmounts{});
        return output->amount > 0 || s.spring.value_or(0) > 0 || s.summer.value_or(0) > 0 ||
            s.autumn.value_or(0) > 0 || s.winter.value_or(0) > 0;
    })) return;
    for (const auto& trait : def.stockTraits)
        if (!contains(outputs, trait)) outputs.push_back(trait);
}

StockOutputs stock_outputs(const RuntimeState& state, std::string_view identity)
{
    StockOutputs outputs;
    browser::StringArray available, supplied;
    const auto& cards = state.content->config.gamepieces;
    const auto unlocked = research_unlock(state);
    for (const auto& [id, def] : cards.practices) {
        const auto pool = practice_pool(state, def);
        if (def.locked.value_or(false) || contains(fullMapSeedCardIds, id) ||
            (state.hot.rulesetId && !full_map_offer(id, def.fullMapOffer.value_or(false))) || (pool != "common" && pool != identity)) continue;
        collect_outputs(available, def);
        if (quality_index(def.minimumQuality) <= unlocked) {
            collect_outputs(outputs.classed, def);
            if (pool == "common") collect_outputs(outputs.common, def);
        }
    }
    std::vector<const browser::ConstructionConsume*> inputs;
    bool populated = false;
    for (auto siteId : player_sites(state)) {
        const auto& site = settlement::site_at(state, siteId);
        const auto& populations = settlement::population_totals(state, siteId).byResidency;
        populated |= populations[0].total() > 0 || populations[1].total() > 0;
        for (auto index : site.detailedState.practiceSlots.slots) {
            if (!index) continue;
            const auto id = state.name(state.tables.at(index).practiceId);
            const auto def = std::ranges::find(cards.practices, id, &browser::GamepiecesPractices::value_type::first);
            if (def == cards.practices.end()) continue;
            collect_outputs(supplied, def->second);
            inputs.push_back(&def->second.consume);
            inputs.push_back(&def->second.require);
        }
        for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins)) {
            if (!cell.construction) continue;
            const auto id = state.name(cell.structureId);
            const auto def = std::ranges::find(cards.structures, id, &browser::GamepiecesStructures::value_type::first);
            if (def != cards.structures.end()) inputs.push_back(&def->second.construction.consume);
        }
    }
    const auto require = [&](const std::string& trait) {
        if (contains(available, trait) && !contains(outputs.unmet, trait)) outputs.unmet.push_back(trait);
    };
    for (const auto* recipes : inputs) {
        for (const auto& input : *recipes) {
            if (input.amount <= 0 || std::ranges::any_of(input.traits, [&](const auto& trait) { return contains(supplied, trait); }))
                continue;
            for (const auto& trait : input.traits) require(trait);
        }
    }
    if (populated && !contains(supplied, "Edible")) require("Edible");
    std::ranges::sort(outputs.classed);
    std::ranges::sort(outputs.common);
    std::ranges::sort(outputs.unmet);
    return outputs;
}

std::string_view node_type(const Node& node)
{
    return node.family == "relic" && node.specialRelic.value_or(false) ? "specialRelic"sv : node.family;
}

const browser::LifeMapNodeRule* rule_for(const Rules& entries, std::string_view id)
{
    const auto index = std::ranges::find(families, id);
    if (index != families.end()) return &(entries.*rules[index - families.begin()]);
    if (id == "legacy") return &entries.legacy;
    if (id == "signature:legacyPlus") return &entries.signature_legacyPlus;
    if (id == "signature:monsterHunt") return &entries.signature_monsterHunt;
    if (id == "signature:removePractice") return &entries.signature_removePractice;
    if (id == "signature:foodShop") return &entries.signature_foodShop;
    if (id == "signature:knowledgeShop") return &entries.signature_knowledgeShop;
    if (id == "signature:housingShop") return &entries.signature_housingShop;
    return nullptr;
}

template<class Range, class Weight>
auto weighted(const Range& entries, std::uint32_t& seed, Weight weight)
{
    double total = 0;
    for (const auto& entry : entries) total += weight(entry);
    auto draw = graph_roll(seed) * total;
    for (const auto& entry : entries) {
        draw -= weight(entry);
        if (draw < 0) return entry;
    }
    return entries.back();
}

bool roll_legacy_families(LifeMapGraph& graph, std::uint32_t& seed)
{
    using Weights = browser::NodeFamilyWeights;
    constexpr std::array members{&Weights::patronage, &Weights::development, &Weights::crossroads,
        &Weights::practiceReform, &Weights::publicWorks, &Weights::crisis, &Weights::relic, &Weights::specialRelic,
        &Weights::training, &Weights::discovery, &Weights::campaign, &Weights::challenge, &Weights::neutralMarket,
        &Weights::classMarket, &Weights::foodShop, &Weights::housingShop};
    const auto& config = graph.generatorConfig;
    auto& nodes = graph.nodes;
    std::size_t entries = 0;
    for (auto& node : nodes) {
        std::vector<std::string_view> excluded;
        for (const auto& edge : graph.edges) {
            if (edge.toNodeId != node.id) continue;
            const auto parent = std::ranges::find(nodes, edge.fromNodeId, &Node::id);
            const auto family = node_type(*parent);
            if (contains(config.nonRepeatFamilyIds, family)) excluded.push_back(family);
        }
        if (node.depth == 0) {
            if (entries == 1) excluded.push_back(node_type(nodes.front()));
            ++entries;
        }
        const auto& weights = node.band == "early" ? config.weights.early : node.band == "mid" ? config.weights.mid : config.weights.late;
        const auto weight = [&](std::size_t i) { return weights.*members[i]; };
        std::vector<std::size_t> eligible;
        for (std::size_t i = 0; i < members.size(); ++i)
            if (weight(i) > 0 && !contains(excluded, families[i])) eligible.push_back(i);
        if (eligible.empty()) return false;
        const auto family = families[weighted(eligible, seed, weight)];
        node.family = family == "specialRelic" ? "relic" : family;
        if (node.family == "relic") node.specialRelic = family == "specialRelic";
    }
    return true;
}

void place_legacy_rooms(LifeMapGraph& graph, std::uint32_t& seed, const browser::Candidate& candidate,
                        const StockOutputs& output, std::string_view identity)
{
    auto& nodes = graph.nodes;
    if (const auto& signature = candidate.signatureNode) {
        if (signature->variantId == "legacyPlus") {
            const auto boss = std::ranges::find(nodes, graph.bossNodeId, &Node::id);
            if (boss != nodes.end()) boss->signatureNode = signature;
        } else if (std::ranges::find(signatureDefs, signature->variantId, &SignatureDef::id) != std::end(signatureDefs)) {
            std::vector<Node*> eligible;
            for (auto& node : nodes)
                if (node.band == "mid" && node.family != "legacy") eligible.push_back(&node);
            if (!eligible.empty()) {
                auto& node = *eligible[graph_pick(seed, eligible.size())];
                node.family = "signature";
                node.signatureNode = signature;
            }
        }
    }
    const bool founder = candidate.founderClassId.has_value();
    const auto founding = graph.foundingNodeId ? std::ranges::find(nodes, *graph.foundingNodeId, &Node::id) : nodes.end();
    const auto after_founding = [&](const Node& node) { return founding != nodes.end() && node.depth >= founding->depth; };
    const bool eligibleClassRooms = founding != nodes.end() && std::ranges::any_of(nodes, [&](const auto& node) {
        return after_founding(node) && !node.bookend && !node.signatureNode && node.family != "legacy";
    });
    const auto can_use_output = [&](std::string_view trait) {
        return !founder || contains(output.common, trait) || eligibleClassRooms;
    };
    auto pool = output.classed;
    std::erase_if(pool, [&](const auto& trait) { return !can_use_output(trait); });
    browser::StringArray chosen;
    while (!pool.empty() && chosen.size() < 2) {
        const auto picked = pool.begin() + graph_pick(seed, pool.size());
        chosen.push_back(*picked);
        pool.erase(picked);
    }
    auto unmet = output.unmet;
    std::erase_if(unmet, [&](const auto& trait) { return !can_use_output(trait); });
    if (!unmet.empty() && std::ranges::none_of(chosen, [&](const auto& trait) { return contains(unmet, trait); }))
        chosen.insert(chosen.begin(), unmet[graph_pick(seed, unmet.size())]);
    const auto is_tagged = [](const Node& node) { return node.family == "foodShop" || node.family == "housingShop"; };
    const auto can_replace = [](const Node& node) {
        return node.depth > 0 && !node.bookend && !node.signatureNode && node.family != "legacy" && node.family != "signature";
    };
    std::vector<Node*> targets;
    for (auto& node : nodes)
        if (can_replace(node) && !is_tagged(node)) targets.push_back(&node);
    if (targets.size() < chosen.size()) for (auto& node : nodes)
        if (can_replace(node) && is_tagged(node)) targets.push_back(&node);
    for (const auto& trait : chosen) {
        std::vector<Node*> eligible;
        for (auto* node : targets)
            if (!founder || after_founding(*node) || contains(output.common, trait)) eligible.push_back(node);
        if (eligible.empty()) continue;
        auto* node = eligible[graph_pick(seed, eligible.size())];
        std::erase(targets, node);
        node->family = "stockShop";
        node->stockOutput = trait;
    }

    std::vector<Node*> ordinary;
    for (auto& node : nodes) {
        if (node.signatureNode || node.bookend || node.family == "legacy" || node.family == "signature") continue;
        ordinary.push_back(&node);
        if (node.family == "classMarket" && identity.empty()) node.family = "neutralMarket";
        if ((node.family == "training" && identity.empty()) || (node.family == "discovery" && identity != "scholar") ||
            ((node.family == "campaign" || node.family == "challenge") && identity != "warrior")) node.family = "development";
    }
    if (identity.empty() || ordinary.empty()) return;
    if (candidate.classId) ordinary.front()->family = "training";
    auto remaining = identity == "warrior" ? 1 : 2;
    for (auto* node : std::span(ordinary).subspan(1)) {
        if (remaining == 0) break;
        if (node->family != "patronage" && node->family != "development") continue;
        node->family = identity == "scholar" ? "discovery" : "campaign";
        --remaining;
    }
}

bool populate(LifeMapGraph& graph, std::uint32_t& seed, const browser::Candidate& candidate, const StockOutputs& outputs,
              std::string_view identity)
{
    const auto& config = graph.generatorConfig;
    const auto& design = config.design;
    auto& nodes = graph.nodes;
    const auto& edges = graph.edges;
    const bool founder = candidate.founderClassId.has_value();
    const auto index = [&](std::string_view id) {
        return static_cast<std::size_t>(std::ranges::find(nodes, id, &Node::id) - nodes.begin());
    };
    const auto founding = graph.foundingNodeId ? &nodes[index(*graph.foundingNodeId)] : nullptr;
    const auto activeClass = founder && !founding ? ""sv : identity;
    const auto class_at = [&](const Node& node) {
        return founder && (!founding || node.depth < founding->depth) ? ""sv : identity;
    };
    const auto outputs_at = [&](const Node& node) -> const browser::StringArray& {
        return class_at(node).empty() ? outputs.common : outputs.classed;
    };
    const auto enabled = [&](std::string_view id, std::string_view classId, std::string_view timing = {}) {
        const auto* rule = rule_for(design.nodes, id);
        return rule && rule->enabled && scope_matches(rule->scope, classId) &&
            (id != "signature:legacyPlus" || design.bookends.legacy.enabled) &&
            (timing.empty() || contains(rule->timings, timing));
    };
    const auto pool_for = [&](const Node& node) -> std::string_view {
        const auto* rule = node.signatureNode ? rule_for(design.nodes, "signature:" + node.signatureNode->variantId)
                                             : rule_for(design.nodes, node_type(node));
        return rule ? rule->poolId : ""sv;
    };
    std::vector<std::vector<std::size_t>> parents(nodes.size()), children(nodes.size());
    for (const auto& edge : edges) {
        const auto from = index(edge.fromNodeId), to = index(edge.toNodeId);
        parents[to].push_back(from);
        children[from].push_back(to);
    }
    const auto targets = [&](std::string_view type, std::string_view id) {
        std::vector<std::string_view> result;
        if (type == "node") result.push_back(id);
        else for (auto family : families)
            if (rule_for(design.nodes, family)->poolId == id) result.push_back(family);
        return result;
    };
    const auto eligibility = [&](const Node& node, const auto& ids, bool milestone = false) {
        std::vector<std::string_view> result;
        const auto n = index(node.id);
        for (auto id : ids) {
            const auto* rule = rule_for(design.nodes, id);
            if (!rule || (!milestone && rule->milestonesOnly) || !enabled(id, class_at(node), node.band) ||
                (id == "stockShop" && outputs_at(node).empty())) continue;
            const auto family_matches = [&](auto i) { return node_type(nodes[i]) == id; };
            if (contains(config.nonRepeatFamilyIds, id) && (std::ranges::any_of(parents[n], family_matches) ||
                std::ranges::any_of(children[n], family_matches))) continue;
            result.push_back(id);
        }
        return result;
    };
    const auto occurrence = [&](std::string_view id) {
        return id == "rare" ? design.occurrence.rare : id == "uncommon" ? design.occurrence.uncommon : design.occurrence.common;
    };
    const auto choose = [&](const Node& node, const auto& ids, bool milestone = false) -> std::string_view {
        const auto candidates = eligibility(node, ids, milestone);
        if (candidates.empty()) return {};
        const auto run_length = [&](auto&& self, std::size_t i, std::string_view pool) -> int {
            if (pool_for(nodes[i]) != pool) return 0;
            int length = 0;
            for (auto parent : parents[i]) length = std::max(length, self(self, parent, pool));
            return length + 1;
        };
        std::vector<const browser::LifeMapDesignPoolsEntry*> pools, spaced;
        for (const auto& pool : design.pools) {
            if (std::ranges::none_of(candidates, [&](auto id) { return rule_for(design.nodes, id)->poolId == pool.id; }))
                continue;
            pools.push_back(&pool);
            if (std::ranges::all_of(parents[index(node.id)], [&](auto i) {
                return run_length(run_length, i, pool.id) < pool.maxConsecutive;
            })) spaced.push_back(&pool);
        }
        if (pools.empty()) return {};
        const auto* pool = weighted(spaced.empty() ? pools : spaced, seed, [&](auto* row) { return occurrence(row->occurrence); });
        auto choices = candidates;
        std::erase_if(choices, [&](auto id) { return rule_for(design.nodes, id)->poolId != pool->id; });
        return weighted(choices, seed, [&](auto id) { return occurrence(rule_for(design.nodes, id)->occurrence); });
    };
    const auto assign = [&](Node& node, std::string_view family) {
        node.family = family == "specialRelic" ? "relic" : family;
        if (family == "stockShop") {
            const auto& stock = outputs_at(node);
            node.stockOutput = stock[graph_pick(seed, stock.size())];
        }
        if (node.family == "relic") node.specialRelic = family == "specialRelic";
    };
    for (auto& node : nodes) {
        if (!node.milestoneId) continue;
        const auto& column = *std::ranges::find(design.columns, *node.milestoneId, &browser::LifeMapDesignColumnsEntry::id);
        const auto family = choose(node, targets(column.targetType, column.targetId), true);
        if (family.empty()) return false;
        assign(node, family);
        node.generationRuleId = "milestone:" + column.id;
    }
    if (const auto& signature = candidate.signatureNode; signature && enabled("signature:" + signature->variantId, activeClass)) {
        if (signature->variantId == "legacyPlus") {
            const auto node = std::ranges::find(nodes, "legacy", &Node::family);
            if (node != nodes.end()) node->signatureNode = signature;
        } else {
            std::vector<Node*> candidates, mid;
            for (auto& node : nodes) {
                if (!node.family.empty() || !enabled("signature:" + signature->variantId, class_at(node), node.band)) continue;
                candidates.push_back(&node);
                if (node.band == "mid") mid.push_back(&node);
            }
            auto& choices = mid.empty() ? candidates : mid;
            if (choices.empty()) return false;
            auto& node = *choices[graph_pick(seed, choices.size())];
            node.family = "signature";
            node.signatureNode = signature;
            node.generationRuleId = "signature";
        }
    }
    auto guarantees = design.guarantees;
    std::ranges::stable_sort(guarantees, {}, [](const auto& g) { return g.maxDepth - g.minDepth; });
    for (const auto& g : guarantees) {
        if (!scope_matches(g.scope, activeClass) || !stage_matches(g.lifeStage.value_or("any"), founder)) continue;
        const auto matches = [&](const Node& node) {
            return node.depth >= g.minDepth - 1 && node.depth <= g.maxDepth - 1 &&
                (g.targetType == "node" ? node_type(node) : pool_for(node)) == g.targetId;
        };
        const auto ids = targets(g.targetType, g.targetId);
        for (std::size_t attempt = 0; attempt < nodes.size(); ++attempt) {
            std::vector<std::size_t> path;
            int count = 0;
            if (g.coverage == "map") {
                count = static_cast<int>(std::ranges::count_if(nodes, matches));
                path.resize(nodes.size());
                std::iota(path.begin(), path.end(), 0);
            } else {
                const auto none = nodes.size();
                std::vector<int> scores(nodes.size());
                std::vector<std::size_t> previous(nodes.size(), none);
                std::size_t terminal = none;
                for (std::size_t i = 0; i < nodes.size(); ++i) {
                    for (auto p : parents[i])
                        if (previous[i] == none || scores[p] < scores[previous[i]]) previous[i] = p;
                    scores[i] = matches(nodes[i]) + (previous[i] == none ? 0 : scores[previous[i]]);
                    if (children[i].empty() && (terminal == none || scores[i] < scores[terminal])) terminal = i;
                }
                count = scores[terminal];
                for (auto i = terminal; i != none; i = previous[i]) path.push_back(i);
                std::ranges::reverse(path);
            }
            if (count >= g.count) break;
            std::erase_if(path, [&](auto i) {
                const auto& node = nodes[i];
                return !node.family.empty() || node.depth < g.minDepth - 1 || node.depth > g.maxDepth - 1 ||
                    eligibility(node, ids).empty();
            });
            if (path.empty()) return false;
            auto& node = nodes[path[graph_pick(seed, path.size())]];
            assign(node, choose(node, ids));
            node.generationRuleId = g.id;
        }
    }
    const auto& supply = design.stockSupply;
    if (supply.enabled && enabled("stockShop", identity)) {
        const auto in_range = [&](const Node& node) { return node.depth >= supply.minDepth - 1 && node.depth <= supply.maxDepth - 1; };
        browser::StringArray chosen, available;
        for (const auto& node : nodes) {
            if (in_range(node) && node.stockOutput && !contains(chosen, *node.stockOutput)) chosen.push_back(*node.stockOutput);
        }
        for (const auto& output : outputs.classed)
            if (std::ranges::any_of(nodes, [&](const Node& node) {
                return in_range(node) && contains(outputs_at(node), output);
            })) available.push_back(output);
        const auto occupied = chosen.size();
        auto pool = available;
        std::erase_if(pool, [&](const auto& output) { return contains(chosen, output); });
        const auto take = [&seed, &chosen](auto& choices) {
            const auto i = choices.begin() + graph_pick(seed, choices.size());
            chosen.push_back(*i);
            choices.erase(i);
        };
        while (chosen.size() < supply.randomCount && !pool.empty()) take(pool);
        auto unmet = outputs.unmet;
        std::erase_if(unmet, [&](const auto& output) { return !contains(available, output) || contains(chosen, output); });
        auto needed = supply.unmetCount - std::ranges::count_if(chosen, [&](const auto& output) {
            return contains(outputs.unmet, output);
        });
        while (needed-- > 0 && !unmet.empty()) take(unmet);
        for (std::size_t i = occupied; i < chosen.size(); ++i) {
            std::vector<Node*> candidates, spaced;
            for (auto& node : nodes) {
                if (!node.family.empty() || !in_range(node) || !contains(outputs_at(node), chosen[i]) ||
                    eligibility(node, std::array{"stockShop"sv}).empty()) continue;
                candidates.push_back(&node);
                if (std::ranges::none_of(nodes, [&](const Node& other) {
                    return other.family == "stockShop" && std::abs(other.depth - node.depth) < 2;
                })) spaced.push_back(&node);
            }
            auto& usable = spaced.empty() ? candidates : spaced;
            if (usable.empty()) return false;
            auto& node = *usable[graph_pick(seed, usable.size())];
            assign(node, "stockShop");
            node.generationRuleId = "stockSupply";
            node.stockOutput = chosen[i];
        }
    }
    for (auto& node : nodes) {
        if (!node.family.empty()) continue;
        const auto family = choose(node, families);
        if (family.empty()) return false;
        assign(node, family);
    }
    return true;
}

void dedupe(LifeMapGraph& graph)
{
    auto& nodes = graph.nodes;
    auto& edges = graph.edges;
    const auto index = [&](std::string_view id) {
        return static_cast<std::size_t>(std::ranges::find(nodes, id, &Node::id) - nodes.begin());
    };
    std::vector<std::string> signatures(nodes.size());
    for (std::size_t i = nodes.size(); i > 0; --i) {
        const auto& node = nodes[i - 1];
        std::vector<std::string_view> unique;
        std::erase_if(edges, [&](const Edge& edge) {
            if (edge.fromNodeId != node.id) return false;
            const auto& signature = signatures[index(edge.toNodeId)];
            if (contains(unique, signature)) return true;
            unique.push_back(signature);
            return false;
        });
        std::ranges::sort(unique);
        auto signature = node.family + ":" + (node.specialRelic.value_or(false) ? "true" : "false") + ":" +
            node.stockOutput.value_or("") + ":" + (node.signatureNode ? node.signatureNode->variantId : "") +
            ":" + (node.generationRuleId ? node.id : "") + "[";
        for (auto child : unique) {
            signature += child;
            signature += '|';
        }
        signatures[i - 1] = signature + ']';
    }
    std::vector<std::string_view> entries;
    for (std::size_t i = 0; i < nodes.size() && nodes[i].depth == nodes.front().depth; ++i) {
        if (contains(entries, signatures[i])) continue;
        entries.push_back(signatures[i]);
        graph.entryNodeIds.push_back(nodes[i].id);
    }
    auto reachable = graph.entryNodeIds;
    for (std::size_t i = 0; i < reachable.size(); ++i)
        for (const auto& edge : edges)
            if (edge.fromNodeId == reachable[i] && !contains(reachable, edge.toNodeId)) reachable.push_back(edge.toNodeId);
    std::erase_if(nodes, [&](const Node& node) { return !contains(reachable, node.id); });
    std::erase_if(edges, [&](const Edge& edge) { return !contains(reachable, edge.fromNodeId) || !contains(reachable, edge.toNodeId); });
}

void layout(LifeMapGraph& graph)
{
    const auto& config = graph.generatorConfig;
    auto& nodes = graph.nodes;
    const auto index = [&](std::string_view id) {
        return static_cast<std::size_t>(std::ranges::find(nodes, id, &Node::id) - nodes.begin());
    };
    std::vector<double> base, y;
    std::vector<std::vector<std::size_t>> parents(nodes.size()), children(nodes.size());
    for (const auto& edge : graph.edges) {
        const auto from = index(edge.fromNodeId), to = index(edge.toNodeId);
        parents[to].push_back(from);
        children[from].push_back(to);
    }
    for (const auto& node : nodes)
        base.push_back(node.bookend || node.milestoneId ? .5 : .08 + .84 * node.lane / (config.laneCount - 1));
    y = base;
    const auto smooth = [&](double depth, const auto& links, bool forward) {
        std::vector<std::size_t> row;
        for (std::size_t i = 0; i < nodes.size(); ++i) {
            if (nodes[i].depth != depth) continue;
            row.push_back(i);
            if (links[i].empty()) continue;
            double sum = 0;
            for (auto neighbor : links[i]) sum += y[neighbor];
            y[i] = (1 - config.layoutSmoothing) * (forward ? base[i] : y[i]) +
                config.layoutSmoothing * (sum / links[i].size());
        }
        if (row.empty()) return;
        for (std::size_t i = 1; i < row.size(); ++i)
            y[row[i]] = std::max(y[row[i]], y[row[i - 1]] + config.minimumNodeGap);
        if (y[row.back()] > .92) {
            const auto shift = y[row.back()] - .92;
            for (auto i : row) y[i] -= shift;
        }
        for (auto i = row.size() - 1; i > 0; --i)
            y[row[i - 1]] = std::min(y[row[i - 1]], y[row[i]] - config.minimumNodeGap);
        if (y[row.front()] < .08) {
            const auto shift = .08 - y[row.front()];
            for (auto i : row) y[i] += shift;
        }
    };
    const auto min = nodes.front().depth, max = nodes.back().depth;
    for (auto depth = min + 1; depth <= max; ++depth) smooth(depth, parents, true);
    for (auto depth = max - 1; depth >= min; --depth) smooth(depth, children, false);
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        auto& node = nodes[i];
        node.position.x = core::js::round(((node.depth - min) / (max - min)) * 1000000) / 1000000;
        node.position.y = node.bookend || node.milestoneId ? .5 : core::js::round(y[i] * 1000000) / 1000000;
    }
    std::ranges::sort(graph.edges, [](const Edge& a, const Edge& b) {
        return std::tie(a.fromNodeId, a.toNodeId) < std::tie(b.fromNodeId, b.toNodeId);
    });
}

}

std::optional<LifeMapGraph> action_graph(const RuntimeState& state, const browser::Candidate& candidate,
                                        std::string_view id, std::uint32_t& seed)
{
    const auto& config = state.content->config.lifeMapGenerator;
    const auto identity = candidate.founderClassId.value_or(!candidate.classId ? "" :
        *candidate.classId == browser::SpecialistClass::scholar ? "scholar" : "warrior");
    LifeMapGraph graph{.schemaVersion = 9, .graphId = std::string(id) + "-life-map",
        .generationSeed = core::js::floor(seed), .generatorConfig = config,
        .generationContext = {identity.empty() ? std::nullopt : std::optional(identity), candidate.founderClassId}};
    if (!draw_routes(graph, seed)) return std::nullopt;
    if (!config.design.enabled && !roll_legacy_families(graph, seed)) return std::nullopt;
    apply_columns(graph, id, identity, candidate.founderClassId.has_value());
    const auto output = stock_outputs(state, identity);
    if (config.design.enabled && !populate(graph, seed, candidate, output, identity)) return std::nullopt;
    dedupe(graph);
    if (!config.design.enabled) place_legacy_rooms(graph, seed, candidate, output, identity);
    for (auto& node : graph.nodes) if (node.family != "relic") node.specialRelic.reset();
    layout(graph);
    return graph;
}

}
