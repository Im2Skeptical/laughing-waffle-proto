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
    std::map<std::pair<int, int>, std::array<MapRect, 5>> townLevels;
    std::array<MapPixels, 3> clouds;
};

struct MapTerrain {
    enum class Surface : std::uint8_t { ground, sea, river, pool };
    struct SitePiece {
        Point at;
        double width, height;
        MapRect frame, market;
        bool mirror{};
    };
    struct SitePlan {
        std::vector<SitePiece> buildings;
        Point entrance{}, court{};
        double radiusX{}, radiusY{};
    };
    struct RoadSample { Point at; Surface surface; };
    struct BoneStrip {
        std::size_t region;
        int neighbor;
        std::vector<SitePiece> pieces;
    };
    using Road = std::pair<std::size_t, std::size_t>;
    MapPixels full, compact; // Natural and occupied layers stacked vertically.
    std::array<MapPixels, 3> coarse;
    const MapPixels& level(int index) const { return index == 0 ? full : index == 1 ? compact : coarse[index - 2]; }
    struct WeatherCell {
        float fog{}, distance{}, edge{}, water{};
        Surface surface{};
        std::array<std::uint8_t, 3> colour{};
        std::array<std::uint8_t, 3> waterIndex{}, waterStrength{};
        std::uint8_t waterVariant{};
    };
    std::vector<WeatherCell> weather;
    int weatherWidth{}, weatherHeight{};
    Point origin; // Canonical browser world coordinates at texel two.
    Point min, max; // Projected world bounds in the normalized map coordinate space.
    std::vector<Surface> surfaces;
    std::vector<SitePlan> sites;
    std::vector<BoneStrip> bones;
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
