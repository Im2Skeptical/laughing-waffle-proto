#pragma once

#include "sim/state/runtime_state.hpp"

namespace waffle::timegraph {

struct PopulationSeries {
    double population{}, freeWorkers{};
};

struct ClassSeries {
    PopulationSeries workers;
    double faith{}, happiness{50};
};

// Region ordinal is the world-region index, including regions without a site.
struct SiteSummary {
    double population{}, food{}, currency{}, housing{};
    double loyalSharePercent{}, unrestYears{}, holdingForce{}, requiredForce{};
    std::array<ClassSeries, 2> residency;
};

struct SummaryHeader {
    double second{}, year{};
    double population{}, food{}, currency{}, housing{};
    double chaosPower{}, chaosRawPressure{}, chaosResistance{}, monsterCount{}, prestige{};
    std::array<PopulationSeries, 2> residency;
    double lossSecond{-1}, lossYear{}, currentVassalResolutionSecond{-1}, latestVassalEndSecond{};
    sim::runtime::VassalId currentVassal;
    std::optional<sim::browser::RunEndReason> terminal;
};

static_assert(sizeof(SiteSummary) == 128);

// Both class arrays use villager then stranger. Repeated civilization series
// on local plots come from the header. Marker ID is local to this generation.
SummaryHeader summarize(const sim::RuntimeState& state, std::span<SiteSummary> regions);

}
