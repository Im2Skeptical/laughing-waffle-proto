#include "sim/stages/entries.hpp"
#include "sim/practice/practice.hpp"

namespace waffle::sim::stages {

bool migration_practices(RuntimeState& state, StageContext&)
{
    practice::activate(state, content::Activation::migration);
    return true;
}

}
