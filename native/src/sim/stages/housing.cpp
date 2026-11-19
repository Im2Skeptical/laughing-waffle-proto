#include "sim/stages/entries.hpp"
#include "sim/stages/housing.hpp"

#include "core/js_number.hpp"
#include "sim/content/compiled_content.hpp"
#include "sim/practice/practice.hpp"
#include "sim/practice/stock.hpp"
#include "sim/settlement/prelude.hpp"
#include "sim/settlement/site_access.hpp"

#include <algorithm>

namespace waffle::sim::stages {
namespace {

using namespace runtime;
namespace js = core::js;

bool pay_construction(RuntimeState& state, const Site& site, StructureCell& cell,
                      const content::StructureDefinitionConstruction& recipe,
                      bool localOnly, bool& completed)
{
    const auto& content = *state.compiledContent;
    const auto plan = practice::plan_stock(state, site, content.tables.view(recipe.consume),
                                           {}, nullptr, false, localOnly);
    if (!plan.ok || !practice::apply_stock(state, site, plan)) return false;

    ++cell.construction->completedCycles;
    auto& traitStorage = state.housingStage.constructionTraits;
    std::size_t traitCount = 0;
    std::array<practice::Provider, std::tuple_size_v<decltype(plan.providers.rows)>> providers;
    std::size_t count = 0;
    for (const auto& provider : plan.providers) {
        providers[count++] = provider.receipt;
        for (const auto trait : provider.source.traits) {
            const auto used = std::span(traitStorage).first(traitCount);
            if (std::ranges::find(used, trait) != used.end()) continue;
            if (traitCount == traitStorage.size()) traitStorage.resize(std::max(std::size_t{1}, traitCount * 2));
            traitStorage[traitCount++] = trait;
        }
    }
    practice::EventData event{};
    event.fields.structureId = cell.structureId;
    event.traits = std::span(traitStorage).first(traitCount);
    event.providers = std::span(providers).first(count);
    practice::emit(state, practice::EventKind::stockConsumed, site.regionId, event);

    if (cell.construction->completedCycles >= recipe.cycles) {
        cell.construction.reset();
        completed = true;
    }
    return true;
}

void run_construction(RuntimeState& state)
{
    const auto definitions = state.compiledContent->structures();
    const auto regions = state.tables.view(state.hot.world.regions);
    auto& retries = state.housingStage.constructionRetries;
    std::size_t retryCount = 0;
    bool completed = false;
    for (const auto id : settlement::active_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        if (!state.hot.rulesetId && regions[site.regionId.value].controller != state.practiceVocabulary.player)
            continue;
        const auto origins = site.detailedState.structureSlots.origins;
        for (auto index = origins.begin; index < origins.end; ++index) {
            const Index<StructureCell> cellIndex{index};
            auto& cell = state.tables.at(cellIndex);
            if (!cell.construction || cell.structureId.value >= definitions.size()) continue;
            const auto& recipe = definitions[cell.structureId.value].value.construction;
            if (recipe.activation.type != content::Activation::housing) continue;
            if (pay_construction(state, site, cell, recipe, true, completed)) continue;
            if (retryCount == retries.size()) retries.resize(std::max(std::size_t{1}, retries.size() * 2));
            retries[retryCount++] = {id, cellIndex};
        }
    }
    // Give every site its local attempt before any attempt can debit a neighbour.
    for (const auto& retry : std::span(retries).first(retryCount)) {
        const auto& site = settlement::site_at(state, retry.site);
        auto& cell = state.tables.at(retry.cell);
        pay_construction(state, site, cell, definitions[cell.structureId.value].value.construction, false, completed);
    }
    if (completed) practice::rebuild_listeners(state);
}

double structure_housing(const RuntimeState& state, const Site& site)
{
    const auto& housing = state.content->migration.structureHousing;
    double capacity = 0;
    for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins)) {
        if (cell.construction || cell.structureId.value >= housing.size()) continue;
        const auto base = housing[cell.structureId.value];
        const double quality = 1 + .25 * std::max(0.0, cell.qualityBonus.value_or(0));
        capacity += js::floor(base * quality);
    }
    return capacity;
}

}

void prepare_housing(RuntimeState& state)
{
    if (!state.hot.variantFlags.settlementPrototypeEnabled) return;
    auto& cache = state.housingStage;
    for (auto& bank : cache.reports)
        bank = state.tables.table<MoonRegionResultHousing>().append(state.hot.world.sites.size(), "Housing reports");
    cache.constructionRetries.resize(state.tables.rows<StructureCell>().size());
    cache.constructionTraits.resize(state.content->ids.get<TraitId>().offsets.size() +
                                    state.addedIds.get<TraitId>().offsets.size());
}

bool housing(RuntimeState& state, StageContext& context)
{
    auto& turn = settlement::set_moon_turn_phase(state, context.lunar);
    auto& modifiers = state.hot.civilization.phaseModifiers.housingByRegion;
    modifiers = {};
    practice::activate(state, content::Activation::housing);
    run_construction(state);
    practice::drain(state);

    const auto reportRows = state.housingStage.reports[state.settlementPrelude.nextMoonBuffer ^ 1];
    const auto reports = state.tables.view(reportRows);
    const auto regions = state.tables.view(state.hot.world.regions);
    const auto regionalModifiers = state.tables.view(modifiers);
    const auto [negative, neutral, positive] = state.faithStage.happiness;
    const auto player = state.practiceVocabulary.player;
    const auto negativeRatio = state.compiledContent->settings().overHousingNegativeRatio;
    std::size_t next = 0;
    for (const auto id : settlement::active_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        const auto region = site.regionId;
        const auto& control = site.detailedState.control;
        if (regions[region.value].controller != player && !(control && control->unrest)) continue;

        const auto& totals = settlement::population_totals(state, id).byResidency;
        const auto reserved = settlement::reserved_migration_population(state, turn, region);
        const double population = std::max(0.0, static_cast<double>(totals[0].total() + totals[1].total()) - reserved);
        const auto modifier = std::ranges::find(regionalModifiers, region, &practice::RecipeStorage::RegionalModifier::key);
        const auto capacity = structure_housing(state, site) + (modifier == regionalModifiers.end() ? 0.0 : modifier->value);
        const auto overflow = std::max(0.0, population - capacity);
        const auto cap = population <= capacity ? positive : population > capacity * negativeRatio ? negative : neutral;
        const auto migrants = settlement::reserve_housing_migration(state, turn, id, overflow);
        reports[id.value] = {state.hot.tSec, population, capacity, overflow, migrants, cap};

        auto& result = settlement::ensure_moon_region_result(state, turn, region, &next);
        result.housing = Index<MoonRegionResultHousing>{reportRows.begin + id.value};
    }
    return true;
}

}
