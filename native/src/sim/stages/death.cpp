#include "sim/stages/entries.hpp"

#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {

bool death(RuntimeState& state, StageContext& context)
{
    settlement::set_moon_turn_phase(state, context.lunar);
    // TODO: Mortality, arrivals, losses and RNG.
    return false;
}

}
