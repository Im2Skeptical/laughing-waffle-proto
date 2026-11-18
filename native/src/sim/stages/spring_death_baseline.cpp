#include "sim/stages/entries.hpp"

#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {

bool spring_death_baseline(RuntimeState& state, StageContext&)
{
    settlement::spring_death_baseline(state);
    return true;
}

}
