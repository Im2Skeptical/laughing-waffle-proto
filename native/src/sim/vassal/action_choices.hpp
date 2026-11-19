#pragma once

#include "sim/step/replay.hpp"

namespace waffle::sim::vassal::detail {

bool create_node_choices(RuntimeState& state, const runtime::Vassal& actor, browser::LifeMapNodeState& node);
ActionResult commit_node_choice(RuntimeState& state, runtime::Vassal& actor,
                                const browser::LifeMapNodeState& node, const browser::LifeMapOption& option,
                                double price);

}
