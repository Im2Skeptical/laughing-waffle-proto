#include "sim/stages/entries.hpp"

#include "core/js_number.hpp"
#include "sim/state/runtime_state.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim::stages {
namespace {

namespace js = core::js;

constexpr double defaultSeasonDurationSec = 8;
constexpr double apCycleSec = 6;
constexpr double apPhaseOffsetSec = 0;
constexpr double apMinCap = 0;
constexpr double apMaxCap = 120;
constexpr double apIncome = 1;
constexpr double apWaxingMultiplier = 8;
constexpr double apWaningMultiplier = 0;

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

double update_clocks(runtime::HotState& hot, double seasonTicks) noexcept
{
    const double tickInSeason = js::remainder(hot.simStepIndex, seasonTicks);
    hot.simTime = hot.simStepIndex / ticksPerSecond;
    hot.seasonClockSec = tickInSeason / ticksPerSecond;
    hot.seasonTimeRemaining = (seasonTicks - tickInSeason) / ticksPerSecond;
    return tickInSeason;
}

double season_ticks(const runtime::HotState& hot) noexcept
{
    const double duration = hot.seasonDurationSec;
    return (std::isfinite(duration) && duration > 0 && duration == js::floor(duration) ? duration : defaultSeasonDurationSec)
        * ticksPerSecond;
}

}

bool advance_clock(RuntimeState& state, StageContext& context)
{
    context.clockBoundary.reset();
    context.seasonChanged = false;
    auto& hot = state.hot;
    const double firstIndex = hot.simStepIndex;
    double lastIndex = firstIndex + ticksPerSecond;
    constexpr double maxExactIndex = 0x1p53;
    if (firstIndex >= maxExactIndex - ticksPerSecond || firstIndex <= -maxExactIndex) {
        lastIndex = firstIndex;
        for (int tick = 0; tick < ticksPerSecond; ++tick) lastIndex += 1;
    }
    const double second = js::floor(lastIndex / ticksPerSecond);
    const double seasonTicks = season_ticks(hot);
    if (second <= hot.tSec) {
        hot.simStepIndex = lastIndex;
        update_clocks(hot, seasonTicks);
        return true;
    }

    // Mid-second anchors still dispatch at the whole-second tick. If the
    // dispatch permits more ticks, the driver derives the final clock afterward.
    const double boundary = std::max(firstIndex + 1, (hot.tSec + 1) * ticksPerSecond);
    const int ticksToBoundary = static_cast<int>(std::clamp(boundary - firstIndex, 1.0, double(ticksPerSecond)));
    hot.simStepIndex = firstIndex + ticksToBoundary;
    hot.tSec = js::floor(hot.simStepIndex / ticksPerSecond);
    update_action_points(hot, hot.tSec);
    const double tickInSeason = update_clocks(hot, seasonTicks);
    const double seasonCount = hot.seasons.size();
    if (tickInSeason == 0 && seasonCount > 0) {
        const double elapsedSeasons = hot.simStepIndex / seasonTicks;
        hot.currentSeasonIndex = js::remainder(elapsedSeasons, seasonCount);
        hot.year = 1 + js::floor(elapsedSeasons / seasonCount);
        context.seasonChanged = true;
    }
    context.clockBoundary = StageContext::ClockBoundary{lastIndex, ticksPerSecond - ticksToBoundary};
    return true;
}

void finish_clock_tail(RuntimeState& state, const StageContext& context)
{
    auto& hot = state.hot;
    hot.simStepIndex = context.clockBoundary->lastStepIndex;
    update_clocks(hot, season_ticks(hot));
}

}
