#pragma once

#include "sim/state/rows.generated.hpp"

namespace waffle::sim {
struct RuntimeState;
}

namespace waffle::sim::settlement {

struct MigrationStorage {
    runtime::Range<runtime::MigrationMovement> movements;
    runtime::Range<runtime::MigrationIntentSummary> summaries;
    runtime::Range<runtime::MigrationSourceLoss> unresolved;
    runtime::Range<runtime::JointCohort> joint;
    runtime::Range<runtime::ElderCohort> elders;
};

struct MigrationCache {
    runtime::Range<runtime::MigrationReport> reports;
    std::vector<MigrationStorage> storage;
    std::vector<double> structureHousing;
    std::vector<unsigned char> ediblePractices;
    std::array<runtime::ResidencyId, 2> classes;
    runtime::FactionId ruin;
    runtime::SymbolId stayed;
};

void prepare_migration(RuntimeState& state);
void resolve_migration(RuntimeState& state, runtime::MoonTurn& turn);
void cancel_moon_migration(RuntimeState& state, runtime::RegionId region);

}
