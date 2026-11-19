#include "sim/world/generate_detail.hpp"

#include "core/js_math.hpp"

#include <algorithm>
#include <limits>
#include <map>
#include <numbers>
#include <tuple>

namespace waffle::sim::world_generation {
namespace {

namespace js = core::js;
constexpr double pi = std::numbers::pi;
constexpr std::array adjectives{"Eastern", "Southeastern", "Southern", "Southwestern",
                                "Western", "Northwestern", "Northern", "Northeastern", "Central"};
constexpr std::array biomeNames{"Plains", "Forest", "Islands", "Swamp", "Mountains"};

std::vector<int> minimum_cost_slots(const std::vector<std::vector<double>>& costs)
{
    const auto rows = static_cast<int>(costs.size()), columns = static_cast<int>(costs.front().size());
    std::vector<double> rowCost(rows + 1), columnCost(columns + 1);
    std::vector<int> matched(columns + 1), previous(columns + 1);
    for (int row = 1; row <= rows; ++row) {
        matched[0] = row;
        std::vector<double> distance(columns + 1, std::numeric_limits<double>::infinity());
        std::vector<bool> used(columns + 1);
        int column = 0;
        do {
            used[column] = true;
            const int currentRow = matched[column];
            double delta = std::numeric_limits<double>::infinity();
            int next = 0;
            for (int candidate = 1; candidate <= columns; ++candidate) {
                if (used[candidate]) continue;
                const double cost = costs[currentRow - 1][candidate - 1] - rowCost[currentRow] - columnCost[candidate];
                if (cost < distance[candidate]) {
                    distance[candidate] = cost;
                    previous[candidate] = column;
                }
                if (distance[candidate] < delta) { delta = distance[candidate]; next = candidate; }
            }
            for (int candidate = 0; candidate <= columns; ++candidate) {
                if (used[candidate]) {
                    rowCost[matched[candidate]] += delta;
                    columnCost[candidate] -= delta;
                } else distance[candidate] -= delta;
            }
            column = next;
        } while (matched[column] != 0);
        do {
            const int prior = previous[column];
            matched[column] = matched[prior];
            column = prior;
        } while (column != 0);
    }
    std::vector<int> result(rows);
    for (int column = 1; column <= columns; ++column)
        if (matched[column]) result[matched[column] - 1] = column - 1;
    return result;
}

std::vector<int> patch_directions(const std::vector<Point>& points)
{
    if (points.size() == 1) {
        const double x = points.front().x - .5, y = points.front().y - .5;
        if (js::hypot(x, y) < .17) return {8};
        return {(static_cast<int>(js::round(js::atan2(y, x) / (pi / 4))) + 8) % 8};
    }
    auto lo = points.front(), hi = points.front();
    for (const auto p : points) {
        lo = {std::min(lo.x, p.x), std::min(lo.y, p.y)};
        hi = {std::max(hi.x, p.x), std::max(hi.y, p.y)};
    }
    const double span = std::max(hi.x - lo.x, hi.y - lo.y);
    std::array<Point, 9> anchors{};
    for (int i = 0; i < 8; ++i) anchors[i] = {js::cos(i * pi / 4), js::sin(i * pi / 4)};
    const auto slots = ((points.size() + 7) / 8) * anchors.size();
    std::vector<std::vector<double>> costs;
    for (const auto point : points) {
        const double globalX = point.x * 2 - 1, globalY = point.y * 2 - 1;
        const double localX = span > 0 ? (point.x * 2 - lo.x - hi.x) / span : globalX;
        const double localY = span > 0 ? (point.y * 2 - lo.y - hi.y) / span : globalY;
        const double x = .75 * localX + .25 * globalX, y = .75 * localY + .25 * globalY;
        auto& row = costs.emplace_back();
        for (std::size_t slot = 0; slot < slots; ++slot) {
            const auto direction = slot % anchors.size();
            const auto anchor = anchors[direction];
            const double dx = x - anchor.x, dy = y - anchor.y;
            const int penalty = direction == 8 && js::hypot(localX, localY) > .5 ? 100 : 0;
            row.push_back(dx * dx + dy * dy + static_cast<double>(slot / anchors.size()) * 6 + penalty);
        }
    }
    auto result = minimum_cost_slots(costs);
    for (int& slot : result) slot %= static_cast<int>(anchors.size());
    return result;
}

}

std::array<std::string, regional_region_count> region_names(
    const std::array<Region, regional_region_count>& regions)
{
    std::array<bool, regional_region_count> visited{};
    std::map<std::string, std::vector<int>> byBase;
    for (int root = 0; root < regional_region_count; ++root) {
        if (visited[root]) continue;
        std::vector<int> members{root};
        visited[root] = true;
        for (std::size_t cursor = 0; cursor < members.size(); ++cursor) {
            for (const int neighbor : regions[members[cursor]].neighbors) {
                if (visited[neighbor] || regions[neighbor].biome != regions[root].biome) continue;
                visited[neighbor] = true;
                members.push_back(neighbor);
            }
        }
        std::sort(members.begin(), members.end());
        std::vector<Point> points;
        for (const int member : members) points.push_back(regions[member].centre);
        const auto directions = patch_directions(points);
        for (std::size_t i = 0; i < members.size(); ++i)
            byBase[std::string(adjectives[directions[i]]) + " " + biomeNames[regions[root].biome]].push_back(members[i]);
    }
    std::array<std::string, regional_region_count> names;
    for (auto& [base, members] : byBase) {
        std::sort(members.begin(), members.end(), [&](int a, int b) {
            const auto p = regions[a].centre, q = regions[b].centre;
            return std::tie(p.y, p.x, a) < std::tie(q.y, q.x, b);
        });
        for (std::size_t i = 0; i < members.size(); ++i) {
            names[members[i]] = base;
            // A regional-v2 map has twenty regions, so suffixes never exceed T.
            if (members.size() > 1) names[members[i]] += std::string(" ") + static_cast<char>('A' + i);
        }
    }
    return names;
}

}
