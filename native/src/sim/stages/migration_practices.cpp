#include "sim/stages/entries.hpp"

namespace waffle::sim::stages {

bool migration_practices(RuntimeState&, StageContext&)
{
    // TODO: Recipes, Stock, Charge, events. Runs before Migration sets the moon phase.
    return false;
}

}
