#include "sim/stages/entries.hpp"

#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {

bool birth(RuntimeState& state, StageContext& context)
{
    settlement::begin_moon_turn(state, context.lunar);
    // TODO: Cohorts, aging and RNG.
    return false;
}

}
