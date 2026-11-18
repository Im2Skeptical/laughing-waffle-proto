#pragma once

#include "core/json.hpp"

namespace waffle::core {

struct RngState {
    double seed{};
    double baseSeed{}; // Starting seed identity, never advanced by a draw.
    double vassalSeed{};
    double vassalDevelopmentSeed{};
    double vassalLifeMapSeed{};
    double vassalPortraitSeed{};
};

enum class RngStream { main, vassal, vassalDevelopment, vassalLifeMap, vassalPortrait };

double rng_next_float(RngState& state, RngStream stream = RngStream::main);
double rng_next_int(RngState& state, double min, double max, RngStream stream = RngStream::main);
json::Value serialize_rng(const RngState& state);

// Standalone seedState used by createRng in the browser.
struct SeedRng {
    double seed{};
};

SeedRng create_rng(double seed) noexcept;
double rng_next_float(SeedRng& state) noexcept;
double rng_next_int(SeedRng& state, double min, double max) noexcept;

}
