#pragma once

#include "sim/step/replay.hpp"

namespace waffle::sim::vassal {

ActionResult apply_action(RuntimeState& state, const Action& action);
ActionResult apply_node_action(RuntimeState& state, const Action& action);

}
