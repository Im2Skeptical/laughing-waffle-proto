#include "sim/vassal/detail.hpp"

#include "sim/territory/detail.hpp"

namespace waffle::sim::vassal::detail {
namespace {

bool active_scholar(const Vassal& actor)
{
    return class_name(actor) == "scholar" && !actor.isDead && !actor.endedReason;
}

const ActiveCommission* active_goal(const Vassal& actor)
{
    return actor.commission.has_key() && actor.commission.value() ? &*actor.commission.value() : nullptr;
}

bool stat_increased(const RuntimeState& state, const Vassal& actor, const ActiveCommission& goal)
{
    if (!goal.statId || !goal.startingStat) return false;
    const auto stat = std::ranges::find(statIds, state.name(*goal.statId));
    return stat != statIds.end() && whole(actor.stats.*statMembers[stat - statIds.begin()]) > *goal.startingStat;
}

struct Parameter {
    std::string_view id, label;
    RegionId region{};
};

struct OfferContext {
    std::vector<Parameter> families, regions, practiceTags, structureTags;
};

template<class Cards>
std::vector<Parameter> available_tags(const RuntimeState& state, const Cards& cards, std::size_t unlocked)
{
    std::vector<Parameter> parameters;
    for (const auto& [id, def] : cards) {
        std::string_view pool = def.pool;
        std::string_view prototypeTag;
        if constexpr (std::is_same_v<Cards, browser::GamepiecesPractices>) {
            pool = practice_pool(state, def);
            prototypeTag = practice_prototype_tag(state, id);
        }
        if (def.locked.value_or(false) || (pool != "common" && pool != "scholar")
            || quality_index(def.minimumQuality) > unlocked) continue;
        for (const auto& tag : def.tags) parameters.push_back({tag, tag});
        if (!prototypeTag.empty()) parameters.push_back({prototypeTag, prototypeTag});
    }
    std::ranges::sort(parameters, {}, [](const auto& p) { return core::json::utf16_sort_key(p.id); });
    const auto duplicates = std::ranges::unique(parameters, {}, &Parameter::id);
    parameters.erase(duplicates.begin(), duplicates.end());
    return parameters;
}

OfferContext offer_context(const RuntimeState& state, const Vassal& actor)
{
    const auto& map = actor.lifeMap;
    const auto& graph = read(state, map.graph);
    const auto current = map.currentNodeId ? state.name(*map.currentNodeId) : ""sv;
    std::vector<std::string_view> reachable;
    if (!current.empty()) reachable.push_back(current);
    else for (const auto& id : read(state, map.availableNodeIds)) reachable.push_back(id);
    for (std::size_t i = 0; i < reachable.size(); ++i)
        for (const auto& edge : graph.edges)
            if (edge.fromNodeId == reachable[i] && std::ranges::find(reachable, edge.toNodeId) == reachable.end())
                reachable.push_back(edge.toNodeId);
    std::vector<std::string_view> completed;
    state.histories.at(map.completedNodeIds.row).for_each([&](const NodeId& id, const HistoryPayload&) {
        completed.push_back(state.name(id));
    });
    OfferContext context;
    for (const auto& family : nodeFamilyLabels) {
        const auto available = std::ranges::any_of(graph.nodes, [&](const auto& node) {
            return node.family == family.id && node.id != current
                && std::ranges::find(reachable, node.id) != reachable.end()
                && std::ranges::find(completed, node.id) == completed.end();
        });
        if (available) context.families.push_back({family.id, family.label});
    }
    std::ranges::sort(context.families, {}, &Parameter::id);
    if (std::ranges::find(context.families, "crossroads", &Parameter::id) != context.families.end()) {
        const auto origin = actor.locationRegionId;
        const auto neighbors = territory::neighbors(state, origin);
        const auto roads = territory::roads(state, origin);
        for (const auto id : settlement::detailed_sites(state)) {
            const auto region = settlement::site_at(state, id).regionId;
            if (std::ranges::find(neighbors, region) == neighbors.end()) continue;
            if (!state.hot.rulesetId && (territory::region_at(state, region).controller != state.practiceVocabulary.player
                || std::ranges::find(roads, region) == roads.end())) continue;
            context.regions.push_back({{}, state.topology->region_name(region), region});
        }
    }
    const auto& pieces = state.content->config.gamepieces;
    const auto unlocked = research_unlock(state);
    context.practiceTags = available_tags(state, pieces.practices, unlocked);
    context.structureTags = available_tags(state, pieces.structures, unlocked);
    return context;
}

std::span<const Parameter> parameters(const CommissionDef& def, const OfferContext& ctx)
{
    static constexpr Parameter empty[]{{}};
    static constexpr Parameter stats[]{
        {statIds[0], "Ingenuity"}, {statIds[1], "Wisdom"}, {statIds[2], "Effectiveness"}, {statIds[3], "Intelligence"},
    };
    if (def.parameter == "statId") return stats;
    if (def.parameter == "nodeFamily") return ctx.families;
    if (def.parameter == "regionId") return ctx.regions;
    if (def.parameter == "tag") return def.event == "practiceInstalled" ? ctx.practiceTags : ctx.structureTags;
    return empty;
}

std::string fill_parameter(std::string_view pattern, std::string_view label)
{
    const auto start = pattern.find('{');
    if (start == pattern.npos) return std::string(pattern);
    const auto end = pattern.find('}', start);
    return std::string(pattern.substr(0, start)) + std::string(label) + std::string(pattern.substr(end + 1));
}

CommissionOffer make_offer(RuntimeState& state, const Vassal& actor, const CommissionDef& def,
                           const Parameter& target)
{
    const auto round = decimal(actor.completedCommissions.value_or(0) + 1);
    const auto id = std::string(state.name(actor.vassalId)) + ":commission:" + round + ":" + std::string(def.id);
    CommissionOffer offer;
    offer.id = intern<SymbolId>(state, def.id);
    offer.difficulty = intern<SymbolId>(state, def.difficulty);
    offer.label = store<decltype(offer.label)>(state, fill_parameter(def.label, target.label));
    offer.description = store<decltype(offer.description)>(state, fill_parameter(def.description, target.label));
    offer.event = intern<SymbolId>(state, def.event);
    offer.prestige = def.prestige;
    offer.offerId = intern<SymbolId>(state, id);
    if (!def.parameter.empty()) offer.parameter = intern<SymbolId>(state, def.parameter);
    if (!def.minimumQuality.empty()) offer.minimumQuality = intern<SymbolId>(state, def.minimumQuality);
    if (def.amount) offer.amount = def.amount;
    if (def.parameter == "tag") offer.tag = intern<TagId>(state, target.id);
    if (def.parameter == "statId") {
        offer.statId = intern<SymbolId>(state, target.id);
        offer.statLabel = store<decltype(offer.statLabel)::value_type>(state, std::string(target.label));
    }
    if (def.parameter == "nodeFamily") {
        offer.nodeFamily = intern<SymbolId>(state, target.id);
        offer.nodeLabel = store<decltype(offer.nodeLabel)::value_type>(state, std::string(target.label));
    }
    if (def.parameter == "regionId") {
        offer.regionId = target.region;
        offer.locationLabel = store<decltype(offer.locationLabel)::value_type>(state, std::string(target.label));
    }
    return offer;
}

void post_income(RuntimeState& state, Vassal& actor, double income)
{
    if (state.hot.rulesetId) {
        *state.hot.civilization.prestige += income;
        state.hot.civilization.treasury->grossIncome += income;
    } else actor.prestige += income;
}

void finish_commission(RuntimeState& state, Vassal& actor, ActiveCommission goal)
{
    actor.commission = browser::OptionalNullable<ActiveCommission>{std::nullopt};
    post_income(state, actor, whole(goal.prestige));
    actor.completedCommissions = actor.completedCommissions.value_or(0) + 1;
    const auto history = actor.commissionHistory.value_or(Range<SymbolId>{});
    const auto retained = std::min<std::size_t>(11, history.size());
    auto& table = state.tables.table<SymbolId>();
    actor.commissionHistory = table.append(retained + 1, "Commission history");
    auto rows = state.tables.view(*actor.commissionHistory);
    std::ranges::copy(state.tables.view(history).last(retained), rows.begin());
    rows.back() = goal.id;
    add_event(state, actor, "commissionCompleted", std::string(state.name(goal.offerId)) + ":completed", {}, {}, {},
        read(state, goal.label) + ": +" + decimal(goal.prestige) + " Prestige");
    ensure_commission_offers(state, actor);
}

}

bool commission_due(const RuntimeState& state, const Vassal& actor)
{
    if (!active_scholar(actor)) return false;
    if (const auto* goal = active_goal(actor)) return stat_increased(state, actor, *goal);
    return !actor.commissionOffers || actor.commissionOffers->size() == 0;
}

void ensure_commission_offers(RuntimeState& state, Vassal& actor)
{
    if (!active_scholar(actor) || active_goal(actor) || (actor.commissionOffers && actor.commissionOffers->size() > 0)) return;
    const auto context = offer_context(state, actor);
    const auto recent = state.tables.view(actor.commissionHistory.value_or(Range<SymbolId>{}));
    struct Entry {
        const CommissionDef* def;
        std::span<const Parameter> targets;
        std::ptrdiff_t recency;
    };
    std::vector<Entry> pool;
    for (const auto& def : commissionDefs) {
        const auto targets = parameters(def, context);
        if (targets.empty()) continue;
        std::ptrdiff_t recency = -1;
        for (std::size_t i = 0; i < recent.size(); ++i)
            if (state.name(recent[i]) == def.id) recency = static_cast<std::ptrdiff_t>(i);
        pool.push_back({&def, targets, recency});
    }
    shuffle(state, pool);
    std::ranges::stable_sort(pool, {}, &Entry::recency);
    const auto count = std::min<std::size_t>(3, pool.size());
    actor.commissionOffers = state.tables.table<CommissionOffer>().append(count, "Commission offers");
    auto offers = state.tables.view(*actor.commissionOffers);
    for (std::size_t i = 0; i < count; ++i) {
        const auto& entry = pool[i];
        const auto target = entry.targets.size() == 1 ? 0 : pick(state, entry.targets.size());
        offers[i] = make_offer(state, actor, *entry.def, entry.targets[target]);
    }
}

void step_commission(RuntimeState& state, Vassal& actor)
{
    if (!active_scholar(actor)) return;
    ensure_commission_offers(state, actor);
    const auto* goal = active_goal(actor);
    if (goal && state.name(goal->event) == "statIncreased" && stat_increased(state, actor, *goal))
        finish_commission(state, actor, *goal);
}

void credit_prestige(RuntimeState& state, Vassal& actor, double amount)
{
    const auto income = whole(amount);
    post_income(state, actor, income);
    if (income != 0) record_commission_event(state, actor, "prestigeGained", {}, income);
}

void record_commission_event(RuntimeState& state, Vassal& actor, std::string_view kind,
                             std::string_view subject, double amount)
{
    if (!active_scholar(actor) || !active_goal(actor)) return;
    auto& goal = *actor.commission.value();
    if (state.name(goal.event) != kind) return;
    if (goal.nodeFamily && state.name(*goal.nodeFamily) != subject) return;
    if (goal.statId && !stat_increased(state, actor, goal)) return;
    if (goal.tag) {
        const auto& cards = state.content->config.gamepieces;
        const auto has_tag = [&](const auto& definitions) {
            const auto found = std::ranges::find(definitions, subject, &std::remove_cvref_t<decltype(definitions)>::value_type::first);
            return found != definitions.end() &&
                std::ranges::find(found->second.tags, state.name(*goal.tag)) != found->second.tags.end();
        };
        if (!(kind == "practiceInstalled" ? has_tag(cards.practices) : has_tag(cards.structures))) return;
    }
    if (goal.regionId || goal.minimumQuality) return;
    if (goal.amount) {
        goal.progress = std::min(*goal.amount, goal.progress + whole(amount));
        if (goal.progress < *goal.amount) return;
    }
    finish_commission(state, actor, goal);
}

}
