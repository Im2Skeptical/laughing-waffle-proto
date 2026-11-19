#pragma once

#include "sim/state/rows.generated.hpp"

namespace waffle::sim {

struct RuntimeState;

namespace settlement {

using BirthFactionCredit = runtime::Entry<runtime::FactionId, double>;
using BirthCredit = runtime::Entry<runtime::BirthCreditId, runtime::Range<BirthFactionCredit>>;

struct BirthStorage {
    std::array<runtime::SymbolId, 4> faithTiers;
    std::array<runtime::BirthCreditId, 6> groupKeys;
    std::array<runtime::Range<runtime::MoonRegionResultBirth>, 2> reports;
    runtime::Range<BirthCredit> groups;
    runtime::Range<BirthFactionCredit> factions;
    std::size_t binCapacityHint{};
};

void prepare_birth(RuntimeState& state);
// Starts at the post-Practice seam, after the new moon report is installed.
void resolve_birth_cohorts(RuntimeState& state);

}
}
