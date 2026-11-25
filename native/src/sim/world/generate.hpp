#pragma once

#include "core/json.hpp"

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace waffle::sim {

inline constexpr int regional_region_count = 20;

struct RegionalWorld {
    using Road = std::pair<int, int>;
    struct Region {
        std::string id;
        std::string name;
        std::string biome;
        std::string colour;
        std::vector<int> neighbors;
        std::array<double, 2> labelPoint{};
    };
    std::string definitionId;
    std::array<Region, regional_region_count> regions;
    std::vector<Road> openingRoads; // Ranked order, before starter selection.
    std::vector<std::vector<int>> biomeComponents;

    core::json::Value topology_json() const;
};

using RegionalOutlines = std::array<std::vector<std::array<double, 2>>, regional_region_count>;
struct RegionalEdgeInk {
    enum class Kind { frontier, exterior, river, ridge };
    Kind kind;
    std::vector<std::array<double, 2>> points;
    int neighbor{-1}, worldSide{-1};
};
using RegionalEdgeInks = std::array<std::vector<RegionalEdgeInk>, regional_region_count>;
RegionalWorld generate_regional_world(std::uint32_t seed, RegionalOutlines* outlines = nullptr,
                                      RegionalEdgeInks* edgeInk = nullptr,
                                      std::array<bool, 4>* oceanSides = nullptr);
std::optional<std::uint32_t> generated_regional_seed(std::string_view definitionId);

}
