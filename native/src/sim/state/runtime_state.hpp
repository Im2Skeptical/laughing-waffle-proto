#pragma once

#include <limits>

#include "sim/state/rows.generated.hpp"
#include "sim/settlement/birth_storage.hpp"
#include "sim/settlement/migration.hpp"
#include "sim/settlement/migration_reservation.hpp"
#include "sim/practice/runtime.hpp"
#include "sim/territory/cache.hpp"

#include <memory>

namespace waffle::sim {

class WorldTopology;
struct CompiledContent;

struct CapturedContent {
    browser::GameConfig config;
    std::string configHash;
    // The baseline vocabularies are frozen at import. Config definition
    // dictionary order is the prefix of the corresponding definition IDs.
    runtime::IdTables ids;
    settlement::MigrationContent migration;
};

struct PopulationTotals {
    std::uint64_t children{}, adults{}, elders{};
    std::uint64_t total() const { return children + adults + elders; }
};

using FactionPopulationTotal = runtime::Entry<runtime::FactionId, double>;

struct SiteIndex {
    std::array<PopulationTotals, 2> byResidency;
    runtime::Range<FactionPopulationTotal> byAllegiance;
    runtime::Range<FactionPopulationTotal> allegianceStorage;
    std::array<runtime::Range<runtime::JointCohort>, 2> jointStorage;
    std::array<std::array<runtime::Range<runtime::ElderCohort>, 3>, 2> elderStorage;
};

struct PopulationVocabulary {
    // Lexical order of the browser's closed ledger vocabulary.
    std::array<runtime::FactionId, 3> factions;
    std::array<runtime::SpecialtyId, 3> specialties;
    std::array<runtime::LifeStageId, 3> stages;
};

struct SettlementPreludeCache {
    runtime::SeasonId spring;
    runtime::SymbolId gold;
    runtime::SymbolId neutral;
    std::array<runtime::SymbolId, 6> phases;
    // Own the capacity of two rotating moon dictionaries and one result per site.
    std::array<runtime::Range<runtime::Entry<runtime::RegionId, runtime::MoonRegionResult>>, 2> moonRegions;
    runtime::Range<runtime::MoonRegionResult> siteResults;
    unsigned nextMoonBuffer{};
};

struct FaithStageCache {
    std::array<runtime::SymbolId, 3> happiness;
    std::array<runtime::SymbolId, 4> faith;
    std::array<runtime::Range<runtime::MoonRegionResultFaith>, 2> reports;
};

struct FoodStageCache {
    struct Meal {
        double saved{}, demand{}, overhead{}, local{};
    };
    std::vector<Meal> meals;
    // Both passes use authored site order. These rows are indexed by SiteId.
    std::vector<double> garrisonCosts;
    runtime::Range<runtime::MealResult> siteMeals;
    std::array<runtime::Range<runtime::MealResult>, 3> reports;
    runtime::Range<double> partialFeedMemory;
    std::uint32_t memoryPerClass{};
};

struct HousingStageCache {
    struct ConstructionRetry {
        runtime::SiteId site;
        runtime::Index<runtime::StructureCell> cell;
    };
    // Keep the previous moon's reports alive through site-result rollover.
    std::array<runtime::Range<runtime::MoonRegionResultHousing>, 2> reports;
    std::vector<ConstructionRetry> constructionRetries;
    std::vector<runtime::TraitId> constructionTraits;
};

struct RuntimeIndexes {
    std::vector<runtime::SiteId> sitesByRegion;
    std::vector<runtime::SiteId> detailedSitesByRegion;
    std::vector<runtime::SiteId> detailedSites;
    std::vector<runtime::SiteId> activeSites;  // Detailed sites without a neutral market.
    std::vector<runtime::Range<runtime::RegionId>> roadsByRegion;
    std::vector<runtime::RegionId> roadNeighbors;
    std::vector<SiteIndex> sites;
    std::vector<FactionPopulationTotal> allegianceTotals;
    runtime::Index<runtime::Entry<runtime::VassalId, runtime::Vassal>> currentVassal;

    std::size_t live_bytes() const;
};

struct RuntimeState {
    runtime::HotState hot;
    runtime::HotTables tables;
    // The index of a side column equals the index of its PracticeSlot or
    // JointCohort row. Copying a state copies all of these value buffers.
    std::vector<std::optional<double>> practiceStock;
    std::vector<double> practiceCharge;
    std::vector<std::uint64_t> jointCounts;
    std::vector<runtime::PracticeEventPayload> eventPayloads;
    runtime::HistoryPayload pendingPracticePayload;
    runtime::ColdTables cold;
    runtime::HistoryTables histories;
    RuntimeIndexes indexes;
    std::shared_ptr<const CapturedContent> content;
    std::shared_ptr<const CompiledContent> compiledContent;
    std::shared_ptr<const WorldTopology> topology;
    runtime::IdTables addedIds;
    SettlementPreludeCache settlementPrelude;
    settlement::BirthStorage birthStorage;
    FaithStageCache faithStage;
    FoodStageCache foodStage;
    HousingStageCache housingStage;
    runtime::Range<runtime::MoonRegionResultDeath> deathReports;
    settlement::MigrationReservationCache migrationReservations;
    PopulationVocabulary populationVocabulary;
    settlement::MigrationCache migration;
    practice::Vocabulary practiceVocabulary;
    practice::ListenerIndex practiceListeners;
    practice::RecipeStorage practiceRecipeStorage;
    territory::Cache territory;
    // The browser omits this latch on export and clears it on import.
    bool seasonChanged{};
    // Derived from tSec and immutable settings. Zero triggers calculation.
    double nextLunarBoundarySec{};
    double nextVassalCheckSec{std::numeric_limits<double>::infinity()};

    template<class Key>
    Key find_id(std::string_view name) const
    {
        const auto& original = content->ids.get<Key>();
        if (const auto id = original.find(name)) return Key{*id};
        const auto extra = addedIds.get<Key>().find(name);
        if (!extra) return {};
        return Key{static_cast<std::uint32_t>(original.offsets.size() + *extra)};
    }

    template<class Key>
    Key intern(std::string_view name, std::string_view path)
    {
        if (const auto id = find_id<Key>(name)) return id;
        auto& extra = addedIds.get<Key>();
        const auto next = runtime::checked_index(content->ids.get<Key>().offsets.size() + extra.offsets.size(), path);
        extra.append(name, path);
        return Key{next};
    }

    template<class Key>
    std::string_view name(Key id) const
    {
        const auto& original = content->ids.get<Key>();
        if (id.value < original.offsets.size()) return original.at(id.value);
        return addedIds.get<Key>().at(id.value - static_cast<std::uint32_t>(original.offsets.size()));
    }

    std::size_t hot_bytes() const;
};

// Adapter-only import checks representational bounds and live world links. Schema shape
// validation belongs to browser::import_game_state.
RuntimeState import_runtime(const browser::GameState& state);
// Gameplay admission requires the topology for state.world.definitionId.
// The original gameConfig JSON enables checks on browser record-key identity.
RuntimeState admit_runtime(const browser::GameState& state, const core::json::Value* topology,
                           const core::json::Value* capturedConfig = nullptr);
browser::GameState export_runtime(const RuntimeState& state);

// Rebuild lookup and summary indexes after changing their authoritative inputs.
// Serialized population summary columns are independent caches at the adapter
// boundary and must be kept current by any future population writes.
void rebuild_runtime_indexes(RuntimeState& state);
void refresh_site_population_index(RuntimeState& state, runtime::SiteId site);

}
