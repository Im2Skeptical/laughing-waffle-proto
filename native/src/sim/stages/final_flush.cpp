#include "sim/stages/entries.hpp"
#include "sim/practice/practice.hpp"

namespace waffle::sim::stages {

bool final_flush(RuntimeState& state, StageContext&)
{
    practice::drain(state);
    return true;
}

}
