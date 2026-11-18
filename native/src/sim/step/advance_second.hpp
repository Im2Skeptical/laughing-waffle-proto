#pragma once

namespace waffle::sim {

struct RuntimeState;

enum class LunarPhase { birth, food, housing, faith, migration, death };

struct LunarSchedule {
    LunarPhase phase;
    double moonIndex;
    bool boundary;
};

LunarSchedule lunar_schedule_at_second(double second, double phaseDurationSec) noexcept;

// Advance the browser-compatible clock by 60 ticks with at most one gameplay
// dispatch. Return whether tSec advanced. A paused or complete run is unchanged.
bool advance_one_second(RuntimeState& state);

}
