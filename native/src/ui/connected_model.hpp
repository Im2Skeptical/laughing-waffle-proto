#pragma once

#include "crest_model.hpp"

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
    enum class Feature { frontier, exterior, river, ridge };
    struct InkLine {
        Feature feature;
        std::vector<Point> points;
        int neighbor{-1}, worldSide{-1};
    };
    Point label{};
    std::vector<Point> outline;
    std::vector<InkLine> ink;
};

struct MapGeography {
    std::uint32_t seed{};
    Point min{}, max{};
    std::array<bool, 4> oceanSides{};
    std::vector<RegionShape> shapes;
};

struct Card {
    std::string id, name, rule, mode, quality, tags;
    double charge{}, workerCapacity{};
    std::optional<double> stock;
    bool locked{};
};

enum class Holder { player, crown, neutral, monster };
enum class CrownRank { none, province, capital };

struct Region {
    std::string id, name, settlement;
    Holder holder{Holder::neutral};
    CrownRank crown{CrownRank::none};
    std::uint8_t biome{};
    double population{}, food{}, currency{}, housing{};
    double loyalSharePercent{}, holdingForce{}, requiredForce{};
    std::array<Card, 5> cards;
    bool hasSite{}, detailed{}, ruin{}, occupied{};
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
    CrestAtlas crests;
    double crestModelMs{};
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
