#pragma once

#include "sim/content/vocabulary.hpp"

#include <optional>

namespace waffle::sim {

// Seed-1 admission stand-in until N03d-4 supplies the captured world topology.
class WorldTopology {
public:
    std::size_t region_count() const { return order.size(); }
    std::span<const runtime::RegionId> regions() const { return order; }
    std::span<const runtime::RegionId> neighbors(runtime::RegionId id) const
    {
        if (id.value >= order.size()) return {};
        return std::span(edges[id.value]).first(counts[id.value]);
    }

    std::optional<content::Biome> biome(runtime::RegionId id) const
    {
        if (id.value >= order.size()) return {};
        switch (id.value) {
        case 1: case 4: case 7: case 17: case 18: return content::Biome::plains;
        case 2: case 3: case 5: case 11: case 12: case 14: return content::Biome::mountains;
        case 8: case 15: case 19: return content::Biome::forest;
        default: return {};
        }
    }

    std::span<const runtime::RegionId> mountain_component(runtime::RegionId id) const
    {
        if (id.value == 14) return isolated;
        return biome(id) == content::Biome::mountains ? std::span<const runtime::RegionId>(mountains)
                                                     : std::span<const runtime::RegionId>{};
    }

private:
    static constexpr auto order = [] {
        std::array<runtime::RegionId, 20> result{};
        for (std::uint32_t i = 0; i < result.size(); ++i) result[i] = {i};
        return result;
    }();
    static constexpr std::array<std::size_t, 20> counts{2,4,3,4,4,3,6,6,3,2,4,4,5,5,6,5,3,3,4,2};
    static constexpr auto edges = [] {
        constexpr std::uint32_t source[20][6]{
            {1,6}, {0,6,7,8}, {3,9,10}, {2,4,10,11}, {3,5,11,12}, {4,6,12},
            {0,1,5,7,12,13}, {1,6,8,13,14,15}, {1,7,15}, {2,10}, {2,3,9,11},
            {3,4,10,12}, {4,5,6,11,13}, {6,7,12,14,16}, {7,13,15,16,17,18},
            {7,8,14,18,19}, {13,14,17}, {14,16,18}, {14,15,17,19}, {15,18},
        };
        std::array<std::array<runtime::RegionId, 6>, 20> result{};
        for (std::size_t i = 0; i < result.size(); ++i)
            for (std::size_t j = 0; j < counts[i]; ++j) result[i][j] = {source[i][j]};
        return result;
    }();
    static constexpr std::array<runtime::RegionId, 5> mountains{{{2},{3},{11},{12},{5}}};
    static constexpr std::array<runtime::RegionId, 1> isolated{{{14}}};
};

}
