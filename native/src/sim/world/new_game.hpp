#pragma once

#include "sim/state/runtime_state.hpp"

namespace waffle::sim {

// Ordinary regional random-road opening. The caller supplies the captured
// configuration and may retain its original JSON for content admission checks.
RuntimeState build_new_game(std::uint32_t seed, const browser::GameConfig& config,
                            const core::json::Value* capturedConfig = nullptr);

}
