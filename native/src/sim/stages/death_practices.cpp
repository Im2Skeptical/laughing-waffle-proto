#include "sim/stages/entries.hpp"
#include "sim/practice/practice.hpp"

namespace waffle::sim::stages {

bool death_practices(RuntimeState& state, StageContext&)
{
    practice::activate(state, content::Activation::death);
    return true;
}

}
