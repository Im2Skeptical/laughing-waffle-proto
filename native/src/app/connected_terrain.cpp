#include "connected_map_art.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <limits>
#include <numeric>

namespace waffle::connected {
namespace {

constexpr double aspect = 2.15;
constexpr double worldWidth = 788, worldHeight = 258; // Browser lattice at texel 2.
constexpr double pi = 3.14159265358979323846;
constexpr auto sea = MapTerrain::Surface::sea;
constexpr auto river = MapTerrain::Surface::river;
constexpr auto ground = MapTerrain::Surface::ground;
constexpr std::array<std::string_view, 7> biomes{
    "plains", "mountains", "forest", "plains", "islands", "swamp", "plains"};
constexpr std::array<std::array<unsigned, 4>, 7> palette{{
    {0x9f8c69, 0xac9670, 0xb7a17b, 0xc5b18d}, {0x827869, 0x958774, 0xa49782, 0xb4a792},
    {0x858266, 0x989573, 0xa6a381, 0xb1ad8b}, {0x9f8c69, 0xac9670, 0xb7a17b, 0xc5b18d},
    {0x9eaa83, 0xabb48e, 0xb5bc99, 0xc1c5a6}, {0x55505d, 0x6d6170, 0x867b87, 0x9c8c99},
    {0x3f3031, 0x55403c, 0x735146, 0x927062}}};

struct Edge { Point a, b; std::size_t region; int neighbor, worldSide; };
struct Core { Point centre; double radius, phase; };
struct Neck { Point a, mid, b; double radius; };
struct Box { double left, top, right, bottom; };

Box bounds(const std::vector<Point>& points)
{
    Box box{points.front()[0], points.front()[1], points.front()[0], points.front()[1]};
    for (const auto& p : points) {
        box.left = std::min(box.left, p[0]);
        box.top = std::min(box.top, p[1]);
        box.right = std::max(box.right, p[0]);
        box.bottom = std::max(box.bottom, p[1]);
    }
    return box;
}

double smooth(double a, double b, double at)
{
    const auto t = std::clamp((at - a) / (b - a), 0., 1.);
    return t * t * (3 - 2 * t);
}

std::uint32_t cellSalt(int x, int y)
{
    return static_cast<std::uint32_t>(x) * 73856093u ^ static_cast<std::uint32_t>(y) * 19349663u;
}

double noise(std::uint32_t seed, double x, double y, double scale)
{
    x /= scale; y /= scale;
    const auto ix = static_cast<int>(std::floor(x)), iy = static_cast<int>(std::floor(y));
    const auto fx = smooth(0, 1, x - ix), fy = smooth(0, 1, y - iy);
    const auto at = [&](int a, int b) { return decorationRandom(seed, cellSalt(a, b)); };
    return std::lerp(std::lerp(at(ix, iy), at(ix + 1, iy), fx),
        std::lerp(at(ix, iy + 1), at(ix + 1, iy + 1), fx), fy);
}

double distance(Point a, Point b)
{
    const auto dx = (a[0] - b[0]) * aspect, dy = a[1] - b[1];
    return std::sqrt(dx * dx + dy * dy);
}

double distanceTo(Point p, Point a, Point b)
{
    const auto dx = (b[0] - a[0]) * aspect, dy = b[1] - a[1];
    const auto divisor = dx * dx + dy * dy;
    const auto t = divisor ? std::clamp(((p[0] - a[0]) * aspect * dx + (p[1] - a[1]) * dy) / divisor, 0., 1.) : 0.;
    return distance(p, {std::lerp(a[0], b[0], t), std::lerp(a[1], b[1], t)});
}

unsigned rgb(const std::uint8_t* p) { return (p[0] << 16) | (p[1] << 8) | p[2]; }

unsigned mix(unsigned a, unsigned b, double t)
{
    unsigned result{};
    for (int shift : {16, 8, 0})
        result |= static_cast<unsigned>(std::lerp(static_cast<double>((a >> shift) & 255u),
            static_cast<double>((b >> shift) & 255u), t) + .5) << shift;
    return result;
}

void paint(std::uint8_t* p, unsigned colour)
{
    p[0] = static_cast<std::uint8_t>(colour >> 16);
    p[1] = static_cast<std::uint8_t>(colour >> 8);
    p[2] = static_cast<std::uint8_t>(colour);
    p[3] = 255;
}

int repeat(int v, int m) { return (v % m + m) % m; }

unsigned sample(const MapAtlas& atlas, const MapRect& box, int x, int y)
{
    return rgb(atlas.pixels.at(box.x + repeat(x, box.w), box.y + repeat(y, box.h)));
}

void fillRegions(std::vector<int>& regions, int width, int height, const std::vector<Point>& polygon, int index)
{
    const auto box = bounds(polygon);
    const auto first = std::max(0, static_cast<int>(std::ceil(box.top - .5)));
    const auto last = std::min(height - 1, static_cast<int>(std::floor(box.bottom - .5)));
    std::vector<double> crossings;
    crossings.reserve(polygon.size());
    for (int y = first; y <= last; ++y) {
        crossings.clear();
        const auto scan = y + .5;
        auto a = polygon.back();
        for (const auto b : polygon) {
            if ((a[1] > scan) != (b[1] > scan))
                crossings.push_back(a[0] + (scan - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
            a = b;
        }
        std::ranges::sort(crossings);
        for (std::size_t i = 1; i < crossings.size(); i += 2) {
            const auto lo = std::max(0, static_cast<int>(std::ceil(crossings[i - 1] - .5)));
            const auto hi = std::min(width, static_cast<int>(std::ceil(crossings[i] - .5)));
            if (hi > lo) std::fill(regions.begin() + y * width + lo, regions.begin() + y * width + hi, index);
        }
    }
}

// Browser's island field, sampled directly on the texture lattice. Shared
// edges that connect island provinces carry the same narrow neck between cores.
bool islandLand(Point p, const Core& core, const std::vector<Neck>& necks,
    const std::vector<Edge>& shore, std::size_t ordinal)
{
    const auto angle = std::atan2(p[1] - core.centre[1], (p[0] - core.centre[0]) * aspect);
    auto value = core.radius * (1 + .13 * std::sin(angle * 3 + core.phase) +
        .07 * std::sin(angle * 5 - core.phase)) - distance(p, core.centre);
    auto inset = 1.;
    for (const auto& neck : necks) {
        value = std::max(value, neck.radius - std::min(distanceTo(p, neck.a, neck.mid), distanceTo(p, neck.mid, neck.b)));
        inset = std::min(inset, distance(p, neck.mid) / (neck.radius * 1.5));
    }
    if (value <= 0) return false;
    auto clearance = std::numeric_limits<double>::infinity();
    for (const auto& edge : shore)
        if (edge.region == ordinal || edge.neighbor == static_cast<int>(ordinal))
            clearance = std::min(clearance, distanceTo(p, edge.a, edge.b));
    return clearance > .008 * inset;
}

std::array<double, 4> surroundings(const Snapshot& snapshot, const MapGeography& geography,
    const std::vector<Edge>& edges, Point p)
{
    auto water = std::numeric_limits<double>::infinity(), land = water;
    std::array<double, 4> affinity{};
    for (const auto& edge : edges) {
        const auto d = distanceTo(p, edge.a, edge.b);
        if (geography.oceanSides[edge.worldSide]) { water = std::min(water, d); continue; }
        land = std::min(land, d);
        const auto biome = snapshot.regions[edge.region].biome;
        const auto category = biome == 1 ? 0 : biome == 4 || biome == 5 ? 1 : biome == 2 ? 2 : 3;
        affinity[category] += 1 / (.004 + d * d * d);
    }
    const auto n = noise(geography.seed ^ 98432u, p[0] * aspect, p[1], 1 / 1.2);
    const auto fine = noise(geography.seed ^ 56321u, p[0] * aspect, p[1], 1 / 3.4);
    const std::array directions{.5 - p[1], p[0] - .5, p[1] - .5, .5 - p[0]};
    auto seaDirection = -1e9, landDirection = -1e9;
    for (std::size_t i = 0; i < directions.size(); ++i) {
        auto& direction = geography.oceanSides[i] ? seaDirection : landDirection;
        direction = std::max(direction, directions[i]);
    }
    const auto farOcean = .5 + (seaDirection - landDirection) /
        (2 * (std::abs(seaDirection) + std::abs(landDirection) + .1));
    const auto nearest = std::min(water, land);
    const auto ocean = std::lerp(land / std::max(.0001, water + land), farOcean, smooth(.35, 1.5, nearest)) +
        (n - .5) * .2 * smooth(.015, .18, nearest);
    const auto sum = std::accumulate(affinity.begin(), affinity.end(), 0.);
    const auto influence = 1 / ((1 + land * land * 2) * std::max(1., sum));
    const auto high = smooth(.52, .85, .3 + n * .35 + fine * .16 + affinity[0] * influence * .55);
    const auto marsh = smooth(.32, .7, .08 + (1 - n) * .3 + affinity[1] * influence * .7) * (1 - high);
    const auto scrub = std::min(1 - high - marsh, (.12 + affinity[2] * influence * .7 + fine * .12) * (1 - high));
    return {ocean, high, marsh, scrub};
}

void distanceField(std::vector<int>& distances, int width, int height)
{
    for (int pass : {1, -1}) {
        const int sx = pass > 0 ? 0 : width - 1, sy = pass > 0 ? 0 : height - 1;
        for (int y = sy; y >= 0 && y < height; y += pass) {
            for (int x = sx; x >= 0 && x < width; x += pass) {
                auto& d = distances[y * width + x];
                if (x != sx) d = std::min(d, distances[y * width + x - pass] + 3);
                if (y == sy) continue;
                const auto row = (y - pass) * width;
                d = std::min(d, distances[row + x] + 3);
                if (x > 0) d = std::min(d, distances[row + x - 1] + 4);
                if (x + 1 < width) d = std::min(d, distances[row + x + 1] + 4);
            }
        }
    }
}

void paintRivers(MapTerrain& terrain, const MapGeography& geography)
{
    const int width = terrain.full.width, height = terrain.full.height / 2;
    for (const auto& shape : geography.shapes) {
        for (const auto& edge : shape.ink) {
            if (edge.feature != RegionShape::Feature::river) continue;
            auto a = terrain.pixel(edge.points.front());
            for (const auto point : edge.points) {
                const auto b = terrain.pixel(point);
                const auto steps = std::max(1, static_cast<int>(std::ceil(std::hypot(a[0] - b[0], a[1] - b[1]))));
                for (int step = 0; step <= steps; ++step) {
                    const auto t = static_cast<double>(step) / steps;
                    const auto cx = static_cast<int>(std::lerp(a[0], b[0], t)), cy = static_cast<int>(std::lerp(a[1], b[1], t));
                    for (int y = cy - 3; y <= cy + 3; ++y) for (int x = cx - 3; x <= cx + 3; ++x) {
                        const auto r = (cx - x) * (cx - x) + (cy - y) * (cy - y);
                        if (r > 10 || x < 0 || y < 0 || x >= width || y >= height ||
                            terrain.surfaces[y * width + x] == sea) continue;
                        auto& water = terrain.surfaces[y * width + x];
                        if (r < 5) water = river;
                        const unsigned colour = r < 5 ? 0x4d6e70 : 0x867d64;
                        for (int offset : {0, height}) {
                            auto* cell = terrain.full.at(x, y + offset);
                            if (r < 5) paint(cell, colour);
                            else if (water != river) paint(cell, mix(rgb(cell), colour, .8));
                        }
                    }
                }
                a = b;
            }
        }
    }
}

void paintWetlands(MapTerrain& terrain, const MapGeography& geography, const Snapshot& snapshot,
    const std::vector<int>& regions, const std::vector<int>& dryDistance)
{
    const auto width = terrain.full.width, height = terrain.full.height / 2;
    std::vector<Point> centres;
    for (const auto& shape : geography.shapes) centres.push_back(terrain.pixel(shape.label));
    const auto seed = geography.seed;
    for (int y = 8; y < height - 8; ++y) for (int x = 8; x < width - 8; ++x) {
        const int i = y * width + x, id = regions[i];
        if (id < 0 || snapshot.regions[id].biome != 5 || terrain.surfaces[i] != ground || dryDistance[i] < 14) continue;
        if (regions[i - 8] != id || regions[i + 8] != id || regions[i - width * 8] != id || regions[i + width * 8] != id) continue;
        const auto center = centres[id];
        const auto dx = (x - center[0]) / 21., dy = (y - center[1]) / 16.;
        if (dx * dx + dy * dy < 1.2) continue;
        const auto broad = noise(seed ^ 51991u, x, y * 1.6, 58);
        const auto fine = noise(seed ^ 9713u, x, y, 16);
        const auto approach = std::hypot(x - center[0], y - center[1]) / 24.;
        const auto field = broad * .8 + fine * .2 - .28 * std::exp(-approach * approach);
        if (field <= .55) continue;
        if (field > .61) {
            terrain.surfaces[i] = MapTerrain::Surface::pool;
            const auto shelf = noise(seed ^ 17233u, x, y, 28);
            const auto mixing = noise(seed ^ 3167u, x, y, 25);
            const auto water = mix(0x35433f, 0x67664f, std::clamp((mixing - .32) * 2.4, 0., 1.));
            const auto colour = mix(water, 0x87906a, smooth(.55, .87, shelf) * .7);
            paint(terrain.full.at(x, y), colour);
            paint(terrain.full.at(x, height + y), colour);
        } else {
            auto* pixel = terrain.full.at(x, y);
            paint(pixel, mix(rgb(pixel), fine > .5 ? 0x74765c : 0x514d4e, .48));
        }
    }
}

unsigned gradeRelief(const std::uint8_t* source, std::string_view family)
{
    const auto r = (source[0] & 248) + 4., g = (source[1] & 248) + 4., b = (source[2] & 248) + 4.;
    const auto value = r * .30 + g * .59 + b * .11;
    const auto pack = [](double r, double g, double b) {
        const auto round = [](double c) { return static_cast<unsigned>(std::clamp(std::round(c), 0., 255.)); };
        return round(r) << 16 | round(g) << 8 | round(b);
    };
    if (family == "plains") {
        if (g > b * 1.35 && g > r * .90) return pack(value * .82 + 18, value * .80 + 20, value * .49 + 14);
        return pack(value * .88 + 32, value * .76 + 25, value * .49 + 19);
    }
    if (family == "forest") {
        const auto canopy = 86 + (value - 108) * .65;
        return pack(canopy + (r - value) * .7 + 2, canopy + (g - value) * .8 + 3, canopy + (b - value) * .6 - 7);
    }
    if (family == "island-basalt") return pack(120 + (r - 112) * .64, 121 + (g - 112) * .64, 119 + (b - 112) * .64);
    if (family == "hellscape") return pack(85 + (r - 85) * .86, 85 + (g - 85) * .86, 85 + (b - 85) * .86);
    if (family == "mountains") return pack(r * 1.06 + 3, g * 1.055 + 3, b * 1.08 + 3);
    return pack(r * 1.04 + 3, g * 1.02 + 3, b * 1.04 + 3);
}

void paintHinterland(MapTerrain& terrain, const MapArtwork& art, const MapGeography& geography,
    const std::vector<int>& regions)
{
    struct Crest { int x, y; MapRect frame; bool flip; };
    std::vector<Crest> crests;
    const auto width = terrain.full.width, height = terrain.full.height / 2;
    const auto random = [&](std::uint32_t salt) { return decorationRandom(geography.seed ^ 59137u, salt); };
    unsigned edgeIndex = 0;
    for (const auto& shape : geography.shapes) for (const auto& edge : shape.ink) {
        if (edge.worldSide < 0 || geography.oceanSides[edge.worldSide]) continue;
        const auto region = terrain.pixel(shape.label);
        for (int belt = 0; belt < 3; ++belt) {
            auto a = terrain.pixel(edge.points.front());
            auto travelled = 0., next = random(edgeIndex * 997 + belt * 173) * 14;
            unsigned attempts = 0;
            for (const auto p : edge.points) {
                const auto b = terrain.pixel(p);
                const auto dx = b[0] - a[0], dy = b[1] - a[1];
                const auto length = std::hypot(dx, dy);
                while (length > 0 && next <= travelled + length) {
                    const auto t = (next - travelled) / length;
                    const auto x = a[0] + dx * t, y = a[1] + dy * t;
                    const auto d = std::hypot(x - region[0], y - region[1]);
                    const auto salt = 710001u + edgeIndex * 9817u + belt * 271u + attempts++ * 113u;
                    const auto distance = 27. + belt * 46 + random(salt) * 16;
                    const auto px = static_cast<int>(x + (x - region[0]) / d * distance);
                    const auto py = static_cast<int>(y + (y - region[1]) / d * distance);
                    const auto index = static_cast<int>(random(salt + 67) * 12);
                    const auto frame = art.relief.frames.find((belt ? "terrain-mountains-" : "terrain-ridge-border-") +
                        std::to_string(index));
                    if (frame != art.relief.frames.end() && px >= 0 && py >= 0 && px < width && py < height &&
                        regions[py * width + px] < 0 && terrain.surfaceAt({double(px), double(py)}) == ground) {
                        crests.push_back({px, py, frame->second, random(salt + 17) > .5});
                        next += frame->second.w * (.35 + random(salt + 5) * .16);
                    } else next += 9.;
                }
                travelled += length;
                a = b;
            }
        }
        ++edgeIndex;
    }
    std::ranges::stable_sort(crests, {}, &Crest::y);
    for (const auto& crest : crests) {
        const auto& frame = crest.frame;
        const int left = crest.x - frame.w / 2, top = crest.y - frame.h / 2;
        for (int y = std::max(0, -top); y < frame.h && top + y < height; ++y)
            for (int x = std::max(0, -left); x < frame.w && left + x < width; ++x) {
                const auto offset = (top + y) * width + left + x;
                if (regions[offset] >= 0 || terrain.surfaces[offset] != ground) continue;
                const auto* source = art.relief.pixels.at(frame.x + (crest.flip ? frame.w - 1 - x : x), frame.y + y);
                if (source[3] < 65) continue;
                const auto luminance = source[0] * .3 + source[1] * .59 + source[2] * .11;
                const auto gray = static_cast<unsigned>(std::clamp(53 + (luminance - 105) * .30, 29., 88.));
                const unsigned colour = (gray - 3) << 16 | (gray + 1) << 8 | (gray + 6);
                auto* cell = terrain.full.at(left + x, top + y);
                paint(cell, mix(rgb(cell), colour, source[3] / 255. * .88));
                std::copy_n(cell, 4, terrain.full.at(left + x, top + y + height));
            }
    }
}

struct Piece { int x, y, size; MapRect frame; bool mirror; unsigned region; };

void relief(MapTerrain& terrain, const MapArtwork& art, const Snapshot& snapshot,
    const MapGeography& geography, const std::vector<std::vector<Point>>& outlines, const std::vector<int>& regions)
{
    const int width = terrain.full.width, height = terrain.full.height / 2;
    const auto random = [&](std::uint32_t n) { return decorationRandom(geography.seed ^ 48317u, n); };
    for (int occupied : {0, 1}) {
        std::vector<Piece> pieces;
        for (std::size_t i = 0; i < outlines.size(); ++i) {
            const auto box = bounds(outlines[i]);
            const auto center = terrain.pixel(geography.shapes[i].label);
            const auto biome = snapshot.regions[i].biome;
            const auto terrainName = biome == 4 ? "island-basalt" : biomes[biome];
            const std::string prefix = occupied ? "terrain-hellscape-" : "terrain-" + std::string(terrainName) + "-";
            struct Candidate { int x, y; double density; std::uint32_t salt; };
            std::vector<Candidate> candidates;
            const auto area = (box.right - box.left) * (box.bottom - box.top);
            const int attempts = std::min(650, static_cast<int>(std::ceil(area / (biome == 2 ? 64 : 120))));
            for (int n = 0; n < attempts; ++n) {
                const auto salt = 270001u + static_cast<std::uint32_t>(i) * 91813u + n * 137u;
                const int x = static_cast<int>(std::lerp(box.left, box.right, random(salt)));
                const int y = static_cast<int>(std::lerp(box.top, box.bottom, random(salt + 1)));
                if (regions[y * width + x] != static_cast<int>(i) || terrain.surfaceAt({double(x), double(y)}) != ground) continue;
                const auto density = noise(geography.seed ^ 7281u, x, y, 86) * .65 +
                    noise(geography.seed ^ 8167u, x, y, 32) * .35;
                if (density >= (biome == 2 ? .28 : .48))
                    candidates.push_back({x, y, density, salt});
            }
            std::ranges::stable_sort(candidates, std::greater{}, &Candidate::density);
            const int limit = std::clamp(static_cast<int>(area / (biome == 2 ? 490 : 1350)), 2, 34);
            int placed = 0;
            for (const auto& item : candidates) {
                if (placed >= limit) break;
                if (std::hypot(item.x - center[0], (item.y - center[1]) * 1.4) < 23) continue;
                if (std::ranges::any_of(pieces, [&](const auto& p) {
                        const auto dx = item.x - p.x, dy = item.y - p.y;
                        return dx * dx + dy * dy < p.size * p.size * .20;
                    })) continue;
                const auto choice = [&](int n) {
                    const auto kind = static_cast<int>(random(item.salt + n * 79u) * (occupied ? 6 : 12));
                    return art.relief.frames.find(prefix + std::to_string(kind));
                };
                auto entry = choice(0);
                for (int n = 1; n < 4 && entry == art.relief.frames.end(); ++n) entry = choice(n);
                if (entry == art.relief.frames.end()) continue;
                const auto frame = entry->second;
                const auto size = static_cast<int>(frame.w * (biome == 2 ? .62 : occupied ? .48 : .78));
                const auto tall = size * frame.h / frame.w;
                const int left = item.x - size / 2, top = item.y - tall / 2;
                bool fits = left >= 0 && top >= 0 && left + size < width && top + tall < height;
                for (int y = 0; fits && y < tall; y += 2) for (int x = 0; x < size; x += 2) {
                    const auto* source = art.relief.pixels.at(frame.x + x * frame.w / size, frame.y + y * frame.h / tall);
                    if (source[3] < 65) continue;
                    const auto p = (top + y) * width + left + x;
                    if (regions[p] != static_cast<int>(i) || terrain.surfaces[p] != ground) { fits = false; break; }
                }
                if (!fits) continue;
                pieces.push_back({item.x, item.y, size, frame, random(item.salt + 79) < .5, static_cast<unsigned>(i)});
                ++placed;
            }
        }
        std::ranges::stable_sort(pieces, {}, &Piece::y);
        for (const auto& p : pieces) {
            const auto tall = p.size * p.frame.h / p.frame.w;
            const auto left = p.x - p.size / 2, top = p.y - tall / 2;
            for (int y = 0; y < tall; ++y) for (int x = 0; x < p.size; ++x) {
                const auto dx = left + x, dy = top + y;
                if (regions[dy * width + dx] != static_cast<int>(p.region) || terrain.surfaces[dy * width + dx] != ground) continue;
                const auto sx = (p.mirror ? p.size - 1 - x : x) * p.frame.w / p.size;
                const auto* source = art.relief.pixels.at(p.frame.x + sx, p.frame.y + y * p.frame.h / tall);
                if (source[3] < 65) continue;
                auto* pixel = terrain.full.at(dx, dy + height * occupied);
                const auto biome = snapshot.regions[p.region].biome;
                const auto family = occupied ? "hellscape" : biome == 4 ? "island-basalt" : biomes[biome];
                if (family != "forest" && source[2] > source[0] + 8 && source[1] > source[0] + 3) continue;
                paint(pixel, mix(rgb(pixel), gradeRelief(source, family), source[3] / 255.));
            }
        }
    }
}

void compactLevel(MapTerrain& terrain)
{
    const auto& from = terrain.full;
    auto& to = terrain.compact;
    to.width = from.width / 2;
    to.height = from.height / 2;
    to.rgba.resize(static_cast<std::size_t>(to.width) * to.height * 4);
    for (int y = 0; y < to.height; ++y) for (int x = 0; x < to.width; ++x) {
        const auto* a = from.at(x * 2, y * 2);
        const auto* b = from.at(x * 2, y * 2 + 1);
        auto* p = to.at(x, y);
        for (int ch = 0; ch < 4; ++ch) p[ch] = (a[ch] + a[ch + 4] + b[ch] + b[ch + 4] + 2) / 4;
    }
}

}

Point MapTerrain::world(Point px) const
{
    return {std::lerp(min[0], max[0], (px[0] + .5) / full.width),
        std::lerp(min[1], max[1], (px[1] + .5) / (full.height / 2))};
}

Point MapTerrain::pixel(Point p) const
{
    return {(p[0] - min[0]) / (max[0] - min[0]) * full.width,
        (p[1] - min[1]) / (max[1] - min[1]) * (full.height / 2)};
}

MapTerrain::Surface MapTerrain::surfaceAt(Point px) const
{
    if (px[0] < 0 || px[0] >= full.width || px[1] < 0 || px[1] >= full.height / 2) return Surface::sea;
    return surfaces[static_cast<int>(px[1]) * full.width + static_cast<int>(px[0])];
}

MapTerrain bakeMapTerrain(const MapArtwork& art, const MapGeography& geography, const Snapshot& snapshot)
{
    const auto start = std::chrono::steady_clock::now();
    const auto raw = [&](Point p) -> Point {
        return {std::lerp(geography.min[0], geography.max[0], p[0]), std::lerp(geography.min[1], geography.max[1], p[1])};
    };
    MapTerrain terrain;
    const auto x0 = std::floor((geography.min[0] * worldWidth - 160) / 8) * 8;
    const auto y0 = std::floor((geography.min[1] * worldHeight - 160) / 8) * 8;
    const auto x1 = std::ceil((geography.max[0] * worldWidth + 160) / 8) * 8;
    const auto y1 = std::ceil((geography.max[1] * worldHeight + 160) / 8) * 8;
    const int width = static_cast<int>(x1 - x0), height = static_cast<int>(y1 - y0);
    const auto normalized = [&](double x, double y) -> Point {
        return {(x / worldWidth - geography.min[0]) / (geography.max[0] - geography.min[0]),
            (y / worldHeight - geography.min[1]) / (geography.max[1] - geography.min[1])};
    };
    terrain.min = normalized(x0, y0);
    terrain.max = normalized(x1, y1);
    terrain.full = {width, height * 2, std::vector<std::uint8_t>(static_cast<std::size_t>(width) * height * 8)};
    terrain.surfaces.resize(static_cast<std::size_t>(width) * height);

    std::vector<int> regions(terrain.surfaces.size(), -1);
    std::vector<std::vector<Point>> outlines;
    std::vector<Edge> boundary, shore;
    std::vector<Core> cores;
    std::vector<std::vector<Neck>> necks(geography.shapes.size());
    for (std::size_t i = 0; i < geography.shapes.size(); ++i) {
        const auto& shape = geography.shapes[i];
        auto& outline = outlines.emplace_back();
        for (const auto p : shape.outline) outline.push_back(terrain.pixel(p));
        fillRegions(regions, width, height, outline, static_cast<int>(i));
        const auto center = raw(shape.label);
        cores.push_back({center, 1e9, decorationRandom(geography.seed, static_cast<std::uint32_t>(i) + 87000u) * pi * 2});
        for (const auto& line : shape.ink) {
            Edge edge{raw(line.points.front()), raw(line.points.back()), i, line.neighbor, line.worldSide};
            if (edge.worldSide >= 0) boundary.push_back(edge);
            if (edge.neighbor < 0 || snapshot.regions[edge.neighbor].biome != snapshot.regions[i].biome) shore.push_back(edge);
        }
    }
    for (std::size_t i = 0; i < geography.shapes.size(); ++i) for (const auto& line : geography.shapes[i].ink) {
        const auto a = raw(line.points.front()), b = raw(line.points.back());
        cores[i].radius = std::min(cores[i].radius, distanceTo(cores[i].centre, a, b));
        if (line.neighbor >= 0) {
            auto& next = cores[line.neighbor];
            next.radius = std::min(next.radius, distanceTo(next.centre, a, b));
        }
    }
    for (auto& core : cores) core.radius = std::max(.025, core.radius * .85);
    for (std::size_t i = 0; i < geography.shapes.size(); ++i) for (const auto& line : geography.shapes[i].ink) {
        if (line.neighbor < 0 || snapshot.regions[i].biome != 4 || snapshot.regions[line.neighbor].biome != 4) continue;
        const auto a = cores[i], b = cores[line.neighbor];
        const Neck neck{a.centre, raw(line.points[line.points.size() / 2]), b.centre, std::min(a.radius, b.radius) * .7};
        necks[i].push_back(neck);
        necks[line.neighbor].push_back(neck);
    }

    constexpr int fieldStep = 8;
    const int fieldWidth = width / fieldStep + 1, fieldHeight = height / fieldStep + 1;
    std::vector<std::array<double, 4>> field(static_cast<std::size_t>(fieldWidth) * fieldHeight);
    for (int y = 0; y < fieldHeight; ++y) for (int x = 0; x < fieldWidth; ++x)
        field[y * fieldWidth + x] = surroundings(snapshot, geography, boundary,
            {(x0 + x * fieldStep) / worldWidth, (y0 + y * fieldStep) / worldHeight});

    const auto hinterland = [&](int x, int y, int channel) {
        const int i = (y / fieldStep) * fieldWidth + x / fieldStep;
        const auto fx = (x % fieldStep) / double(fieldStep), fy = (y % fieldStep) / double(fieldStep);
        return std::lerp(std::lerp(field[i][channel], field[i + 1][channel], fx),
            std::lerp(field[i + fieldWidth][channel], field[i + fieldWidth + 1][channel], fx), fy);
    };
    std::vector<int> seaDistance(regions.size()), dryDistance(regions.size());
    for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x) {
        const auto i = y * width + x, id = regions[i];
        bool land = id >= 0 ? true : hinterland(x, y, 0) < .5;
        if (id >= 0 && snapshot.regions[id].biome == 4) {
            const Point p{(x0 + x + .5) / worldWidth, (y0 + y + .5) / worldHeight};
            const auto center = terrain.pixel(geography.shapes[id].label);
            const auto xOffset = (x - center[0]) / 21., yOffset = (y - center[1]) / 15.;
            land = xOffset * xOffset + yOffset * yOffset < 1 || islandLand(p, cores[id], necks[id], shore, id);
        }
        terrain.surfaces[i] = land ? ground : sea;
        seaDistance[i] = land ? 0 : 768;
        dryDistance[i] = land ? 768 : 0;
    }
    distanceField(seaDistance, width, height);
    distanceField(dryDistance, width, height);

    std::array<std::array<MapRect, 16>, 7> tiles{};
    for (std::size_t b = 0; b < tiles.size(); ++b) for (int n = 0; n < 16; ++n) {
        const auto biome = b == 6 ? "monster" : biomes[b];
        tiles[b][n] = (b == 6 ? art.monster : art.ground).frame("ground-" + std::string(biome) + "-" + std::to_string(n));
    }
    constexpr std::array<std::array<int, 16>, 6> bankStyles{{
        {1, 2, 0, 2, 0, 3, 4, 2, 5, 6, 2, 4, 2, 4, 5, 7}, {0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7},
        {2, 0, 7, 2, 3, 2, 1, 3, 2, 1, 3, 7, 0, 1, 4, 6}, {1, 2, 0, 2, 0, 3, 4, 2, 5, 6, 2, 4, 2, 4, 5, 7},
        {1, 0, 1, 3, 4, 5, 2, 1, 5, 1, 3, 2, 1, 7, 6, 3}, {0, 1, 0, 2, 3, 0, 4, 3, 0, 5, 6, 2, 0, 3, 4, 7}}};
    std::array<std::array<MapRect, 8>, 6> profiles{};
    for (std::size_t b = 0; b < profiles.size(); ++b) for (int n = 0; n < 8; ++n)
        profiles[b][n] = art.banks.frame("bank-" + std::string(biomes[b]) + "-" + std::to_string(n));

    for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x) {
        const auto i = y * width + x, id = regions[i];
        const auto seed = geography.seed;
        const int wx = x + static_cast<int>(x0), wy = y + static_cast<int>(y0);
        const auto variant = static_cast<int>(decorationRandom(seed ^ 60331u,
            cellSalt(static_cast<int>(std::floor(wx / 32.)), static_cast<int>(std::floor(wy / 32.)))) * 16);
        unsigned natural{}, occupied{};
        if (terrain.surfaces[i] == sea) {
            const auto d = seaDistance[i] / 3.;
            const auto shelf = noise(seed ^ 179u, wx, wy, 135), channel = noise(seed ^ 713u, wx * .6, wy * 1.2, 46);
            const auto shoal = std::exp(-d / (24 + shelf * shelf * 150));
            const auto open = noise(seed ^ 9071u, wx, wy, 92);
            const auto swell = (wy + wx * .22 + std::sin(wx / 83.) * 6 +
                (noise(seed ^ 619u, wx, wy * .45, 68) - .5) * 21) / 17.;
            natural = mix(0x293f50, 0x365b68, std::clamp(open * .7 + shelf * .22, 0., 1.));
            natural = mix(natural, 0x508b83, std::clamp(shoal * (.55 + channel * .65), 0., 1.));
            natural = mix(natural, 0x99b8a7, (std::sin(swell * pi * 2) * .5 + .5) * (.04 + shoal * .08));
            occupied = natural;
        } else if (id < 0) {
            const auto high = hinterland(x, y, 1), marsh = hinterland(x, y, 2), scrub = hinterland(x, y, 3);
            natural = mix(0x252527, 0x4b5159, high * .8 + scrub * .17);
            natural = mix(natural, 0x3b4044, marsh * .7 + noise(seed ^ 138u, wx, wy, 19) * .21);
            occupied = natural;
        } else {
            const auto b = std::min<std::size_t>(snapshot.regions[id].biome, 5);
            const auto shade = noise(seed, x, y, 60) * .55 + noise(seed ^ 7531u, x, y, 16) * .45;
            const auto speck = decorationRandom(seed ^ 1731u, static_cast<std::uint32_t>(x) * 8363u ^ static_cast<std::uint32_t>(y) * 36433u);
            const int tone = std::clamp(static_cast<int>(shade * 4) + (speck < .025 ? -1 : speck > .98 ? 1 : 0), 0, 3);
            natural = mix(palette[b][tone], sample(art.ground, tiles[b][variant], wx, wy), .72);
            if (b == 4) {
                const auto inland = std::clamp((dryDistance[i] / 3. - 4) / 14, 0., 1.);
                const auto heath = noise(seed ^ 63917u, x, y, 70);
                const auto volcanic = mix(0x777971, 0x565d4d, std::clamp((heath - .3) * 2, 0., 1.));
                natural = mix(natural, volcanic, inland * .64);
            }
            if (dryDistance[i] <= 27) {
                const auto& profile = profiles[b][bankStyles[b][variant]];
                const auto gradientX = std::abs(dryDistance[y * width + std::min(x + 1, width - 1)] -
                    dryDistance[y * width + std::max(x - 1, 0)]);
                const auto gradientY = std::abs(dryDistance[std::min(y + 1, height - 1) * width + x] -
                    dryDistance[std::max(y - 1, 0) * width + x]);
                natural = mix(natural, sample(art.banks, profile, (gradientX < gradientY ? wx : wy) * 2,
                    11 + dryDistance[i] * 20 / 27), (1 - dryDistance[i] / 29.) * .68);
            }
            occupied = mix(palette[6][tone], sample(art.monster, tiles[6][variant], wx, wy), .72);
        }
        paint(terrain.full.at(x, y), natural);
        paint(terrain.full.at(x, height + y), occupied);
    }
    paintRivers(terrain, geography);
    paintWetlands(terrain, geography, snapshot, regions, dryDistance);
    paintHinterland(terrain, art, geography, regions);
    relief(terrain, art, snapshot, geography, outlines, regions);
    planMapSites(terrain, art, geography, snapshot, regions);
    planMapRoads(terrain, geography, snapshot, regions);
    compactLevel(terrain);
    terrain.bakeMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
    return terrain;
}

}
