#include "sim/world/generate_detail.hpp"

#include "core/js_math.hpp"

#include <algorithm>
#include <bit>
#include <cstdlib>
#include <map>
#include <numeric>
#include <optional>
#include <stdexcept>
#include <unordered_set>

namespace waffle::sim::world_generation {
namespace {

constexpr auto count = regional_region_count;
using Mask = std::uint32_t;
using Neighbors = std::array<Mask, count>;
using Assignment = std::array<int, count>;
using Quotas = std::array<int, biome_count>;

Mask lowest(Mask mask) { return mask & (0u - mask); }

int take_component(Mask& mask, const Neighbors& neighbors)
{
    Mask frontier = lowest(mask);
    mask ^= frontier;
    int size = 0;
    while (frontier) {
        const Mask bit = lowest(frontier);
        frontier ^= bit;
        ++size;
        const Mask next = neighbors[std::countr_zero(bit)] & mask;
        frontier |= next;
        mask ^= next;
    }
    return size;
}

// Preserve subset discovery order: the fallback returns the first partition.
class ConnectedPartition {
public:
    ConnectedPartition(const Neighbors& neighbors, const Quotas& quotas)
        : neighbors_(neighbors), quotas_(quotas)
    {
        std::iota(order_.begin(), order_.end(), 0);
        std::stable_sort(order_.begin(), order_.end(), [&](int a, int b) { return quotas_[a] > quotas_[b]; });
    }

    std::optional<Assignment> find()
    {
        return search((Mask{1} << count) - 1, 0) ? std::optional{assignment_} : std::nullopt;
    }

private:
    bool search(Mask available, int depth)
    {
        if (depth == biome_count) return available == 0;
        const Mask key = (available << 3) | static_cast<Mask>(depth);
        if (failed_.contains(key)) return false;
        Mask possible = 1;
        for (int i = depth; i < biome_count; ++i) possible |= possible << quotas_[order_[i]];
        int parts = 0;
        for (Mask remaining = available; remaining;) {
            const int part = take_component(remaining, neighbors_);
            if (++parts > biome_count - depth || !(possible & (Mask{1} << part))) {
                failed_.insert(key);
                return false;
            }
        }
        std::vector<Mask> layer;
        for (Mask mask = available; mask; mask &= mask - 1) layer.push_back(lowest(mask));
        const int label = order_[depth];
        for (int size = 1; size < quotas_[label]; ++size) {
            std::vector<Mask> next;
            std::unordered_set<Mask> seen;
            for (const Mask group : layer) {
                Mask fringe = 0;
                for (Mask mask = group; mask; mask &= mask - 1)
                    fringe |= neighbors_[std::countr_zero(lowest(mask))];
                for (Mask mask = fringe & available & ~group; mask; mask &= mask - 1) {
                    const Mask candidate = group | lowest(mask);
                    if (seen.insert(candidate).second) next.push_back(candidate);
                }
            }
            layer = std::move(next);
        }
        for (const Mask group : layer) {
            if (!search(available ^ group, depth + 1)) continue;
            for (Mask mask = group; mask; mask &= mask - 1)
                assignment_[std::countr_zero(lowest(mask))] = label;
            return true;
        }
        failed_.insert(key);
        return false;
    }

    const Neighbors& neighbors_;
    const Quotas& quotas_;
    std::array<int, biome_count> order_{};
    Assignment assignment_{};
    std::unordered_set<Mask> failed_;
};

template<class T, std::size_t N>
void shuffle(std::array<T, N>& values, core::SeedRng& rng)
{
    for (int i = static_cast<int>(N) - 1; i > 0; --i) {
        const auto j = static_cast<int>(core::rng_next_int(rng, 0, i));
        std::swap(values[i], values[j]);
    }
}

struct Result { int matching{}, groups{}; double fit{}; };
struct Candidate { Assignment assignment; Result result; };

}

void assign_biomes(std::array<Region, count>& regions, const std::vector<Edge>& edges,
                   core::SeedRng& rng, std::uint32_t seed)
{
    std::array natural{plains, forest, islands, swamp, mountains};
    shuffle(natural, rng);
    const std::array names{natural[0], natural[1], natural[2], natural[3], natural[4], monster};
    Quotas quotas{6, 5, 4, 3, 2, 2};
    int donors = 0;
    for (int i = 0; i < biome_count - 1 && donors < 2; ++i) {
        if (names[i] == islands) continue;
        --quotas[i];
        ++donors;
    }

    std::vector<RegionalWorld::Road> shared;
    Neighbors neighbors{};
    std::array<std::array<double, biome_count>, count> affinity{};
    for (const auto& edge : edges) {
        if (edge.regions.size() != 2) continue;
        const int a = edge.regions[0], b = edge.regions[1];
        shared.emplace_back(a, b);
        neighbors[a] |= Mask{1} << b;
        neighbors[b] |= Mask{1} << a;
    }
    for (int i = 0; i < count; ++i) {
        const auto has = [&](auto test) {
            return std::any_of(regions[i].edges.begin(), regions[i].edges.end(),
                               [&](int id) { return test(edges[id]); });
        };
        for (int j = 0; j < biome_count; ++j) {
            switch (names[j]) {
            case islands: affinity[i][j] = has([](const Edge& edge) { return edge.regions.size() == 1; }) ? .85 : -.35; break;
            case swamp: affinity[i][j] = has([](const Edge& edge) { return edge.feature == river; }) ? .65 : 0; break;
            case mountains: affinity[i][j] = has([](const Edge& edge) { return edge.feature == ridge; }) ? .85 : -.1; break;
            default: break;
            }
        }
    }
    const auto evaluate = [&](const Assignment& assignment) {
        Result result;
        std::array<Mask, biome_count> masks{};
        for (int i = 0; i < count; ++i) {
            masks[assignment[i]] |= Mask{1} << i;
            result.fit += affinity[i][assignment[i]];
        }
        for (const auto& [a, b] : shared) result.matching += assignment[a] == assignment[b];
        for (Mask mask : masks)
            while (mask) { take_component(mask, neighbors); ++result.groups; }
        return result;
    };

    std::map<int, Candidate> pool;
    std::optional<Candidate> minimum, maximum;
    const auto remember = [&](const Assignment& assignment, const Result& result) {
        const Candidate candidate{assignment, result};
        const auto old = pool.find(result.matching);
        if (old == pool.end() || result.groups < old->second.result.groups ||
            (result.groups == old->second.result.groups && result.fit > old->second.result.fit))
            pool.insert_or_assign(result.matching, candidate);
        if (!minimum || result.matching < minimum->result.matching ||
            (result.matching == minimum->result.matching && result.fit > minimum->result.fit)) minimum = candidate;
        if (result.groups == biome_count && (!maximum || result.matching > maximum->result.matching ||
            (result.matching == maximum->result.matching && result.fit > maximum->result.fit))) maximum = candidate;
    };
    auto clusterRng = core::create_rng(core::js::to_int32(seed ^ 0x62a81fu));
    Assignment initial{};
    auto next = initial.begin();
    for (int label = 0; label < biome_count; ++label) next = std::fill_n(next, quotas[label], label);
    for (const bool spread : {true, false}) {
        const int steps = spread ? 2200 : 3600;
        const auto score = [spread](Result r) { return spread ? -r.matching : r.matching - (r.groups - biome_count) * 8; };
        for (int restart = 0; restart < (spread ? 6 : 16); ++restart) {
            auto assignment = initial;
            shuffle(assignment, clusterRng);
            auto current = evaluate(assignment);
            remember(assignment, current);
            for (int step = 0; step < steps; ++step) {
                const auto a = static_cast<int>(core::rng_next_int(clusterRng, 0, count - 1));
                const auto b = static_cast<int>(core::rng_next_int(clusterRng, 0, count - 1));
                if (assignment[a] == assignment[b]) continue;
                std::swap(assignment[a], assignment[b]);
                const auto result = evaluate(assignment);
                const int delta = score(result) - score(current);
                const double progress = 1 - static_cast<double>(step) / steps;
                const double temperature = (spread ? 2.3 : 3.5) * (progress * progress) + .025;
                remember(assignment, result);
                if (delta >= 0 || core::rng_next_float(clusterRng) < core::js::exp(delta / temperature))
                    current = result;
                else std::swap(assignment[a], assignment[b]);
            }
        }
    }
    if (!maximum) {
        const auto connected = ConnectedPartition(neighbors, quotas).find();
        if (!connected) throw std::runtime_error("regional footprint cannot fit connected biome quotas");
        remember(*connected, evaluate(*connected));
    }
    const int target = static_cast<int>(core::js::round(minimum->result.matching +
        (maximum->result.matching - minimum->result.matching) * .5));
    // Matching keys are ascending, so equal target distances prefer fewer matches.
    auto chosen = pool.lower_bound(minimum->result.matching);
    for (auto entry = chosen; entry != pool.end() && entry->first <= maximum->result.matching; ++entry)
        if (std::abs(entry->first - target) < std::abs(chosen->first - target)) chosen = entry;
    for (int i = 0; i < count; ++i) regions[i].biome = names[chosen->second.assignment[i]];
}

}
