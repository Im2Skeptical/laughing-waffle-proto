#pragma once

#include "sim/settlement/site_access.hpp"

namespace waffle::sim::settlement {

enum class Residency { villager, stranger };
enum class PopulationTie { ledger_key, input_order };

struct PopulationBin {
    Residency residency{};
    runtime::JointCohort key;
    std::uint64_t count{};
};

struct PopulationBinView {
    Residency residency{};
    std::span<const runtime::JointCohort> keys;
    std::span<const std::uint64_t> counts;

    std::size_t size() const { return keys.size(); }
    PopulationBin operator[](std::size_t index) const { return {residency, keys[index], counts[index]}; }
};

struct PopulationFilter {
    std::optional<Residency> residency;
    runtime::SpecialtyId specialty;
    runtime::LifeStageId kind;
    runtime::FactionId allegiance;
    bool beneficiaryOnly{};
    bool opposing{};
};

struct Cohort {
    double children{}, adults{};
    std::vector<runtime::ElderCohort> elders;
};

struct CohortView {
    double children{}, adults{};
    std::span<const runtime::ElderCohort> elders;
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

void prepare_population(RuntimeState& state);
const runtime::PopulationClass& population_class(const runtime::PopulationByClass& population, Residency residency);
PopulationBinView population_bins(const RuntimeState& state, const runtime::PopulationByClass& population,
                                  Residency residency);

// Allocation returns nonzero bins in input order. Largest-remainder ties use
// the browser ledger key and then input position. Input and output must be disjoint.
void allocate_population(const RuntimeState& state, std::span<const PopulationBin> bins,
                         double requested, std::vector<PopulationBin>& output, LedgerScratch& scratch,
                         PopulationTie tie = PopulationTie::ledger_key);
void collect_population(const RuntimeState& state, const runtime::PopulationByClass& population,
                        std::vector<PopulationBin>& output, const PopulationFilter& filter = {},
                        runtime::FactionId beneficiary = {});

// Remove from the first matching bin, in selection order. Commit the changed
// working bins with write_population_bins. Input and output must be disjoint.
void remove_population(std::span<PopulationBin> bins, std::span<const PopulationBin> selected,
                       std::vector<PopulationBin>& removed);
void write_population_bins(RuntimeState& state, runtime::SiteId site,
                           std::span<const PopulationBin> bins, LedgerScratch& scratch, bool joint = true);
runtime::PopulationComposition write_population_composition(
    RuntimeState& state, std::span<const PopulationBin> bins, bool joint, LedgerScratch& scratch,
    std::uint32_t& jointCursor, std::uint32_t& elderCursor);

CohortView cohort_view(const RuntimeState& state, const runtime::AgeCounts& counts);
CohortView cohort_view(const RuntimeState& state, const runtime::PopulationClass& population);
double cohort_total(CohortView cohort);
void add_age_cohort(Cohort& target, CohortView source, int sign, CohortScratch& scratch);
void split_specialist_cohorts(const RuntimeState& state, const runtime::PopulationClass& population,
                              std::array<Cohort, 3>& parts, CohortScratch& scratch);
void combine_specialist_cohorts(const std::array<Cohort, 3>& parts, Cohort& combined, CohortScratch& scratch);

}
