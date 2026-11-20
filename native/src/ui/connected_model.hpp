#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace waffle::connected {

using Second = std::uint64_t;
using Point = std::array<double, 2>;

struct RegionShape {
    Point label{};
    std::vector<Point> outline;
};

struct Card {
    std::string id, name, rule, mode, quality, tags;
    double charge{}, workerCapacity{};
    std::optional<double> stock;
    bool locked{};
};

enum class Holder { player, crown, neutral, monster };

struct Region {
    std::string id, name, settlement;
    Holder holder{Holder::neutral};
    std::uint8_t biome{};
    double population{}, food{}, currency{}, housing{};
    double loyalSharePercent{}, holdingForce{}, requiredForce{};
    std::array<Card, 5> cards;
    bool hasSite{}, detailed{};
};

enum class Decision { chooseVassal, commission, enterShop, specialty, reorder, advance };

struct Choice {
    Decision kind{};
    std::string id, label;
};

struct Snapshot {
    Second second{};
    double year{}, prestige{};
    bool terminal{};
    std::string capital, vassalRegion, shop;
    std::optional<Second> shopSeconds;
    std::vector<Choice> choices;
    std::vector<Region> regions;
    std::vector<std::pair<std::size_t, std::size_t>> roads;
};

struct Selection {
    std::string region;
    std::optional<std::size_t> card;
    std::optional<std::size_t> destination;

    const Region* selected(const Snapshot* snapshot) const;
    void select(std::string id);
    bool inspect(const Snapshot* snapshot, std::size_t slot);
    bool stage(const Snapshot* snapshot, std::size_t slot);
};

}
