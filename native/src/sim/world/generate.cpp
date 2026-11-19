#include "sim/world/generate_detail.hpp"

#include "core/js_math.hpp"

#include <algorithm>
#include <charconv>
#include <limits>
#include <map>
#include <numbers>
#include <set>
#include <stdexcept>

namespace waffle::sim {
namespace {

using namespace world_generation;
namespace js = core::js;
using core::json::Value;
constexpr double aspect = 2.15;
constexpr double pi = std::numbers::pi;
constexpr double infinity = std::numeric_limits<double>::infinity();

double square(double value) { return value * value; }
double distance(Point a, Point b) { return js::hypot((a.x - b.x) * aspect, a.y - b.y); }
double lerp(double a, double b, double t) { return a + (b - a) * t; }
Point midpoint(Point a, Point b) { return {(a.x + b.x) / 2, (a.y + b.y) / 2}; }

template<class A, class T>
bool contains(const A& values, const T& value)
{
    return std::find(values.begin(), values.end(), value) != values.end();
}

std::string vertex_key(Point p, double scale)
{
    return std::to_string(static_cast<std::int64_t>(js::round(p.x * scale))) + "," +
           std::to_string(static_cast<std::int64_t>(js::round(p.y * scale)));
}

template<class T>
std::pair<T, T> edge_key(const T& a, const T& b)
{
    return a < b ? std::pair{a, b} : std::pair{b, a};
}

double segment_distance(Point p, Point a, Point b)
{
    const double dx = (b.x - a.x) * aspect, dy = b.y - a.y;
    const double lengthSquared = dx * dx + dy * dy;
    const double t = std::clamp(((p.x - a.x) * aspect * dx + (p.y - a.y) * dy) /
        (lengthSquared != 0 ? lengthSquared : 1), 0.0, 1.0);
    return distance(p, {lerp(a.x, b.x, t), lerp(a.y, b.y, t)});
}

std::vector<Point> clip(const std::vector<Point>& polygon, double a, double b, double c)
{
    std::vector<Point> result;
    result.reserve(polygon.size() + 1);
    for (std::size_t i = 0; i < polygon.size(); ++i) {
        const auto p = polygon[i], q = polygon[(i + 1) % polygon.size()];
        const double dp = a * p.x + b * p.y - c, dq = a * q.x + b * q.y - c;
        if (dp <= 1e-10) result.push_back(p);
        if ((dp < 0) != (dq < 0)) {
            const double t = dp / (dp - dq);
            result.push_back({lerp(p.x, q.x, t), lerp(p.y, q.y, t)});
        }
    }
    return result;
}

Point centroid(const std::vector<Point>& polygon)
{
    double area = 0, x = 0, y = 0;
    for (std::size_t i = 0; i < polygon.size(); ++i) {
        const auto p = polygon[i], q = polygon[(i + 1) % polygon.size()];
        const double cross = p.x * q.y - q.x * p.y;
        area += cross;
        x += (p.x + q.x) * cross;
        y += (p.y + q.y) * cross;
    }
    return {x / (3 * area), y / (3 * area)};
}

std::array<Region, regional_region_count> footprint(core::SeedRng& rng, std::array<double, 2> phases)
{
    struct Site { double x, y, weight; };
    std::array<Site, 96> sites;
    for (int i = 0; i < static_cast<int>(sites.size()); ++i) {
        sites[i] = {-.6 + (i % 12 + .5 + (core::rng_next_float(rng) - .5) * .65) * 2.2 / 12,
                    -.95 + (i / 12 + .5 + (core::rng_next_float(rng) - .5) * .65) * 2.9 / 8,
                    (core::rng_next_float(rng) - .5) * .045 * .85};
    }
    std::array<Cell, sites.size()> cells;
    std::vector<int> perimeter;
    std::map<std::pair<std::string, std::string>, int> owners;
    for (int i = 0; i < static_cast<int>(sites.size()); ++i) {
        const auto& site = sites[i];
        std::vector<Point> polygon{{-2, -2}, {3, -2}, {3, 3}, {-2, 3}};
        for (const auto& other : sites) {
            if (&other == &site) continue;
            polygon = clip(polygon, 2 * square(aspect) * (other.x - site.x), 2 * (other.y - site.y),
                           square(aspect) * (square(other.x) - square(site.x)) + square(other.y) -
                           square(site.y) + site.weight - other.weight);
        }
        auto& cell = cells[i];
        for (std::size_t j = 0; j < polygon.size(); ++j) {
            if (vertex_key(polygon[j], 1e6) != vertex_key(polygon[(j + polygon.size() - 1) % polygon.size()], 1e6))
                cell.polygon.push_back(polygon[j]);
        }
        cell.centre = centroid(cell.polygon);
        for (std::size_t j = 0; j < cell.polygon.size(); ++j) {
            const auto a = vertex_key(cell.polygon[j], 1e6);
            const auto b = vertex_key(cell.polygon[(j + 1) % cell.polygon.size()], 1e6);
            const auto [owner, inserted] = owners.emplace(edge_key(a, b), i);
            if (!inserted) {
                cell.neighbors.push_back(owner->second);
                cells[owner->second].neighbors.push_back(i);
            }
        }
        if (std::any_of(cell.polygon.begin(), cell.polygon.end(), [](Point p) {
            return p.x == -2 || p.x == 3 || p.y == -2 || p.y == 3;
        })) perimeter.push_back(i);
    }
    std::array<double, sites.size()> scores;
    for (std::size_t i = 0; i < cells.size(); ++i) {
        const double x = (cells[i].centre.x - .5) / .7, y = (cells[i].centre.y - .5) / .56;
        const double angle = js::atan2(y, x);
        const double radius = 1 + .19 * js::sin(angle * 3 + phases[0]) + .12 * js::sin(angle * 5 + phases[1]);
        scores[i] = js::hypot(x, y) / radius;
    }
    const auto start = static_cast<int>(std::min_element(scores.begin(), scores.end()) - scores.begin());
    std::array<bool, sites.size()> selected{};
    selected[start] = true;
    auto frontier = cells[start].neighbors;
    for (int count = 1; count < regional_region_count; ++count) {
        auto ranked = frontier;
        std::stable_sort(ranked.begin(), ranked.end(), [&](int a, int b) { return scores[a] < scores[b]; });
        const auto next = std::find_if(ranked.begin(), ranked.end(), [&](int candidate) {
            auto seen = selected;
            seen[candidate] = true;
            auto pending = perimeter;
            auto visited = count + 1;
            while (!pending.empty()) {
                const int index = pending.back();
                pending.pop_back();
                if (seen[index]) continue;
                seen[index] = true;
                ++visited;
                pending.insert(pending.end(), cells[index].neighbors.begin(), cells[index].neighbors.end());
            }
            return visited == static_cast<int>(cells.size());
        });
        if (next == ranked.end()) throw std::runtime_error("regional generation exhausted the footprint frontier");
        selected[*next] = true;
        std::erase(frontier, *next);
        for (const int i : cells[*next].neighbors)
            if (!selected[i] && !contains(frontier, i)) frontier.push_back(i);
    }
    std::array<Region, regional_region_count> regions;
    auto next = regions.begin();
    for (std::size_t i = 0; i < cells.size(); ++i) {
        if (!selected[i]) continue;
        next->polygon = std::move(cells[i].polygon);
        next->centre = cells[i].centre;
        ++next;
    }
    return regions;
}

struct Geometry {
    std::vector<Point> vertices;
    std::vector<Edge> edges;
};

Geometry make_edges(std::array<Region, regional_region_count>& regions)
{
    Geometry result;
    std::vector<std::string> keys;
    std::map<std::string, int> vertices;
    std::map<std::pair<int, int>, int> edges;
    for (int i = 0; i < regional_region_count; ++i) {
        auto& region = regions[i];
        for (const auto p : region.polygon) {
            auto key = vertex_key(p, 1e6);
            const auto [entry, inserted] = vertices.emplace(key, static_cast<int>(keys.size()));
            if (inserted) {
                keys.push_back(std::move(key));
                result.vertices.push_back(p);
            } else result.vertices[entry->second] = p;
            region.vertices.push_back(entry->second);
        }
        for (std::size_t j = 0; j < region.vertices.size(); ++j) {
            const int a = region.vertices[j], b = region.vertices[(j + 1) % region.vertices.size()];
            const auto [entry, inserted] = edges.emplace(edge_key(a, b), static_cast<int>(result.edges.size()));
            if (inserted) {
                if (keys[a] < keys[b]) result.edges.push_back(Edge{a, b, {}});
                else result.edges.push_back(Edge{b, a, {}});
            }
            result.edges[entry->second].regions.push_back(i);
            region.edges.push_back(entry->second);
        }
    }
    for (const auto& edge : result.edges) {
        if (edge.regions.size() != 2) continue;
        const int a = edge.regions[0], b = edge.regions[1];
        regions[a].neighbors.push_back(b);
        regions[b].neighbors.push_back(a);
    }
    return result;
}

void assign_world_sides(Geometry& geometry, const std::array<Region, regional_region_count>& regions)
{
    std::vector<RegionalWorld::Road> next(geometry.vertices.size(), {-1, -1});
    int start = -1;
    for (int i = 0; i < static_cast<int>(geometry.edges.size()); ++i) {
        const auto& edge = geometry.edges[i];
        if (edge.regions.size() != 1) continue;
        const auto& region = regions[edge.regions.front()];
        const auto j = std::find(region.edges.begin(), region.edges.end(), i) - region.edges.begin();
        const int from = region.vertices[j], to = region.vertices[(j + 1) % region.vertices.size()];
        if (start == -1) start = from;
        next[from] = {i, to};
    }
    if (start == -1) throw std::runtime_error("regional generation produced no perimeter");
    std::vector<int> perimeter, perimeterVertices;
    for (int current = start;;) {
        const auto [edge, to] = next[current];
        if (edge < 0 || perimeter.size() >= next.size())
            throw std::runtime_error("regional generation produced an open perimeter");
        perimeter.push_back(edge);
        perimeterVertices.push_back(current);
        current = to;
        if (current == start) break;
    }
    const auto size = static_cast<int>(perimeter.size());
    constexpr std::array<RegionalWorld::Road, 4> diagonals{{{-1, -1}, {1, -1}, {1, 1}, {-1, 1}}};
    std::array<int, 4> corners{};
    for (int side = 0; side < 4; ++side) {
        const auto [dx, dy] = diagonals[side];
        const auto score = [&](int i) {
            const auto p = geometry.vertices[perimeterVertices[i]];
            return p.x * aspect * dx + p.y * dy;
        };
        for (int i = 1; i < size; ++i)
            if (score(i) > score(corners[side])) corners[side] = i;
    }
    std::array<int, 5> stops{0, 0, 0, 0, size};
    int previous = 0;
    for (int i = 1; i < 4; ++i) {
        int offset = (corners[i] - corners[0] + size) % size;
        if (offset < previous) offset = size;
        previous = offset;
        stops[i] = std::max(stops[i - 1] + 1, std::min(size - (4 - i), offset));
    }
    for (int side = 0; side < 4; ++side)
        for (int i = stops[side]; i < stops[side + 1]; ++i)
            geometry.edges[perimeter[(i + corners[0]) % size]].worldSide = side;
}

void build_geography(Geometry& geometry, int firstOcean, int oceanCount, core::SeedRng& rng)
{
    auto& edges = geometry.edges;
    const auto& vertices = geometry.vertices;
    const auto onOcean = [&](int side) { return side >= 0 && (side - firstOcean + 4) % 4 < oceanCount; };
    std::vector<bool> outer(vertices.size()), sea(vertices.size()), used(edges.size());
    std::vector<int> outerOrder;
    std::vector<std::vector<RegionalWorld::Road>> connections(vertices.size());
    for (int i = 0; i < static_cast<int>(edges.size()); ++i) {
        const auto& edge = edges[i];
        connections[edge.a].emplace_back(edge.b, i);
        connections[edge.b].emplace_back(edge.a, i);
        if (edge.regions.size() != 1) continue;
        for (const int vertex : {edge.a, edge.b}) {
            if (!outer[vertex]) outerOrder.push_back(vertex);
            outer[vertex] = true;
            if (onOcean(edge.worldSide)) sea[vertex] = true;
        }
    }
    const auto shared = [&](int edge) { return edges[edge].regions.size() == 2; };
    const auto hasShared = [&](int vertex) {
        return std::any_of(connections[vertex].begin(), connections[vertex].end(),
                           [&](auto link) { return shared(link.second); });
    };
    std::vector<int> components(vertices.size(), -1);
    for (int i = 0; i < static_cast<int>(vertices.size()); ++i) {
        if (components[i] >= 0) continue;
        std::vector<int> pending{i};
        while (!pending.empty()) {
            const int current = pending.back();
            pending.pop_back();
            if (components[current] >= 0) continue;
            components[current] = i;
            for (const auto& [to, edge] : connections[current])
                if (shared(edge)) pending.push_back(to);
        }
    }
    Point riverSource{.35 + core::rng_next_float(rng) * .25, .02};
    Point riverDestination{.4 + core::rng_next_float(rng) * .3, .97};
    core::rng_next_float(rng); // Initial ridge endpoint is drawn before being replaced by land-side anchors.
    const auto rotate = [turn = (firstOcean + 2) % 4](Point p) {
        switch (turn) {
        case 1: return Point{1 - p.y, p.x};
        case 2: return Point{1 - p.x, 1 - p.y};
        case 3: return Point{p.y, 1 - p.x};
        default: return p;
        }
    };
    riverSource = rotate(riverSource);
    riverDestination = rotate(riverDestination);
    const std::array<Point, 4> sidePoints{{{.35, .02}, {.98, .35}, {.65, .98}, {.02, .65}}};
    std::vector<Point> land;
    for (int i = 0; i < 4; ++i)
        if (!onOcean(i)) land.push_back(sidePoints[i]);

    for (const auto type : {river, ridge}) {
        const auto source = type == river ? riverSource : land.front();
        const auto destination = type == river ? riverDestination : land.back();
        std::vector<int> accessible;
        for (const int vertex : outerOrder)
            if (hasShared(vertex)) accessible.push_back(vertex);
        // The browser sorts this same array twice. The destination sort
        // retains the source order for equal distances, including river ends.
        const auto near = [&](Point p) {
            std::stable_sort(accessible.begin(), accessible.end(), [&](int a, int b) {
                return distance(vertices[a], p) < distance(vertices[b], p);
            });
            return accessible.front();
        };
        if (accessible.empty()) continue;
        int start = near(source), end = near(destination);
        if (type == river) {
            double best = infinity;
            for (int a = 0; a < static_cast<int>(vertices.size()); ++a) {
                if (sea[a] || !hasShared(a)) continue;
                for (const int b : accessible) {
                    if (!sea[b] || components[a] != components[b]) continue;
                    const double score = distance(vertices[a], source) + distance(vertices[b], destination) +
                                         (outer[a] ? 0 : .15);
                    if (score < best) { best = score; start = a; end = b; }
                }
            }
            if (best == infinity) continue;
        }

        std::vector<double> scores(vertices.size(), infinity);
        std::vector<RegionalWorld::Road> previous(vertices.size(), {-1, -1});
        std::vector<bool> settled(vertices.size());
        scores[start] = 0;
        while (true) {
            int current = -1;
            for (int i = 0; i < static_cast<int>(vertices.size()); ++i) {
                if (!settled[i] && scores[i] < (current < 0 ? infinity : scores[current])) current = i;
            }
            if (current < 0 || current == end) break;
            settled[current] = true;
            for (const auto& [to, edge] : connections[current]) {
                if (settled[to] || (type == river && !shared(edge))) continue;
                const auto a = vertices[current], b = vertices[to];
                const auto deviation = segment_distance(midpoint(a, b), source, destination);
                const double forward = ((b.x - a.x) * (destination.x - source.x) * square(aspect) +
                    (b.y - a.y) * (destination.y - source.y)) / distance(source, destination);
                const double cost = distance(a, b) * (1 + deviation * 4 + (shared(edge) ? 0 : 8) +
                    (used[edge] ? 12 : 0)) + (type == river ? std::max(0.0, -forward) * 3 +
                    (sea[to] && to != end ? distance(a, b) * 5 : 0) : 0);
                const double candidate = scores[current] + cost;
                if (candidate < scores[to]) {
                    scores[to] = candidate;
                    previous[to] = {current, edge};
                }
            }
        }
        if (previous[end].first < 0) continue;
        std::vector<RegionalWorld::Road> route;
        for (int current = end; current != start;) {
            route.push_back(previous[current]);
            current = previous[current].first;
        }
        double offset = 0;
        const double phase = core::rng_next_float(rng) * pi * 2;
        for (auto it = route.rbegin(); it != route.rend(); ++it) {
            const auto [from, index] = *it;
            auto& edge = edges[index];
            used[index] = true;
            edge.feature = type;
            edge.offset = offset;
            edge.phase = phase;
            edge.direction = edge.a == from ? 1 : -1;
            offset += distance(vertices[edge.a], vertices[edge.b]);
        }
    }
}

void shape_outlines(Geometry& geometry, std::array<Region, regional_region_count>& regions, core::SeedRng& rng)
{
    for (auto& edge : geometry.edges) {
        const auto a = geometry.vertices[edge.a], b = geometry.vertices[edge.b];
        const double length = distance(a, b);
        const double dx = (b.x - a.x) * aspect, dy = b.y - a.y;
        const double phase = core::rng_next_float(rng) * pi * 2;
        double amplitude = std::min(.016, length * .1);
        for (const int region : edge.regions)
            amplitude = std::min(amplitude, distance(regions[region].centre, midpoint(a, b)) * .16);
        const int samples = std::max(4, static_cast<int>(js::ceil(length * 150)));
        const int frequency = edge.feature == river ? 2 : 5;
        for (int i = 0; i <= samples; ++i) {
            const double t = static_cast<double>(i) / samples;
            const double along = edge.offset + (edge.direction == -1 ? 1 - t : t) * length;
            const double wave = edge.feature != none ? edge.direction *
                (js::sin(along * pi * 2 * frequency + edge.phase) + .25 * js::sin(along * 83 + edge.phase))
                : js::sin(t * pi * 4.8 + phase) + .25 * js::sin(t * 43 + phase);
            const double offset = amplitude * square(js::sin(pi * t)) * wave;
            edge.points.push_back({lerp(a.x, b.x, t) - dy / length * offset / aspect,
                                   lerp(a.y, b.y, t) + dx / length * offset});
        }
    }
    for (auto& region : regions) {
        for (std::size_t i = 0; i < region.edges.size(); ++i) {
            const auto& edge = geometry.edges[region.edges[i]];
            if (edge.a == region.vertices[i])
                region.outline.insert(region.outline.end(), edge.points.begin(), edge.points.end() - 1);
            else
                region.outline.insert(region.outline.end(), edge.points.rbegin(), edge.points.rend() - 1);
        }
        region.centre = centroid(region.outline);
    }
}

void assign_physical_adjacency(RegionalWorld& world, const std::array<Region, regional_region_count>& regions)
{
    using Key = std::pair<std::string, std::string>;
    std::array<std::set<Key>, regional_region_count> polygonEdges;
    for (int i = 0; i < regional_region_count; ++i) {
        const auto& outline = regions[i].outline;
        auto previous = vertex_key(outline.back(), 1e9);
        for (const Point point : outline) {
            auto key = vertex_key(point, 1e9);
            polygonEdges[i].insert(edge_key(previous, key));
            previous = std::move(key);
        }
    }
    for (int a = 0; a < regional_region_count; ++a) {
        for (int b = a + 1; b < regional_region_count; ++b) {
            const bool shared = std::any_of(polygonEdges[a].begin(), polygonEdges[a].end(),
                                            [&](const auto& key) { return polygonEdges[b].contains(key); });
            if (!shared) continue;
            world.regions[a].neighbors.push_back(b);
            world.regions[b].neighbors.push_back(a);
        }
    }
}

void assign_components(RegionalWorld& world)
{
    std::array<bool, regional_region_count> seen{};
    for (int start = 0; start < regional_region_count; ++start) {
        if (seen[start]) continue;
        auto& component = world.biomeComponents.emplace_back();
        component.push_back(start);
        seen[start] = true;
        for (std::size_t cursor = 0; cursor < component.size(); ++cursor) {
            for (const int next : world.regions[component[cursor]].neighbors) {
                if (seen[next] || world.regions[next].biome != world.regions[start].biome) continue;
                seen[next] = true;
                component.push_back(next);
            }
        }
    }
}

double decoration_random(std::uint32_t seed, std::uint32_t index)
{
    auto value = (seed ^ index) * 1597334677u;
    value = (value ^ (value >> 16)) * 2246822519u;
    return (value ^ (value >> 13)) / 0x1p32;
}

}

std::optional<std::uint32_t> generated_regional_seed(std::string_view definitionId)
{
    constexpr std::string_view prefix = "regional-v2:";
    if (!definitionId.starts_with(prefix)) return {};
    const auto id = definitionId.substr(prefix.size());
    if (id.empty() || (id.size() > 1 && id.front() == '0')) return {};
    std::uint32_t seed{};
    const auto end = id.data() + id.size();
    const auto parsed = std::from_chars(id.data(), end, seed);
    if (parsed.ec != std::errc{} || parsed.ptr != end) return {};
    return seed;
}

RegionalWorld generate_regional_world(std::uint32_t seed, RegionalOutlines* outlines)
{
    // The definition generator has its own streams. Only the shared-edge
    // outlines and centroids feed gameplay; island contours and surroundings
    // are presentation data and do not affect the definition.
    auto rng = core::create_rng(seed);
    auto oceanRng = core::create_rng(js::to_int32(seed ^ 0x537a91u));
    const int firstOcean = static_cast<int>(core::rng_next_int(oceanRng, 0, 3));
    const int oceanCount = static_cast<int>(core::rng_next_int(oceanRng, 1, 2));
    const std::array phases{core::rng_next_float(oceanRng) * pi * 2, core::rng_next_float(oceanRng) * pi * 2};
    auto regions = footprint(rng, phases);
    auto geometry = make_edges(regions);
    assign_world_sides(geometry, regions);
    build_geography(geometry, firstOcean, oceanCount, rng);
    assign_biomes(regions, geometry.edges, rng, seed);
    shape_outlines(geometry, regions, rng);

    RegionalWorld world;
    world.definitionId = "regional-v2:" + std::to_string(seed);
    constexpr std::array biomes{"plains", "forest", "islands", "swamp", "mountains"};
    constexpr std::array colours{"red", "green", "blue", "black", "black", "red"};
    for (int i = 0; i < regional_region_count; ++i) {
        if (outlines) {
            auto& outline = (*outlines)[i];
            outline.clear();
            outline.reserve(regions[i].outline.size());
            for (const auto point : regions[i].outline) outline.push_back({point.x, point.y});
        }
        const Biome assigned = regions[i].biome;
        const auto hasFeature = [&](Feature feature) {
            return std::any_of(regions[i].edges.begin(), regions[i].edges.end(),
                               [&](int id) { return geometry.edges[id].feature == feature; });
        };
        if (assigned == monster)
            regions[i].biome = hasFeature(ridge) ? mountains : hasFeature(river) ? swamp : plains;
        world.regions[i] = {std::string(i < 9 ? "R0" : "R") + std::to_string(i + 1), {},
                            biomes[regions[i].biome], colours[assigned], {},
                            {regions[i].centre.x, regions[i].centre.y}};
    }
    auto names = region_names(regions);
    for (int i = 0; i < regional_region_count; ++i) world.regions[i].name = std::move(names[i]);
    assign_physical_adjacency(world, regions);
    assign_components(world);

    std::vector<std::pair<double, RegionalWorld::Road>> ranked;
    for (const auto& edge : geometry.edges) {
        if (edge.regions.size() != 2 || regions[edge.regions[0]].neighbors.size() <= 1) continue;
        const double rank = decoration_random(seed, static_cast<std::uint32_t>(ranked.size()) + 741);
        ranked.push_back({rank, {edge.regions[0], edge.regions[1]}});
    }
    std::stable_sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
    for (std::size_t i = 0; i < std::min<std::size_t>(9, ranked.size()); ++i)
        world.openingRoads.push_back(ranked[i].second);
    return world;
}

core::json::Value RegionalWorld::topology_json() const
{
    const auto ids = [&](const std::vector<int>& ordinals) {
        Value::Array values;
        for (const int ordinal : ordinals) values.emplace_back(regions[ordinal].id);
        return Value(std::move(values));
    };
    std::array<bool, regional_region_count> seen{};
    std::vector<int> reachable{0};
    seen[0] = true;
    for (std::size_t i = 0; i < reachable.size(); ++i) {
        for (const auto next : regions[reachable[i]].neighbors) {
            if (seen[next]) continue;
            seen[next] = true;
            reachable.push_back(next);
        }
    }
    const bool disconnected = reachable.size() != regions.size();
    Value::Array rows, components;
    for (const auto& region : regions) {
        rows.emplace_back(Value::Object{{"id", Value(region.id)}, {"name", Value(region.name)},
            {"neutralSettlementName", Value(region.name + " Market")}, {"biome", Value(region.biome)},
            {"neighbors", ids(region.neighbors)}});
        if (disconnected) rows.back().set("labelPoint",
            Value(Value::Object{{"x", Value(region.labelPoint[0])}, {"y", Value(region.labelPoint[1])}}));
    }
    for (const auto& component : biomeComponents) components.push_back(ids(component));
    return Value(Value::Object{{"formatVersion", Value(1.0)}, {"definitionId", Value(definitionId)},
        {"generatorRevision", Value(2.0)}, {"regions", Value(std::move(rows))},
        {"biomeComponents", Value(std::move(components))}});
}

}
