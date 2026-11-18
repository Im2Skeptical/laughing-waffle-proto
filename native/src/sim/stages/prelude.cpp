#include "sim/stages/entries.hpp"

#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {

bool prelude(RuntimeState& state, StageContext&)
{
    settlement::second_prelude(state);
    return true;
}

}
