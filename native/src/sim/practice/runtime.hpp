#pragma once

#include "sim/state/tables.hpp"

#include <memory>

namespace waffle::sim::runtime { class HistoryArena; struct PoliticalForceEntry; struct PracticeSlot; struct StructureCell; }

namespace waffle::sim::practice {

enum class EventKind : std::uint8_t {
    monsterSpawn, monsterPressure, stockGenerated, stockConsumed, chaosIncreased,
    candidateDevelopment, supportContributed, martialActionResolved, populationDied,
    monsterDestroyed, defenseSucceeded, practiceInstalled, dangerSurvived, campaignWon,
    externalTrade, challengeCompleted, settlementLost, crisisResolved,
    scheduledActivation, practiceResolved, phaseResolved, candidateDevelopmentBanked,
    populationConverted, activated, discharged, chargeGained, cascadeDeferred,
    dischargeBlocked, cascadeSafetyCap, count,
};

struct Assignment {
    std::uint32_t tokens{};
    double effective{};
    bool scholar{};
};

using Assignments = std::array<Assignment, 5>;

struct Candidate {
    runtime::SiteId site;
    std::uint32_t slot;
    runtime::PracticeId definition;
    unsigned triggerKinds{};
};

inline constexpr auto trigger_kind_count = static_cast<std::size_t>(EventKind::scheduledActivation);

struct UpkeepCandidate {
    runtime::SiteId site;
    runtime::Index<runtime::StructureCell> cell;
};

inline constexpr std::size_t activation_count = 10;
inline constexpr std::size_t season_count = 4;

struct ListenerIndex {
    std::vector<Candidate> candidates;
    std::vector<runtime::Range<std::uint32_t>> local;
    std::array<std::vector<std::uint32_t>, trigger_kind_count> remoteByKind;
    std::vector<std::uint32_t> dynamicThreshold;
    struct FixedThreshold {
        runtime::Index<runtime::PracticeSlot> slot;
        double limit;
    };
    std::vector<FixedThreshold> fixedThresholds;
    std::vector<std::optional<EventKind>> eventKinds;
    std::vector<unsigned> modifierKindsBySite;
    std::array<std::vector<Candidate>, activation_count> scheduled;
    std::array<std::vector<UpkeepCandidate>, activation_count + season_count> upkeep;
};

struct RecipeStorage {
    using RegionalModifier = runtime::Entry<runtime::RegionId, double>;
    runtime::Range<RegionalModifier> housing, food;
    std::vector<runtime::Range<runtime::SeasonId>> boostSeasons;
    std::vector<runtime::Range<runtime::Entry<runtime::InstanceId, runtime::PoliticalForceEntry>>> politicalForce;
    std::shared_ptr<runtime::HistoryArena> historyArena;
};

struct Vocabulary {
    std::array<runtime::EventKindId, static_cast<std::size_t>(EventKind::count)> events;
    std::array<runtime::SymbolId, activation_count> activations;
    std::array<runtime::SeasonId, season_count> seasons;
    std::array<runtime::SymbolId, 3> pools;
    std::array<runtime::SymbolId, 2> specialties;
    std::array<runtime::ResidencyId, 2> residencies;
    std::array<runtime::SymbolId, 4> martialActions;
    runtime::SymbolId consume, require, sacrifice, alreadyDischarged, capacityFull, noTraining, unmetCondition;
    runtime::SymbolId requiresScholar, noExternalTarget;
    runtime::FactionId player, frontier, external, neutral, beneficiary;
    runtime::TagId knowledge, food;
    runtime::TraitId currency, edible, record;
    std::vector<runtime::SymbolId> regionSymbols, marketLabels;
};

}
