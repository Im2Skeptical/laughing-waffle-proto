#include "core/rng.hpp"

#include "core/js_number.hpp"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace waffle::core {
namespace {

std::uint32_t& stream_seed(RngState& state, RngStream stream)
{
    switch (stream) {
    case RngStream::main: return state.seed;
    case RngStream::vassal: return state.vassalSeed;
    case RngStream::vassalDevelopment: return state.vassalDevelopmentSeed;
    case RngStream::vassalLifeMap: return state.vassalLifeMapSeed;
    case RngStream::vassalPortrait: return state.vassalPortraitSeed;
    }
    throw std::invalid_argument("invalid RNG stream");
}

double next_int(std::uint32_t& seed, double min, double max) noexcept
{
    const double a = js::ceil(min);
    const double b = js::floor(max);
    return a + js::floor(rng_next_seed_float(seed) * (b - a + 1.0));
}

}

double rng_next_float(RngState& state, RngStream stream)
{
    return rng_next_seed_float(stream_seed(state, stream));
}

double rng_next_int(RngState& state, double min, double max, RngStream stream)
{
    return next_int(stream_seed(state, stream), min, max);
}

std::uint64_t rng_count_below(RngState& state, std::uint64_t draws, double probability) noexcept
{
    const auto start = state.seed;
    state.seed += static_cast<std::uint32_t>(draws) * rng_seed_increment;
    const double bounded = probability > 0 ? std::min(probability, 1.0) : 0;
    const auto threshold = static_cast<std::uint64_t>(std::ceil(bounded * 0x1p32));
    if (threshold == 0) return 0;
    if (threshold == 0x100000000ULL) return draws;

    auto word = start;
    std::uint64_t successes = 0;
    for (std::uint64_t i = 0; i < draws; ++i) {
        word += rng_seed_increment;
        successes += rng_mix_word(word) < static_cast<std::uint32_t>(threshold);
    }
    return successes;
}

json::Value serialize_rng(const RngState& state)
{
    using json::Value;
    return Value(Value::Object{
        {"seed", Value(double(state.seed))},
        {"baseSeed", Value(state.baseSeed)},
        {"vassalSeed", Value(double(state.vassalSeed))},
        {"vassalDevelopmentSeed", Value(double(state.vassalDevelopmentSeed))},
        {"vassalLifeMapSeed", Value(double(state.vassalLifeMapSeed))},
        {"vassalPortraitSeed", Value(double(state.vassalPortraitSeed))},
    });
}

SeedRng create_rng(double seed) noexcept
{
    return {js::to_uint32(js::floor(seed))};
}

double rng_next_float(SeedRng& state) noexcept
{
    return rng_next_seed_float(state.seed);
}

double rng_next_int(SeedRng& state, double min, double max) noexcept
{
    return next_int(state.seed, min, max);
}

}
