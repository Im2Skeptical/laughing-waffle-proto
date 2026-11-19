#include "sim/stages/entries.hpp"
#include "sim/territory/territory.hpp"

namespace waffle::sim::stages {

bool control_and_spatial_pressure(RuntimeState& state, StageContext&)
{
    territory::resolve_control(state);
    territory::step_pressure(state);
    territory::synchronize_sites(state);
    return true;
}

}
