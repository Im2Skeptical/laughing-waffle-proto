#include "sim/stages/entries.hpp"

#include "sim/stages/food.hpp"

#include "core/js_number.hpp"
#include "sim/practice/stock.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"

namespace waffle::sim::stages {
namespace {

using namespace runtime;
using settlement::Residency;
using RegionalFood = Entry<RegionId, double>;
namespace js = core::js;

constexpr double populationPerEdible = 30;
constexpr auto storagePath = "Food stage";

double round_food(double value)
{
    return js::round(value * 10000) / 10000;
}

Range<double> feed_memory(const FoodStageCache& cache, SiteId site, Residency residency)
{
    const auto index = site.value * 2 + static_cast<std::uint32_t>(residency);
    const auto begin = cache.partialFeedMemory.begin + index * cache.memoryPerClass;
    return {begin, begin + cache.memoryPerClass};
}

struct Happiness {
    SymbolId previous;
    SymbolId target;
    bool starving{};
};

Happiness update_happiness(RuntimeState& state, PopulationClassHappiness& memory,
                           SiteId site, Residency residency, double ratio)
{
    const auto& settings = state.content->config.settings.values;
    const auto& statuses = state.faithStage.happiness;
    Happiness result{memory.status, memory.status};
    const auto shift = [&](int delta) {
        const auto found = std::ranges::find(statuses, result.previous);
        const int rank = found == statuses.end() ? 0 : static_cast<int>(found - statuses.begin());
        return statuses[std::clamp(rank + delta, 0, 2)];
    };

    if (ratio >= 1) {
        ++memory.fullFeedStreak;
        memory.missedFeedStreak = 0;
        memory.partialFeedRatios = {};
        if (memory.fullFeedStreak >= settings.fullFeedStreakForIncrease) {
            result.target = statuses.back();
            memory.fullFeedStreak = 0;
        }
    } else if (ratio < settings.partialFeedMinimumRatio) {
        memory.fullFeedStreak = 0;
        memory.partialFeedRatios = {};
        memory.missedFeedStreak = std::min(settings.missedFeedStreakForStarvation, memory.missedFeedStreak + 1);
        result.target = shift(-1);
        result.starving = memory.missedFeedStreak >= settings.missedFeedStreakForStarvation;
    } else {
        const auto old = state.tables.view(memory.partialFeedRatios);
        const auto normalized = round_food(ratio);
        memory.fullFeedStreak = 0;
        memory.missedFeedStreak = 0;
        const auto storage = feed_memory(state.foodStage, site, residency);
        if (!old.empty() && normalized <= old.back() + 0.0001) {
            result.target = shift(-1);
            state.tables.rows<double>()[storage.begin] = normalized;
            memory.partialFeedRatios = {storage.begin, storage.begin + 1};
        } else if (old.size() + 1 >= settings.partialFeedMemoryLength) {
            result.target = shift(1);
            memory.partialFeedRatios = {};
        } else {
            const auto next = storage.begin + static_cast<std::uint32_t>(old.size());
            state.tables.rows<double>()[next] = normalized;
            memory.partialFeedRatios = {storage.begin, next + 1};
        }
    }
    // Faith applies this target after Housing contributes its cap.
    return result;
}

ByClassVillager feed_class(RuntimeState& state, MoonTurn& turn, PopulationClass& population,
                           SiteId site, Residency residency, double demand, double& fedPeople)
{
    const auto consumed = std::min(demand, fedPeople);
    fedPeople -= consumed;
    const auto ratio = demand > 0 ? consumed / demand : 1;
    const auto happiness = update_happiness(state, population.happiness, site, residency, ratio);
    const auto requested = happiness.starving ? js::ceil(demand * (1 - ratio) - 0.00001) : 0;
    const auto migrants = settlement::reserve_migration(state, turn, site, residency, turn.phaseId, requested);
    return {demand, consumed, round_food(ratio), migrants, happiness.previous, happiness.target};
}

double meal_overhead(const RuntimeState& state, const Site& site)
{
    if (!state.hot.rulesetId) return 0;
    const auto definitions = state.compiledContent->structures();
    double overhead = 0;
    for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins))
        if (!cell.construction) overhead += definitions[cell.structureId.value].value.mealExtra.value_or(0);
    return overhead;
}

void publish_meal(RuntimeState& state, Site& site, MoonRegionResult& result, const MealResult& meal)
{
    const auto& cache = state.foodStage;
    const Index<MealResult> local{cache.siteMeals.begin + site.id.value};
    state.tables.at(local) = meal;
    site.detailedState.lastMeal = local;

    // Migration mutates lastMeal, while the Food report is a snapshot. The
    // active moon alternates banks with the previous moon. A dormant site's
    // result may still point to an older bank if it missed a rollover.
    Index<MealResult> report{cache.reports[state.settlementPrelude.nextMoonBuffer ^ 1].begin + site.id.value};
    if (site.detailedState.lastMoonResult &&
        state.tables.at(*site.detailedState.lastMoonResult).food == report)
        report = {cache.reports.back().begin + site.id.value};
    state.tables.at(report) = meal;
    result.food = report;
}

}

void prepare_food(RuntimeState& state)
{
    if (!state.hot.variantFlags.settlementPrototypeEnabled) return;
    auto& cache = state.foodStage;
    auto sites = state.tables.view(state.hot.world.sites);
    cache.meals.resize(sites.size());
    cache.garrisonCosts.resize(sites.size());
    cache.siteMeals = state.tables.table<MealResult>().append(sites.size(), storagePath);
    for (auto& bank : cache.reports)
        bank = state.tables.table<MealResult>().append(sites.size(), storagePath);
    const auto& settings = state.content->config.settings.values;
    cache.memoryPerClass = checked_index(std::max(1.0, js::ceil(settings.partialFeedMemoryLength)), storagePath);
    for (const auto& site : sites) {
        const auto& population = site.detailedState.populationByClass;
        cache.memoryPerClass = std::max({cache.memoryPerClass, population.villager.happiness.partialFeedRatios.size(),
                                        population.stranger.happiness.partialFeedRatios.size()});
    }
    cache.partialFeedMemory = state.tables.table<double>().append(2 * sites.size() * cache.memoryPerClass, storagePath);
    for (auto& site : sites) {
        const auto admit = [&](PopulationClass& population, Residency residency) {
            auto& range = population.happiness.partialFeedRatios;
            const auto storage = feed_memory(cache, site.id, residency);
            std::ranges::copy(state.tables.view(range), state.tables.view(storage).begin());
            range = {storage.begin, storage.begin + range.size()};
        };
        admit(site.detailedState.populationByClass.villager, Residency::villager);
        admit(site.detailedState.populationByClass.stranger, Residency::stranger);
    }
}

bool food(RuntimeState& state, StageContext& context)
{
    auto& turn = settlement::set_moon_turn_phase(state, context.lunar);
    auto& phaseFood = state.hot.civilization.phaseModifiers.foodByRegion;
    phaseFood = {};
    for (const auto id : settlement::detailed_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        if (!site.neutral) continue;
        for (auto& stock : state.tables.view(state.tables.at(*site.neutral).stocks))
            stock.stock = std::min(stock.capacity, stock.stock + stock.replenishment);
    }
    practice::activate(state, content::Activation::food, content::Stage::preRouting);
    practice::activate(state, content::Activation::food, content::Stage::postRouting);
    const auto modifiers = state.tables.view(phaseFood);
    auto& work = state.foodStage.meals;

    for (const auto id : settlement::active_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        const auto& population = settlement::population_totals(state, id).byResidency;
        const auto demand = js::ceil(double(population[0].total() + population[1].total()) / populationPerEdible);
        const auto modifier = std::ranges::find(modifiers, site.regionId, &RegionalFood::key);
        const auto saved = modifier == modifiers.end() ? 0 : std::clamp(modifier->value, 0.0, demand);
        const auto overhead = meal_overhead(state, site);
        const auto stock = demand - saved + overhead;
        work[id.value] = {saved, stock, overhead, practice::consume_meal_stock(state, site, stock, true)};
    }

    const auto regions = state.tables.view(state.hot.world.regions);
    std::size_t nextReport = 0;
    for (const auto id : settlement::active_sites(state)) {
        auto& site = settlement::site_at(state, id);
        const auto [saved, demand, overhead, local] = work[id.value];
        const auto shortage = demand - local;
        const auto consumed = local + (shortage > 0 ? practice::consume_meal_stock(state, site, shortage, false) : 0);
        auto& settlement = site.detailedState;
        settlement.mealRelief = DetailedSettlementMealRelief{state.hot.tSec, regions[site.regionId.value].controller,
                                                            std::max(0.0, consumed - local), shortage, consumed >= demand};
        double fedPeople = std::max(0.0, consumed + saved - overhead) * populationPerEdible;
        MealResult meal{.tSec = state.hot.tSec, .demand = demand, .savedStock = saved, .consumed = consumed,
                        .ratio = round_food(demand > 0 ? consumed / demand : 1)};
        const auto& population = settlement::population_totals(state, id).byResidency;
        auto& byClass = settlement.populationByClass;
        meal.byClass.villager = feed_class(state, turn, byClass.villager, id, Residency::villager,
                                          double(population[0].total()), fedPeople);
        if (const auto strangers = population[1].total(); strangers > 0) {
            const auto result = feed_class(state, turn, byClass.stranger, id, Residency::stranger,
                                           double(strangers), fedPeople);
            meal.byClass.stranger = {result.demand, result.consumed, result.ratio, result.migrants,
                                    result.previousHappiness, result.targetHappiness};
        } else {
            settlement::reset_empty_stranger_cohort(state, byClass.stranger);
            meal.byClass.stranger.ratio = 1;
        }

        auto& result = settlement::ensure_moon_region_result(state, turn, site.regionId, &nextReport);
        publish_meal(state, site, result, meal);
    }
    return true;
}

}
