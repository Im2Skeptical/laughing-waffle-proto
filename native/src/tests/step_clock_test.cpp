#include "sim/state/runtime_state.hpp"
#include "sim/step/advance_second.hpp"

#include <iostream>
#include <stdexcept>

namespace {

using namespace waffle::sim;

void expect(bool condition, const char* message)
{
    if (!condition) throw std::runtime_error(message);
}

void default_clock()
{
    RuntimeState state;
    auto& hot = state.hot;
    hot.seasons = state.tables.table<runtime::SeasonId>().append(4, "$.seasons");
    hot.seasonDurationSec = 8;
    hot.year = 1;
    for (int second = 1; second <= 33; ++second) {
        expect(advance_one_second(state), "running clock did not advance");
        expect(hot.tSec == second && hot.simStepIndex == second * 60, "second or step index drift");
        const auto ordinal = second / 8;
        expect(hot.currentSeasonIndex == ordinal % 4 && hot.year == 1 + ordinal / 4,
               "season or year changed away from its exact boundary");
        expect(hot.simTime == second && hot.seasonClockSec == second % 8 &&
               hot.seasonTimeRemaining == 8 - second % 8, "tick-derived clocks drifted");
    }
}

void gates_and_ap()
{
    RuntimeState state;
    auto& hot = state.hot;
    hot.actionPoints = 42;
    hot.apCapOverride = runtime::ApCapOverride{true, 43.9, 0};
    hot.paused = true;
    expect(!advance_one_second(state), "paused clock advanced");
    hot.paused = false;
    hot.runStatus = runtime::RunStatus{true, browser::RunEndReason::territorialLoss, 1, 0};
    expect(!advance_one_second(state), "terminal clock advanced");
    expect(hot.actionPoints == 42 && hot.simStepIndex == 0 && hot.simTime == 0, "gate changed the state");

    hot.runStatus.reset();
    expect(advance_one_second(state), "override clock did not advance");
    expect(hot.actionPointCap == 43 && hot.actionPoints == 43, "override cap floor or override income differs");
    hot.apCapOverride->cap = 46;
    expect(advance_one_second(state) && hot.actionPoints == 44, "override income did not advance by one");

    hot.apCapOverride->enabled = false;
    hot.skillRuntime.modifiers.global.apCapBonus = -0.5;
    expect(advance_one_second(state), "waxing clock did not advance");
    expect(hot.actionPointCap == 119 && hot.actionPoints == 52, "waxing cap, skill bonus or income differs");
    expect(advance_one_second(state), "waning clock did not advance");
    expect(hot.actionPointCap == 79 && hot.actionPoints == 52, "waning cap or income differs");
}

void fractional_clocks()
{
    RuntimeState state;
    auto& hot = state.hot;
    hot.seasons = state.tables.table<runtime::SeasonId>().append(4, "$.seasons");
    hot.simStepIndex = 479;
    hot.tSec = 7;
    hot.year = 1;
    hot.seasonDurationSec = 2.25;
    expect(advance_one_second(state) && hot.simStepIndex == 539 && hot.tSec == 8, "mid-second index drift");
    expect(hot.currentSeasonIndex == 1 && hot.year == 1, "fractional duration did not use the default boundary");
    expect(hot.simTime == 539.0 / 60 && hot.seasonClockSec == 59.0 / 60 &&
           hot.seasonTimeRemaining == 421.0 / 60, "mid-second clocks drifted");
    expect(advance_one_second(state) && hot.simStepIndex == 599 && hot.tSec == 9, "mid-second continuation drift");
    expect(hot.currentSeasonIndex == 1 && hot.seasonClockSec == 119.0 / 60, "continuation changed the season");

    constexpr double duration = 2.9;
    const auto zero = lunar_schedule_at_second(0, duration);
    expect(zero.phase == LunarPhase::birth && zero.moonIndex == 0 && !zero.boundary, "second zero dispatch");
    for (int index = 0; index < 12; ++index) {
        const auto atBoundary = lunar_schedule_at_second(1 + index * 2, duration);
        const auto between = lunar_schedule_at_second(2 + index * 2, duration);
        expect(atBoundary.phase == static_cast<LunarPhase>(index % 6) && atBoundary.moonIndex == index / 6 &&
               atBoundary.boundary, "lunar boundary order or rollover differs");
        expect(between.phase == atBoundary.phase && between.moonIndex == atBoundary.moonIndex &&
               !between.boundary, "between-boundary lunar schedule differs");
    }
}

}

int main()
{
    try {
        default_clock();
        gates_and_ap();
        fractional_clocks();
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
