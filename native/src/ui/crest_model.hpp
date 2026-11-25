#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace waffle::sim { struct RuntimeState; }

namespace waffle::connected {

enum class CrestControl { unheld, supported, occupied, contested, unrest };
enum class StockException { unused, unhosted, missing };

struct StockBadge {
    std::string trait;
    StockException issue;
};

struct MonsterReading {
    double strength{};
    std::optional<std::size_t> target;
    std::optional<double> defense;
    std::optional<double> repelGain;
    double repelSecond{};
    bool willBeRepelled{};
};

struct CrestReading {
    std::array<double, 3> allegiance{}; // Free, Crown, Unaffiliated
    double workers{}, assigned{}, prestige{}, force{}, warriors{}, received{};
    double minimumShare{}, zeroForceShare{}, minimumLoyal{};
    std::optional<double> requiredForce, unrestYears;
    double unrestChaos{};
    CrestControl control{CrestControl::unheld};
    bool town{}, held{}, income{}, crown{};
    std::optional<MonsterReading> monster;
    std::vector<StockBadge> stock;
};

struct TransferReading {
    enum class Resource { stock, food, population };
    std::size_t source{}, destination{};
    double second{}, amount{};
    Resource resource{};
    std::string trait;
    bool require{};
};

struct CrestAtlas {
    std::vector<CrestReading> regions;
    std::vector<TransferReading> transfers;
};

CrestAtlas readCrests(const sim::RuntimeState& state);

}
