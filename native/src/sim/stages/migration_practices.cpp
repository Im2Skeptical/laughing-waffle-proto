#include "sim/stages/entries.hpp"

namespace waffle::sim::stages {

bool migration_practices(RuntimeState&, StageContext&)
{
    // N03e-3: run scheduled Migration recipes here with the previous moon
    // header. Natural departures and their reports belong to Stage::migration.
    return false;
}

}
