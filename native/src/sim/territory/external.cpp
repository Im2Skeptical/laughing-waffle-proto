#include "sim/territory/territory.hpp"
#include "sim/territory/detail.hpp"

#include "sim/practice/stock.hpp"
#include "sim/settlement/prelude.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim::territory {
namespace {

using content::ExternalAction;
using practice::EventData;
using practice::EventKind;
using content::ModifierKind;

enum class MarketAccess { trade, raid };

bool supplied_recipe(const RuntimeState& state, const Site& site, const content::PracticeDefinition& def)
{
    const auto& tables = state.compiledContent->tables;
    return practice::plan_stock(state, site, tables.view(def.consume), tables.view(def.require_), nullptr, false, false).ok;
}

double legacy_local_support(const RuntimeState& state, const Site& site, bool defense)
{
    const auto& local = site.detailedState;
    double multiplier = 1, flat = 0;
    for (const auto& mod : practice::detail::modifiers(state, site)) {
        const auto kind = mod.def->kind;
        if (kind == ModifierKind::support || (defense && kind == ModifierKind::defenseMultiplier))
            multiplier += mod.amount;
        if (defense && kind == ModifierKind::defense) flat += mod.amount;
        if (defense && kind == ModifierKind::lossDefense)
            flat += mod.amount * std::min(3.0, state.hot.civilization.history.lostSettlements);
        if (kind == ModifierKind::stockSupport || (defense && kind == ModifierKind::stockDefense)) {
            unsigned stocked = 0;
            for (const auto row : local.practiceSlots.slots) {
                if (!row || state.practiceStock[row.value].value_or(0) <= 0) continue;
                const auto& def = practice::detail::definition(state, state.tables.at(row).practiceId);
                const auto& tables = state.compiledContent->tables;
                if (mod.def->query && mod.def->query->traitsAny &&
                    !practice::detail::intersects(tables.view(*mod.def->query->traitsAny), tables.view(def.stockTraits))) continue;
                ++stocked;
            }
            (kind == ModifierKind::stockDefense ? flat : multiplier) += std::min(3u, stocked) * mod.amount;
        }
    }
    for (const auto& slot : state.tables.view(local.practiceSlots.rows)) {
        const auto& def = practice::detail::definition(state, slot.practiceId);
        const auto bonus = def.supportMultiplier.value_or(0) + (defense ? def.defenseMultiplier.value_or(0) : 0);
        if (bonus != 0 && def.mode == content::Mode::scheduled && supplied_recipe(state, site, def)) multiplier += bonus;
    }
    const auto warriors = practice::detail::specialists(state, site, content::SpecialistClass::warrior);
    const auto bank = local.supportBank.value_or(runtime::SupportBank{});
    return std::floor(warriors / 5 * multiplier + flat + bank.formation.value_or(0)
        + bank.siege.value_or(0) + bank.mobility.value_or(0));
}

std::span<const std::pair<RegionId, double>> legacy_support(const RuntimeState& state)
{
    thread_local std::vector<std::pair<RegionId, double>> contributions;
    contributions.clear();
    contributions.reserve(state.hot.world.regions.size());
    const auto record = [&](RegionId id, double amount) {
        const auto prior = std::ranges::find(contributions, id, &std::pair<RegionId, double>::first);
        if (prior == contributions.end()) contributions.emplace_back(id, amount);
        else prior->second += amount;
    };
    const auto player = state.practiceVocabulary.player;
    for (const auto id : settlement::detailed_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        if (region_at(state, site.regionId).controller != player) continue;
        record(site.regionId, legacy_local_support(state, site, true));
        double share = 0;
        for (const auto& mod : practice::detail::modifiers(state, site))
            if (mod.def->kind == ModifierKind::networkSupport) share += mod.amount;
        const auto bank = site.detailedState.supportBank.value_or(runtime::SupportBank{});
        const bool coordination = bank.coordination.value_or(0) != 0;
        const bool greatHost = bank.greatHost.value_or(0) != 0;
        share = std::min(.5, share + (coordination ? .25 : 0) + (greatHost ? .5 : 0));
        if (share <= 0) continue;
        for (const auto region : roads(state, site.regionId)) {
            if (region_at(state, region).controller != player) continue;
            const auto* other = site_at_region(state, region);
            const auto amount = other ? std::min(10.0, std::floor(legacy_local_support(state, *other, true) * share)) : 0;
            if (amount > 0) record(region, amount);
            if (coordination && !greatHost) break;
        }
    }
    return contributions;
}

const NeutralStock* stocked_goods(const RuntimeState& state, Index<NeutralMarket> market)
{
    const auto stocks = state.tables.view(state.tables.at(market).stocks);
    const auto goods = std::ranges::find_if(stocks, [](const auto& row) { return row.stock > 0; });
    return goods == stocks.end() ? nullptr : &*goods;
}

}

double available_warriors(const RuntimeState& state, RegionId region)
{
    const auto* site = settlement::detailed_site(state, region);
    if (!site) return 0;
    const auto player = state.practiceVocabulary.player;
    const auto force = military(state, region, player);
    const auto adults = force.adultWarriors - force.sentAdultWarriors;
    if (adults <= 0 || region_at(state, region).controller != player) return std::max(0.0, adults);
    const auto pop = resistance(state, *site, player);
    if (pop.loyal <= 0) return 0;
    if (pop.loyal / pop.total >= .70) return adults;
    const auto required = std::max(0.0, holding_pressure(pop) * (.70 * pop.total / pop.loyal - 1));
    const auto other = std::max(0.0, force.force - adults);
    return std::max(0.0, adults - std::ceil(std::max(0.0, required - other)));
}

double retinue(const RuntimeState& state, const Vassal& vassal)
{
    if (vassal.classId != browser::SpecialistClass::warrior) return 0;
    const auto player = state.practiceVocabulary.player;
    const auto prestige = state.hot.rulesetId ? state.hot.civilization.prestige.value_or(0) : vassal.prestige;
    double bonus = 0;
    for (const auto id : settlement::active_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        if (region_at(state, site.regionId).controller != player) continue;
        for (const auto& mod : practice::detail::modifiers(state, site))
            if (mod.def->kind == content::ModifierKind::retinueForce) bonus += mod.amount;
        for (const auto& slot : state.tables.view(site.detailedState.practiceSlots.rows)) {
            const auto& def = practice::detail::definition(state, slot.practiceId);
            if (def.retinueForce && *def.retinueForce != 0 && supplied_recipe(state, site, def))
                bonus += *def.retinueForce;
        }
    }
    return std::floor(std::max(0.0, prestige) / 10) + std::floor(bonus);
}

namespace {

double martial_force(const RuntimeState& state)
{
    double force = 0;
    if (!state.hot.rulesetId)
        for (const auto& [region, amount] : legacy_support(state)) force += std::max(0.0, amount);
    if (!state.indexes.currentVassal) return force;
    const auto& vassal = state.tables.at(state.indexes.currentVassal).value;
    if (state.hot.rulesetId) force = available_warriors(state, vassal.locationRegionId);
    const bool prowess = vassal.classId == browser::SpecialistClass::warrior ||
        (!vassal.classId && vassal.founderClassId && state.name(*vassal.founderClassId) == "warrior");
    if (!prowess) return force;
    auto intelligence = std::max(0.0, std::floor(vassal.stats.intelligence));
    for (const auto& item : state.cold.at(vassal.heirlooms.row).get().equipped)
        if (item && item->definitionId == "abacus") ++intelligence;
    return force + intelligence + retinue(state, vassal);
}

RegionId market_target(const RuntimeState& state, RegionId region, MarketAccess access)
{
    std::optional<double> force;
    for (const auto id : roads(state, region)) {
        const auto* target = site_at_region(state, id);
        if (!target || !target->neutral || !stocked_goods(state, *target->neutral)) continue;
        if (access == MarketAccess::trade) return id;
        if (!force) force = martial_force(state);
        if (state.tables.at(*target->neutral).defense <= *force) return id;
    }
    return {};
}

void record_support(RuntimeState& state, RegionId region, FactionId faction, content::MartialAction action)
{
    struct Context {
        RuntimeState& state;
        SymbolId action;
    } context{state, state.practiceVocabulary.martialActions[static_cast<unsigned>(action)]};
    auto& sources = state.territory.supportSources;
    sources.clear();
    const auto contribute = [](RegionId source, double force, void* opaque) {
        auto& ctx = *static_cast<Context*>(opaque);
        auto& s = ctx.state;
        s.territory.supportSources.push_back(source);
        EventData event{};
        event.fields.actionKind = ctx.action;
        event.fields.amount = force;
        event.fields.classId = browser::OptionalNullable<SymbolId>{std::nullopt};
        practice::emit(s, EventKind::supportContributed, source, event);
        if (auto* site = site_at_region(s, source); site && site->detailedState.supportBank)
            site->detailedState.supportBank = runtime::SupportBank{};
    };
    if (state.hot.rulesetId) military(state, region, faction, contribute, &context);
    else for (const auto& [id, force] : legacy_support(state))
        if (force > 0) contribute(id, force, &context);
    EventData event{};
    event.fields.actionKind = context.action;
    event.fields.classId = browser::OptionalNullable<SymbolId>{std::nullopt};
    event.sources = std::span<const RegionId>(sources);
    practice::emit(state, EventKind::martialActionResolved, region, event);
}

bool joint_population(const Site& site)
{
    const auto& cohorts = site.detailedState.populationByClass;
    return cohorts.villager.joint || cohorts.stranger.joint;
}

void collect_residents(const RuntimeState& state, const Site& site, std::vector<settlement::PopulationBin>& output)
{
    using namespace settlement;
    if (joint_population(site)) {
        collect_population(state, site.detailedState.populationByClass, output);
        return;
    }
    thread_local std::array<Cohort, 3> parts;
    thread_local CohortScratch scratch;
    output.clear();
    const auto& lex = state.populationVocabulary;
    for (const auto residency : {Residency::villager, Residency::stranger}) {
        split_specialist_cohorts(state, population_class(site.detailedState.populationByClass, residency), parts, scratch);
        const auto append = [&](std::size_t specialty, auto stage, std::optional<std::uint64_t> age, std::uint64_t count) {
            if (count) output.push_back({residency, {{}, lex.specialties[specialty], stage, age}, count});
        };
        for (std::size_t i = 0; i < parts.size(); ++i)
            append(i, lex.stages[1], {}, static_cast<std::uint64_t>(parts[i].children));
        for (std::size_t i = 0; i < parts.size(); ++i)
            append(i, lex.stages[0], {}, static_cast<std::uint64_t>(parts[i].adults));
        const auto ages = std::max({parts[0].elders.size(), parts[1].elders.size(), parts[2].elders.size()});
        for (std::size_t age = 0; age < ages; ++age)
            for (std::size_t i = 0; i < parts.size(); ++i) if (age < parts[i].elders.size()) {
                const auto& elder = parts[i].elders[age];
                append(i, lex.stages[2], elder.age, elder.count);
            }
    }
}

double residents(const RuntimeState& state, const Site& site)
{
    const auto& classes = settlement::population_totals(state, site.id).byResidency;
    return static_cast<double>(classes[0].total() + classes[1].total());
}

double housing(const RuntimeState& state, const Site& site)
{
    if (site.neutral) return state.tables.at(*site.neutral).housing;
    double total = 0;
    for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins)) {
        if (cell.construction) continue;
        const auto& def = practice::detail::definition(state, cell.structureId);
        const auto quality = 1 + .25 * std::max(0.0, cell.qualityBonus.value_or(0));
        total += std::floor(def.housing.value_or(0) * quality);
    }
    return total;
}

}

ExternalPlan plan_external(const RuntimeState& state, const Site& site, ExternalAction action)
{
    if (site.neutral) return {.ok = action == ExternalAction::trade};
    if (action == ExternalAction::hunt) {
        const auto force = state.hot.rulesetId ? military(state, site.regionId, region_at(state, site.regionId).controller).force
                                              : martial_force(state);
        for (const auto id : neighbors(state, site.regionId)) {
            const auto& monster = region_at(state, id).monster;
            if (monster && monster->defense <= force) return {true, monster->defense, id};
        }
        return {.ok = false};
    }
    if (action == ExternalAction::trade) {
        const auto target = market_target(state, site.regionId, MarketAccess::trade);
        return {true, target ? 1.0 : 0.0, target};
    }
    const auto id = market_target(state, site.regionId, MarketAccess::raid);
    if (!id) return {.ok = false};
    const auto& goods = *stocked_goods(state, *site_at_region(state, id)->neutral);
    return {true, std::min(2.0, goods.stock) - 1, id};
}

void commit_external(RuntimeState& state, const Site& site, ExternalAction action,
                     PracticeId practiceId, ExternalPlan plan)
{
    if (site.neutral) return;
    auto& history = state.hot.civilization.history;
    EventData event{};
    event.fields.practiceId = practiceId;
    if (action == ExternalAction::trade) {
        // Trade looks up the first stocked storefront again after payment.
        if (market_target(state, site.regionId, MarketAccess::trade)) {
            history.trades = history.trades.value_or(0) + 1;
            practice::emit(state, EventKind::externalTrade, site.regionId, event);
        }
        return;
    }
    if (!plan.target) return;
    if (action == ExternalAction::hunt) {
        region_at(state, plan.target).monster.reset();
        recount_monsters(state);
        const auto faction = region_at(state, site.regionId).controller;
        if (state.hot.rulesetId && faction != state.practiceVocabulary.player) {
            auto& local = site_at_region(state, site.regionId)->detailedState.history;
            if (!local) local.emplace();
            local->victories = local->victories.value_or(0) + 1;
        } else ++history.victories;
        record_support(state, site.regionId, faction, content::MartialAction::hunt);
        practice::emit(state, EventKind::monsterDestroyed, site.regionId, event);
        return;
    }
    const auto* market = site_at_region(state, plan.target);
    if (!market || !market->neutral) return;
    for (auto& goods : state.tables.view(state.tables.at(*market->neutral).stocks)) {
        if (goods.stock <= 0) continue;
        goods.stock -= std::min(2.0, goods.stock);
        ++history.raids;
        practice::emit(state, state.territory.raidResolved, site.regionId, event);
        break;
    }
}

bool defend_legacy(RuntimeState& state, Site& site, double strength)
{
    const auto& board = site.detailedState.practiceSlots;
    const auto& v = state.practiceVocabulary;
    const auto& t = state.compiledContent->tables;
    const auto edible = [&](auto row) {
        return row && state.practiceStock[row.value] && practice::detail::has(
            t.view(practice::detail::definition(state, state.tables.at(row).practiceId).stockTraits), v.edible);
    };
    double stored = 0;
    for (const auto row : board.slots)
        if (edible(row)) stored += std::max(0.0, *state.practiceStock[row.value]);
    if (stored < 1) return false;
    for (const auto& slot : state.tables.view(board.rows)) {
        const auto& def = practice::detail::definition(state, slot.practiceId);
        if (!def.defenseMultiplier.value_or(0)) continue;
        const auto plan = practice::plan_stock(state, site, t.view(def.consume), t.view(def.require_), nullptr, false, false);
        if (!plan.ok) continue;
        double cost = 0;
        for (const auto& provider : plan.providers)
            if (provider.receipt.record.kind == v.consume && provider.source.region == site.regionId &&
                edible(provider.source.practice)) cost += provider.receipt.record.amount;
        if (stored < cost + 1) continue;
        if (martial_force(state) < strength) return false;

        auto& journal = state.hot.civilization.practiceEvents;
        const auto root = practice::emit(state, state.territory.defense, site.regionId);
        struct Scope {
            PracticeEventJournal& journal;
            std::optional<double> root, event;
            ~Scope() { journal.activeRoot = root; journal.activeEvent = event; }
        } scope{journal, journal.activeRoot, journal.activeEvent};
        journal.activeRoot = root.rootId;
        journal.activeEvent = root.id;
        record_support(state, site.regionId, v.player, content::MartialAction::defense);
        practice::apply_stock(state, site, plan);
        double remaining = 1;
        for (const auto row : board.slots) if (edible(row)) {
            auto& stock = *state.practiceStock[row.value];
            const auto take = std::min(remaining, std::max(0.0, stock));
            stock -= take;
            remaining -= take;
        }
        state.hot.civilization.research.total += strength;
        practice::emit(state, EventKind::defenseSucceeded, site.regionId);
        return true;
    }
    return false;
}

void evacuate_legacy(RuntimeState& state, const Site& source)
{
    using namespace settlement;
    double share = 0;
    for (const auto& modifier : practice::detail::modifiers(state, source))
        if (modifier.def->kind == ModifierKind::evacuationShare) share += modifier.amount;
    const auto maximum = std::ceil(residents(state, source) * std::min(.75, share));
    if (maximum <= 0) return;
    for (const auto region : roads(state, source.regionId)) {
        auto* target = site_at_region(state, region);
        if (!target || region == source.regionId || region_at(state, region).controller != state.practiceVocabulary.player) continue;
        const auto free = housing(state, *target) - residents(state, *target);
        if (free <= 0) continue;
        struct Workspace {
            std::vector<PopulationBin> source, target, selected, moved;
            LedgerScratch ledger;
        };
        thread_local Workspace scratch;
        collect_residents(state, source, scratch.source);
        const auto sourceJoint = joint_population(source);
        allocate_population(state, scratch.source, std::min(maximum, free), scratch.selected, scratch.ledger,
                            PopulationTie::input_order);
        if (scratch.selected.empty()) continue;
        remove_population(scratch.source, scratch.selected, scratch.moved);
        write_population_bins(state, source.id, scratch.source, scratch.ledger, sourceJoint);
        collect_residents(state, *target, scratch.target);
        const auto targetJoint = joint_population(*target);
        if (!targetJoint) reset_empty_stranger_cohort(state, target->detailedState.populationByClass.stranger);
        double moved = 0;
        for (auto bin : scratch.moved) {
            bin.residency = Residency::stranger;
            scratch.target.push_back(bin);
            moved += static_cast<double>(bin.count);
        }
        write_population_bins(state, target->id, scratch.target, scratch.ledger, targetJoint);
        EventData event{};
        event.fields.destinationId = region;
        event.fields.amount = moved;
        practice::emit(state, state.territory.populationRescued, source.regionId, event);
        break;
    }
}

}
