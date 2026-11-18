#include "sim/stages/entries.hpp"

#include "core/js_number.hpp"
#include "sim/state/runtime_state.hpp"

#include <algorithm>

namespace waffle::sim::stages {
namespace {

namespace js = core::js;

constexpr double tickDuration = 1.0 / ticksPerSecond;
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

void advance_clock_ticks(RuntimeState& state, StageContext& context, int ticks) noexcept
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
            context.seasonChanged = true;
        }
    }
    hot.simTime = elapsed;
    hot.seasonClockSec = seasonClock;
    hot.seasonTimeRemaining = std::max(0.0, duration - seasonClock);
}

}

bool advance_clock(RuntimeState& state, StageContext& context)
{
    context.clockBoundary.reset();
    auto& hot = state.hot;
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
        advance_clock_ticks(state, context, ticksPerSecond);
        return true;
    }

    // For a mid-second anchor, leave the ticks after dispatch to the driver.
    // AP on the boundary tick still sees the clock before that tick.
    const double boundary = std::max(firstIndex + 1, (hot.tSec + 1) * ticksPerSecond);
    const int ticksToBoundary = static_cast<int>(std::clamp(boundary - firstIndex, 1.0, double(ticksPerSecond)));
    advance_clock_ticks(state, context, ticksToBoundary - 1);
    hot.simStepIndex = firstIndex + ticksToBoundary;
    hot.tSec = js::floor(hot.simStepIndex / ticksPerSecond);
    update_action_points(hot, hot.tSec);
    advance_clock_ticks(state, context, 1);
    context.clockBoundary = StageContext::ClockBoundary{lastIndex, ticksPerSecond - ticksToBoundary};
    return true;
}

void finish_clock_tail(RuntimeState& state, StageContext& context)
{
    const auto boundary = *context.clockBoundary;
    state.hot.simStepIndex = boundary.lastStepIndex;
    advance_clock_ticks(state, context, boundary.remainingTicks);
}

}
