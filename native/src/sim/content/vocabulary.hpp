#pragma once

#include "sim/browser/generated/game_state.hpp"
#include "sim/state/tables.hpp"

namespace waffle::sim::content {

enum class Mode : std::uint8_t { scheduled, charge };
enum class Pool : std::uint8_t { common, scholar, warrior };
enum class Provenance : std::uint8_t { warrior, scholar, neutral, dictator };
enum class Quality : std::uint8_t { bronze, silver, gold, diamond };
enum class Activation : std::uint8_t { season, birth, food, housing, faith, migration, death, charge, passive, crisis };
enum class Season : std::uint8_t { spring, summer, autumn, winter };
enum class Stage : std::uint8_t { preRouting, postRouting, afterMeals };
enum class Category : std::uint8_t { influence, resource };
enum class Condition : std::uint8_t { diverseStock, ruins, deaths, chaos, externalConnection };
enum class PopulationCondition : std::uint8_t { housed, relief };
enum class ExternalAction : std::uint8_t { trade, raid, hunt };
enum class ResponseAction : std::uint8_t { rescue };
enum class HistoryScale : std::uint8_t { losses, deaths, deathsSinceSpring };
enum class HistorySource : std::uint8_t { age, records, losses, retired, commissions, knowledgeStructures, chaos, victories, conquests };
enum class SupportBank : std::uint8_t { formation, siege, mobility, coordination, greatHost };
enum class Reach : std::uint8_t { local, connectedAdjacent };
enum class Duration : std::uint8_t { moon, year };
enum class Biome : std::uint8_t { plains, mountains, forest, water };
enum class TriggerScope : std::uint8_t { local, adjacent, connected, civilization };
enum class MartialAction : std::uint8_t { campaign, defense, hunt, conquest };
enum class Keyword : std::uint8_t { synthesis, monsterTrophies, economicRegions };
enum class KeywordMode : std::uint8_t { disciplines, lenses, teachings };
enum class KeywordClass : std::uint8_t { scholar, warrior, priest, merchant };
enum class Rarity : std::uint8_t { common, uncommon, rare };
enum class Timing : std::uint8_t { early, mid, late };
enum class TargetType : std::uint8_t { pool, node };
enum class LifeMapStage : std::uint8_t { any, firstLife, successor };
enum class LifeMapScope : std::uint8_t { common, specialist, scholar, warrior, unclassed };
enum class GuaranteeCoverage : std::uint8_t { map, eachRoute };
enum class UpkeepActivation : std::uint8_t {
    season, birth, food, housing, faith, migration, death, charge, passive, crisis, spring, summer, autumn, winter,
};
enum class ModifierKind : std::uint8_t {
    occupation, outputMultiplier, capacity, localDefense, networkGarrison, garrisonUpkeep,
    output, historyCandidate, chargeGain, chargeThresholdReduction, requireSubstitution,
    support, defense, defenseMultiplier, retinueForce, lossDefense, currencyWildcard,
    consumeReduction, effectBonus, flexibleProvider, scalingCap, preview, lossResistance,
    stockDefense, networkSupport, stockSupport, evacuationShare,
};

using SpecialistClass = browser::SpecialistClass;

}
