#pragma once

#include "sim/settlement/population_workspace.hpp"

namespace waffle::sim {

struct RuntimeState;

namespace settlement {

using BirthFactionCredit = runtime::Entry<runtime::FactionId, double>;
using BirthCredit = runtime::Entry<runtime::BirthCreditId, runtime::Range<BirthFactionCredit>>;

struct BirthWorkspace {
    LedgerScratch ledger;
    std::vector<PopulationBin> bins, candidates, matured, elderly, removed;
    CohortScratch cohorts;
    std::array<Cohort, 3> legacy;
    Cohort combined;

    BirthWorkspace() = default;
    BirthWorkspace(const BirthWorkspace& other) { reserve(other.capacity); }
    BirthWorkspace(BirthWorkspace&&) noexcept = default;
    BirthWorkspace& operator=(BirthWorkspace&&) noexcept = default;
    BirthWorkspace& operator=(const BirthWorkspace& other);
    void reserve(std::size_t binsPerSite);

private:
    std::size_t capacity{};
};

struct BirthStorage {
    std::array<runtime::SymbolId, 4> faithTiers;
    std::array<runtime::BirthCreditId, 6> groupKeys;
    std::array<runtime::Range<runtime::MoonRegionResultBirth>, 2> reports;
    runtime::Range<BirthCredit> groups;
    runtime::Range<BirthFactionCredit> factions;
    BirthWorkspace work;
};

void prepare_birth(RuntimeState& state);
// Starts at the post-Practice seam, after the new moon report is installed.
void resolve_birth_cohorts(RuntimeState& state);

}
}
