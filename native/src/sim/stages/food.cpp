#include "sim/stages/entries.hpp"

#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {

bool food(RuntimeState& state, StageContext& context)
{
    settlement::set_moon_turn_phase(state, context.lunar);
    // TODO: Meals, market and reservations.
    return false;
}

}
