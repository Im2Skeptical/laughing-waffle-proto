#include "sim/stages/entries.hpp"
#include "sim/state/runtime_state.hpp"
#include "sim/vassal/vassal.hpp"

namespace waffle::sim::stages {

bool vassal_check(RuntimeState& state, StageContext&)
{
    return state.hot.tSec < state.nextVassalCheckSec || vassal::resolve_due(state);
}

}
