#pragma once

#include "sim/state/runtime_state.hpp"

namespace waffle::sim::detail {

// For staged opening construction. Each draft carries the same GameConfig as
// the first admitted draft. Live IDs and tables are rebuilt for every draft.
RuntimeState admit_with_compiled_config(const browser::GameState& state, const core::json::Value& topology,
                                        std::shared_ptr<const CompiledContent> compiled);

}
