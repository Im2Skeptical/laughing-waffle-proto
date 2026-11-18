#include "sim/stages/entries.hpp"
#include "sim/stages/faith.hpp"

#include "core/js_math.hpp"
#include "core/js_number.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"

#include <algorithm>

namespace waffle::sim::stages {
namespace {

using namespace runtime;
namespace js = core::js;

constexpr std::size_t negative = 0;
constexpr std::size_t neutral = 1;
constexpr std::size_t positive = 2;
constexpr std::size_t bronze = 0;

template<std::size_t Count>
std::size_t find_rank(const std::array<SymbolId, Count>& order, SymbolId value)
{
    const auto found = std::ranges::find(order, value);
    return static_cast<std::size_t>(found - order.begin());
}

double round_chaos(double value)
{
    // JS Number(value) || 0 replaces NaN, but Infinity is truthy.
    if (!(value > 0)) return 0;
    return js::round(value * 100000) / 100000;
}

double primordial_pressure(const RuntimeState& state)
{
    const auto& settings = state.content->config.settings.values;
    const auto base = std::max(0.0, settings.primordialBasePressure);
    const auto growth = std::max(1.0, settings.primordialGrowthFactor);
    const auto cadence = std::max(1.0, js::floor(settings.primordialGrowthCadenceYears));
    const auto elapsed = std::max(0.0, js::floor(state.hot.year) - 1);
    const auto steps = js::floor(elapsed / cadence);
    return round_chaos(base * js::pow(growth, steps));
}

void account_chaos(RuntimeState& state, const std::array<double, 4>& population)
{
    auto& civilization = state.hot.civilization;
    auto& chaos = civilization.chaos;
    const auto& pending = chaos.pendingLosses;
    const auto& settings = state.content->config.settings.values;
    const auto mitigation = pending.prematureDeathMitigation.value_or(0);
    const auto primordial = primordial_pressure(state);
    const auto unrest = round_chaos(chaos.pendingUnrestIncome.value_or(0));
    const auto premature = std::max(pending.prematureDeaths * settings.prematureDeathChaosWeight - mitigation, 0.0);
    const auto external = pending.externalEmigrants * settings.externalEmigrationChaosWeight;
    const auto oldAge = pending.oldAgeDeaths * settings.oldAgeDeathChaosWeight;
    const auto internal = pending.internalMigrants * settings.internalMigrationChaosWeight;
    const auto raw = primordial + premature + external + oldAge + internal + unrest;
    const auto income = std::max(raw, 0.0);
    // Preserve the browser's tier order and fold its initial zero.
    const auto faithResistance = 0.0 + population[0] / settings.bronzeChaosResistancePopulation
        + population[1] / settings.silverChaosResistancePopulation
        + population[2] / settings.goldChaosResistancePopulation
        + population[3] / settings.diamondChaosResistancePopulation;
    const auto populationResistance = faithResistance * settings.populationChaosResistanceMultiplier;
    const auto resistance = round_chaos(populationResistance + civilization.phaseModifiers.faithResistance);
    // An overflow remains Infinity in live play. After a browser save and
    // restore its null balance instead contributes zero to the next addition.
    chaos.chaosPower = round_chaos(chaos.chaosPower.value_or(0) + income);
    const auto roundedIncome = round_chaos(income);
    chaos.lastMoonIncome = ChaosLastMoonIncome{
        .prematureDeaths = pending.prematureDeaths,
        .oldAgeDeaths = pending.oldAgeDeaths,
        .externalEmigrants = pending.externalEmigrants,
        .primordialPressure = primordial,
        .unrestPressure = unrest,
        .prematureDeathPressure = round_chaos(premature),
        .prematureDeathMitigation = round_chaos(mitigation),
        .externalEmigrationPressure = round_chaos(external),
        .oldAgeDeathPressure = round_chaos(oldAge),
        .internalMigrationPressure = round_chaos(internal),
        .rawPressure = round_chaos(raw),
        .faithPopulation = {population[0], population[1], population[2], population[3]},
        .resistance = resistance,
        .populationResistance = round_chaos(populationResistance),
        .incomingChaos = roundedIncome,
        .totalIncome = roundedIncome,
        .accumulatedChaos = chaos.chaosPower,
    };
    chaos.pendingLosses = {};
    chaos.pendingUnrestIncome = 0;
}

void activate_faith_practices(RuntimeState&, StageContext&)
{
    // N03e-3 executes Faith activations here. The dispatcher already runs
    // phase events and their drain with the pre-phase Chaos balance.
}

template<class Report>
bool resolve_class(PopulationClass& population, std::optional<SymbolId> food, std::size_t cap,
                   bool forcePositive, const FaithStageCache& cache, double streakForShift, Report& report)
{
    auto& faith = population.faith;
    auto& happiness = population.happiness.status;
    const auto previousHappiness = happiness;
    const auto foodRank = find_rank(cache.happiness, food.value_or(previousHappiness));
    const auto status = forcePositive ? positive
        : std::min(foodRank == cache.happiness.size() ? negative : foodRank, cap);
    happiness = cache.happiness[status];
    const auto previousFaith = faith.tier;
    if (status == neutral) {
        faith.trend.reset();
        faith.streak = 0;
    } else {
        faith.streak = faith.trend == happiness ? std::max(0.0, js::floor(faith.streak)) + 1 : 1;
        faith.trend = happiness;
        if (faith.streak >= streakForShift) {
            const auto rank = find_rank(cache.faith, faith.tier);
            const auto previous = rank == cache.faith.size() ? bronze : rank;
            const auto next = status == positive ? std::min(previous + 1, cache.faith.size() - 1)
                                                 : std::max(previous, std::size_t{1}) - 1;
            faith.tier = cache.faith[next];
            faith.streak = 0;
        }
    }
    const bool collapse = faith.tier == cache.faith[bronze] && status == negative;
    const bool firstCollapse = collapse && !faith.collapseActive.value_or(false);
    faith.collapseActive = collapse;
    report = {previousHappiness, happiness, previousFaith, faith.tier, previousFaith != faith.tier,
              faith.trend, faith.streak, false, 0};
    return firstCollapse;
}

}

void prepare_faith(RuntimeState& state)
{
    if (!state.hot.variantFlags.settlementPrototypeEnabled) return;
    auto& cache = state.faithStage;
    constexpr auto path = "Faith stage";
    cache.happiness = {state.intern<SymbolId>("negative", path), state.settlementPrelude.neutral,
                       state.intern<SymbolId>("positive", path)};
    cache.faith = {state.intern<SymbolId>("bronze", path), state.intern<SymbolId>("silver", path),
                   state.settlementPrelude.gold, state.intern<SymbolId>("diamond", path)};
    for (auto& bank : cache.reports)
        bank = state.tables.table<MoonRegionResultFaith>().append(state.hot.world.sites.size(), path);
    settlement::prepare_migration_reservations(state);
}

bool faith(RuntimeState& state, StageContext& context)
{
    auto& turn = settlement::set_moon_turn_phase(state, context.lunar);
    activate_faith_practices(state, context);
    const auto& cache = state.faithStage;
    const auto& settings = state.content->config.settings.values;
    const auto regions = state.tables.view(state.hot.world.regions);
    const auto moonRegions = state.tables.view(turn.regions);
    const auto reportRows = cache.reports[state.settlementPrelude.nextMoonBuffer ^ 1];
    const auto reports = state.tables.view(reportRows);
    const auto player = state.populationVocabulary.factions[2];
    std::array<double, 4> faithPopulation{};
    std::size_t nextRegion = 0;
    for (const auto id : settlement::detailed_sites(state)) {
        auto& site = settlement::site_at(state, id);
        auto& local = site.detailedState;
        const bool playerControlled = regions[site.regionId.value].controller == player;
        const bool update = !site.neutral && (playerControlled || (local.control && local.control->unrest));
        if (!update && !playerControlled) continue;

        auto& villager = local.populationByClass.villager;
        auto& stranger = local.populationByClass.stranger;
        const auto villagers = settlement::cohort_total(settlement::cohort_view(state, villager));
        const auto strangers = settlement::cohort_total(settlement::cohort_view(state, stranger));
        if (update) {
            auto row = nextRegion < moonRegions.size() ? moonRegions.begin() + nextRegion : moonRegions.end();
            if (row == moonRegions.end() || row->key != site.regionId)
                row = std::ranges::find(moonRegions, site.regionId, &Entry<RegionId, MoonRegionResult>::key);
            if (row == moonRegions.end()) throw std::logic_error("missing Faith moon region");
            nextRegion = row - moonRegions.begin() + 1;
            const auto& housing = row->value.housing;
            const auto* meal = row->value.food ? &state.tables.at(*row->value.food) : nullptr;
            const auto capRank = housing ? find_rank(cache.happiness, state.tables.at(*housing).happinessCap) : positive;
            auto& floor = local.happinessFloor;
            const bool floorActive = floor && floor->remainingResolutions > 0;
            const bool forcePositive = floorActive && floor->status == cache.happiness[positive];
            const auto cap = capRank == cache.happiness.size() ? negative : capRank;
            auto& report = reports[id.value];
            report.tSec = state.hot.tSec;
            const auto finishCollapse = [&](auto& result, settlement::Residency residency, double count) {
                result.displaced = settlement::reserve_migration(state, turn, id, residency, turn.phaseId,
                    js::ceil(count * settings.bronzeCollapseLossRate));
                result.collapseEntered = result.displaced > 0;
            };
            if (resolve_class(villager, meal ? std::optional{meal->byClass.villager.targetHappiness} : std::nullopt,
                              cap, forcePositive, cache, settings.faithStreakForShift, report.byClass.villager))
                finishCollapse(report.byClass.villager, settlement::Residency::villager, villagers);
            if (strangers > 0) {
                auto& result = report.byClass.stranger.emplace();
                if (resolve_class(stranger, meal ? meal->byClass.stranger.targetHappiness : std::nullopt,
                                  cap, forcePositive, cache, settings.faithStreakForShift, result))
                    finishCollapse(result, settlement::Residency::stranger, strangers);
            } else {
                settlement::reset_empty_stranger_cohort(state, stranger);
                report.byClass.stranger.reset();
            }
            if (floorActive) --floor->remainingResolutions;
            row->value.faith = Index<MoonRegionResultFaith>{reportRows.begin + id.value};
        }
        if (playerControlled) {
            const auto villagerRank = find_rank(cache.faith, villager.faith.tier);
            const auto strangerRank = find_rank(cache.faith, stranger.faith.tier);
            if (villagerRank < faithPopulation.size()) faithPopulation[villagerRank] += villagers;
            if (strangerRank < faithPopulation.size()) faithPopulation[strangerRank] += strangers;
        }
    }
    account_chaos(state, faithPopulation);
    return true;
}

}
