#pragma once

#include "connected_model.hpp"

namespace waffle::sim { struct RuntimeState; }

namespace waffle::connected {

enum class SettlementTab { overview, moon, structures, practices };

struct Reading {
    std::string key, label, value, detail;
    bool warning{};
    std::optional<double> fill;
    std::string sources;
};

struct Census {
    double children{}, adults{}, elders{}, scholars{}, warriors{};
    std::vector<std::pair<double, double>> elderAges;
    std::string mood, faith, faithTrend;
    double fullMeals{}, missedMeals{}, faithStreak{};
    bool collapse{};
};

struct MealReading {
    Second second{};
    double demand{}, consumed{}, ratio{}, villagerRatio{}, strangerRatio{};
};

struct GarrisonChoice {
    std::string id, name, reason;
    std::size_t region{};
    double defense{};
    bool current{};
};

struct GarrisonReading {
    std::string supported;
    double defense{}, force{}, warriors{};
    std::vector<GarrisonChoice> choices;
};

struct SettlementOverview {
    std::array<Census, 2> census;
    std::optional<MealReading> meal;
    std::string housingMoodCap;
    std::vector<Reading> economy, control;
    std::optional<GarrisonReading> garrison;
};

struct StorefrontReading {
    std::string identity;
    double defense{};
    std::vector<Reading> offers;
};

struct MoonReading {
    double index{};
    Second started{};
    bool current{};
    std::vector<Reading> phases;
};

struct Building {
    std::size_t origin{}, width{};
    std::string id, name, rule, status;
    bool warning{};
    std::vector<Reading> details;
};

struct StructureReading {
    std::size_t capacity{}, occupied{};
    std::vector<Building> buildings;
};

struct PracticeReading {
    double workers{}, effective{}, capacity{}, charge{}, threshold{};
    double chargeGain{}, outputMultiplier{1};
    std::optional<double> stock, stockCapacity;
    bool scholar{}, chargeMode{};
    std::string category, schedule, trigger, discharge, outputTraits;
    std::vector<Reading> inputs, providers, activity;
    Reading status;
};

struct SettlementReading {
    std::optional<SettlementOverview> overview;
    std::optional<StorefrontReading> storefront;
    std::optional<MoonReading> moon;
    std::optional<StructureReading> structures;
    std::optional<PracticeReading> practice;
};

SettlementReading readSettlement(const sim::RuntimeState& state, const Region& region,
    SettlementTab tab, std::optional<std::size_t> slot = {}, std::string_view stockDetail = {});

}
