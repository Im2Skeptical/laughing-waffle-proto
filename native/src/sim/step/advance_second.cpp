#include "sim/step/advance_second.hpp"

#include "core/js_number.hpp"
#include "sim/state/runtime_state.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim {
namespace {

namespace js = core::js;

constexpr int ticksPerSecond = 60;
constexpr double tickDuration = 1.0 / ticksPerSecond;
constexpr double defaultSeasonDurationSec = 8;
constexpr double apCycleSec = 6;
constexpr double apPhaseOffsetSec = 0;
constexpr double apMinCap = 0;
constexpr double apMaxCap = 120;
constexpr double apIncome = 1;
constexpr double apWaxingMultiplier = 8;
constexpr double apWaningMultiplier = 0;

bool terminal(const runtime::HotState& hot) noexcept
{
    return hot.runStatus && hot.runStatus->complete;
}

double phase_duration(double setting) noexcept
{
    return std::isfinite(setting) ? std::max(1.0, js::floor(setting)) : 1.0;
}

void update_action_points(runtime::HotState& hot, double second) noexcept
{
    // Import establishes the numeric AP shape; the browser's typeof guards
    // and skill-shape normalization are already satisfied by live snapshots.
    double income = apIncome;
    if (hot.apCapOverride && hot.apCapOverride->enabled) {
        hot.actionPointCap = std::max(0.0, js::floor(hot.apCapOverride->cap));
    } else {
        constexpr double half = apCycleSec / 2;
        const double phaseSec = js::remainder(second + apPhaseOffsetSec, apCycleSec);
        const bool waxing = phaseSec <= half;
        const double phase = (waxing ? phaseSec : apCycleSec - phaseSec) / half;
        const double baseCap = js::round(apMinCap + phase * (apMaxCap - apMinCap));
        const double bonus = js::floor(hot.skillRuntime.modifiers.global.apCapBonus);
        hot.actionPointCap = std::max(0.0, baseCap + bonus);
        income *= waxing ? apWaxingMultiplier : apWaningMultiplier;
    }
    hot.actionPoints = std::min(hot.actionPoints + income, hot.actionPointCap);
}

void advance_clock(RuntimeState& state, int ticks) noexcept
{
    auto& hot = state.hot;
    const double duration = hot.seasonDurationSec > 0 ? hot.seasonDurationSec : defaultSeasonDurationSec;
    const double seasonCount = hot.seasons.size();
    double elapsed = hot.simTime;
    double seasonClock = hot.seasonClockSec;
    for (int tick = 0; tick < ticks; ++tick) {
        elapsed += tickDuration;
        seasonClock += tickDuration;
        while (seasonClock >= duration) {
            seasonClock -= duration;
            if (seasonCount == 0) break;
            hot.currentSeasonIndex = js::remainder(hot.currentSeasonIndex + 1, seasonCount);
            if (hot.currentSeasonIndex == 0) hot.year = std::max(1.0, hot.year + 1);
            state.seasonChanged = true;
        }
    }
    hot.simTime = elapsed;
    hot.seasonClockSec = seasonClock;
    hot.seasonTimeRemaining = std::max(0.0, duration - seasonClock);
}

// Deferred stage writes and their owners are listed in parity-masks.json.
void prelude(RuntimeState&) {}                                     // Unrest, Green, Stranger defaults.
void seasonal_practices(RuntimeState&) {}                          // Recipes, Stock, Charge, events.
void spring_death_baseline(RuntimeState&) {}                       // Site history.springDeaths.
void birth(RuntimeState&, LunarSchedule) {}                        // Moon turns, cohorts, aging and RNG.
void food(RuntimeState&, LunarSchedule) {}                         // Meals, market and reservations.
void after_meals_practices(RuntimeState&) {}                       // Recipes, Stock, Charge, events.
void garrison_upkeep(RuntimeState&) {}                             // Supplies and garrison records.
void housing(RuntimeState&, LunarSchedule) {}                      // Construction and Housing results.
void faith(RuntimeState&, LunarSchedule) {}                        // Faith, happiness and Chaos.
void migration_practices(RuntimeState&) {}                         // Recipes, Stock, Charge, events.
void migration(RuntimeState&, LunarSchedule) {}                    // Movement and population ledgers.
void death(RuntimeState&, LunarSchedule) {}                        // Mortality, arrivals, losses and RNG.
void death_practices(RuntimeState&) {}                             // Recipes, Stock, Charge, events.
void control_and_spatial_pressure(RuntimeState&) {}                // Territory, Creep and terminal status.
void phase_events_and_drain(RuntimeState&, LunarSchedule, double) {} // Phase events and Discharge.
void vassal_check(RuntimeState&) {}                                // Commission and due Life Map work.
void final_flush(RuntimeState&) {}                                 // Pending events, reactions and journals.

void dispatch_second(RuntimeState& state)
{
    auto& hot = state.hot;
    if (!hot.variantFlags.settlementPrototypeEnabled) return;

    prelude(state);
    if (state.seasonChanged) {
        seasonal_practices(state);
        if (terminal(hot)) {
            final_flush(state);
            return;
        }
        const auto seasons = state.tables.view(hot.seasons);
        if (hot.currentSeasonIndex >= 0 && hot.currentSeasonIndex < static_cast<double>(seasons.size()) &&
            state.name(seasons[static_cast<std::size_t>(hot.currentSeasonIndex)]) == "spring") {
            spring_death_baseline(state);
        }
    }
    if (hot.tSec >= state.nextLunarBoundarySec) {
        const double duration = phase_duration(state.content->config.settings.values.phaseDurationSec);
        const auto phase = lunar_schedule_at_second(hot.tSec, duration);
        const double sinceBoundary = phase.boundary ? 0 : js::remainder(hot.tSec - 1, duration);
        state.nextLunarBoundarySec = hot.tSec + (duration - sinceBoundary);
        if (phase.boundary) {
            const double chaosBefore = hot.civilization.chaos.chaosPower;
            switch (phase.phase) {
            case LunarPhase::birth:
                birth(state, phase);
                break;
            case LunarPhase::food:
                food(state, phase);
                after_meals_practices(state);
                garrison_upkeep(state);
                break;
            case LunarPhase::housing:
                housing(state, phase);
                break;
            case LunarPhase::faith:
                faith(state, phase);
                break;
            case LunarPhase::migration:
                if (hot.rulesetId) migration_practices(state);
                migration(state, phase);
                break;
            case LunarPhase::death:
                death(state, phase);
                death_practices(state);
                control_and_spatial_pressure(state);
                break;
            }
            phase_events_and_drain(state, phase, chaosBefore);
        }
    }
    if (!terminal(hot)) vassal_check(state);
    final_flush(state);
}

} // namespace

LunarSchedule lunar_schedule_at_second(double second, double phaseDurationSec) noexcept
{
    second = std::max(0.0, js::floor(second));
    if (second == 0) return {LunarPhase::birth, 0, false};

    constexpr double phaseCount = 6;
    const double duration = phase_duration(phaseDurationSec);
    const double elapsed = second - 1;
    const double phaseIndex = js::remainder(js::floor(elapsed / duration), phaseCount);
    return {static_cast<LunarPhase>(static_cast<int>(phaseIndex)), js::floor(elapsed / (duration * phaseCount)),
            js::remainder(elapsed, duration) == 0};
}

bool advance_one_second(RuntimeState& state)
{
    auto& hot = state.hot;
    if (hot.paused || terminal(hot)) return false;

    const double firstIndex = hot.simStepIndex;
    double lastIndex = firstIndex + ticksPerSecond;
    constexpr double maxExactIndex = 0x1p53;
    if (firstIndex >= maxExactIndex - ticksPerSecond || firstIndex <= -maxExactIndex) {
        lastIndex = firstIndex;
        for (int tick = 0; tick < ticksPerSecond; ++tick) lastIndex += 1;
    }
    const double second = js::floor(lastIndex / ticksPerSecond);
    if (second <= hot.tSec) {
        hot.simStepIndex = lastIndex;
        advance_clock(state, ticksPerSecond);
        return false;
    }

    // An imported browser snapshot can be between boundaries. Split the
    // numeric kernel around the dispatch tick so AP sees the pre-tick clock.
    const double boundary = std::max(firstIndex + 1, (hot.tSec + 1) * ticksPerSecond);
    const int ticksToBoundary = static_cast<int>(std::clamp(boundary - firstIndex, 1.0, double(ticksPerSecond)));
    advance_clock(state, ticksToBoundary - 1);
    hot.simStepIndex = firstIndex + ticksToBoundary;
    hot.tSec = js::floor(hot.simStepIndex / ticksPerSecond);
    update_action_points(hot, hot.tSec);
    advance_clock(state, 1);
    dispatch_second(state);
    state.seasonChanged = false;

    if (ticksToBoundary < ticksPerSecond && !hot.paused && !terminal(hot)) {
        hot.simStepIndex = lastIndex;
        advance_clock(state, ticksPerSecond - ticksToBoundary);
    }
    return true;
}

}
