#pragma once

#include "core/rng.hpp"
#include "sim/world/generate.hpp"

namespace waffle::sim::world_generation {

enum Biome { plains, forest, islands, swamp, mountains, monster, biome_count };
enum Feature { none, river, ridge };

struct Point { double x, y; };
struct Cell {
    std::vector<Point> polygon;
    Point centre{};
    std::vector<int> neighbors;
};
struct Region : Cell {
    std::vector<Point> outline;
    std::vector<int> vertices;
    std::vector<int> edges;
    Biome biome{};
};
struct Edge {
    int a, b;
    std::vector<int> regions;
    int worldSide{-1};
    Feature feature{none};
    double offset{};
    double phase{};
    int direction{1};
    std::vector<Point> points;
};

void assign_biomes(std::array<Region, regional_region_count>& regions,
                   const std::vector<Edge>& edges, core::SeedRng& rng, std::uint32_t seed);
std::array<std::string, regional_region_count> region_names(
    const std::array<Region, regional_region_count>& regions);

}
