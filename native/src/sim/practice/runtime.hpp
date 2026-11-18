#pragma once

#include "sim/state/tables.hpp"

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

struct Vocabulary {
    std::array<runtime::EventKindId, static_cast<std::size_t>(EventKind::count)> events;
    std::array<runtime::SymbolId, 10> activations;
    std::array<runtime::SeasonId, 4> seasons;
    std::array<runtime::SymbolId, 3> pools;
    std::array<runtime::SymbolId, 2> specialties;
    std::array<runtime::SymbolId, 4> martialActions;
    runtime::SymbolId consume, require, sacrifice, alreadyDischarged, capacityFull, noTraining, unmetCondition;
    runtime::FactionId player, frontier, external, neutral, beneficiary;
    runtime::TagId knowledge, food;
    runtime::TraitId currency, edible, record;
    std::vector<runtime::SymbolId> regionSymbols, marketLabels;
};

}
