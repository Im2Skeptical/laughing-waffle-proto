#include "sim/stages/entries.hpp"

#include "core/js_number.hpp"
#include "sim/practice/practice.hpp"
#include "sim/practice/stock.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"

#include <algorithm>
#include <limits>
#include <numeric>
#include <tuple>

namespace waffle::sim::stages {
namespace {

using namespace runtime;
using namespace settlement;
namespace js = core::js;
using MoonRegion = Entry<RegionId, MoonRegionResult>;
constexpr auto deathPath = "Death";
constexpr std::array residencies{Residency::villager, Residency::stranger};
constexpr double arrivalMealCost = 1.0 / 30;
constexpr auto noMovement = std::numeric_limits<std::size_t>::max();

struct ArrivalBin {
    PopulationBin bin;
    std::size_t movement, order;
    std::uint64_t fed{};
    double remainder{};
};

struct Workspace {
    LedgerScratch ledger;
    CohortScratch cohort;
    std::array<Cohort, 3> parts;
    std::vector<PopulationBin> residents, selection, composition;
    std::vector<std::size_t> firstMovement, arrivals, binOrder, ranked;
    std::vector<ArrivalBin> arrivalBins;
    std::vector<double> hardship;
};

bool has_ledger(const auto& population)
{
    return population.villager.joint || population.stranger.joint;
}

double mortality_rate(const content::SettingValues& settings, std::uint64_t age)
{
    if (age <= 49) return settings.elderMortalityThrough49;
    if (age <= 54) return settings.elderMortality50To54;
    if (age <= 59) return settings.elderMortality55To59;
    if (age <= 64) return settings.elderMortality60To64;
    if (age <= 69) return settings.elderMortality65To69;
    if (age <= 74) return settings.elderMortality70To74;
    return settings.elderMortality75Plus;
}

std::uint64_t roll_deaths(core::SeedRng& rng, std::uint64_t count, double probability)
{
    std::uint64_t deaths = 0;
    for (std::uint64_t i = 0; i < count; ++i)
        deaths += core::rng_next_float(rng) < probability;
    return deaths;
}

// Legacy compositions enumerate specialty before age. Arrival ties rank by
// age position before specialty, independently of that enumeration order.
void collect_legacy_class(const RuntimeState& state, const PopulationClass& population,
                          Residency residency, std::vector<PopulationBin>& output,
                          Workspace& scratch, std::vector<std::size_t>* mealOrder = nullptr)
{
    split_specialist_cohorts(state, population, scratch.parts, scratch.cohort);
    const auto& lex = state.populationVocabulary;
    const auto classOrder = static_cast<std::size_t>(residency) * 1000;
    for (std::size_t s = 0; s < scratch.parts.size(); ++s) {
        auto& part = scratch.parts[s];
        if (mealOrder) std::ranges::sort(part.elders, {}, &ElderCohort::age);
        const auto add = [&](LifeStageId kind, std::optional<std::uint64_t> age,
                             std::uint64_t count, std::size_t ageOrder) {
            if (!count) return;
            output.push_back({residency, {{}, lex.specialties[s], kind, age}, count});
            if (mealOrder) mealOrder->push_back((classOrder + ageOrder) * 3 + s);
        };
        add(lex.stages[1], {}, static_cast<std::uint64_t>(part.children), 0);
        add(lex.stages[0], {}, static_cast<std::uint64_t>(part.adults), 1);
        for (std::size_t i = 0; i < part.elders.size(); ++i) {
            const auto& elder = part.elders[i];
            add(lex.stages[2], elder.age, elder.count, 2 + i);
        }
    }
}

void collect_composition(const RuntimeState& state, const PopulationComposition& composition,
                         Workspace& scratch, bool forMeal = false)
{
    const std::array classes{&composition.villager, &composition.stranger};
    auto& bins = scratch.composition;
    bins.clear();
    scratch.binOrder.clear();
    const bool joint = has_ledger(composition);
    for (std::size_t c = 0; c < classes.size(); ++c) {
        const auto& row = *classes[c];
        if (joint) {
            const auto range = row.joint.value_or(Range<JointCohort>{});
            const auto keys = state.tables.view(range);
            for (std::size_t i = 0; i < keys.size(); ++i) {
                if (forMeal) scratch.binOrder.push_back(bins.size());
                bins.push_back({residencies[c], keys[i], state.jointCounts[range.begin + i]});
            }
        } else {
            collect_legacy_class(state, {row.specialists, row.children, row.adults, row.eldersByAge},
                                 residencies[c], bins, scratch, forMeal ? &scratch.binOrder : nullptr);
        }
    }
}

void collect_residents(const RuntimeState& state, const PopulationByClass& population, Workspace& scratch)
{
    if (has_ledger(population)) {
        collect_population(state, population, scratch.residents);
    } else {
        scratch.residents.clear();
        for (const auto residency : residencies)
            collect_legacy_class(state, population_class(population, residency), residency,
                                 scratch.residents, scratch);
    }
}

// Arrival meals use the destination's local Edible in slot order. They
// neither use the shared Stock network nor emit a Stock-consumed event.
template<class Action>
void visit_edible(RuntimeState& state, const Site* site, Action act)
{
    if (!site) return;
    if (site->neutral) {
        for (auto& slot : state.tables.view(state.tables.at(*site->neutral).stocks))
            if (std::ranges::find(state.tables.view(slot.traits), state.practiceVocabulary.edible) !=
                state.tables.view(slot.traits).end()) act(slot.stock);
        return;
    }
    const auto& edible = state.content->migration.ediblePractices;
    for (const auto slot : site->detailedState.practiceSlots.slots) {
        if (!slot) continue;
        const auto def = state.tables.at(slot).practiceId.value;
        if (def < edible.size() && edible[def]) act(state.practiceStock[slot.value]);
    }
}

double stock_amount(double value) { return value; }
double stock_amount(std::optional<double> value) { return value.value_or(0); }

double round_food(double value)
{
    return std::max(0.0, js::round(value * 10000) / 10000);
}

void feed_destination(RuntimeState& state, Range<MigrationMovement> range, const Site* destination,
                      std::span<const std::size_t> arrivals, Workspace& scratch)
{
    const auto moves = state.tables.view(range);
    auto& bins = scratch.arrivalBins;
    bins.clear();
    double demand = 0;
    for (const auto i : arrivals) {
        collect_composition(state, moves[i].composition, scratch, true);
        for (std::size_t b = 0; b < scratch.composition.size(); ++b) {
            const auto& bin = scratch.composition[b];
            bins.push_back({bin, i, scratch.binOrder[b]});
            demand += double(bin.count) * arrivalMealCost;
        }
    }

    double available = 0;
    visit_edible(state, destination, [&](const auto& stock) { available += std::max(0.0, stock_amount(stock)); });
    const auto coverage = demand > 0 ? std::min(1.0, available / demand) : 1;
    double used = 0;
    for (auto& row : bins) {
        const auto exact = double(row.bin.count) * coverage;
        row.fed = static_cast<std::uint64_t>(js::floor(exact));
        row.remainder = exact - double(row.fed);
        used += double(row.fed) * arrivalMealCost;
    }

    auto remaining = round_food(available - used);
    if (coverage < 1 && arrivalMealCost <= remaining + .00001) {
        auto& ranked = scratch.ranked;
        ranked.resize(bins.size());
        std::iota(ranked.begin(), ranked.end(), std::size_t{0});
        std::ranges::sort(ranked, [&](auto i, auto j) {
            const auto& a = bins[i];
            const auto& b = bins[j];
            return std::tuple(-a.remainder, a.movement, a.order, i) <
                   std::tuple(-b.remainder, b.movement, b.order, j);
        });
        bool progressed;
        do {
            progressed = false;
            for (const auto i : ranked) {
                if (arrivalMealCost > remaining + .00001) break;
                auto& row = bins[i];
                if (row.fed == row.bin.count) continue;
                ++row.fed;
                remaining = round_food(remaining - arrivalMealCost);
                used += arrivalMealCost;
                progressed = true;
            }
        } while (progressed);
    }

    auto checkout = std::max(0.0, js::ceil(used - 1e-9));
    visit_edible(state, destination, [&](auto& stock) {
        const auto balance = stock_amount(stock);
        const auto paid = std::min(checkout, std::max(0.0, balance));
        stock = std::max(0.0, balance - paid);
        checkout -= paid;
    });
    std::size_t b = 0;
    for (const auto i : arrivals) {
        auto& move = moves[i];
        auto& survivors = scratch.composition;
        survivors.clear();
        bool allFed = true;
        double count = 0;
        for (; b < bins.size() && bins[b].movement == i; ++b) {
            auto bin = bins[b].bin;
            const auto fed = bins[b].fed;
            allFed &= fed == bin.count;
            bin.count = fed;
            survivors.push_back(bin);
            count += double(fed);
        }
        move.survivors = count;
        move.arrivalDeaths = move.amount - count;
        if (survivors.empty()) move.survivorComposition.emplace();
        else if (allFed) move.survivorComposition = move.composition;
        else move.survivorComposition = store_arrival_survivors(
            state, range, survivors, has_ledger(move.composition), scratch.ledger);
    }
}

double resolve_arrivals(RuntimeState& state, MoonTurn& turn, Workspace& scratch)
{
    const auto moves = state.tables.view(turn.movements);
    scratch.firstMovement.assign(state.hot.world.regions.size(), noMovement);
    scratch.arrivals.clear();
    for (std::size_t i = 0; i < moves.size(); ++i) {
        const auto& move = moves[i];
        if (move.external.value_or(false)) continue;
        auto& first = scratch.firstMovement[move.destinationRegionId.value];
        if (first == noMovement) first = i;
        scratch.arrivals.push_back(i);
    }
    const auto group = [&](std::size_t i) { return scratch.firstMovement[moves[i].destinationRegionId.value]; };
    std::ranges::sort(scratch.arrivals, [&](auto a, auto b) {
        return std::tuple(group(a), a) < std::tuple(group(b), b);
    });
    const auto order = std::span(scratch.arrivals);
    for (std::size_t first = 0; first < order.size();) {
        auto end = first + 1;
        while (end < order.size() && group(order[end]) == group(order[first])) ++end;
        const auto* site = detailed_site(state, moves[order[first]].destinationRegionId);
        feed_destination(state, turn.movements, site, order.subspan(first, end - first), scratch);
        first = end;
    }

    double deaths = 0;
    for (const auto& move : moves) {
        if (move.external.value_or(false)) continue;
        deaths += move.arrivalDeaths;
        if (move.survivors == 0) continue;
        auto* site = detailed_site(state, move.destinationRegionId);
        if (!site) continue;
        auto& population = site->detailedState.populationByClass;
        const bool joint = has_ledger(population);
        if (!joint) reset_empty_stranger_cohort(state, population.stranger);
        collect_residents(state, population, scratch);
        collect_composition(state, *move.survivorComposition, scratch);
        for (auto& bin : scratch.composition) bin.residency = Residency::stranger;
        scratch.residents.insert(scratch.residents.end(), scratch.composition.begin(), scratch.composition.end());
        write_population_bins(state, site->id, scratch.residents, scratch.ledger, joint);
    }
    return deaths;
}

double resolve_hardship(RuntimeState& state, const MigrationSourceLoss& loss, Workspace& scratch,
                        core::SeedRng& rng, double rate)
{
    auto* site = detailed_site(state, loss.sourceRegionId);
    collect_composition(state, loss.composition, scratch);
    auto& vulnerable = scratch.selection;
    const bool joint = site && has_ledger(site->detailedState.populationByClass);
    if (site) collect_residents(state, site->detailedState.populationByClass, scratch);
    if (joint) {
        std::array<bool, 2> classes{};
        double requested = 0;
        for (const auto& bin : scratch.composition) {
            classes[static_cast<std::size_t>(bin.residency)] = true;
            requested += double(bin.count);
        }
        auto& eligible = scratch.composition;
        eligible.clear();
        for (const auto& bin : scratch.residents)
            if (classes[static_cast<std::size_t>(bin.residency)]) eligible.push_back(bin);
        allocate_population(state, eligible, requested, vulnerable, scratch.ledger);
    } else {
        vulnerable.assign(scratch.composition.begin(), scratch.composition.end());
    }

    double deaths = 0;
    for (auto& bin : vulnerable) {
        bin.count = roll_deaths(rng, bin.count, rate);
        deaths += double(bin.count);
    }
    if (!site || deaths == 0) return deaths;
    auto& removed = scratch.composition;
    remove_population(scratch.residents, vulnerable, removed);
    if (joint) {
        deaths = 0;
        for (const auto& bin : removed) deaths += double(bin.count);
    }
    write_population_bins(state, site->id, scratch.residents, scratch.ledger, joint);
    return deaths;
}

DeathByClass resolve_mortality(RuntimeState& state, const Site& site, Workspace& scratch,
                               core::SeedRng& rng)
{
    const auto& population = site.detailedState.populationByClass;
    if (!population.villager.eldersByAge.size() && !population.stranger.eldersByAge.size()) return {};
    const auto& settings = state.compiledContent->settings();
    std::array<double, 2> deaths{};
    const auto elder = state.populationVocabulary.stages[2];
    const bool joint = has_ledger(population);
    if (joint) {
        for (const auto residency : residencies) {
            const auto bins = population_bins(state, population, residency);
            for (std::size_t i = 0; i < bins.size(); ++i) {
                if (bins.keys[i].kind != elder) continue;
                const auto dead = roll_deaths(rng, bins.counts[i], mortality_rate(settings, bins.keys[i].age.value_or(0)));
                if (!dead) continue;
                auto& cohort = population_class(population, residency);
                state.jointCounts[cohort.joint->begin + i] -= dead;
                deaths[static_cast<std::size_t>(residency)] += double(dead);
            }
        }
        if (deaths[0] + deaths[1] > 0) {
            collect_population(state, population, scratch.residents);
            write_population_bins(state, site.id, scratch.residents, scratch.ledger);
        }
    } else {
        collect_residents(state, population, scratch);
        for (auto& bin : scratch.residents) {
            if (bin.key.kind != elder) continue;
            const auto dead = roll_deaths(rng, bin.count, mortality_rate(settings, bin.key.age.value_or(0)));
            bin.count -= dead;
            deaths[static_cast<std::size_t>(bin.residency)] += double(dead);
        }
        if (deaths[0] + deaths[1] > 0)
            write_population_bins(state, site.id, scratch.residents, scratch.ledger, false);
    }
    return {{deaths[0]}, {deaths[1]}};
}

Index<MoonRegionResultDeath> death_report_slot(const RuntimeState& state, const Site& site)
{
    // Native rollover shares result rows with the previous moon and the
    // site's last result. A returning site may still hold an older row.
    auto row = state.deathReports.begin + 3 * site.id.value;
    Index<MoonRegionResultDeath> sitePrior;
    if (site.detailedState.lastMoonResult)
        sitePrior = state.tables.at(*site.detailedState.lastMoonResult).death.value_or(Index<MoonRegionResultDeath>{});
    Index<MoonRegionResultDeath> moonPrior;
    if (const auto& previous = state.hot.civilization.lastMoonTurn) {
        const auto regions = state.tables.view(previous->regions);
        auto found = site.id.value < regions.size() ? regions.begin() + site.id.value : regions.end();
        if (found == regions.end() || found->key != site.regionId)
            found = std::ranges::find(regions, site.regionId, &MoonRegion::key);
        if (found != regions.end()) moonPrior = found->value.death.value_or(Index<MoonRegionResultDeath>{});
    }
    while (row == sitePrior.value || row == moonPrior.value) ++row;
    return {row};
}

MoonRegionResult& moon_result(RuntimeState& state, MoonTurn& turn, RegionId region, std::size_t& next)
{
    auto rows = state.tables.view(turn.regions);
    auto found = next < rows.size() ? rows.begin() + next : rows.end();
    if (found == rows.end() || found->key != region)
        found = std::ranges::find(rows, region, &MoonRegion::key);
    if (found == rows.end()) {
        const auto old = turn.regions;
        turn.regions = state.tables.table<MoonRegion>().append(old.size() + 1, deathPath);
        rows = state.tables.view(turn.regions);
        std::ranges::copy(state.tables.view(old), rows.begin());
        rows.back() = {region, MoonRegionResult{region}};
        found = rows.end() - 1;
    }
    next = found - rows.begin() + 1;
    return found->value;
}

thread_local Workspace scratchForDeath;

} // namespace

void prepare_death(RuntimeState& state)
{
    if (!state.hot.variantFlags.settlementPrototypeEnabled) return;
    state.deathReports = state.tables.table<MoonRegionResultDeath>().append(
        3 * state.hot.world.sites.size(), "Death reports");
    auto& scratch = scratchForDeath;
    const auto bins = state.birthStorage.binCapacityHint;
    scratch.ledger.reserve(bins);
    scratch.cohort.reserve(bins);
    for (auto& part : scratch.parts) part.elders.reserve(bins);
    scratch.residents.reserve(2 * bins);
    scratch.composition.reserve(bins);
    scratch.selection.reserve(bins);
    scratch.binOrder.reserve(bins);
    scratch.arrivalBins.reserve(2 * bins);
    scratch.ranked.reserve(2 * bins);
    scratch.arrivals.reserve(state.hot.world.sites.size());
    scratch.firstMovement.reserve(state.hot.world.regions.size());
    scratch.hardship.reserve(state.hot.world.regions.size());
}

bool death(RuntimeState& state, StageContext& context)
{
    auto& turn = set_moon_turn_phase(state, context.lunar);
    auto& scratch = scratchForDeath;
    const bool fullMap = state.hot.rulesetId.has_value();
    const double arrivalDeaths = turn.movements.size() ? resolve_arrivals(state, turn, scratch) : 0;
    const auto& settings = state.compiledContent->settings();
    core::SeedRng rng{state.hot.rng.seed};
    double hardshipDeaths = 0;
    const bool hasHardship = turn.unresolved.size() != 0;
    if (hasHardship) {
        scratch.hardship.assign(state.hot.world.regions.size(), 0);
        for (const auto& loss : state.tables.view(turn.unresolved)) {
            const auto deaths = resolve_hardship(state, loss, scratch, rng, settings.migrationHardshipDeathRate);
            scratch.hardship[loss.sourceRegionId.value] += deaths;
            hardshipDeaths += deaths;
        }
    }

    double premature = fullMap ? 0 : hardshipDeaths + arrivalDeaths;
    double oldAge = 0, mitigation = 0;
    const auto regions = state.tables.view(state.hot.world.regions);
    std::size_t nextRegion = 0;
    for (const auto id : active_sites(state)) {
        auto& site = site_at(state, id);
        auto& result = moon_result(state, turn, site.regionId, nextRegion);
        const auto natural = resolve_mortality(state, site, scratch, rng);
        const auto arrivals = finish_migration_report(state, id, turn, result);
        const auto hardship = hasHardship ? scratch.hardship[site.regionId.value] : 0;
        result.death = death_report_slot(state, site);
        state.tables.at(*result.death) = {state.hot.tSec, natural, hardship, arrivals};

        auto& local = site.detailedState;
        auto& history = local.history;
        if (!history) history.emplace();
        const double naturalDeaths = natural.villager.naturalDeaths + natural.stranger.naturalDeaths;
        const double prematureDeaths = hardship + arrivals;
        // Browser history always starts as {deaths: 0}; a missing count is zero.
        auto& deaths = history->deaths.emplace(history->deaths.value_or(0));
        deaths += natural.villager.naturalDeaths;
        deaths += natural.stranger.naturalDeaths;
        if (prematureDeaths + naturalDeaths > 0) {
            history->lastDeathSec = state.hot.tSec;
            history->lastDeathCount = prematureDeaths + naturalDeaths;
            deaths += prematureDeaths;
            practice::EventData event{};
            event.fields.amount = prematureDeaths + naturalDeaths;
            event.fields.premature = prematureDeaths > 0;
            practice::emit(state, practice::EventKind::populationDied, site.regionId, event);
        }
        if (!fullMap && prematureDeaths > 0) {
            const auto resistance = std::min(.75, practice::structure_modifier_total(
                state, site, content::ModifierKind::lossResistance));
            mitigation += prematureDeaths * resistance * settings.prematureDeathChaosWeight;
        }
        // Full-map loss pressure is scoped to player-held towns and the
        // browser discards the legacy Structure mitigation in this mode.
        if (!fullMap) {
            oldAge += natural.villager.naturalDeaths;
            oldAge += natural.stranger.naturalDeaths;
        } else if (regions[site.regionId.value].controller == state.populationVocabulary.factions[2]) {
            oldAge += naturalDeaths;
            premature += prematureDeaths;
        }
        reset_empty_stranger_cohort(state, local.populationByClass.stranger);
    }
    state.hot.rng.seed = rng.seed;
    auto& pending = state.hot.civilization.chaos.pendingLosses;
    pending.prematureDeaths += premature;
    pending.oldAgeDeaths += oldAge;
    pending.prematureDeathMitigation = pending.prematureDeathMitigation.value_or(0) + std::max(0.0, mitigation);
    practice::drain(state);
    return true;
}

}
