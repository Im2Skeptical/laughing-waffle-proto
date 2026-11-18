#include "sim/stages/entries.hpp"

#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {

bool migration(RuntimeState& state, StageContext& context)
{
    settlement::set_moon_turn_phase(state, context.lunar);
    // TODO: Movement and population ledgers.
    return false;
}

}
