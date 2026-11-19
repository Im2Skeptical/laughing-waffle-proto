#pragma once

#include "sim/state/rows.generated.hpp"

namespace waffle::sim {

struct RuntimeState;

namespace settlement {

enum class Residency;

struct MigrationReservationCache {
    struct Bin {
        runtime::JointCohort key;
        double count{};
        double selected{};
        double remainder{};
        std::size_t order{};
    };
    struct Payload {
        runtime::Range<runtime::JointCohort> joint;
        runtime::Range<runtime::ElderCohort> elders;
    };
    struct Bank {
        runtime::Range<runtime::MigrationIntent> intents;
        std::vector<Payload> payloads;
        // Indexed by site, residency and reservation phase (Food, Housing, Faith).
    };
    std::array<Bank, 2> banks;
    std::vector<Bin> bins;
    std::vector<std::size_t> ranked;
    std::array<runtime::ResidencyId, 2> residencies;
};

void prepare_migration_reservations(RuntimeState& state);
double reserve_migration(RuntimeState& state, runtime::MoonTurn& turn, runtime::SiteId site,
                         Residency residency, runtime::SymbolId reason, double requested);
double reserved_migration_population(const RuntimeState& state, const runtime::MoonTurn& turn,
                                     runtime::RegionId region);
double reserve_housing_migration(RuntimeState& state, runtime::MoonTurn& turn,
                                 runtime::SiteId site, double overflow);

}
}
