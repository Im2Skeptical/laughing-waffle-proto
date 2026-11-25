#include "connected_map_art.hpp"
#include "connected_water.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <limits>
#include <numeric>
#include <span>

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
    return mixInk(a, b, t);
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

struct ShoreTreatment { unsigned bank, sediment; double reach; };
constexpr std::array<ShoreTreatment, 6> shores{{
    {0x78664a, 0xc5b78c, 14}, {0x615047, 0xa3927f, 4}, {0x424936, 0x92956a, 5},
    {0x78664a, 0xc5b78c, 14}, {0x565b4c, 0xb3ac8f, 6}, {0x55475b, 0x96869a, 24}
}};

using TileFrames = std::array<std::array<MapRect, 16>, 7>;

int groundVariant(std::uint32_t seed, int wx, int wy)
{
    return static_cast<int>(decorationRandom(seed ^ 60331u,
        cellSalt(static_cast<int>(std::floor(wx / 32.)), static_cast<int>(std::floor(wy / 32.)))) * 16);
}

struct OceanInk {
    unsigned base{};
    std::array<std::uint8_t, 3> index{}, strength{};
    unsigned paint() const
    {
        auto result = base;
        for (std::size_t n = 0; n < index.size(); ++n)
            result = mix(result, oceanRamps[oceanRampFor(index[n])][index[n] % 32], strength[n] / 255.);
        return result;
    }
};

OceanInk oceanInk(std::uint32_t seed, double x, double y, double distance)
{
    const auto unit = [](double n) { return std::clamp(n, 0., 1.); };
    const auto fract = [](double n) { return n - std::floor(n); };
    const auto shelf = noise(seed ^ 179u, x, y, 135), channel = noise(seed ^ 713u, x * .6, y * 1.2, 46);
    const auto shoal = std::exp(-distance / (24 + shelf * shelf * 150));
    const auto open = noise(seed ^ 9071u, x, y, 92), lace = noise(seed ^ 8317u, x, y, 8);
    const auto travel = (y + x * .22 + std::sin(x / 83.) * 6 + (noise(seed ^ 619u, x, y * .45, 68) - .5) * 21) / 17;
    const auto swell = fract(travel);
    const auto fine = noise(seed ^ 977u, x * .55, y * 1.8, 10);
    const auto chop = fract((y - x * .32 + std::sin(x / 27.) * 3) / 9);
    const auto packet = noise(seed ^ 4217u, x * .75, y * 1.25, 37), pores = noise(seed ^ 3191u, x, y, 2.7);
    const auto streak = noise(seed ^ 4231u, x * .45, y * 2.1, 12);
    const auto surfReach = 16 + shelf * 35;
    const auto coastal = distance < surfReach;
    const auto foamPhase = coastal ? fract(distance / 21 + travel * .32 + (channel - .5) * .65 + (lace - .5) * .19) :
        fract(swell + (pores - .5) * .06);
    const auto strength = .07 + unit((packet - .32) * 2) * (.12 + streak * .38);
    const auto ripple = (.14 + unit((fine - .64) * 3) * .3) * smooth(.48, .80, fine);
    const auto foam = coastal ? smooth(0, 12, surfReach - distance) * smooth(0, 4, distance) *
        smooth(.22, .50, packet) * (.42 + lace * .30) * (.35 + smooth(.25, .73, pores) * .65) :
        smooth(0, 16, distance - surfReach) * smooth(.50, .82, packet) * smooth(.40, .72, fine) *
        (.35 + fine * .3) * (.45 + pores * .55);
    auto base = mix(0x293f50, 0x365b68, unit(open * .7 + shelf * .22));
    base = mix(base, 0x508b83, unit(shoal * (.55 + channel * .65)));
    base = mix(base, 0x9eaf90, unit((channel - .47) * 3) * std::pow(shoal, 1.8) * .55);
    base = mix(base, 0x314f59, unit((.42 - channel) * 4) * shoal * .45);
    const auto grain = fract(std::sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453);
    base = mix(base, grain > .5 ? 0x729b96 : 0x294a58, .035 + pores * .025);
    return {base,
        {static_cast<std::uint8_t>(swell * 32), static_cast<std::uint8_t>(96 + chop * 32),
         static_cast<std::uint8_t>((coastal ? 32 : 64) + foamPhase * (coastal ? 32 : 16))},
        {static_cast<std::uint8_t>(std::round(strength * 255)), static_cast<std::uint8_t>(std::round(ripple * 255)),
         static_cast<std::uint8_t>(std::round(foam * 255))}};
}

void paintEcotones(MapTerrain& terrain, const MapArtwork& art, const Snapshot& snapshot, std::uint32_t seed,
    const std::vector<int>& regions, const TileFrames& tiles)
{
    // The contact atlas supplies each corner case. The distance ribbon blends
    // material on its own side of the border and leaves the geography intact.
    constexpr std::array order{0, 4, 1, 0, 2, 3};
    std::array<std::array<std::array<MapRect, 16>, 5>, 5> contacts{};
    for (int a : {0, 2, 4, 5, 1}) for (int b : {0, 2, 4, 5, 1}) {
        if (order[b] <= order[a]) continue;
        const auto label = "contact-" + std::string(biomes[a]) + "-" + std::string(biomes[b]) + "-";
        for (int n = 0; n < 16; ++n) contacts[order[a]][order[b]][n] = art.ground.frame(label + std::to_string(n));
    }
    constexpr int reach = 9;
    const auto width = terrain.full.width, height = terrain.full.height / 2;
    const auto x0 = static_cast<int>(terrain.origin[0]), y0 = static_cast<int>(terrain.origin[1]);
    const auto biomeAt = [&](int x, int y) {
        if (x < 0 || y < 0 || x >= width || y >= height) return -1;
        const auto id = regions[y * width + x];
        return id < 0 ? -1 : std::min<int>(snapshot.regions[id].biome, 5);
    };
    for (int y = reach; y < height - reach; ++y) for (int x = reach; x < width - reach; ++x) {
        const auto i = y * width + x, biome = biomeAt(x, y);
        if (biome < 0 || terrain.surfaces[i] != ground) continue;
        auto other = -1, distance = 0;
        for (int d = 2; d <= reach && other < 0; d += 2) for (const auto j : {i - d, i + d, i - width * d, i + width * d}) {
            const auto id = regions[j];
            if (id < 0 || terrain.surfaces[j] != ground) continue;
            const auto candidate = std::min<int>(snapshot.regions[id].biome, 5);
            if (order[candidate] == order[biome]) continue;
            other = candidate;
            distance = d;
            break;
        }
        const auto riverMargin = terrain.surfaces[i - 4] == river || terrain.surfaces[i + 4] == river ||
            terrain.surfaces[i - width * 4] == river || terrain.surfaces[i + width * 4] == river;
        if (other < 0 && !riverMargin) continue;
        const auto n = noise(seed ^ 5371u, x, y, 7);
        auto* cell = terrain.full.at(x, y);
        auto colour = rgb(cell);
        if (other >= 0) {
            const auto wx = x + x0, wy = y + y0, variant = groundVariant(seed, wx, wy);
            auto a = biome, b = other;
            auto amount = (1 - distance / (reach + 2.)) * (.25 + n * .4);
            if (order[a] > order[b]) { std::swap(a, b); amount = 1 - amount; }
            const auto px = static_cast<int>(std::floor(wx / 32.)) * 32 - x0;
            const auto py = static_cast<int>(std::floor(wy / 32.)) * 32 - y0;
            int mask = 0;
            constexpr std::array offsets{Point{0, 0}, Point{32, 0}, Point{32, 32}, Point{0, 32}};
            for (std::size_t k = 0; k < offsets.size(); ++k) {
                const auto material = biomeAt(px + static_cast<int>(offsets[k][0]), py + static_cast<int>(offsets[k][1]));
                if (material >= 0 && order[material] == order[b]) mask |= 1 << k;
            }
            const auto base = mix(sample(art.ground, tiles[a][variant], wx, wy),
                sample(art.ground, tiles[b][variant], wx, wy), amount);
            const auto material = mix(base, sample(art.ground, contacts[order[a]][order[b]][mask], wx, wy), .22);
            colour = mix(colour, material, .65);
            if ((a == 1 || b == 1) && n > .62 && (x + y * 7) % 13 < 2) colour = palette[biome][0];
            const auto chop = (y + std::sin(x / 8.) * 3) / 6;
            if ((a == 5 || b == 5) && n > .64 && chop - std::floor(chop) < .24)
                colour = mix(palette[biome][0], 0x5d7368, .5);
        }
        if (riverMargin) {
            if (n > .35) colour = mix(colour, shores[biome].sediment, .35);
            if (biome == 1 && (x * 3 + y) % 7 < 2) colour = palette[biome][0];
            if (biome == 2 && n > .6) colour = 0x586047;
        }
        paint(cell, colour);
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
    if (family == "swamp") {
        if (b > g * .70 && r < g * 1.35) return pack(r * 1.10 + 3, g * .95 + 3, b * 1.20 + 3);
        if (g > b * 1.22 && r < g * 1.22) return pack(r * 1.04 + 3, g * .99 + 3, b * 1.08 + 3);
        return pack(r * 1.04 + 3, g * 1.02 + 3, b * 1.04 + 3);
    }
    if (family == "mountains" && std::max({r, g, b}) - std::min({r, g, b}) < 35)
        return pack(r * 1.085 + 3, g * 1.035 + 3, b * 1.025 + 3);
    return pack(r * 1.06 + 3, g * 1.055 + 3, b * 1.08 + 3);
}

void paintHinterland(MapTerrain& terrain, const MapArtwork& art, const MapGeography& geography,
    const Snapshot& snapshot, const std::vector<Edge>& boundary, const std::vector<int>& regions)
{
    struct Crest { int x, y; MapRect frame; bool flip, barrier; std::string_view family; };
    std::vector<Crest> crests;
    const auto width = terrain.full.width, height = terrain.full.height / 2;
    const auto random = [&](std::uint32_t salt) { return decorationRandom(geography.seed ^ 59137u, salt); };
    const auto add = [&](int px, int py, double dx, double dy, std::string_view family,
                         std::span<const int> indices, std::uint32_t salt, bool barrier) {
        const auto prefix = "terrain-" + std::string(family) + "-";
        std::vector<std::pair<double, int>> ranked;
        for (const auto n : indices) for (int flip : {0, 1})
            ranked.emplace_back(random(salt + static_cast<unsigned>(ranked.size()) * 67), n * 2 + flip);
        std::ranges::sort(ranked);
        for (const auto& [rank, key] : ranked) {
            const auto found = art.relief.frames.find(prefix + std::to_string(key / 2));
            if (found == art.relief.frames.end()) continue;
            const auto frame = found->second;
            const auto left = px - frame.w / 2, top = py - frame.h / 2;
            if (left < 0 || top < 0 || left + frame.w > width || top + frame.h > height) continue;
            if (std::ranges::any_of(crests, [&](const Crest& other) {
                    return other.frame == frame && std::hypot(other.x - px, other.y - py) < (barrier ? 76 : 120);
                })) continue;
            int painted{}, dry{}, outside{};
            for (int y = 0; y < frame.h; y += 2) for (int x = 0; x < frame.w; x += 2) {
                const auto* source = art.relief.pixels.at(frame.x + (key % 2 ? frame.w - 1 - x : x), frame.y + y);
                if (source[3] < 65) continue;
                const auto i = (top + y) * width + left + x;
                ++painted;
                dry += terrain.surfaces[i] == ground;
                outside += regions[i] < 0;
            }
            if (!painted || dry <= painted * .96 || outside <= painted * (barrier ? .72 : .98)) continue;
            crests.push_back({px, py, frame, key % 2 != 0, barrier, family});
            return std::abs(dx) * frame.w + std::abs(dy) * frame.h;
        }
        return 0.;
    };
    constexpr std::array broad{0, 1, 2, 3, 4, 5, 6};
    constexpr std::array foothills{5, 6, 7, 8, 9, 11};
    constexpr std::array flat{0, 1, 6, 7, 10};
    constexpr std::array rising{2, 4, 6, 10}, falling{3, 5, 7, 10};
    unsigned edgeIndex = 0;
    for (const auto& shape : geography.shapes) for (const auto& edge : shape.ink) {
        if (edge.worldSide < 0 || geography.oceanSides[edge.worldSide]) continue;
        const auto region = terrain.pixel(shape.label);
        unsigned attempts = 0;
        for (int belt = 0; belt < 3; ++belt) {
            auto a = terrain.pixel(edge.points.front());
            auto travelled = 0., next = random(edgeIndex * 997 + belt * 173) * 14;
            for (const auto p : edge.points) {
                const auto b = terrain.pixel(p);
                const auto dx = b[0] - a[0], dy = b[1] - a[1];
                const auto length = std::hypot(dx, dy);
                while (length > 0 && next <= travelled + length) {
                    const auto t = (next - travelled) / length;
                    const auto x = a[0] + dx * t, y = a[1] + dy * t;
                    const auto d = std::hypot(x - region[0], y - region[1]);
                    const auto salt = 710001u + edgeIndex * 9817u + belt * 271u + attempts++ * 113u;
                    const auto indices = belt == 2 ? std::span<const int>(foothills) : belt == 1 ? std::span<const int>(broad) :
                        std::abs(dy) < std::abs(dx) * .5 ? std::span<const int>(flat) :
                        dx * dy < 0 ? std::span<const int>(rising) : std::span<const int>(falling);
                    const auto offsets = belt == 2 ? std::array{48, 59, 72, 85} :
                        belt == 1 ? std::array{26, 36, 46, 46} : std::array{8, 15, 23, 31};
                    double accepted = 0;
                    for (const auto offset : offsets) {
                        const auto distance = offset * 2.;
                        const auto px = static_cast<int>(std::round(x + (x - region[0]) / std::max(1., d) * distance));
                        const auto py = static_cast<int>(std::round(y + (y - region[1]) / std::max(1., d) * distance));
                        accepted = add(px, py, dx / length, dy / length, belt ? "mountains" : "ridge-border", indices, salt, true);
                        if (accepted) break;
                    }
                    next += accepted ? accepted * (.38 + random(salt + 5) * .16) : 10.;
                }
                travelled += length;
                a = b;
            }
        }
        ++edgeIndex;
    }
    constexpr std::array forest{0, 1, 2, 3, 4, 5, 7};
    constexpr std::array mountains{2, 5, 6, 7, 8, 9, 10, 11},
        swamp{0, 1, 3, 5, 6, 8, 10, 11}, plains{4, 5, 6, 7, 8, 9, 10, 11};
    for (unsigned n = 0; n < 550; ++n) {
        const auto salt = 910001u + n * 193u;
        const auto wx = -1 + random(salt) * 3, wy = -1 + random(salt + 1) * 3;
        const auto x = wx * worldWidth - terrain.origin[0], y = wy * worldHeight - terrain.origin[1];
        if (x < 0 || y < 0 || x >= width || y >= height || random(salt + 2) > .48) continue;
        const auto cluster = static_cast<std::uint32_t>(static_cast<int>(std::floor(x / 130))) * 857u ^
            static_cast<std::uint32_t>(static_cast<int>(std::floor(y / 90))) * 3187u;
        if (random(cluster) < .38 || std::ranges::any_of(crests, [&](const Crest& crest) {
                return std::hypot(crest.x - x, crest.y - y) < (crest.barrier ? 46 : 28);
            })) continue;
        const auto field = surroundings(snapshot, geography, boundary, {wx, wy});
        if (field[0] > .35) continue;
        const bool high = field[1] > .45, mire = field[2] > .3, trees = field[3] > .28;
        const auto indices = high ? std::span<const int>(mountains) : mire ? std::span<const int>(swamp) :
            trees ? std::span<const int>(forest) : std::span<const int>(plains);
        add(static_cast<int>(std::round(x)), static_cast<int>(std::round(y)), 1, 0,
            high ? "mountains" : mire ? "swamp" : trees ? "forest" : "plains", indices, salt, false);
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
                if (crest.family != "forest" && source[2] > source[0] + 8 && source[1] > source[0] + 3) continue;
                const auto graded = gradeRelief(source, crest.family);
                const auto luminance = (graded >> 16) * .3 + (graded >> 8 & 255) * .59 + (graded & 255) * .11;
                const auto gray = static_cast<unsigned>(std::clamp(53 + (luminance - 105) * .30, 29., 88.));
                const unsigned colour = (gray - 3) << 16 | (gray + 1) << 8 | (gray + 6);
                auto* cell = terrain.full.at(left + x, top + y);
                paint(cell, mix(rgb(cell), colour, source[3] / 255. * .88));
                std::copy_n(cell, 4, terrain.full.at(left + x, top + y + height));
            }
    }
}

// Reserve the painted building footprints, the court and its approach. The
// bounds follow the planned city modules instead of a single clearing radius.
std::vector<std::uint8_t> siteExclusions(const MapTerrain& terrain)
{
    const auto width = terrain.full.width, height = terrain.full.height / 2;
    std::vector<std::uint8_t> mask(terrain.surfaces.size());
    const auto box = [&](double left, double top, double right, double bottom, const auto& contains) {
        const auto x0 = std::max(0, static_cast<int>(std::floor(left))), x1 = std::min(width, static_cast<int>(std::ceil(right)));
        const auto y0 = std::max(0, static_cast<int>(std::floor(top))), y1 = std::min(height, static_cast<int>(std::ceil(bottom)));
        for (int y = y0; y < y1; ++y) for (int x = x0; x < x1; ++x)
            if (contains(x, y)) mask[y * width + x] = 1;
    };
    const auto scale = terrain.pixel({terrain.min[0] + 1, terrain.min[1] + 1});
    for (const auto& site : terrain.sites) {
        const auto unit = site.radiusX * scale[0] / 23;
        for (const auto& building : site.buildings) {
            const auto at = terrain.pixel(building.at);
            const auto w = building.width * scale[0] * .6 + unit, h = building.height * scale[1];
            box(at[0] - w, at[1] - h - unit * 2, at[0] + w, at[1] + h * .55 + unit, [](int, int) { return true; });
        }
        const auto court = terrain.pixel(site.court), approach = terrain.pixel(site.entrance);
        box(court[0] - 7 * unit, court[1] - 5 * unit, court[0] + 7 * unit, court[1] + 5 * unit, [&](int x, int y) {
            return std::hypot((x - court[0]) / (7 * unit), (y - court[1]) / (5 * unit)) < 1;
        });
        const auto dx = approach[0] - court[0], dy = approach[1] - court[1], d = dx * dx + dy * dy;
        box(std::min(court[0], approach[0]) - 2 * unit, std::min(court[1], approach[1]) - 2 * unit,
            std::max(court[0], approach[0]) + 2 * unit, std::max(court[1], approach[1]) + 2 * unit, [&](int x, int y) {
                const auto t = d ? std::clamp(((x - court[0]) * dx + (y - court[1]) * dy) / d, 0., 1.) : 0.;
                return std::hypot(x - court[0] - t * dx, y - court[1] - t * dy) < 2 * unit;
            });
    }
    return mask;
}

struct Piece { int x, y, size; MapRect frame; bool mirror; int region; std::string_view family; int variant{}; };

MapRect footprint(const Piece& piece)
{
    const auto h = piece.size * piece.frame.h / piece.frame.w;
    return {piece.x - piece.size / 2, piece.y - h / 2, piece.size, h};
}

const std::uint8_t* reliefTexel(const MapAtlas& atlas, const Piece& piece, const MapRect& rect, int x, int y)
{
    const auto sx = (piece.mirror ? rect.w - 1 - x : x) * piece.frame.w / rect.w;
    return atlas.pixels.at(piece.frame.x + sx, piece.frame.y + y * piece.frame.h / rect.h);
}

bool solidRelief(const Piece& p, const std::uint8_t* texel, int alpha)
{
    return texel[3] >= alpha && (p.family == "forest" || texel[2] <= texel[0] + 8 || texel[1] <= texel[0] + 3);
}

double reliefOverlap(const MapAtlas& atlas, const Piece& a, const Piece& b)
{
    const auto aa = footprint(a), bb = footprint(b);
    const auto x0 = std::max(aa.x, bb.x), x1 = std::min(aa.x + aa.w, bb.x + bb.w);
    const auto y0 = std::max(aa.y, bb.y), y1 = std::min(aa.y + aa.h, bb.y + bb.h);
    if (x0 >= x1 || y0 >= y1) return 0;
    const auto solid = [&](const Piece& p, const MapRect& r, int x, int y) {
        return solidRelief(p, reliefTexel(atlas, p, r, x - r.x, y - r.y), 115);
    };
    int overlap = 0;
    for (int y = y0; y < y1; y += 2) for (int x = x0; x < x1; x += 2)
        overlap += solid(a, aa, x, y) && solid(b, bb, x, y);
    if (!overlap) return 0;
    const auto area = [&](const Piece& p, const MapRect& r) {
        int count = 0;
        for (int y = r.y; y < r.y + r.h; ++y) for (int x = r.x; x < r.x + r.w; ++x)
            count += solid(p, r, x, y);
        return count;
    };
    return std::min(1., overlap * 4. / std::max(1, std::min(area(a, aa), area(b, bb))));
}

bool fitsRelief(const Piece& piece, const MapAtlas& art, const MapTerrain& terrain,
    const std::vector<int>& regions, std::span<const std::uint8_t> sites, int adjacent = -1)
{
    const auto box = footprint(piece);
    const auto width = terrain.full.width, height = terrain.full.height / 2;
    if (box.x < 0 || box.y < 0 || box.x + box.w > width || box.y + box.h > height) return false;
    const auto bone = piece.family == "bone-border";
    int painted{}, outside{}, foot{}, dryFoot{}, rooted{};
    for (int y = 0; y < box.h; ++y) for (int x = 0; x < box.w; ++x) {
        if (!solidRelief(piece, reliefTexel(art, piece, box, x, y), 65)) continue;
        const auto index = (box.y + y) * width + box.x + x;
        ++painted;
        if (bone) {
            const auto dry = terrain.surfaces[index] == ground;
            if (y >= box.h * .7) { ++foot; dryFoot += dry; }
            rooted += dry && regions[index] == piece.region;
            continue;
        }
        if (terrain.surfaces[index] != ground || (!sites.empty() && sites[index])) return false;
        outside += regions[index] != piece.region && (adjacent < 0 || regions[index] != adjacent);
    }
    if (bone) return foot > 0 && dryFoot >= foot * .85 && rooted >= painted * .18;
    return painted > 0 && outside < painted * .025;
}

void joinRelief(std::vector<Piece>& pieces, const MapTerrain& terrain, const MapAtlas& atlas,
    const std::vector<int>& regions, std::span<const std::uint8_t> sites, std::span<const Point> path,
    std::span<const int> indices, std::string_view family, int region, int adjacent, std::uint32_t seed, unsigned pathSalt,
    Point interior = {})
{
    const auto prefix = "terrain-" + std::string(family) + "-";
    const auto random = [&](unsigned n) { return decorationRandom(seed ^ 48317u, n); };
    const auto ridge = family == "ridge-border";
    const auto bone = family == "bone-border";
    const auto select = [&](Point point, unsigned salt, const std::optional<Piece>& previous, std::span<const int> variants) {
        std::vector<std::pair<double, int>> ranked;
        for (const auto n : variants) for (int mirrored : {0, 1})
            ranked.emplace_back(random(salt + static_cast<unsigned>(ranked.size()) * 79), n * 2 + mirrored);
        std::ranges::sort(ranked);
        std::optional<Piece> chosen;
        double best = -1e9;
        const auto scales = bone ? std::array{1.3, 1., .72, .5} : std::array{1., .72, .5, 0.};
        for (const auto scale : scales) {
            if (scale == 0) break;
            for (std::size_t n = 0; n < std::min<std::size_t>(12, ranked.size()); ++n) {
                const auto code = ranked[n].second;
                const auto frame = atlas.frames.find(prefix + std::to_string(code / 2));
                if (frame == atlas.frames.end()) continue;
                const auto x = static_cast<int>(std::round(point[0] + (random(salt + n * 31 + 2) - .5) * (bone ? 3 : 10)));
                const auto w = static_cast<int>(std::round(frame->second.w * scale));
                const auto h = w * frame->second.h / frame->second.w;
                const auto y = static_cast<int>(std::round(point[1] + (random(salt + n * 31 + 3) - .5) *
                    (bone ? 3 : 12) + (ridge || bone ? .18 * h : 0)));
                const Piece p{x, y, w, frame->second, code % 2 != 0, region, family, code / 2};
                if (std::ranges::any_of(pieces, [&](const Piece& other) {
                        return p.frame == other.frame && std::hypot(p.x - other.x, p.y - other.y) <
                            (family == "forest" ? 36 : bone ? 64 : 70);
                    })) continue;
                if (!fitsRelief(p, atlas, terrain, regions, sites, adjacent)) continue;
                const auto join = previous ? reliefOverlap(atlas, p, *previous) : 0.;
                if (previous && (join < (ridge ? .12 : .06) || join > .46)) continue;
                double overlap{};
                for (const auto& existing : pieces) overlap = std::max(overlap, reliefOverlap(atlas, p, existing));
                if (overlap > .58) continue;
                const auto score = random(salt + n * 31 + 4) * .3 + (previous ? 1 - std::abs(join - .22) * 3 :
                    std::min(.3, overlap)) - std::max(0., overlap - .38);
                if (score > best) { best = score; chosen = p; }
            }
            if (chosen || ridge || family == "mountains") break;
        }
        return chosen;
    };
    constexpr std::array flat{0, 1, 6, 7, 10};
    constexpr std::array steep{4, 5, 7, 10}, rising{2, 6, 7, 10}, falling{3, 6, 7, 10};
    double travelled = 0, next = random(pathSalt) * 24;
    unsigned attempts = 0;
    std::optional<Piece> previous;
    for (std::size_t j = 1; j < path.size(); ++j) {
        const auto a = path[j - 1], b = path[j];
        const auto dx = b[0] - a[0], dy = b[1] - a[1], length = std::hypot(dx, dy);
        if (!length) continue;
        const auto variants = !ridge ? indices : std::abs(dy) < std::abs(dx) * .4 ? std::span<const int>(flat) :
            std::abs(dy) > std::abs(dx) * 2 ? std::span<const int>(steep) :
            dx * dy < 0 ? std::span<const int>(rising) : std::span<const int>(falling);
        while (next <= travelled + length) {
            const auto t = (next - travelled) / length;
            const Point at{a[0] + dx * t, a[1] + dy * t};
            const auto salt = pathSalt + ++attempts * 719;
            auto piece = select(at, salt, previous, variants);
            if (!piece && bone) {
                const auto d = std::max(1., std::hypot(interior[0] - at[0], interior[1] - at[1]));
                for (const auto offset : {8, 16, 24}) {
                    piece = select({at[0] + (interior[0] - at[0]) / d * offset, at[1] + (interior[1] - at[1]) / d * offset},
                        salt + offset * 13, {}, variants);
                    if (piece) break;
                }
            }
            if (!piece && previous) {
                for (const auto offset : {-5, 5, -9}) {
                    piece = select({at[0] + dx / length * offset * 2, at[1] + dy / length * offset * 2},
                        salt + offset * 113, previous, variants);
                    if (piece) break;
                }
                if (!piece) piece = select(at, salt, {}, variants);
            }
            previous = piece;
            if (piece) {
                pieces.push_back(*piece);
                const auto box = footprint(*piece);
                const auto projected = std::abs(dx / length) * box.w + std::abs(dy / length) * box.h;
                next += projected * (bone ? .48 + random(salt + 5) * .36 : .4 + random(salt + 5) * .16);
            } else next += bone ? 6 + random(salt + 7) * 8 : 14 + random(salt + 7) * 14;
        }
        travelled += length;
    }
}

void planBones(MapTerrain& terrain, const MapArtwork& art, const MapGeography& geography, const std::vector<int>& regions)
{
    constexpr std::array variants{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
    const auto sx = (terrain.max[0] - terrain.min[0]) / terrain.full.width;
    const auto sy = (terrain.max[1] - terrain.min[1]) / (terrain.full.height / 2);
    unsigned edge = 0;
    for (std::size_t i = 0; i < geography.shapes.size(); ++i) for (const auto& line : geography.shapes[i].ink) {
        const auto salt = 990001u + edge++ * 811u;
        std::vector<Point> path;
        for (const auto p : line.points) path.push_back(terrain.pixel(p));
        const auto plan = [&](int region, int neighbor) {
            std::vector<Piece> pieces;
            joinRelief(pieces, terrain, art.relief, regions, {}, path, variants, "bone-border", region, neighbor,
                geography.seed, salt, terrain.pixel(geography.shapes[region].label));
            if (pieces.empty()) return;
            auto& strip = terrain.bones.emplace_back(MapTerrain::BoneStrip{static_cast<std::size_t>(region), neighbor, {}});
            for (const auto& piece : pieces) {
                const auto box = footprint(piece);
                const auto frame = art.towns.frame("terrain-bone-border-" + std::to_string(piece.variant));
                strip.pieces.push_back({terrain.world({double(piece.x), double(box.y + box.h)}),
                    box.w * sx, box.h * sy, frame, frame, piece.mirror});
            }
        };
        plan(static_cast<int>(i), line.neighbor);
        if (line.neighbor >= 0) plan(line.neighbor, static_cast<int>(i));
    }
}

void relief(MapTerrain& terrain, const MapArtwork& art, const Snapshot& snapshot,
    const MapGeography& geography, const std::vector<std::vector<Point>>& outlines, const std::vector<int>& regions,
    std::span<const std::uint8_t> siteMask)
{
    const int width = terrain.full.width, height = terrain.full.height / 2;
    const auto random = [&](std::uint32_t n) { return decorationRandom(geography.seed ^ 48317u, n); };
    for (int occupied : {0, 1}) {
        std::vector<Piece> pieces;
        const auto exclusions = occupied ? std::span<const std::uint8_t>{} : siteMask;
        if (!occupied) {
            unsigned edgeIndex = 0;
            for (std::size_t i = 0; i < geography.shapes.size(); ++i) for (const auto& line : geography.shapes[i].ink) {
                const auto id = edgeIndex++;
                if (line.feature != RegionShape::Feature::ridge || line.neighbor < 0) continue;
                std::vector<Point> path;
                for (const auto p : line.points) path.push_back(terrain.pixel(p));
                joinRelief(pieces, terrain, art.relief, regions, exclusions, path, {}, "ridge-border",
                    static_cast<int>(i), line.neighbor, geography.seed, 3001u + id * 991u);
            }
        }
        for (std::size_t i = 0; i < outlines.size(); ++i) {
            const auto box = bounds(outlines[i]);
            const auto center = terrain.pixel(geography.shapes[i].label);
            const auto biome = snapshot.regions[i].biome;
            const auto terrainName = biome == 4 ? "island-basalt" : biomes[biome];
            const std::string prefix = occupied ? "terrain-hellscape-" : "terrain-" + std::string(terrainName) + "-";
            const auto family = occupied ? std::string_view("hellscape") : terrainName;
            if (biome != 5 || occupied) {
                const auto extent = biome == 1 ? .38 : biome == 4 ? .30 : .31;
                const auto rx = (box.right - box.left) * extent, ry = (box.bottom - box.top) * extent;
                const auto length = biome == 1 ? 13 : 9;
                std::vector<Point> path;
                for (int n = 0; n < length; ++n) {
                    const auto t = n / static_cast<double>(length - 1) * 2 - 1;
                    const auto phase = random(static_cast<unsigned>(i) + (biome == 1 ? 511 : biome == 4 ? 631 : 418));
                    const auto bend = biome == 1 ? std::sin(t * pi * 1.4 + phase * 2) * .24 :
                        std::sin(t * pi + phase * 3) * (biome == 4 ? .25 : .34);
                    path.push_back({center[0] + (rx > ry ? t : bend) * rx, center[1] + (rx > ry ? bend : t) * ry});
                }
                constexpr std::array scars{0, 1, 2, 3};
                constexpr std::array plains{0, 1, 2, 3, 4, 5}, forest{0, 1, 2, 3, 6, 7},
                    islands{2, 3, 4, 5, 6, 7};
                constexpr std::array mountains{0, 1, 2, 3, 4, 6, 10};
                const auto variants = occupied ? std::span<const int>(scars) : biome == 1 ? std::span<const int>(mountains) :
                    biome == 2 ? std::span<const int>(forest) : biome == 4 ? std::span<const int>(islands) : std::span<const int>(plains);
                joinRelief(pieces, terrain, art.relief, regions, exclusions, path, variants, family, static_cast<int>(i),
                    -1, geography.seed, (biome == 1 ? 130001u : biome == 4 ? 160001u : 180001u) + static_cast<unsigned>(i) * 877u);
            }
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
                const Piece piece{item.x, item.y, size, frame, random(item.salt + 79) < .5, static_cast<int>(i), family};
                if (!fitsRelief(piece, art.relief, terrain, regions, exclusions)) continue;
                pieces.push_back(piece);
                ++placed;
            }
        }
        std::ranges::stable_sort(pieces, {}, [](const Piece& p) { const auto box = footprint(p); return box.y + box.h; });
        for (const auto& p : pieces) {
            const auto box = footprint(p);
            for (int y = 0; y < box.h; ++y) for (int x = 0; x < box.w; ++x) {
                const auto dx = box.x + x, dy = box.y + y;
                const auto* source = reliefTexel(art.relief, p, box, x, y);
                if (!solidRelief(p, source, 65) || (occupied && regions[dy * width + dx] != p.region)) continue;
                auto* pixel = terrain.full.at(dx, dy + height * occupied);
                paint(pixel, mix(rgb(pixel), gradeRelief(source, p.family), source[3] / 255.));
            }
        }
    }
}

void reduceTerrain(const MapPixels& from, MapPixels& to)
{
    const auto sourceHeight = from.height / 2, destHeight = (sourceHeight + 1) / 2;
    to.width = (from.width + 1) / 2;
    to.height = destHeight * 2;
    to.rgba.resize(static_cast<std::size_t>(to.width) * to.height * 4);
    for (int layer : {0, 1})
        for (int y = 0; y < destHeight; ++y) for (int x = 0; x < to.width; ++x) {
            const auto sx = x * 2, sy = layer * sourceHeight + y * 2;
            const auto x1 = std::min(sx + 1, from.width - 1), y1 = layer * sourceHeight + std::min(y * 2 + 1, sourceHeight - 1);
            const auto* a = from.at(sx, sy);
            const auto* b = from.at(x1, sy);
            const auto* c = from.at(sx, y1);
            const auto* d = from.at(x1, y1);
            auto* p = to.at(x, y + layer * destHeight);
            for (int ch = 0; ch < 4; ++ch) p[ch] = (a[ch] + b[ch] + c[ch] + d[ch] + 2) / 4;
        }
}

void prepareWeather(MapTerrain& terrain, const std::vector<int>& regions, const std::vector<int>& seaDistance, std::uint32_t seed)
{
    constexpr int step = 8;
    const auto width = terrain.full.width, height = terrain.full.height / 2;
    const auto w = (width + step - 1) / step, h = (height + step - 1) / step;
    terrain.weatherWidth = w;
    terrain.weatherHeight = h;
    terrain.weather.resize(static_cast<std::size_t>(w) * h);
    std::vector<int> outside(terrain.weather.size()), inside(terrain.weather.size());
    for (int y = 0; y < h; ++y) for (int x = 0; x < w; ++x) {
        const auto px = (2 * x + 1) * width / (2 * w), py = (2 * y + 1) * height / (2 * h);
        const auto i = y * w + x, index = py * width + px;
        auto& cell = terrain.weather[i];
        const auto playable = regions[index] >= 0;
        outside[i] = playable ? 0 : 1024;
        inside[i] = playable ? 1024 : 0;
        cell.surface = terrain.surfaces[index];
        std::copy_n(terrain.full.at(px, py), 3, cell.colour.begin());
        cell.edge = static_cast<float>(std::min(1., std::min({x, y, w - 1 - x, h - 1 - y}) * step / 64.));
        if (cell.surface == sea) {
            const auto wx = px + terrain.origin[0], wy = py + terrain.origin[1], distance = seaDistance[index] / 3.;
            cell.water = static_cast<float>(smooth(step * .5, step * 2, distance) * .85);
            const auto ink = oceanInk(seed, wx, wy, distance);
            cell.waterIndex = ink.index;
            cell.waterStrength = ink.strength;
            cell.waterVariant = static_cast<std::uint8_t>(noise(seed ^ 32353u, wx, wy, 120) * 8);
        }
        else if (cell.surface == MapTerrain::Surface::pool)
            cell.water = .28f;
    }
    distanceField(outside, w, h);
    distanceField(inside, w, h);
    for (std::size_t i = 0; i < terrain.weather.size(); ++i) {
        auto& cell = terrain.weather[i];
        cell.distance = (outside[i] - inside[i]) * (static_cast<float>(width) / w / 3);
        cell.fog = static_cast<float>(smooth(8, 24, cell.distance)) * (cell.surface == sea ? 25.f : 110.f) / 255 * cell.edge;
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
    terrain.origin = {x0, y0};
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

    TileFrames tiles{};
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
        const auto variant = groundVariant(seed, wx, wy);
        unsigned natural{}, occupied{};
        if (terrain.surfaces[i] == sea) {
            natural = oceanInk(seed, wx, wy, seaDistance[i] / 3.).paint();
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
            const auto d = dryDistance[i] / 3.;
            const auto fringe = d < shores[b].reach * 1.25 ? shores[b].reach * (.55 + noise(seed ^ 9071u, wx, wy, 92) * .7) : 0.;
            if (d < fringe) {
                const auto& profile = profiles[b][bankStyles[b][variant]];
                const auto gradientX = std::abs(dryDistance[y * width + std::min(x + 1, width - 1)] -
                    dryDistance[y * width + std::max(x - 1, 0)]);
                const auto gradientY = std::abs(dryDistance[std::min(y + 1, height - 1) * width + x] -
                    dryDistance[std::max(y - 1, 0) * width + x]);
                const auto wet = d < 2.5 + noise(seed ^ 8317u, wx, wy, 8) * 2;
                const auto amount = 1 - d / fringe;
                natural = mix(natural, wet ? shores[b].bank : shores[b].sediment, wet ? .8 : amount * .7);
                natural = mix(natural, sample(art.banks, profile, (gradientX < gradientY ? wx : wy) * 2,
                    static_cast<int>(std::round(31 * .44 * amount))), .76 * amount);
            }
            occupied = mix(palette[6][tone], sample(art.monster, tiles[6][variant], wx, wy), .72);
        }
        paint(terrain.full.at(x, y), natural);
        paint(terrain.full.at(x, height + y), occupied);
    }
    paintRivers(terrain, geography);
    paintWetlands(terrain, geography, snapshot, regions, dryDistance);
    paintEcotones(terrain, art, snapshot, geography.seed, regions, tiles);
    paintHinterland(terrain, art, geography, snapshot, boundary, regions);
    planMapSites(terrain, art, geography, snapshot, regions);
    const auto exclusions = siteExclusions(terrain);
    relief(terrain, art, snapshot, geography, outlines, regions, exclusions);
    planBones(terrain, art, geography, regions);
    planMapRoads(terrain, geography, snapshot, regions);
    prepareWeather(terrain, regions, seaDistance, geography.seed);
    reduceTerrain(terrain.full, terrain.compact);
    for (int i = 0; i < static_cast<int>(terrain.coarse.size()); ++i)
        reduceTerrain(terrain.level(i + 1), terrain.coarse[i]);
    terrain.bakeMs = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
    return terrain;
}

}
