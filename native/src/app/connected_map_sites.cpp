#include "connected_map_art.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace waffle::connected {
namespace {

constexpr std::array<std::string_view, 6> biomes{"plains", "mountains", "forest", "plains", "islands", "swamp"};

struct Plot { double x, y; std::string_view role; double size; };
constexpr Plot villagePlots[]{
    {0, -5, "hall", 17}, {-9, -6, "pair", 7}, {9, -5, "pair", 7},
    {-16, -3, "house", 5.8}, {16, -2, "workshop", 7}, {-13, 4, "pair", 7},
    {-5, 9, "house", 6}, {3, 10, "pair", 7}, {11, 7, "house", 6},
    {-7, -11, "house", 5.6}, {1, -12, "house", 5.6}, {9, -10, "house", 5.6},
    {-19, 2, "house", 5.2}, {18, 5, "house", 5.2}, {-12, 10, "house", 5.2},
    {-6, 0, "house", 5.8}, {3, 1, "pair", 6.8}, {-3, 6, "house", 5.2}};
constexpr Plot capitalPlots[]{
    {0, 2, "citadelRear", 32}, {-12, 4, "citadelLeft", 24}, {22, 8, "citadelRight", 24},
    {4, 22, "citadelGate", 32}, {3, 9, "citadelMiddle", 32}, {0, 0, "citadelPalace", 22},
    {-3, -12, "citadelCrown", 20}};
constexpr Plot provincePlots[]{
    {15, 2, "provinceWing", 14}, {0, 0, "provinceHall", 20}, {5, 15, "provinceCourt", 18}, {-1, 24, "provinceGate", 14}};

}

void planMapSites(MapTerrain& terrain, const MapArtwork& art, const MapGeography& geography,
    const Snapshot& snapshot, const std::vector<int>& regions)
{
    const auto& atlas = art.towns;
    terrain.sites.resize(geography.shapes.size());
    for (std::size_t i = 0; i < geography.shapes.size(); ++i) {
        const auto& region = snapshot.regions[i];
        auto& site = terrain.sites[i];
        const auto anchor = terrain.pixel(geography.shapes[i].label);
        const auto biome = std::min<std::size_t>(region.biome, biomes.size() - 1);
        const auto prefix = std::string(biomes[biome]) + "/";
        const auto dry = [&](double x, double y) {
            return terrain.surfaceAt({x, y}) == MapTerrain::Surface::ground &&
                regions[static_cast<int>(y) * terrain.full.width + static_cast<int>(x)] == static_cast<int>(i);
        };
        const auto random = [&](unsigned n) { return decorationRandom(geography.seed, static_cast<unsigned>(i + 1) * 3571u + n * 83u); };
        const auto toScreenUnits = [&](double x, double y) -> Point {
            return {x * (terrain.max[0] - terrain.min[0]) / terrain.full.width,
                y * (terrain.max[1] - terrain.min[1]) / (terrain.full.height / 2)};
        };

        auto unit = .15;
        for (const double scale : {1., .75, .5, .3}) {
            const auto rx = 23 * scale, ry = 16 * scale;
            bool fits = true;
            for (auto y = -ry; fits && y <= ry; y += 2) for (auto x = -rx; x <= rx; x += 2) {
                if ((x / rx) * (x / rx) + (y / ry) * (y / ry) >= 1 || dry(anchor[0] + x, anchor[1] + y)) continue;
                fits = false;
                break;
            }
            if (fits) { unit = scale; break; }
        }

        Point near{};
        auto distance = std::numeric_limits<double>::infinity();
        for (std::size_t j = 0; j < geography.shapes.size(); ++j) {
            if (j == i || snapshot.regions[j].biome == 4) continue;
            const auto point = terrain.pixel(geography.shapes[j].label);
            const auto d = std::hypot(point[0] - anchor[0], point[1] - anchor[1]);
            if (d < distance) { distance = d; near = point; }
        }
        const auto angle = std::isfinite(distance) ? std::atan2((near[1] - anchor[1]) / 16, (near[0] - anchor[0]) / 23) : 1.2;
        Point entrance{std::round(anchor[0] + std::cos(angle) * 23 * unit * .88),
            std::round(anchor[1] + std::sin(angle) * 16 * unit * .88)};
        if (!dry(entrance[0], entrance[1])) entrance = anchor;
        site.entrance = terrain.world(entrance);
        const auto radii = toScreenUnits(23 * unit, 16 * unit);
        site.radiusX = radii[0];
        site.radiusY = radii[1];
        const auto variant = biome == 2 ? static_cast<int>(random(201) * 3) : -1;
        const auto at = [&](double u, double v) -> Point {
            const Point p = variant == 0 ? Point{u + v * v * .018 - 2, v * .85} :
                variant == 1 ? Point{u * 1.06 + (u < 0 ? -2 : 2), v * .82 + (u > 0 ? 2 : -2)} :
                variant == 2 ? Point{u * .78 + v * .4, v * 1.08} : Point{u, v};
            return {anchor[0] + p[0] * unit, anchor[1] + p[1] * unit};
        };
        site.court = terrain.world(at(9, 3));
        const auto add = [&](Point p, double w, std::string_view key, std::string_view market, bool wholeFacade) {
            const auto& frame = atlas.frame(key);
            const auto h = w * frame.h / frame.w;
            for (double dx : {-.5, 0., .5}) for (double dy : {-.3, 0., .3})
                if (!dry(p[0] + dx * w, p[1] + dy * w)) return false;
            if (wholeFacade) {
                for (int y = static_cast<int>(p[1] - h); y <= p[1]; ++y)
                    for (int x = static_cast<int>(p[0] - w * .5); x <= p[0] + w * .5; ++x)
                        if (!dry(x, y)) return false;
            }
            const auto dimensions = toScreenUnits(w, h);
            site.buildings.push_back({terrain.world(p), dimensions[0], dimensions[1],
                frame, market.empty() ? frame : atlas.frame(market)});
            return true;
        };

        if (region.crown != CrownRank::none) {
            const auto assemble = [&](const auto& parts, double size, bool compact) {
                site.buildings.clear();
                for (const auto& part : parts) {
                    if (compact && (part.role == "citadelLeft" || part.role == "citadelRight" || part.role == "provinceWing")) continue;
                    auto name = std::string(part.role);
                    if (part.role == "citadelRear" || part.role == "citadelPalace" || part.role == "provinceHall")
                        name += "-" + std::string(biomes[biome]);
                    if (!add({anchor[0] + part.x * size, anchor[1] + part.y * size}, part.size * size, name, {}, true))
                        return false;
                }
                return true;
            };
            const auto capital = region.crown == CrownRank::capital;
            for (double scale : {1., .75, .5, .3}) {
                const auto placed = capital ? assemble(capitalPlots, scale, scale < 1) :
                    assemble(provincePlots, scale, scale < 1);
                if (placed) break;
                site.buildings.clear();
            }
            if (!site.buildings.empty()) {
                Point lo = anchor, hi = anchor;
                for (const auto point : geography.shapes[i].outline) {
                    const auto px = terrain.pixel(point);
                    for (int axis = 0; axis < 2; ++axis) {
                        lo[axis] = std::min(lo[axis], px[axis]);
                        hi[axis] = std::max(hi[axis], px[axis]);
                    }
                }
                const auto randomCity = [&](unsigned n) {
                    return decorationRandom(geography.seed, static_cast<unsigned>(i + 1) * 13007u + n * 673u);
                };
                const auto addDistrict = [&](Point p, std::string_view role, double size, std::size_t omitAfter) {
                    const auto apron = std::hypot(p[0] - entrance[0], p[1] - entrance[1]);
                    if (apron < 6 || std::hypot(p[0] - anchor[0], p[1] - anchor[1]) < (capital ? 22 : 17)) return false;
                    for (std::size_t n = 0; n < omitAfter; ++n) {
                        const auto& piece = site.buildings[n];
                        const auto other = terrain.pixel(piece.at);
                        const auto w = piece.width * terrain.full.width / (terrain.max[0] - terrain.min[0]);
                        if (std::abs(p[0] - other[0]) < (size + w) * .45 &&
                            std::abs(p[1] - other[1]) < (size + w) * .264) return false;
                    }
                    return add(p, size, role, {}, true);
                };
                unsigned ward = 0;
                for (auto y = lo[1] + 15; y < hi[1]; y += 25) for (auto x = lo[0] + 12; x < hi[0]; x += 30) {
                    const Point p{x + (randomCity(7000 + ward) - .5) * 7, y + (randomCity(8000 + ward) - .5) * 5};
                    ++ward;
                    const auto prior = site.buildings.size();
                    if (!addDistrict(p, "court", 15, prior)) continue;
                    addDistrict({p[0] - 11, p[1] - 4}, "galleryNW", 12, prior);
                    addDistrict({p[0] + 12, p[1] - 4}, randomCity(9000 + ward) > .65 ? "ruinedGalleryNE" : "galleryNE", 14, prior);
                }
                const auto radius = std::max(hi[0] - lo[0], hi[1] - lo[1]);
                unsigned salt = 0;
                for (auto y = lo[1]; y <= hi[1]; y += 6) for (auto x = lo[0]; x <= hi[0]; x += 7) {
                    const double px = x + (randomCity(salt++) - .5) * 3 + std::sin((y - anchor[1]) / 19) * 2;
                    const double py = y + (randomCity(salt++) - .5) * 2;
                    const Point p{px, py};
                    const bool edge = !dry(px - 9, py) || !dry(px + 9, py) || !dry(px, py - 8) || !dry(px, py + 8);
                    const bool ruined = edge ? randomCity(salt++) > .45 :
                        std::hypot(px - anchor[0], (py - anchor[1]) * 1.1) / radius > .5 && randomCity(salt++) > .6;
                    constexpr std::array<Plot, 4> ruins{{{0, 0, "ruinedHouses", 12}, {0, 0, "ruinedGalleryNE", 14},
                        {0, 0, "ribRuin", 12}, {0, 0, "brokenWall", 12}}};
                    constexpr std::array<Plot, 5> houses{{{0, 0, "house", 6}, {0, 0, "house", 6}, {0, 0, "pair", 11},
                        {0, 0, "terrace", 15}, {0, 0, "workshop", 10}}};
                    const auto variant = randomCity(salt++);
                    const auto& type = ruined ? ruins[static_cast<std::size_t>(variant * ruins.size())] :
                        houses[static_cast<std::size_t>(variant * houses.size())];
                    addDistrict(p, type.role, type.size, site.buildings.size());
                }
                continue;
            }
        }

        unsigned n = 0;
        for (const auto& plot : villagePlots) {
            const auto stretch = biome == 1 ? .78 : biome == 2 ? .9 : 1.;
            const auto p = n == 0 ? anchor :
                at(plot.x + (random(n) - .5) * 1.6, plot.y * stretch + random(n + 40) - .5);
            ++n;
            const auto size = plot.size * unit;
            if (plot.role != "hall" && std::abs(p[0] - anchor[0]) < (size + 17 * unit) * .5 &&
                std::abs(p[1] - anchor[1]) < (size * .6 + 10.2 * unit) * .5) continue;
            if (std::hypot(p[0] - entrance[0], p[1] - entrance[1]) < 5 * unit && plot.role != "hall") continue;
            add(p, size, prefix + std::string(plot.role), plot.role == "hall" ? prefix + "market" : "", false);
        }
        add(entrance, 7 * unit, prefix + "gate", {}, false);
        std::ranges::stable_sort(site.buildings, {}, [](const auto& piece) { return piece.at[1]; });
    }
}

}
