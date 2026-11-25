#pragma once

#include "ui/connected_model.hpp"

#include <map>
#include <memory>

namespace waffle::connected {

struct MapRect {
    int x{}, y{}, w{}, h{};
    bool operator==(const MapRect&) const = default;
};

struct MapPixels {
    int width{}, height{};
    std::vector<std::uint8_t> rgba;
    const std::uint8_t* at(int x, int y) const { return rgba.data() + (static_cast<std::size_t>(y) * width + x) * 4; }
    std::uint8_t* at(int x, int y) { return rgba.data() + (static_cast<std::size_t>(y) * width + x) * 4; }
};

struct MapAtlas {
    using Frames = std::map<std::string, MapRect, std::less<>>;
    MapPixels pixels;
    Frames frames;
    const MapRect& frame(std::string_view key) const;
};

struct MapArtwork {
    MapAtlas ground, banks, monster, relief, towns;
};

struct MapTerrain {
    enum class Surface : std::uint8_t { ground, sea, river, pool };
    struct SitePiece {
        Point at;
        double width, height;
        MapRect frame, market;
    };
    struct SitePlan {
        std::vector<SitePiece> buildings;
        Point entrance{}, court{};
        double radiusX{}, radiusY{};
    };
    struct RoadSample { Point at; Surface surface; };
    using Road = std::pair<std::size_t, std::size_t>;
    MapPixels full, compact; // Natural and occupied layers stacked vertically.
    Point min, max; // Projected world bounds in the normalized map coordinate space.
    std::vector<Surface> surfaces;
    std::vector<SitePlan> sites;
    std::map<Road, std::vector<RoadSample>> roads;
    double bakeMs{};

    Point world(Point pixel) const;
    Point pixel(Point world) const;
    Surface surfaceAt(Point pixel) const;
};

std::shared_ptr<const MapArtwork> prepareMapArtwork();
MapTerrain bakeMapTerrain(const MapArtwork& art, const MapGeography& geography, const Snapshot& opening);
void planMapSites(MapTerrain& terrain, const MapArtwork& art, const MapGeography& geography,
    const Snapshot& snapshot, const std::vector<int>& regions);
void planMapRoads(MapTerrain& terrain, const MapGeography& geography, const Snapshot& snapshot,
    const std::vector<int>& regions);
double decorationRandom(std::uint32_t seed, std::uint32_t index);

}
