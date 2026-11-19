#pragma once

#include "sim/step/stages.hpp"

namespace waffle::sim::stages {

bool advance_clock(RuntimeState&, StageContext&);
bool prelude(RuntimeState&, StageContext&);
bool seasonal_practices(RuntimeState&, StageContext&);
bool spring_death_baseline(RuntimeState&, StageContext&);
bool birth(RuntimeState&, StageContext&);
bool food(RuntimeState&, StageContext&);
bool after_meals_practices(RuntimeState&, StageContext&);
bool garrison_upkeep(RuntimeState&, StageContext&);
bool housing(RuntimeState&, StageContext&);
bool faith(RuntimeState&, StageContext&);
bool migration_practices(RuntimeState&, StageContext&);
bool migration(RuntimeState&, StageContext&);
void prepare_death(RuntimeState&);
bool death(RuntimeState&, StageContext&);
bool death_practices(RuntimeState&, StageContext&);
bool control_and_spatial_pressure(RuntimeState&, StageContext&);
bool phase_events_and_drain(RuntimeState&, StageContext&);
bool vassal_check(RuntimeState&, StageContext&);
bool final_flush(RuntimeState&, StageContext&);

void finish_clock_tail(RuntimeState& state, const StageContext& context);

}
