#include "sim/settlement/prelude.hpp"

#include "core/js_number.hpp"
#include "sim/settlement/site_access.hpp"

#include <algorithm>

namespace waffle::sim::settlement {
namespace {

using namespace runtime;
namespace js = core::js;
using MoonRegion = Entry<RegionId, MoonRegionResult>;

void finish_unrest_expiry(RuntimeState& state, Site& site)
{
    cancel_moon_migration(state, site.regionId);
    // N03e-8 clears control, restores the market and emits unrestEnded.
}

void step_unrest(RuntimeState& state)
{
    if (!state.hot.rulesetId) return;
    const auto second = state.hot.tSec;
    const auto& settings = state.content->config.settings.values;
    const double secondsPerYear = 4 * settings.seasonDurationSec;
    auto& income = state.hot.civilization.chaos.pendingUnrestIncome;
    for (const auto id : detailed_sites(state)) {
        auto& site = site_at(state, id);
        const auto& control = site.detailedState.control;
        if (!control || !control->unrest) continue;
        const auto episode = *control->unrest;
        const double elapsed = std::max(0.0, std::min(second, episode.untilSec)
                                           - std::max(second - 1, episode.startedSec));
        income = income.value_or(0) + elapsed * settings.unrestChaosPerYear / secondsPerYear;
        if (second >= episode.untilSec) finish_unrest_expiry(state, site);
    }
}

MoonRegionResult empty_result(RegionId region)
{
    return {region};
}

void copy_site_results(RuntimeState& state, const MoonTurn& previous)
{
    const auto prior = state.tables.view(previous.regions);
    auto results = state.tables.view(state.settlementPrelude.siteResults);
    std::size_t next = 0;
    for (const auto id : detailed_sites(state)) {
        auto& site = site_at(state, id);
        const auto region = site.regionId;
        // The normal case has the same site order in both moons. Look up by
        // key if a formerly absent site has become detailed.
        auto found = next < prior.size() ? prior.begin() + next : prior.end();
        if (found == prior.end() || found->key != region)
            found = std::ranges::find(prior, region, &MoonRegion::key);
        if (found != prior.end()) next = found - prior.begin() + 1;
        results[id.value] = found == prior.end() ? empty_result(region) : found->value;
        site.detailedState.lastMoonResult = Index<MoonRegionResult>{state.settlementPrelude.siteResults.begin + id.value};
    }
}

void write_moon_phase(RuntimeState& state, MoonTurn& turn, LunarPhase phase)
{
    const auto index = static_cast<std::size_t>(phase);
    turn.phaseId = state.settlementPrelude.phases[index];
    turn.phaseIndex = static_cast<double>(index);
}

}

void prepare_prelude(RuntimeState& state)
{
    if (!state.hot.variantFlags.settlementPrototypeEnabled) return;
    auto& cache = state.settlementPrelude;
    constexpr auto path = "settlement prelude";
    cache.spring = state.find_id<SeasonId>("spring");
    cache.gold = state.intern<SymbolId>("gold", path);
    cache.neutral = state.intern<SymbolId>("neutral", path);
    constexpr std::array<std::string_view, 6> phases{"birth", "food", "housing", "faith", "migration", "death"};
    for (std::size_t index = 0; index < phases.size(); ++index)
        cache.phases[index] = state.intern<SymbolId>(phases[index], path);

    const auto sites = state.hot.world.sites.size();
    cache.siteResults = state.tables.table<MoonRegionResult>().append(sites, path);
    for (auto& buffer : cache.moonRegions)
        buffer = state.tables.table<MoonRegion>().append(sites, path);
}

void second_prelude(RuntimeState& state)
{
    step_unrest(state);
    const auto& settings = state.content->config.settings.values;
    const auto tier = settings.greenAutomaticTier
        ? std::max(1.0, state.hot.year) / std::max(1.0, js::floor(settings.greenCadenceYears))
        : settings.greenForcedTier;
    state.hot.civilization.green.tier = std::clamp(js::floor(tier), 0.0, 3.0);
    for (const auto id : detailed_sites(state))
        reset_empty_stranger_cohort(state, site_at(state, id).detailedState.populationByClass.stranger);
}

void reset_empty_stranger_cohort(const RuntimeState& state, PopulationClass& stranger)
{
    if (stranger.children || stranger.adults ||
        (stranger.eldersByAge.size() && std::ranges::any_of(state.tables.view(stranger.eldersByAge),
                                           [](const auto& elder) { return elder.count != 0; }))) return;
    stranger.specialists = {};
    stranger.faith = {state.settlementPrelude.gold};
    stranger.happiness = {state.settlementPrelude.neutral};
}

void spring_death_baseline(RuntimeState& state)
{
    for (const auto id : detailed_sites(state)) {
        auto& history = site_at(state, id).detailedState.history;
        if (!history) history.emplace();
        history->springDeaths = history->deaths;
    }
}

MoonTurn& begin_moon_turn(RuntimeState& state, LunarSchedule phase)
{
    auto& civ = state.hot.civilization;
    if (civ.currentMoonTurn) {
        // Rotate ownership of the old dictionary. Later phases must replace
        // report payloads by index, leaving published report rows immutable
        // while lastMoonTurn or a site's lastMoonResult still references them.
        civ.lastMoonTurn = civ.currentMoonTurn;
        copy_site_results(state, *civ.lastMoonTurn);
    }
    auto& cache = state.settlementPrelude;
    auto regionRows = cache.moonRegions[cache.nextMoonBuffer];
    cache.nextMoonBuffer ^= 1;
    const auto sites = detailed_sites(state);
    regionRows.end = regionRows.begin + static_cast<std::uint32_t>(sites.size());
    auto regions = state.tables.view(regionRows);
    for (std::size_t index = 0; index < sites.size(); ++index) {
        const auto region = site_at(state, sites[index]).regionId;
        regions[index] = {region, empty_result(region)};
    }
    auto& turn = civ.currentMoonTurn.emplace();
    turn.moonIndex = phase.moonIndex;
    turn.startedSec = state.hot.tSec;
    turn.regions = regionRows;
    write_moon_phase(state, turn, phase.phase);
    return turn;
}

MoonTurn& set_moon_turn_phase(RuntimeState& state, LunarSchedule phase)
{
    auto& current = state.hot.civilization.currentMoonTurn;
    if (!current || current->moonIndex != phase.moonIndex) return begin_moon_turn(state, phase);
    write_moon_phase(state, *current, phase.phase);
    return *current;
}

}
