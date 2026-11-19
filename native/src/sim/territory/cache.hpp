#pragma once

#include "sim/state/tables.hpp"

namespace waffle::sim::runtime { struct NeutralMarket; }

namespace waffle::sim::territory {

struct Cache {
    struct ControlChange {
        runtime::SiteId site;
        runtime::FactionId faction;
    };

    std::vector<runtime::SiteId> unrest;
    std::vector<ControlChange> transfers;
    std::vector<runtime::Index<runtime::NeutralMarket>> marketSpare;
    std::vector<runtime::RegionId> supportSources;
    runtime::SiteModeId detailed, ruin;
    runtime::TraitId arms;
    runtime::StructureId tenement;
    runtime::EventKindId controlChanged, unrestStarted, unrestEnded, raidResolved, evacuation, defense, populationRescued;
    runtime::SymbolId held, lost, advance, expand, spawn, strengthen, creep, direct;
    std::array<runtime::SymbolId, 5> spawnOutcomes;
    bool sitesDirty{};
};

}
