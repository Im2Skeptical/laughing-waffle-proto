#include "connected_map_art.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <queue>
#include <set>

namespace waffle::connected {
namespace {

using Surface = MapTerrain::Surface;
constexpr int step = 4;

struct RouteGrid {
    const MapTerrain& terrain;
    const std::vector<int>& regions;
    std::vector<float> cost;
    int columns, rows;

    RouteGrid(const MapTerrain& terrain, const Snapshot& snapshot, const std::vector<int>& regions)
        : terrain(terrain), regions(regions), columns((terrain.full.width + step - 1) / step),
          rows((terrain.full.height / 2 + step - 1) / step)
    {
        cost.reserve(static_cast<std::size_t>(columns) * rows);
        for (int y = 0; y < rows; ++y) for (int x = 0; x < columns; ++x) {
            const Point p{double(x * step), double(y * step)};
            const auto index = regions[y * step * terrain.full.width + x * step];
            const auto surface = terrain.surfaceAt(p);
            auto value = 0.f;
            if (index >= 0 && surface != Surface::sea && surface != Surface::pool) {
                constexpr std::array weights{1.f, 2.8f, 1.6f, 1.f, 1.f, 2.1f, 1.f};
                value = surface == Surface::river ? 14.f : weights[snapshot.regions[index].biome];
            }
            cost.push_back(value);
        }
    }

    Point point(int index) const { return {double(index % columns * step), double(index / columns * step)}; }

    int nearest(Point at) const
    {
        const auto x = static_cast<int>(at[0] / step), y = static_cast<int>(at[1] / step);
        auto best = std::numeric_limits<double>::infinity();
        int result = -1;
        for (int dy = -6; dy <= 6; ++dy) for (int dx = -6; dx <= 6; ++dx) {
            const int col = x + dx, row = y + dy;
            if (col < 0 || row < 0 || col >= columns || row >= rows) continue;
            const auto index = row * columns + col;
            if (cost[index] <= 0.f) continue;
            const auto p = point(index);
            const auto d = std::hypot(at[0] - p[0], at[1] - p[1]);
            if (d < best) { best = d; result = index; }
        }
        return result;
    }

    bool playable(Point p, bool ferry) const
    {
        const auto surface = terrain.surfaceAt(p);
        if (surface == Surface::sea || surface == Surface::pool) return ferry;
        const auto index = static_cast<int>(p[1]) * terrain.full.width + static_cast<int>(p[0]);
        return regions[index] >= 0;
    }

    std::vector<Point> search(int from, int to, bool ferry) const
    {
        if (from < 0 || to < 0) return {};
        struct Entry { float score; int cell; };
        const auto compare = [](Entry a, Entry b) {
            return a.score == b.score ? a.cell > b.cell : a.score > b.score;
        };
        std::priority_queue<Entry, std::vector<Entry>, decltype(compare)> queue(compare);
        std::vector<float> distance(cost.size(), std::numeric_limits<float>::infinity());
        std::vector<int> previous(cost.size(), -1);
        std::vector<bool> closed(cost.size());
        const auto goal = point(to);
        const auto estimate = [&](Point p) { return static_cast<float>(std::hypot(p[0] - goal[0], p[1] - goal[1]) / step); };
        distance[from] = 0;
        queue.push({estimate(point(from)), from});
        while (!queue.empty()) {
            const auto current = queue.top().cell;
            queue.pop();
            if (closed[current]) continue;
            if (current == to) {
                std::vector<Point> path;
                for (int at = to; at != -1; at = previous[at]) path.push_back(point(at));
                std::ranges::reverse(path);
                return path;
            }
            closed[current] = true;
            const auto base = point(current);
            for (int dy = -1; dy <= 1; ++dy) for (int dx = -1; dx <= 1; ++dx) {
                const int col = current % columns + dx, row = current / columns + dy;
                if ((!dx && !dy) || col < 0 || row < 0 || col >= columns || row >= rows) continue;
                const int next = row * columns + col;
                const auto p = point(next);
                if (closed[next] || (!cost[next] && (!ferry || !playable(p, true)))) continue;
                if (!playable({base[0] + dx * step * .5, base[1] + dy * step * .5}, ferry)) continue;
                if (dx && dy && (!playable({p[0], base[1]}, ferry) || !playable({base[0], p[1]}, ferry))) continue;
                const auto travel = (std::max(1.f, cost[current] ? cost[current] : 20.f) +
                    std::max(1.f, cost[next] ? cost[next] : 20.f)) * .5f;
                const auto alt = distance[current] + travel * (dx && dy ? 1.41421356f : 1.f);
                if (alt >= distance[next]) continue;
                distance[next] = alt;
                previous[next] = current;
                queue.push({alt + estimate(p), next});
            }
        }
        return {};
    }
};

Point mix(Point a, Point b, double t) { return {std::lerp(a[0], b[0], t), std::lerp(a[1], b[1], t)}; }

std::vector<MapTerrain::RoadSample> samples(const RouteGrid& grid, const std::vector<Point>& path)
{
    std::vector<MapTerrain::RoadSample> result{{grid.terrain.world(path.front()), Surface::ground}};
    for (std::size_t i = 1; i < path.size(); ++i) {
        const auto a = path[i - 1], b = path[i];
        const auto surface = grid.terrain.surfaceAt(mix(a, b, .5));
        // Simplify collinear dry runs but keep samples at every crossing.
        if (result.size() > 1 && surface != Surface::river && surface == result.back().surface) {
            const auto back = grid.terrain.pixel(result[result.size() - 2].at);
            const auto dot = (a[0] - back[0]) * (b[1] - a[1]) - (a[1] - back[1]) * (b[0] - a[0]);
            if (std::abs(dot) < .1 && (surface != Surface::sea || std::hypot(b[0] - back[0], b[1] - back[1]) < 14)) {
                result.back().at = grid.terrain.world(b);
                continue;
            }
        }
        result.push_back({grid.terrain.world(b), surface});
    }
    return result;
}

}

void planMapRoads(MapTerrain& terrain, const MapGeography& geography, const Snapshot& snapshot,
    const std::vector<int>& regions)
{
    const RouteGrid grid(terrain, snapshot, regions);
    std::set<MapTerrain::Road> edges;
    for (auto [a, b] : snapshot.roads) edges.emplace(std::min(a, b), std::max(a, b));
    for (std::size_t i = 0; i < geography.shapes.size(); ++i)
        for (const auto& edge : geography.shapes[i].ink)
            if (edge.neighbor >= 0) {
                const auto next = static_cast<std::size_t>(edge.neighbor);
                edges.emplace(std::min(i, next), std::max(i, next));
            }
    std::vector<int> starts;
    for (const auto& site : terrain.sites) starts.push_back(grid.nearest(terrain.pixel(site.entrance)));
    for (const auto& [a, b] : edges) {
        auto path = grid.search(starts[a], starts[b], false);
        if (path.empty()) path = grid.search(starts[a], starts[b], true);
        if (path.empty()) continue;
        path.insert(path.begin(), terrain.pixel(terrain.sites[a].entrance));
        path.push_back(terrain.pixel(terrain.sites[b].entrance));
        terrain.roads.emplace(MapTerrain::Road{a, b}, samples(grid, path));
    }
}

}
