#include "core/rng.hpp"

#include "core/js_number.hpp"

#include <cmath>
#include <stdexcept>

namespace waffle::core {
namespace {

double& stream_seed(RngState& state, RngStream stream)
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

double next_float(double& seed) noexcept
{
    // JS accumulates the serialized seed as a Number without wrapping. Only
    // the working value goes through the bitwise operations' ToUint32.
    seed += 0x6d2b79f5;
    std::uint32_t t = js::to_uint32(seed);
    t = (t ^ (t >> 15)) * (1u | t);
    t ^= t + (t ^ (t >> 7)) * (61u | t);
    return (t ^ (t >> 14)) / 4294967296.0;
}

double next_int(double& seed, double min, double max) noexcept
{
    const double a = js::ceil(min);
    const double b = js::floor(max);
    return a + js::floor(next_float(seed) * (b - a + 1.0));
}

}

double rng_next_float(RngState& state, RngStream stream)
{
    return next_float(stream_seed(state, stream));
}

double rng_next_int(RngState& state, double min, double max, RngStream stream)
{
    return next_int(stream_seed(state, stream), min, max);
}

json::Value serialize_rng(const RngState& state)
{
    using json::Value;
    return Value(Value::Object{
        {"seed", Value(state.seed)},
        {"baseSeed", Value(state.baseSeed)},
        {"vassalSeed", Value(state.vassalSeed)},
        {"vassalDevelopmentSeed", Value(state.vassalDevelopmentSeed)},
        {"vassalLifeMapSeed", Value(state.vassalLifeMapSeed)},
        {"vassalPortraitSeed", Value(state.vassalPortraitSeed)},
    });
}

SeedRng create_rng(double seed) noexcept
{
    return {std::isfinite(seed) ? js::floor(seed) : 0.0};
}

double rng_next_float(SeedRng& state) noexcept
{
    return next_float(state.seed);
}

double rng_next_int(SeedRng& state, double min, double max) noexcept
{
    return next_int(state.seed, min, max);
}

}
