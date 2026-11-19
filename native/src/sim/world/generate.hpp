#pragma once

#include "core/json.hpp"

#include <array>
#include <cstdint>
#include <string>
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
    };
    std::string definitionId;
    std::array<Region, regional_region_count> regions;
    std::vector<Road> openingRoads; // Ranked order, before starter selection.
    std::vector<std::vector<int>> biomeComponents;

    core::json::Value topology_json() const;
};

RegionalWorld generate_regional_world(std::uint32_t seed);

}
