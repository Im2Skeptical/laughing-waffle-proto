#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <initializer_list>
#include <utility>

namespace waffle::connected {

using WaterRamp = std::array<unsigned, 32>;

inline unsigned mixInk(unsigned a, unsigned b, double t)
{
    unsigned result{};
    for (int shift : {16, 8, 0})
        result |= static_cast<unsigned>(std::lerp(static_cast<double>((a >> shift) & 255u),
            static_cast<double>((b >> shift) & 255u), t) + .5) << shift;
    return result;
}

// Swell, surf/whitecap and fine ripple use the browser's canonical stops.
inline WaterRamp waterRamp(std::initializer_list<std::pair<double, unsigned>> stops, int length)
{
    WaterRamp result{};
    for (int i = 0; i < length; ++i) {
        const auto t = i / static_cast<double>(length);
        auto lo = stops.begin();
        auto hi = lo + 1;
        while (t > hi->first) { ++lo; ++hi; }
        result[i] = mixInk(lo->second, hi->second, (t - lo->first) / (hi->first - lo->first));
    }
    return result;
}

inline const std::array oceanRamps{
    waterRamp({{0,0x294751},{.28,0x355e67},{.55,0x598b8c},{.65,0x86aaa3},{.73,0x416e79},{1,0x294751}}, 32),
    waterRamp({{0,0x38666c},{.30,0x528d8b},{.44,0x83b7ac},{.50,0xe0e4cd},{.60,0xb6d0bd},{.78,0x72a69e},{1,0x38666c}}, 32),
    waterRamp({{0,0x355c65},{.42,0x416f79},{.55,0xc0d2c4},{.66,0x83aaa5},{1,0x355c65}}, 16),
    waterRamp({{0,0x34555e},{.38,0x416d77},{.55,0x729995},{.65,0x416d77},{1,0x34555e}}, 32)
};

inline auto animateOcean(double seconds)
{
    constexpr std::array starts{128, 160, 192, 208}, lengths{32, 32, 16, 32}, rate{3, 5, 2, 4};
    std::array<std::array<WaterRamp, 4>, 8> colours{};
    for (int variant = 0; variant < 8; ++variant) for (int i = 0; i < 4; ++i) {
        const auto salt = starts[i] * .137 + variant * 1.618;
        constexpr double turn = 6.283185307179586;
        const auto a = std::sin(salt + seconds * turn / (32 * 7.3 + variant * 17 + starts[i] * .2)) - std::sin(salt);
        const auto b = std::sin(salt * .7 + seconds * turn / (32 * 29.7 + variant * 67 + starts[i] * 1.3)) - std::sin(salt * .7);
        const auto phase = seconds * rate[i] * (1 + std::sin(salt) * .12) + lengths[i] * (a * .45 + b * .7);
        const auto envelope = 1 - .42 * a * a / 4 - .26 * b * b / 4;
        const auto whole = std::floor(phase);
        const auto offset = (static_cast<int>(std::fmod(whole, lengths[i])) + lengths[i]) % lengths[i];
        const auto& ramp = oceanRamps[i];
        for (int index = 0; index < lengths[i]; ++index) {
            const auto lo = (index + offset) % lengths[i], hi = (lo + 1) % lengths[i];
            colours[variant][i][index] = mixInk(ramp[static_cast<int>(lengths[i] * .85)],
                mixInk(ramp[lo], ramp[hi], phase - whole), envelope);
        }
    }
    return colours;
}

inline int oceanRampFor(int index)
{
    return index < 32 ? 0 : index < 64 ? 1 : index < 96 ? 2 : 3;
}

}
