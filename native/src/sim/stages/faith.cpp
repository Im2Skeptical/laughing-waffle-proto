#include "sim/stages/entries.hpp"

#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {

bool faith(RuntimeState& state, StageContext& context)
{
    settlement::set_moon_turn_phase(state, context.lunar);
    // TODO: Faith, happiness and Chaos.
    return false;
}

}
