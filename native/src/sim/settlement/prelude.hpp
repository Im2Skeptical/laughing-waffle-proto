#pragma once

#include "sim/step/advance_second.hpp"

namespace waffle::sim::runtime {
struct MoonTurn;
struct PopulationClass;
}

namespace waffle::sim::settlement {

// Admission resolves the rule vocabulary and allocates the report buffers.
void prepare_prelude(RuntimeState& state);
void second_prelude(RuntimeState& state);
void spring_death_baseline(RuntimeState& state);
void reset_empty_stranger_cohort(const RuntimeState& state, runtime::PopulationClass& stranger);
runtime::MoonTurn& begin_moon_turn(RuntimeState& state, LunarSchedule phase);
runtime::MoonTurn& set_moon_turn_phase(RuntimeState& state, LunarSchedule phase);

}
