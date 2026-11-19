#pragma once

namespace waffle::sim {

struct RuntimeState;
enum class Stage;

inline constexpr int ticksPerSecond = 60;

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

// Optional measurement hook. Called immediately before and after each stage
// (including any clock tail). The simulation itself does not read a clock.
using StageObserver = void (*)(void* context, Stage stage, bool entering);
bool advance_one_second(RuntimeState& state, StageObserver observer, void* context);

}
