#include "sim/stages/entries.hpp"

namespace waffle::sim::stages {

bool final_flush(RuntimeState&, StageContext&)
{
    // TODO: Pending events, reactions and journals.
    return false;
}

}
