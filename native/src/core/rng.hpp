#pragma once

#include "core/json.hpp"
#include "core/js_number.hpp"

namespace waffle::core {

struct RngState {
    std::uint32_t seed{};
    double baseSeed{}; // Starting seed identity, never advanced by a draw.
    std::uint32_t vassalSeed{};
    std::uint32_t vassalDevelopmentSeed{};
    std::uint32_t vassalLifeMapSeed{};
    std::uint32_t vassalPortraitSeed{};
};

enum class RngStream { main, vassal, vassalDevelopment, vassalLifeMap, vassalPortrait };

inline constexpr std::uint32_t rng_seed_increment = 0x6d2b79f5;

inline std::uint32_t rng_mix_word(std::uint32_t word) noexcept
{
    word = (word ^ (word >> 15)) * (1u | word);
    word ^= word + (word ^ (word >> 7)) * (61u | word);
    return word ^ (word >> 14);
}

inline double rng_next_seed_float(std::uint32_t& seed) noexcept
{
    seed += rng_seed_increment;
    return rng_mix_word(seed) / 0x1p32;
}

inline double rng_next_float(RngState& state) noexcept { return rng_next_seed_float(state.seed); }
double rng_next_float(RngState& state, RngStream stream);
double rng_next_int(RngState& state, double min, double max, RngStream stream = RngStream::main);
std::uint64_t rng_count_below(RngState& state, std::uint64_t draws, double probability) noexcept;
json::Value serialize_rng(const RngState& state);

// Standalone seedState used by createRng in the browser.
struct SeedRng {
    std::uint32_t seed{};
};

SeedRng create_rng(double seed) noexcept;
double rng_next_float(SeedRng& state) noexcept;
double rng_next_int(SeedRng& state, double min, double max) noexcept;

}
