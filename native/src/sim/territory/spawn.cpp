#include "sim/territory/territory.hpp"
#include "sim/territory/detail.hpp"

#include "core/js_number.hpp"
#include "sim/content/compiled_content.hpp"
#include "sim/practice/practice.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim::territory {
namespace {

using browser::SpawnCause;
using browser::SpawnOutcome;
using practice::EventData;
using practice::EventKind;

double round_pressure(double value)
{
    return core::js::round(value * 1e9) / 1e9;
}

std::span<const RegionId> authored_regions(const RuntimeState& state)
{
    return state.topology ? state.topology->regions() : std::span<const RegionId>{};
}

}

RegionId expansion_target(const RuntimeState& state, RegionId source)
{
    if (state.hot.rulesetId && settlement::detailed_site(state, source)) return source;
    RegionId first;
    for (const auto id : neighbors(state, source)) {
        const auto& region = region_at(state, id);
        if (region.monster) continue;
        if (region.controller == state.practiceVocabulary.frontier && !site_at_region(state, id)) return id;
        if (!first) first = id;
    }
    return first;
}

namespace {

void pressure_event(RuntimeState& state, RegionId region, SymbolId action)
{
    EventData event{};
    event.fields.action = action;
    practice::emit(state, EventKind::monsterPressure, region, event);
}

void strengthen(RuntimeState& state, Region& region)
{
    region.monster->defense += repel_strength_gain;
    pressure_event(state, region.id, state.territory.strengthen);
}

SpawnOutcome expand(RuntimeState& state, Region& source, RegionId id)
{
    auto& target = region_at(state, id);
    auto* site = site_at_region(state, id);
    if (state.hot.rulesetId && site && site->simulationMode == state.territory.detailed) {
        const auto defense = military(state, id, target.controller).defense;
        EventData event{};
        event.fields.faction = browser::OptionalNullable<FactionId>{target.controller};
        if (defense_holds(defense, source.monster->defense)) {
            practice::emit(state, EventKind::defenseSucceeded, id, event);
            site->detailedState.lastDefense = DetailedSettlementLastDefense{state.hot.tSec, state.territory.held, source.id};
            return SpawnOutcome::intercepted;
        }
        if (target.controller == state.practiceVocabulary.player) ++state.hot.civilization.history.lostSettlements;
        target.lostAtSec = state.hot.tSec;
        practice::emit(state, EventKind::settlementLost, id, event);
    } else if (!state.hot.rulesetId && target.controller == state.practiceVocabulary.player && site) {
        if (defend_legacy(state, *site, source.monster->defense)) {
            site->detailedState.lastDefense = DetailedSettlementLastDefense{state.hot.tSec, state.territory.held, source.id};
            return SpawnOutcome::intercepted;
        }
        ++state.hot.civilization.history.lostSettlements;
        evacuate_legacy(state, *site);
        target.lostAtSec = state.hot.tSec;
        practice::emit(state, EventKind::settlementLost, id);
        site->detailedState.lastDefense = DetailedSettlementLastDefense{state.hot.tSec, state.territory.lost, source.id};
    }
    if (site) {
        if (site->town && site->neutral) site->town->market = site->neutral;
        site->neutral.reset();
        site->simulationMode = state.territory.ruin;
        target.detailedSettlementEnabled = false;
        // In-flight listeners and scheduled retries keep their existing
        // indices. The region lookup invalidates eligibility immediately.
        auto& detailed = state.indexes.detailedSitesByRegion[id.value];
        if (detailed == site->id) detailed = {};
        state.territory.sitesDirty = true;
    }
    target.controller = state.practiceVocabulary.frontier;
    target.monster = RegionMonster{source.monster->defense};
    pressure_event(state, id, state.territory.expand);
    return SpawnOutcome::expanded;
}

ChaosLastMonsterSpawn pulse(RuntimeState& state, SpawnCause cause)
{
    auto& chaos = state.hot.civilization.chaos;
    ChaosLastMonsterSpawn result{.tSec = state.hot.tSec, .cause = cause, .outcome = SpawnOutcome::blocked};
    RegionId firstThreat, firstTarget, selected, selectedTarget;
    bool afterPrevious = !chaos.lastPressureRegionId;
    const auto regions = authored_regions(state);
    for (const auto id : regions) {
        if (region_at(state, id).monster) {
            if (const auto target = expansion_target(state, id)) {
                if (afterPrevious) {
                    selected = id;
                    selectedTarget = target;
                    break;
                }
                if (!firstThreat) {
                    firstThreat = id;
                    firstTarget = target;
                }
            }
        }
        if (id == chaos.lastPressureRegionId) afterPrevious = true;
    }
    if (!selected) {
        selected = firstThreat;
        selectedTarget = firstTarget;
    }
    if (selected) {
        auto& source = region_at(state, selected);
        chaos.lastPressureRegionId = selected;
        pressure_event(state, selected, state.territory.advance);
        result.sourceRegionId = selected;
        result.targetRegionId = selectedTarget;
        result.strengthBefore = source.monster->defense;
        result.outcome = expand(state, source, selectedTarget);
        if (result.outcome == SpawnOutcome::intercepted) strengthen(state, source);
        result.strengthAfter = source.monster->defense;
        return result;
    }
    Region* weakest = nullptr;
    for (const auto id : regions) {
        auto& region = region_at(state, id);
        if (!region.monster && (state.hot.rulesetId ||
            (region.controller == state.practiceVocabulary.frontier && !site_at_region(state, id)))) {
            region.monster = RegionMonster{3 + std::floor(++chaos.spatialSpawns / 3)};
            pressure_event(state, id, state.territory.spawn);
            result.targetRegionId = id;
            result.strengthAfter = region.monster->defense;
            result.outcome = SpawnOutcome::appeared;
            return result;
        }
        if (region.monster && (!weakest || region.monster->defense < weakest->monster->defense)) weakest = &region;
    }
    if (weakest) {
        result.targetRegionId = weakest->id;
        result.strengthBefore = weakest->monster->defense;
        strengthen(state, *weakest);
        result.strengthAfter = weakest->monster->defense;
        result.outcome = SpawnOutcome::strengthened;
    }
    return result;
}

void resolve_spawn(RuntimeState& state, SpawnCause cause)
{
    auto& chaos = state.hot.civilization.chaos;
    ++chaos.expansionEvents;
    const auto result = pulse(state, cause);
    chaos.lastMonsterSpawn = result;
    EventData event{};
    event.fields.cause = cause == SpawnCause::creep ? state.territory.creep : state.territory.direct;
    event.fields.outcome = state.territory.spawnOutcomes[static_cast<std::size_t>(result.outcome)];
    if (result.sourceRegionId) event.fields.sourceRegionId = browser::OptionalNullable<RegionId>{*result.sourceRegionId};
    if (result.targetRegionId) event.fields.targetRegionId = browser::OptionalNullable<RegionId>{*result.targetRegionId};
    if (result.strengthBefore) event.fields.strengthBefore = browser::OptionalNullable<double>{*result.strengthBefore};
    if (result.strengthAfter) event.fields.strengthAfter = browser::OptionalNullable<double>{*result.strengthAfter};
    practice::emit(state, EventKind::monsterSpawn, {}, event);
}

void finish_resolution(RuntimeState& state)
{
    const auto survivor = first_player_site(state);
    if (survivor && state.indexes.currentVassal) {
        auto& vassal = state.tables.at(state.indexes.currentVassal).value;
        const auto from = vassal.locationRegionId;
        const auto* prior = site_at_region(state, from);
        if (!prior || prior->simulationMode != state.territory.detailed ||
            (!state.hot.rulesetId && region_at(state, from).controller != state.practiceVocabulary.player)) {
            const auto to = settlement::site_at(state, survivor).regionId;
            vassal.locationRegionId = to;
            const auto name = state.topology ? state.topology->region_name(from) : state.name(from);
            const auto eventId = std::string(state.name(vassal.vassalId)) + ":evacuation:" +
                std::to_string(static_cast<std::uint64_t>(state.hot.tSec));
            const auto text = "Evacuated " + std::string(name) + " after territorial loss.";
            state.histories.at(vassal.lifeEvents.row).append([&](HistoryPayload& page) {
                return VassalLifeEventsEntry{
                    .eventId = page.intern_text(eventId, "Vassal evacuation"),
                    .kind = state.territory.evacuation, .tSec = state.hot.tSec,
                    .text = page.intern_text(text, "Vassal evacuation"),
                    .fromRegionId = from, .toRegionId = to,
                };
            });
        }
    }
    recount_monsters(state);
    if (!survivor) end_run(state, browser::RunEndReason::monsterOverrun);
}

double resistance_to_chaos(const RuntimeState& state)
{
    std::array<double, 4> population{};
    const auto& ids = state.faithStage.faith;
    const auto player = state.practiceVocabulary.player;
    for (const auto id : settlement::detailed_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        if (region_at(state, site.regionId).controller != player) continue;
        const auto& cohorts = site.detailedState.populationByClass;
        const auto& totals = settlement::population_totals(state, id).byResidency;
        for (const auto residency : {0u, 1u}) {
            const auto& cohort = residency == 0 ? cohorts.villager : cohorts.stranger;
            const auto tier = std::ranges::find(ids, cohort.faith.tier);
            if (tier != ids.end()) population[tier - ids.begin()] += static_cast<double>(totals[residency].total());
        }
    }
    const auto& settings = state.compiledContent->settings();
    const auto faith = 0.0 + population[0] / settings.bronzeChaosResistancePopulation
        + population[1] / settings.silverChaosResistancePopulation
        + population[2] / settings.goldChaosResistancePopulation
        + population[3] / settings.diamondChaosResistancePopulation;
    const auto value = faith * settings.populationChaosResistanceMultiplier + state.hot.civilization.phaseModifiers.faithResistance;
    return std::max(0.0, core::js::round(value * 100000) / 100000);
}

}

void recount_monsters(RuntimeState& state)
{
    state.hot.civilization.chaos.monsterCount = static_cast<double>(
        std::ranges::count_if(state.tables.view(state.hot.world.regions), [](const auto& region) { return region.monster.has_value(); }));
}

void add_pressure(RuntimeState& state, double amount)
{
    if (terminal(state)) return;
    auto& chaos = state.hot.civilization.chaos;
    const auto threshold = state.compiledContent->settings().monsterExpansionThreshold;
    chaos.monsterPressure = round_pressure(chaos.monsterPressure + std::max(0.0, amount));
    while (chaos.monsterPressure >= threshold && first_player_site(state)) {
        chaos.monsterPressure = round_pressure(chaos.monsterPressure - threshold);
        resolve_spawn(state, SpawnCause::creep);
    }
    finish_resolution(state);
}

void trigger_spawn(RuntimeState& state, double count)
{
    for (double i = 0; i < count && !terminal(state) && first_player_site(state); ++i) {
        resolve_spawn(state, SpawnCause::direct);
        finish_resolution(state);
    }
}

void step_pressure(RuntimeState& state)
{
    if (terminal(state)) return;
    const auto power = state.hot.civilization.chaos.chaosPower.value_or(0);
    const auto resistance = power > 0 ? resistance_to_chaos(state) : 0;
    const auto ratio = std::max(0.0, power - resistance) / std::max(1.0, resistance);
    add_pressure(state, ratio * state.compiledContent->settings().monsterProgressPerChaosRatio);
}

}
