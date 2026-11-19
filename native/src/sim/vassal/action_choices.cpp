#include "sim/vassal/action_choices.hpp"
#include "sim/vassal/detail.hpp"

#include "sim/practice/detail.hpp"
#include "sim/practice/stock.hpp"
#include "sim/settlement/population.hpp"
#include "sim/step/action_fields.hpp"
#include "sim/territory/detail.hpp"

#include <numeric>

namespace waffle::sim::vassal::detail {
namespace {

using Option = browser::LifeMapOption;
using Node = browser::LifeMapNodeState;

bool calculated(const content::BalanceValue& value)
{
    return std::get_if<browser::BalancePreset>(&value) &&
        std::get<browser::BalancePreset>(value) == browser::BalancePreset::calculated;
}

void adjust(const RuntimeState& state, Option& option, const content::OptionCost& rule, std::string_view key = {})
{
    const auto& design = state.compiledContent->values.lifeMapGenerator.design;
    if (!design.enabled) return;
    option.balanceKey = key.empty() ? option.id : std::string(key);
    if (!(state.hot.rulesetId && option.expedition.value_or(false)))
        option.phaseCost = year_phases(state, balance_value(rule.time, design.costBands.time));
    option.prestigeCost = balance_value(rule.prestige, design.costBands.prestige);
    if (!calculated(rule.risk)) {
        option.immediateDeathChance = balance_value(rule.risk, design.costBands.risk);
        if (option.baseDanger) option.baseDanger = option.immediateDeathChance;
    }
    if (!calculated(rule.monsterPressure)) {
        if (!option.effects) option.effects.emplace();
        auto& effects = *option.effects;
        std::erase_if(effects, [](const auto& effect) {
            return std::holds_alternative<browser::PracticeEffectaddMonsterPressure>(effect);
        });
        const auto pressure = balance_value(rule.monsterPressure, design.costBands.monsterPressure);
        if (pressure > 0) effects.emplace_back(browser::PracticeEffectaddMonsterPressure{.amount = pressure});
    }
}

std::string stat_label(const RuntimeState& state, const Vassal& actor, std::string_view stat)
{
    if (stat == "cunning") return has_identity(state, actor, "scholar") ? "Ingenuity" : "Cunning";
    if (stat == "intelligence") return has_identity(state, actor, "warrior") ? "Prowess" : "Intelligence";
    if (stat == "wisdom") return "Wisdom";
    return "Effectiveness";
}

bool equipped(const RuntimeState& state, const Vassal& actor, std::string_view id)
{
    return std::ranges::any_of(read(state, actor.heirlooms).equipped,
        [&](const auto& item) { return item && item->definitionId == id; });
}

void add_stat(Vassal& actor, const std::optional<std::string>& stat, std::optional<double> amount)
{
    if (!stat || !amount) return;
    const auto it = std::ranges::find(statIds, *stat);
    if (it == statIds.end()) return;
    auto& value = actor.stats.*statMembers[it - statIds.begin()];
    value = std::max(0.0, core::js::floor(value) + core::js::floor(*amount));
}

std::string region_label(const RuntimeState& state, RegionId id)
{
    return state.topology ? std::string(state.topology->region_name(id)) : "null";
}

std::optional<double> connected_distance(const RuntimeState& state, RegionId origin, RegionId target)
{
    std::vector<std::pair<RegionId, double>> queue{{origin, 0}};
    std::vector<bool> reached(state.hot.world.regions.size());
    reached[origin.value] = true;
    for (std::size_t i = 0; i < queue.size(); ++i) {
        const auto [region, distance] = queue[i];
        if (region == target) return distance;
        for (const auto next : territory::roads(state, region)) {
            if (reached[next.value]) continue;
            reached[next.value] = true;
            queue.emplace_back(next, distance + 1);
        }
    }
    return {};
}

void crossroads(const RuntimeState& state, const Vassal& actor, Node& node)
{
    const auto& settings = state.compiledContent->settings();
    const double phases = settings.seasonDurationSec * 4 / settings.phaseDurationSec;
    const auto& rules = state.compiledContent->values.lifeMapGenerator.design.optionCosts.crossroads;
    const auto origin = actor.locationRegionId;
    const auto neighbors = territory::neighbors(state, origin);
    const auto regions = state.topology ? state.topology->regions() : std::span<const RegionId>{};
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        const auto id = site.regionId;
        if (!practice::detail::has(neighbors, id) || settlement::detailed_site(state, id) != &site) continue;
        if (!state.hot.rulesetId && territory::region_at(state, id).controller != state.practiceVocabulary.player) continue;
        const auto distance = connected_distance(state, origin, id);
        if (!state.hot.rulesetId && distance != 1) continue;
        const bool expedition = state.hot.rulesetId && !distance;
        auto& option = node.options.emplace_back(Option{
            .id = "travel-" + std::string(state.name(id)), .label = "Move to " + region_label(state, id),
            .phaseCost = expedition ? 2 * phases : 18,
            .graphDistance = distance ? browser::OptionalNullable<double>(*distance) : browser::OptionalNullable<double>(std::nullopt),
            .expedition = expedition, .locationRegionId = std::string(state.name(id)),
            .prestigeDelta = 3.0 * (1 + (std::ranges::find(regions, id) - regions.begin()) % 3),
        });
        adjust(state, option, rules.travel, "travel");
    }
    for (const auto other : neighbors) {
        if (practice::detail::has(territory::roads(state, origin), other)) continue;
        const auto originFirst = std::ranges::find(regions, origin) < std::ranges::find(regions, other);
        const auto a = std::string(state.name(originFirst ? origin : other));
        const auto b = std::string(state.name(originFirst ? other : origin));
        const auto& [first, second] = std::minmax(a, b);
        auto& option = node.options.emplace_back(Option{
            .id = "crossroads-route:" + first + "|" + second, .label = "Build a route to " + region_label(state, other),
            .phaseCost = 5 * phases, .prestigeCost = 15,
            .intervention = browser::Intervention{.kind = "connection", .mode = "add", .regionAId = a, .regionBId = b},
        });
        adjust(state, option, rules.route, "route");
    }
    adjust(state, node.options.emplace_back(Option{.id = "tour", .label = "Tour this region", .phaseCost = 2 * phases,
        .randomReward = browser::OptionalNullable<browser::LifeMapOptionRandomReward>(
            browser::LifeMapOptionRandomReward{.relicChance = .25, .statDelta = 1})}), rules.tour);
}

bool owns_relic(const RuntimeState& state, const Vassal& actor, std::string_view id)
{
    const auto has = [id](const auto& slots) {
        return std::ranges::any_of(slots, [id](const auto& item) { return item && item->definitionId == id; });
    };
    const auto& items = read(state, actor.heirlooms);
    const auto& civ = state.hot.civilization;
    const auto overflow = civ.vassalLineage.pendingVaultOverflow;
    return has(items.equipped) || has(items.carry) || has(read(state, civ.heirloomVault)) ||
        (overflow && std::ranges::any_of(read(state, *overflow),
            [id](const auto& item) { return item.definitionId == id; }));
}

std::size_t weighted_pick(RuntimeState& state, std::span<const double> weights)
{
    auto draw = roll(state) * std::accumulate(weights.begin(), weights.end(), 0.0);
    for (std::size_t i = 0; i < weights.size(); ++i) {
        draw -= weights[i];
        if (draw < 0) return i;
    }
    return weights.size() - 1;
}

double local_stock(const RuntimeState& state, const Site& site, TraitId trait)
{
    double total = 0;
    for (const auto& source : practice::detail::stock_sources(state, site, true))
        if (practice::detail::has(source.traits, trait)) total += source.remaining;
    return total;
}

practice::detail::Sources action_sources(const RuntimeState& state, const Site& site)
{
    using namespace practice::detail;
    Sources sources;
    const auto player = state.practiceVocabulary.player;
    const auto holder = [&](RegionId id) { return territory::region_at(state, id).controller; };
    const auto append = [&](const Site& from, bool priced) {
        for (auto source : stock_sources(state, from, true)) {
            source.priced = priced;
            sources.push_back(source);
        }
    };
    if (!state.hot.rulesetId || holder(site.regionId) == player) append(site, false);
    if (!state.hot.rulesetId || (site.detailedState.control && site.detailedState.control->unrest)) return sources;
    const auto roads = territory::roads(state, site.regionId);
    Buffer<const Site*, 20> markets;
    for (const auto id : territory::neighbors(state, site.regionId)) {
        if (!has(roads, id)) continue;
        const auto* neighbor = settlement::detailed_site(state, id);
        if (!neighbor) continue;
        if (holder(id) == player) append(*neighbor, false);
        else if (neighbor->neutral) markets.push_back(neighbor);
    }
    for (const auto* market : markets) append(*market, true);
    return sources;
}

Index<PracticeSlot> relief_host(const RuntimeState& state, const Site& site)
{
    for (const auto slot : site.detailedState.practiceSlots.slots) {
        if (!slot) continue;
        const auto& def = practice::detail::definition(state, state.tables.at(slot).practiceId);
        if (practice::detail::has(state.compiledContent->tables.view(def.stockTraits), state.practiceVocabulary.edible) &&
            state.practiceStock[slot.value].value_or(0) < practice::detail::stock_capacity(state, site, slot, false))
            return slot;
    }
    return {};
}

double residents(const RuntimeState& state, const Site& site)
{
    const auto& people = settlement::population_totals(state, site.id).byResidency;
    return static_cast<double>(people[0].total() + people[1].total());
}

double housing(const RuntimeState& state, const Site& site)
{
    if (site.neutral) return state.tables.at(*site.neutral).housing;
    double capacity = 0;
    for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins)) {
        if (cell.construction) continue;
        const auto& def = practice::detail::definition(state, cell.structureId);
        capacity += std::floor(def.housing.value_or(0) * (1 + .25 * cell.qualityBonus.value_or(0)));
    }
    return capacity;
}

Index<PracticeSlot> rescue_practice(const RuntimeState& state, const Site& site)
{
    for (const auto slot : site.detailedState.practiceSlots.slots)
        if (slot && practice::detail::definition(state, state.tables.at(slot).practiceId).responseAction == content::ResponseAction::rescue)
            return slot;
    return {};
}

practice::StockPlan rescue_plan(const RuntimeState& state, const Site& site, Index<PracticeSlot> slot)
{
    const auto& card = state.tables.at(slot);
    const auto& def = practice::detail::definition(state, card.practiceId);
    const auto& tables = state.compiledContent->tables;
    return practice::plan_stock(state, site, tables.view(def.consume), tables.view(def.require_), &card, false, false);
}

void crisis(const RuntimeState& state, const Vassal& actor, Node& node)
{
    const auto& rules = state.compiledContent->values.lifeMapGenerator.design.optionCosts.crisis;
    const auto& vocab = state.practiceVocabulary;
    const auto& settings = state.compiledContent->settings();
    const auto add = [&](Option option, const content::OptionCost& rule, std::string_view key) {
        adjust(state, option, rule, key);
        node.options.push_back(std::move(option));
    };
    for (const auto id : player_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        const auto name = region_label(state, site.regionId);
        const auto region = std::string(state.name(site.regionId));
        const bool shortage = local_stock(state, site, vocab.edible) < std::ceil(residents(state, site) / 30);
        if (shortage && relief_host(state, site)) {
            add({.id = "relief-" + region, .label = "Food shortage at " + name + ": relief expedition", .phaseCost = 2,
                .immediateDeathChance = .15, .classAction = browser::LifeMapOptionClassAction{.kind = "relief", .targetId = region}},
                rules.relief, "relief");
            if (local_stock(state, site, vocab.currency) >= 1)
                add({.id = "buy-relief-" + region, .label = "Food shortage at " + name + ": procure relief for 1 Currency Stock",
                    .phaseCost = 1, .classAction = browser::LifeMapOptionClassAction{.kind = "relief", .targetId = region, .currency = 1}},
                    rules.buy_relief, "buy-relief");
        }
        const auto nearby = territory::neighbors(state, site.regionId);
        const auto threat = std::ranges::find_if(nearby, [&](auto other) { return territory::region_at(state, other).monster.has_value(); });
        if (threat != nearby.end()) {
            const auto monster = std::string(state.name(*threat));
            add({.id = "delay-" + monster, .label = "Monster threatens " + name + ": reduce Creep by " + decimal(settings.monsterDiversionProgress),
                .phaseCost = 1, .immediateDeathChance = .2, .prestigeDelta = 6,
                .classAction = browser::LifeMapOptionClassAction{.kind = "delay", .targetId = monster}}, rules.delay, "delay");
        }
        if (shortage || threat != nearby.end()) {
            const auto response = rescue_practice(state, site);
            const auto roads = territory::roads(state, site.regionId);
            const auto destination = std::ranges::find_if(roads, [&](auto target) {
                const auto* destination = settlement::detailed_site(state, target);
                return destination && territory::region_at(state, target).controller == vocab.player &&
                    housing(state, *destination) > residents(state, *destination);
            });
            if (response && destination != roads.end() && rescue_plan(state, site, response).ok)
                add({.id = "rescue-" + region, .label = "Rescue endangered population from " + name + " to " +
                    region_label(state, *destination) + " (1 Edible)", .phaseCost = 1,
                    .classAction = browser::LifeMapOptionClassAction{.kind = "evacuate", .targetId = region,
                        .destinationId = std::string(state.name(*destination)), .maximum = 5}}, rules.rescue, "rescue");
        }
    }
    const bool incidents = !node.options.empty();
    const auto* local = settlement::detailed_site(state, actor.locationRegionId);
    const auto preview = local ? std::min(3.0, local->detailedState.previewBonus.value_or(0) +
        practice::structure_modifier_total(state, *local, content::ModifierKind::preview)) : 0;
    if (preview > 0) for (auto& option : node.options) {
        const auto target = state.find_id<RegionId>(*option.classAction->targetId);
        if (const auto* site = settlement::detailed_site(state, target))
            option.label += " · demand " + decimal(std::ceil(residents(state, *site) / 30)) +
                ", Edible " + decimal(local_stock(state, *site, vocab.edible));
        else if (const auto& monster = territory::region_at(state, target).monster)
            option.label += " · Monster Defense " + decimal(monster->defense);
    }
    if (node.options.size() > 3 + preview) node.options.resize(static_cast<std::size_t>(3 + preview));
    add({.id = "observe-crisis", .label = incidents ? "Leave the response to the civilization" : "No current incident: inspect the frontier",
        .phaseCost = 1, .classAction = browser::LifeMapOptionClassAction{.kind = "observe"}}, rules.observe_crisis, "observe-crisis");
}

void evacuate(RuntimeState& state, Site& source, Site& destination, double maximum)
{
    using namespace settlement;
    const auto count = std::min(maximum, std::max(0.0, housing(state, destination) - residents(state, destination)));
    std::vector<PopulationBin> sourceBins, destinationBins, selected, moved;
    LedgerScratch scratch;
    collect_population(state, source.detailedState.populationByClass, sourceBins);
    allocate_population(state, sourceBins, count, selected, scratch, PopulationTie::input_order);
    remove_population(sourceBins, selected, moved);
    const auto joint = [](const Site& site) {
        const auto& people = site.detailedState.populationByClass;
        return people.villager.joint.has_value() || people.stranger.joint.has_value();
    };
    write_population_bins(state, source.id, sourceBins, scratch, joint(source));
    collect_population(state, destination.detailedState.populationByClass, destinationBins);
    double total = 0;
    for (auto bin : moved) {
        bin.residency = Residency::stranger;
        destinationBins.push_back(bin);
        total += static_cast<double>(bin.count);
    }
    write_population_bins(state, destination.id, destinationBins, scratch, joint(destination));
    if (total > 0) {
        practice::EventData event;
        event.fields.destinationId = destination.regionId;
        event.fields.amount = total;
        practice::emit(state, state.territory.populationRescued, source.regionId, event);
    }
}

void generate_relief(RuntimeState& state, const Site& site, Index<PracticeSlot> index)
{
    const auto& slot = state.tables.at(index);
    const auto& def = practice::detail::definition(state, slot.practiceId);
    auto& stock = state.practiceStock[index.value];
    const auto before = std::max(0.0, stock.value_or(0));
    stock = std::max(before, std::min(practice::detail::stock_capacity(state, site, index, false), before + 3));
    if (*stock <= before) return;
    practice::EventData event;
    event.fields.practiceId = def.id;
    event.fields.slotIndex = slot.slot;
    event.fields.amount = *stock - before;
    event.fields.pool = state.practiceVocabulary.pools[static_cast<std::size_t>(def.pool)];
    event.fields.scholarStaffed = false;
    event.traits = state.compiledContent->tables.view(def.stockTraits);
    event.tags = state.compiledContent->tables.view(def.tags);
    practice::emit(state, practice::EventKind::stockGenerated, site.regionId, event);
}

}

double action_stock_total(const RuntimeState& state, const Site* site, TraitId trait)
{
    double total = 0;
    if (site) for (const auto& source : action_sources(state, *site))
        if (practice::detail::has(source.traits, trait)) total += source.remaining;
    return total;
}

practice::StockPlan action_stock_plan(const RuntimeState& state, const Site* site, const TraitId& trait, double amount)
{
    using namespace practice::detail;
    practice::StockPlan plan;
    plan.ok = amount <= 0;
    if (!site || plan.ok) return plan;
    auto sources = action_sources(state, *site);
    const auto& vocab = state.practiceVocabulary;
    const auto add = [&](Source& source, double taken, std::span<const TraitId> traits,
                         RegionId payment = {}, std::span<const TraitId> substitution = {}) {
        StockProvider provider{.kind = vocab.consume, .regionId = source.region,
            .slotIndex = static_cast<double>(source.slot), .amount = taken};
        if (source.practice) provider.practiceId = state.tables.at(source.practice).practiceId;
        plan.providers.push_back({{provider, traits, substitution}, source, payment});
        source.remaining -= taken;
    };
    for (auto& source : sources) {
        if (amount <= 0) break;
        if (source.priced || !has(source.traits, trait)) continue;
        const auto taken = std::min(amount, source.remaining);
        add(source, taken, {&trait, 1});
        amount -= taken;
    }
    if (state.hot.rulesetId && amount > 0 && std::ranges::any_of(modifiers(state, *site), [](const auto& mod) {
        return mod.def->kind == content::ModifierKind::currencyWildcard;
    })) {
        for (auto& source : sources) {
            if (source.priced || source.remaining < 1 || !has(source.traits, vocab.currency)) continue;
            add(source, 1, source.traits, {}, {&trait, 1});
            --amount;
            break;
        }
    }
    for (auto& market : sources) {
        if (amount <= 0) break;
        if (!market.priced || !has(market.traits, trait)) continue;
        double currency = 0;
        for (const auto& source : sources)
            if (source.region == site->regionId && has(source.traits, vocab.currency)) currency += source.remaining;
        const auto price = state.tables.at(market.market).price;
        const auto taken = std::min({amount, market.remaining, std::floor(currency / price)});
        if (taken <= 0) continue;
        auto owed = taken * price;
        for (auto& source : sources) {
            if (owed <= 0) break;
            if (source.region != site->regionId || !has(source.traits, vocab.currency) || source.remaining <= 0) continue;
            const auto paid = std::min(owed, source.remaining);
            add(source, paid, {&vocab.currency, 1}, market.region);
            owed -= paid;
        }
        add(market, taken, {&trait, 1});
        amount -= taken;
    }
    plan.ok = amount <= 0;
    return plan;
}

ActionResult change_connection(RuntimeState& state, Vassal& actor, const browser::Intervention& action)
{
    const auto a = state.find_id<RegionId>(action.regionAId.value_or(""));
    const auto b = state.find_id<RegionId>(action.regionBId.value_or(""));
    const bool add = action.mode == "add";
    if (add && (!a || !b || !practice::detail::has(territory::neighbors(state, a), b))) return {"invalidConnection"};
    if (!state.topology) return {"missingConnections"};
    auto& connections = state.hot.world.connections;
    const auto current = state.tables.view(connections);
    std::vector<Connection> next(current.begin(), current.end());
    const auto existing = std::ranges::find_if(next, [&](const auto& entry) {
        return (entry.regionAId == a && entry.regionBId == b) || (entry.regionAId == b && entry.regionBId == a);
    });
    if (add && existing != next.end()) return {"connectionExists"};
    if (!add && existing == next.end()) return {"connectionMissing"};
    if (add) next.push_back({a, b});
    else next.erase(existing);
    const auto regions = state.topology->regions();
    const auto order = [&](RegionId id) { return std::ranges::find(regions, id) - regions.begin(); };
    for (auto& edge : next)
        if (order(edge.regionAId) > order(edge.regionBId)) std::swap(edge.regionAId, edge.regionBId);
    std::ranges::sort(next, {}, [&](const auto& edge) {
        return std::pair(order(edge.regionAId), order(edge.regionBId));
    });
    connections = state.tables.table<Connection>().append(next.size(), "Vassal connection");
    std::ranges::copy(next, state.tables.view(connections).begin());
    rebuild_runtime_indexes(state);
    if (add) record_commission_event(state, actor, "routeBuilt");
    return {};
}

browser::LifeMapNodeStateOptions relic_options(RuntimeState& state, const Vassal& actor, bool special)
{
    const auto& pools = state.compiledContent->values.lifeMapGenerator.design.relicPools;
    const auto& qualities = pools.relic.qualities;
    const std::array rules{qualities.bronze, qualities.silver, qualities.gold, qualities.diamond};
    const auto entries = state.compiledContent->tables.view(pools.specialRelic.entries);
    const auto& settings = state.compiledContent->settings();
    const std::array pressure{0.0, settings.silverRelicMonsterProgress, settings.goldRelicMonsterProgress,
        settings.diamondRelicMonsterProgress};
    std::vector<const HeirloomDef*> eligible;
    std::vector<double> itemWeights;
    for (const auto& def : heirloomDefs) {
        if (owns_relic(state, actor, def.id)) continue;
        auto rule = rules[quality_index(def.quality)];
        if (special) {
            const auto found = std::ranges::find_if(entries, [&](const auto& entry) { return state.name(entry.key) == def.id; });
            if (found == entries.end()) continue;
            rule = found->value;
        }
        if (!rule.enabled) continue;
        eligible.push_back(&def);
        itemWeights.push_back(rule.weight);
    }
    browser::LifeMapNodeStateOptions offers;
    while (!eligible.empty() && offers.size() < 3) {
        std::size_t index;
        if (special) index = weighted_pick(state, itemWeights);
        else {
            std::array<double, 4> weights{};
            for (const auto* def : eligible) {
                const auto quality = quality_index(def->quality);
                weights[quality] = rules[quality].weight;
            }
            const auto quality = weighted_pick(state, weights);
            std::vector<std::size_t> matching;
            for (std::size_t i = 0; i < eligible.size(); ++i)
                if (quality_index(eligible[i]->quality) == quality) matching.push_back(i);
            index = matching.empty() ? pick(state, eligible.size()) : matching[pick(state, matching.size())];
        }
        const auto& def = *eligible[index];
        const auto quality = quality_index(def.quality);
        offers.push_back({.id = "relic:" + std::string(def.id), .label = std::string(def.label),
            .phaseCost = (quality ? 224.0 : 128.0) + pick(state, quality > 1 ? 97 : 65),
            .immediateDeathChance = special ? .35 : 0.0,
            .effects = browser::PracticeDefinitionEffects{browser::PracticeEffectaddMonsterPressure{.amount = pressure[quality]}},
            .description = std::string(def.description), .definitionId = std::string(def.id), .quality = std::string(def.quality),
            .inheritanceState = "sanctified", .timeCostTier = quality == 0 ? "low" : quality == 1 ? "medium" : "high"});
        eligible.erase(eligible.begin() + index);
        itemWeights.erase(itemWeights.begin() + index);
    }
    if (offers.empty()) offers.push_back({.id = "relic-empty", .label = "No eligible Relics remain", .immediateDeathChance = 0,
        .description = "Leave this empty pool without spending time or risking death.", .timeCostTier = "low", .emptyRelic = true});
    return offers;
}

void roll_tour_reward(RuntimeState& state, const Vassal& actor, Option& option)
{
    const auto reward = *option.randomReward.value();
    option.randomReward = browser::OptionalNullable<browser::LifeMapOptionRandomReward>(std::nullopt);
    std::vector<const HeirloomDef*> eligible;
    for (const auto& def : heirloomDefs)
        if (def.quality == "bronze" && !owns_relic(state, actor, def.id)) eligible.push_back(&def);
    if (roll(state) < reward.relicChance && !eligible.empty()) {
        const auto& def = *eligible[pick(state, eligible.size())];
        option.definitionId = def.id;
        option.label = def.label;
        option.quality = def.quality;
        option.description = def.description;
        option.immediateDeathChance = option.immediateDeathChance.value_or(0);
    } else {
        option.statId = statIds[pick(state, statIds.size())];
        option.statDelta = reward.statDelta;
    }
}

ActionResult acquire_relic(RuntimeState& state, Vassal& actor, std::string_view id,
                           const core::json::Value& acquisition, bool commit)
{
    using namespace action_fields;
    const auto destination = string(acquisition, "destination");
    if (destination == "decline") return {};
    if (std::ranges::find(heirloomDefs, id, &HeirloomDef::id) == std::end(heirloomDefs)) return {"invalidHeirloom"};
    if (owns_relic(state, actor, id)) return {"duplicateHeirloom"};
    auto inventory = read(state, actor.heirlooms);
    auto& serial = state.hot.civilization.vassalLineage.nextHeirloomInstanceId;
    const auto next = std::max(1.0, whole(serial));
    const browser::Heirloom item{"heirloom-" + decimal(next), std::string(id), browser::InheritanceState::sanctified, false};
    const auto* discard = acquisition.find("discard");
    const auto discardIndex = discard ? number(*discard, "index").value_or(-1) : -1;
    const auto valid = [](double index, std::size_t size) {
        return index >= 0 && index < static_cast<double>(size) && index == std::floor(index);
    };
    const auto empty_slot = [](const auto& slot) { return !slot; };
    const auto carry = std::ranges::find_if(inventory.carry, empty_slot);
    if (destination == "equip") {
        const auto equipped = std::ranges::find_if(inventory.equipped, empty_slot);
        if (equipped != inventory.equipped.end()) *equipped = item;
        else {
            const auto index = std::floor(number(acquisition, "replaceEquippedIndex").value_or(-1));
            if (!valid(index, inventory.equipped.size())) return {"equipSlotRequired"};
            auto& slot = inventory.equipped[static_cast<std::size_t>(index)];
            const auto location = discard ? string(*discard, "location") : std::string_view{};
            if (carry != inventory.carry.end()) *carry = slot;
            else if (location == "carry" && valid(discardIndex, inventory.carry.size()))
                inventory.carry[static_cast<std::size_t>(discardIndex)] = slot;
            else if (location != "equipped" || discardIndex != index) return {"discardRequired"};
            slot = item;
        }
    } else if (destination == "carry") {
        if (carry != inventory.carry.end()) *carry = item;
        else {
            const auto index = std::floor(number(acquisition, "replaceCarryIndex").value_or(discardIndex));
            if (!valid(index, inventory.carry.size())) return {"carrySlotRequired"};
            inventory.carry[static_cast<std::size_t>(index)] = item;
        }
    } else return {"acquireRequired"};
    if (commit) {
        serial = next + 1;
        replace(state, actor.heirlooms, inventory);
        record_commission_event(state, actor, "relicAcquired", id);
    }
    return {};
}

bool create_node_choices(RuntimeState& state, const Vassal& actor, Node& node)
{
    const auto& design = state.compiledContent->values.lifeMapGenerator.design;
    const auto& costs = design.optionCosts;
    if (node.signatureNode && node.signatureNode->variantId == "legacyPlus") {
        node.options = {
            {.id = "foundDynasty", .label = "Found a Dynasty", .phaseCost = year_phases(state, 4 * 3.6),
                .prestigeCost = 40, .legacyStartingPrestigeBonus = 12},
            {.id = "enduringOffice", .label = "Enduring Office", .phaseCost = year_phases(state, 4 * 3.6),
                .prestigeCost = 20, .legacyStartingPrestigeBonus = 6},
            {.id = "humbleRemembrance", .label = "Humble Remembrance", .legacyStartingPrestigeBonus = 2},
        };
        adjust(state, node.options[0], costs.signature_legacyPlus.foundDynasty);
        adjust(state, node.options[1], costs.signature_legacyPlus.enduringOffice);
        adjust(state, node.options[2], costs.signature_legacyPlus.humbleRemembrance);
    } else if (node.signatureNode && node.signatureNode->variantId == "monsterHunt") {
        node.options = {{.id = "observe-frontier", .label = "Observe the frontier", .phaseCost = 2, .prestigeDelta = 6}};
    } else if (node.family == "crossroads") {
        crossroads(state, actor, node);
    } else if (node.family == "relic") {
        const bool special = node.specialRelic.value_or(false);
        node.options = relic_options(state, actor, special);
        for (auto& option : node.options)
            if (!option.emptyRelic.value_or(false))
                adjust(state, option, special ? costs.specialRelic.search : costs.relic.search, "search");
    } else if (node.family == "crisis") {
        crisis(state, actor, node);
    } else if (node.family == "discovery") {
        node.options = {
            {.id = "discovery-research", .label = "Discovery: develop technique (+25 Research +1 per Ingenuity)",
                .phaseCost = 6, .classAction = browser::LifeMapOptionClassAction{.kind = "discovery", .research = 25}},
            {.id = "discovery-frontier", .label = "Discovery: forbidden observation (+60 Research +1 per Ingenuity, next shop accesses one maturity higher)",
                .phaseCost = 8, .immediateDeathChance = .1,
                .effects = browser::PracticeDefinitionEffects{browser::PracticeEffectaddMonsterPressure{
                    .amount = state.compiledContent->settings().discoveryMonsterProgress}},
                .classAction = browser::LifeMapOptionClassAction{.kind = "discovery", .frontier = true, .research = 60}},
        };
        adjust(state, node.options[0], costs.discovery.discovery_research);
        adjust(state, node.options[1], costs.discovery.discovery_frontier);
    } else if (node.family == "challenge") {
        const std::array rules{&costs.challenge.challenge_3, &costs.challenge.challenge_6, &costs.challenge.challenge_9};
        for (std::size_t i = 0; i < rules.size(); ++i) {
            const double difficulty = 3.0 * (i + 1);
            const auto label = decimal(difficulty);
            adjust(state, node.options.emplace_back(Option{.id = "challenge-" + label, .label = "Challenge " + label,
                .phaseCost = difficulty * 2, .immediateDeathChance = difficulty * .05, .prestigeDelta = difficulty * 3,
                .classAction = browser::LifeMapOptionClassAction{.kind = "challenge", .difficulty = difficulty}}), *rules[i]);
        }
    } else if (node.family == "philosopherFounding" || node.family == "warlordFounding") {
        const bool scholar = node.family == "philosopherFounding";
        node.options.push_back({
            .id = "train-estate", .label = scholar ? "Philosopher: establish Scholars" : "Warlord: establish Warriors",
            .phaseCost = 6,
            .description = scholar ? "Train up to two existing adults as Scholars and found a Lyceum if two construction cells are free."
                                   : "Train up to ten existing adults as Warriors.",
            .classAction = browser::LifeMapOptionClassAction{
                .kind = "train", .classId = scholar ? "scholar" : "warrior", .count = scholar ? 2.0 : 10.0,
                .structureId = scholar ? std::optional<std::string>("lyceum") : std::nullopt,
                .establishClass = true, .onCompletion = true,
            },
        });
    } else if (node.family == "patronage") {
        node.options = {
            {.id = "immediateFavor", .label = "Immediate Favor", .phaseCost = year_phases(state, 3.6), .prestigeDelta = 8},
            {.id = "longAppointment", .label = "Long Appointment", .phaseCost = year_phases(state, 4 * 3.6), .prestigeDelta = 20},
            {.id = "cultivateConnections", .label = class_name(actor) == "scholar" ? "Cultivate Ingenuity" : "Cultivate Connections",
                .statDelta = 1, .statId = "cunning", .statLabel = stat_label(state, actor, "cunning"),
                .phaseCost = year_phases(state, 3 * 3.6), .prestigeDelta = 5},
        };
        const std::array rules{&costs.patronage.immediateFavor, &costs.patronage.longAppointment, &costs.patronage.cultivateConnections};
        for (std::size_t i = 0; i < rules.size(); ++i) adjust(state, node.options[i], *rules[i]);
    } else if (node.family == "development") {
        auto stats = statIds;
        shuffle(state, stats);
        const std::array ids{"deepStudy", "hardLesson", "steadyPractice"};
        const std::array labels{"Deep Study", "Hard Lesson", "Steady Practice"};
        const std::array rules{&costs.development.deepStudy, &costs.development.hardLesson, &costs.development.steadyPractice};
        for (std::size_t i = 0; i < rules.size(); ++i) {
            const auto stat = stats[i];
            const auto label = stat_label(state, actor, stat);
            Option option{.id = ids[i], .label = labels[i] + (": " + label), .statDelta = i == 2 ? 1.0 : 2.0,
                .statId = std::string(stat), .statLabel = label, .phaseCost = year_phases(state, (i == 0 ? 6 : 2) * 3.6)};
            if (i == 0 && (stat == "cunning" || stat == "wisdom")) {
                option.effects.emplace().emplace_back(browser::PracticeEffectaddMonsterPressure{
                    .amount = state.compiledContent->settings().deepStudyMonsterProgress,
                });
            }
            if (i == 1) {
                auto losses = std::vector(statIds.begin(), statIds.end());
                std::erase(losses, stat);
                option.lossStatDelta = -1;
                option.lossStatId = losses[pick(state, losses.size())];
                option.lossStatLabel = stat_label(state, actor, *option.lossStatId);
            }
            adjust(state, option, *rules[i]);
            node.options.push_back(std::move(option));
        }
    } else if (node.family == "training") {
        const bool scholar = class_name(actor) == "scholar";
        node.options.push_back({.id = "train-estate", .label = scholar ? "Train Scholars" : "Train Warriors",
            .phaseCost = 6, .description = scholar ? "Convert up to 2 existing adults into Scholars."
                                                 : "Convert up to 10 existing adults into Warriors.",
            .classAction = browser::LifeMapOptionClassAction{.kind = "train"}});
        adjust(state, node.options.back(), costs.training.train_estate);
    } else if (node.family == "legacy" && !node.signatureNode) {
        const std::array stats{
            whole(actor.stats.cunning) + bonuses(state, actor).cunning, whole(actor.stats.wisdom),
            whole(actor.stats.effectiveness), whole(actor.stats.intelligence) + equipped(state, actor, "abacus"),
        };
        const auto highest = std::ranges::max_element(stats) - stats.begin();
        const auto label = stat_label(state, actor, statIds[highest]);
        const auto statAmount = std::floor(stats[highest] / 3);
        const auto renown = std::floor((state.hot.rulesetId ? *state.hot.civilization.prestige : actor.prestige) / 10);
        node.options = {
            {.id = "highest-stat", .label = "Teach " + label,
                .description = "Future Vassals start with +" + decimal(statAmount) + " " + label + ".",
                .legacyReward = browser::LifeMapOptionLegacyReward{"stat", std::string(statIds[highest]), statAmount}},
            {.id = "accumulated-prestige", .label = "Leave renown",
                .description = state.hot.rulesetId ? "Endow the civilization with " + decimal(renown) + " Prestige."
                    : "Future Vassals start with +" + decimal(renown) + " Prestige.",
                .legacyReward = browser::LifeMapOptionLegacyReward{"prestige", {}, renown}},
        };
        adjust(state, node.options[0], costs.legacy.highest_stat);
        adjust(state, node.options[1], costs.legacy.accumulated_prestige);
    } else return false;
    return true;
}

double immediate_risk(const RuntimeState& state, const Vassal& actor, const Option& option)
{
    const auto base = std::clamp(option.immediateDeathChance.value_or(0), 0.0, 1.0);
    if (!has_identity(state, actor, "warrior")) return base;
    return std::max(0.0, 1 - (1 - base) * (1 + .15 * (whole(actor.stats.intelligence) + equipped(state, actor, "abacus"))));
}

ActionResult commit_node_choice(RuntimeState& state, Vassal& actor, Node& node, const Option& option,
                                double price)
{
    auto& civ = state.hot.civilization;
    const auto previousLocation = actor.locationRegionId;
    if (option.classAction) {
        const auto& action = *option.classAction;
        const auto target = state.find_id<RegionId>(action.targetId.value_or(""));
        if (action.kind == "train" && !settlement::detailed_site(state, actor.locationRegionId)) return {"settlementLost"};
        if (action.establishClass.value_or(false) && (!actor.founderClassId ||
            action.classId != state.name(*actor.founderClassId) || civ.vassalLineage.establishedClassId))
            return {"foundingUnavailable"};
        if (action.kind == "relief") {
            const auto* site = settlement::detailed_site(state, target);
            if (!site || territory::region_at(state, target).controller != state.practiceVocabulary.player || !relief_host(state, *site))
                return {"reliefUnavailable"};
            if (action.currency.value_or(0) > local_stock(state, *site, state.practiceVocabulary.currency)) return {"insufficientCurrencyStock"};
        }
        if (action.kind == "delay" && (!target || !territory::region_at(state, target).monster)) return {"threatEnded"};
        if (action.kind == "evacuate") {
            Node fresh;
            crisis(state, actor, fresh);
            if (std::ranges::none_of(fresh.options, [&](const auto& choice) {
                return choice.classAction->kind == "evacuate" && choice.classAction->targetId == action.targetId &&
                    choice.classAction->destinationId == action.destinationId;
            })) return {"rescueUnavailable"};
        }
    }
    const auto quotedRisk = immediate_risk(state, actor, option);
    auto& account = state.hot.rulesetId ? *civ.prestige : actor.prestige;
    if (price > account) return {"insufficientPrestige"};
    account -= price;
    if (!option.classAction && option.prestigeDelta) {
        auto delta = std::floor(*option.prestigeDelta);
        if (delta > 0 && node.family == "patronage" && equipped(state, actor, "courtiersBrooch")) delta *= 2;
        if (delta > 0) credit_prestige(state, actor, delta);
        else account = std::max(0.0, account + delta);
    }
    add_stat(actor, option.statId, option.statDelta);
    add_stat(actor, option.lossStatId, option.lossStatDelta);
    if (option.intervention) {
        if (option.intervention->kind != "connection") return {"interventionUnavailable"};
        if (const auto changed = change_connection(state, actor, *option.intervention); !changed) return changed;
    }
    if (option.locationRegionId) actor.locationRegionId = state.find_id<RegionId>(*option.locationRegionId);
    civ.vassalLegacy.futureStartingPrestigeBonus += whole(option.legacyStartingPrestigeBonus.value_or(0));
    if (option.legacyReward) {
        const auto& reward = *option.legacyReward;
        if (reward.kind == "stat" && reward.statId) {
            const auto stat = std::ranges::find(statIds, *reward.statId);
            if (stat != statIds.end()) {
                auto& stats = civ.vassalLegacy.futureStartingStatBonuses;
                std::array pointers{&stats.cunning, &stats.wisdom, &stats.effectiveness, &stats.intelligence};
                *pointers[stat - statIds.begin()] += reward.amount;
            }
        } else if (state.hot.rulesetId) credit_prestige(state, actor, reward.amount);
        else civ.vassalLegacy.futureStartingPrestigeBonus += reward.amount;
    }
    const auto pressure = [&] {
        if (option.effects) for (const auto& effect : *option.effects)
            if (const auto* add = std::get_if<browser::PracticeEffectaddMonsterPressure>(&effect))
                territory::add_pressure(state, add->amount);
    };
    if (option.effects) for (const auto& effect : *option.effects) {
        if (std::holds_alternative<browser::PracticeEffectaddMonsterPressure>(effect)) continue;
        return {"unsupportedVassalNodeEffect"};
    }
    const bool dangerous = std::max(option.baseDanger.value_or(0), option.immediateDeathChance.value_or(0)) > 0;
    const bool failed = dangerous && roll(state) < (state.compiledContent->values.lifeMapGenerator.design.enabled ? quotedRisk : immediate_risk(state, actor, option));
    if (failed) {
        const bool relic = node.family == "relic";
        const std::string_view cause = relic ? "relic" : "crisis";
        if (spend_mandate(state, actor)) {
            node.mandatePreventedDeath = true;
            add_event(state, actor, "mandatePrevented", {}, actor.lifeMap.currentNodeId, {}, {},
                relic ? "Mandate of Heaven prevented a fatal Relic search." : "Mandate of Heaven prevented a fatal Crisis.", {}, cause);
        } else {
            node.resolutionResult = relic ? "relicDeath" : "crisisDeath";
            finish_vassal(state, actor, cause);
            pressure();
            return {};
        }
    }
    practice::EventData event;
    event.fields.classId = actor.classId ? browser::OptionalNullable<SymbolId>(intern<SymbolId>(state, class_name(actor)))
                                         : browser::OptionalNullable<SymbolId>(std::nullopt);
    const auto kind = intern<EventKindId>(state, "vassalAction");
    const auto root = practice::emit(state, kind, actor.locationRegionId, event);
    auto& journal = civ.practiceEvents;
    const auto previousRoot = journal.activeRoot;
    const auto previousEvent = journal.activeEvent;
    journal.activeRoot = root.rootId;
    journal.activeEvent = root.id;
    if (dangerous && !failed) {
        event.fields.martial = option.classAction && (option.classAction->kind == "challenge" || option.classAction->kind == "campaign");
        practice::emit(state, intern<EventKindId>(state, "dangerSurvived"), actor.locationRegionId, event);
        event.fields.martial.reset();
    }
    if (option.classAction && !option.classAction->onCompletion.value_or(false)) {
        const auto& action = *option.classAction;
        if (action.kind == "train") {
            if (!apply_timed_class_action(state, actor, action)) return {"classActionFailed"};
        } else {
            event.fields.actionKind = intern<SymbolId>(state, action.kind);
            const auto child = practice::emit(state, kind, actor.locationRegionId, event);
            journal.activeEvent = child.id;
            ensure_commission_offers(state, actor);
            if (action.kind == "discovery") {
                civ.research.total += action.research.value_or(0) + whole(actor.stats.cunning) + bonuses(state, actor).cunning;
                if (action.frontier.value_or(false)) actor.discoveryAccess = true;
            } else if (action.kind == "challenge") {
                event.fields.actionKind.reset();
                practice::emit(state, intern<EventKindId>(state, "challengeCompleted"), actor.locationRegionId, event);
            } else if (action.kind == "relief") {
                const auto& site = *settlement::detailed_site(state, state.find_id<RegionId>(*action.targetId));
                auto remaining = action.currency.value_or(0);
                for (const auto& source : practice::detail::stock_sources(state, site, true)) {
                    if (remaining <= 0) break;
                    if (!practice::detail::has(source.traits, state.practiceVocabulary.currency)) continue;
                    const auto taken = std::min(remaining, source.remaining);
                    if (source.market) state.tables.at(source.market).stock -= taken;
                    else *state.practiceStock[source.practice.value] -= taken;
                    remaining -= taken;
                }
                if (const auto slot = relief_host(state, site)) generate_relief(state, site, slot);
            } else if (action.kind == "delay") {
                const auto& target = territory::region_at(state, state.find_id<RegionId>(*action.targetId));
                civ.research.total += target.monster->defense;
                civ.chaos.monsterPressure = std::max(0.0, civ.chaos.monsterPressure - state.compiledContent->settings().monsterDiversionProgress);
                event.fields.actionKind.reset();
                practice::emit(state, intern<EventKindId>(state, "monsterDiverted"), actor.locationRegionId, event);
            } else if (action.kind == "evacuate") {
                auto& source = *settlement::detailed_site(state, state.find_id<RegionId>(*action.targetId));
                auto& destination = *settlement::detailed_site(state, state.find_id<RegionId>(*action.destinationId));
                const auto plan = rescue_plan(state, source, rescue_practice(state, source));
                if (practice::apply_stock(state, source, plan)) evacuate(state, source, destination, action.maximum.value_or(0));
            }
            journal.activeEvent = root.id;
        }
    }
    pressure();
    journal.activeRoot = previousRoot;
    journal.activeEvent = previousEvent;
    practice::drain(state);
    if (option.classAction && option.prestigeDelta) credit_prestige(state, actor, *option.prestigeDelta);
    if (class_name(actor) == "warrior" && dangerous && !failed) credit_prestige(state, actor, 15);
    record_commission_event(state, actor, "statIncreased");
    if (actor.locationRegionId != previousLocation) record_commission_event(state, actor, "locationMoved", state.name(actor.locationRegionId));
    return {};
}

}
