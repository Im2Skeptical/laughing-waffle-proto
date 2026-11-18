#pragma once

#include "sim/state/rows.generated.hpp"

namespace waffle::sim::settlement {

enum class Residency { villager, stranger };

struct PopulationBin {
    Residency residency{};
    runtime::JointCohort key;
    std::uint64_t count{};
};

struct Cohort {
    double children{}, adults{};
    std::vector<runtime::ElderCohort> elders;
};

struct CohortScratch {
    std::vector<std::pair<std::uint64_t, double>> ages;
    void reserve(std::size_t agesPerClass);
};

// Reuse one workspace across sites. Reserve from the maximum input and output
// bin count of a stage before entering its steady-state loop.
struct LedgerScratch {
    struct Rank {
        std::size_t index;
        double remainder;
    };
    std::vector<Rank> ranks;
    std::vector<PopulationBin> merged;
    std::array<std::array<Cohort, 3>, 2> summaries;
    void reserve(std::size_t binsPerSite);
};

}
