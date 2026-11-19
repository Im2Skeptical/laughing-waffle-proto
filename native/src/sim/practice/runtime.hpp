#pragma once

#include "sim/state/tables.hpp"

namespace waffle::sim::runtime { struct PoliticalForceEntry; }

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

struct Candidate {
    runtime::SiteId site;
    std::uint32_t slot;
    runtime::PracticeId definition;
    unsigned triggerKinds{};
};

inline constexpr auto trigger_kind_count = static_cast<std::size_t>(EventKind::scheduledActivation);

struct ListenerIndex {
    std::vector<Candidate> candidates;
    std::vector<runtime::Range<std::uint32_t>> local;
    std::array<std::vector<std::uint32_t>, trigger_kind_count> remoteByKind;
    std::vector<std::uint32_t> dynamicThreshold;
    std::vector<std::optional<EventKind>> eventKinds;
};

struct RecipeStorage {
    using RegionalModifier = runtime::Entry<runtime::RegionId, double>;
    runtime::Range<RegionalModifier> housing, food;
    std::vector<runtime::Range<runtime::SeasonId>> boostSeasons;
    std::vector<runtime::Range<runtime::Entry<runtime::InstanceId, runtime::PoliticalForceEntry>>> politicalForce;
};

struct Vocabulary {
    std::array<runtime::EventKindId, static_cast<std::size_t>(EventKind::count)> events;
    std::array<runtime::SymbolId, 10> activations;
    std::array<runtime::SeasonId, 4> seasons;
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
