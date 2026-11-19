#include "timegraph/summary.hpp"

#include "core/js_math.hpp"
#include "sim/practice/stock.hpp"
#include "sim/territory/detail.hpp"

#include <algorithm>

namespace waffle::timegraph {
namespace {

using namespace sim;
using namespace sim::runtime;
using namespace sim::practice::detail;
using settlement::Residency;
constexpr std::array residencies{Residency::villager, Residency::stranger};

// The sim's cached assignments keep total tokens and effectiveness. The plot
// needs the residency split, so reproduce the ordered staffing selection.
std::array<double, 2> assigned_by_residency(const RuntimeState& state, const Site& site)
{
    std::array<double, 2> assigned{};
    const auto board = state.tables.view(site.detailedState.practiceSlots.rows);
    if (board.empty()) return assigned;
    struct Socket {
        const PracticeSlot* slot;
        double capacity;
        bool required, influence, scholar{};
    };
    Buffer<Socket, 5> sockets;
    for (const auto& slot : board) {
        const auto& def = definition(state, slot.practiceId);
        if (def.workerCapacity > 0)
            sockets.push_back({&slot, def.workerCapacity, def.scholarRequired.value_or(false),
                               def.category == content::Category::influence});
    }
    const auto& pop = site.detailedState.populationByClass;
    const auto per = std::max(1.0, state.compiledContent->settings().populationPerToken);
    const auto assign = [&](Socket& socket, std::size_t residency, double& people, bool scholar, double cost) {
        while (people >= cost && socket.capacity > 0 && (!scholar || !socket.scholar)) {
            socket.scholar |= scholar;
            --socket.capacity;
            ++assigned[residency];
            people -= cost;
        }
    };

    if (!pop.villager.joint && !pop.stranger.joint) {
        std::array<double, 2> scholars{};
        for (std::size_t i = 0; i < residencies.size(); ++i) {
            const auto& cohort = settlement::population_class(pop, residencies[i]);
            const auto view = settlement::cohort_view(state, cohort.specialists.scholar);
            scholars[i] = static_cast<double>(settlement::cohort_total(view) - view.children);
            auto remaining = scholars[i];
            for (bool required : {true, false})
                for (auto& socket : sockets)
                    if (socket.required == required) assign(socket, i, remaining, true, 1);
        }
        for (std::size_t i = 0; i < residencies.size(); ++i) {
            const auto& totals = state.indexes.sites[site.id.value].byResidency[i];
            auto remaining = core::js::floor(
                std::max(0.0, static_cast<double>(totals.adults + totals.elders) - scholars[i]) / per);
            for (auto& socket : sockets) assign(socket, i, remaining, false, 1);
        }
        return assigned;
    }

    struct Group {
        FactionId faction;
        std::size_t residency;
        double scholars{}, ordinary{};
    };
    Buffer<Group, 6> groups;
    for (std::size_t i = 0; i < residencies.size(); ++i) {
        const auto bins = settlement::population_bins(state, pop, residencies[i]);
        for (std::size_t j = 0; j < bins.size(); ++j) {
            const auto bin = bins[j];
            if (bin.key.kind == state.populationVocabulary.stages[1]) continue;
            auto group = std::find_if(groups.begin(), groups.end(), [&](const Group& row) {
                return row.faction == bin.key.allegiance && row.residency == i;
            });
            if (group == groups.end()) {
                groups.push_back({bin.key.allegiance, i});
                group = groups.end() - 1;
            }
            (bin.key.specialty == state.populationVocabulary.specialties[1]
                ? group->scholars : group->ordinary) += static_cast<double>(bin.count);
        }
    }
    for (bool influence : {true, false}) for (bool scholar : {true, false}) for (auto& group : groups) {
        auto& remaining = scholar ? group.scholars : group.ordinary;
        for (auto& socket : sockets) {
            if (socket.influence != influence ||
                (influence && (group.faction == state.practiceVocabulary.neutral ||
                               group.faction != socket.slot->allegiance))) continue;
            assign(socket, group.residency, remaining, scholar, scholar ? 1 : per);
        }
    }
    return assigned;
}

void read_local_resources(const RuntimeState& state, const Site& site, SiteSummary& row)
{
    const auto& vocabulary = state.practiceVocabulary;
    const auto addStock = [&](auto traits, double amount) {
        const auto stock = std::max(0.0, amount);
        if (has(traits, vocabulary.edible)) row.food += stock;
        if (has(traits, vocabulary.currency)) row.currency += stock;
    };
    if (site.neutral) {
        const auto& market = state.tables.at(*site.neutral);
        row.housing = market.housing;
        for (const auto& stock : state.tables.view(market.stocks))
            addStock(state.tables.view(stock.traits), stock.stock);
        return;
    }
    const auto& detail = site.detailedState;
    const auto& stockRows = state.tables.rows<PracticeSlot>();
    for (auto slot : detail.practiceSlots.slots) {
        if (!slot) continue;
        const auto& stock = stockRows[slot.value];
        addStock(state.compiledContent->tables.view(definition(state, stock.practiceId).stockTraits),
                 state.practiceStock[slot.value].value_or(0));
    }
    const auto& housing = state.content->migration.structureHousing;
    for (const auto& cell : state.tables.view(detail.structureSlots.origins)) {
        if (cell.construction || cell.structureId.value >= housing.size()) continue;
        const auto quality = 1 + .25 * std::max(0.0, cell.qualityBonus.value_or(0));
        row.housing += core::js::floor(housing[cell.structureId.value] * quality);
    }
}

void read_vassal_markers(const RuntimeState& state, SummaryHeader& row)
{
    const auto& lineage = state.hot.civilization.vassalLineage;
    for (const auto& entry : state.tables.view(lineage.vassalsById)) {
        const auto& vassal = entry.value;
        if (entry.key == lineage.currentVassalId.value_or(VassalId{})) {
            row.currentVassal = vassal.vassalId;
            if (vassal.lifeMap.pendingResolution)
                row.currentVassalResolutionSecond = core::js::floor(vassal.lifeMap.pendingResolution->resolveSec);
        }
        if (has(state.tables.view(lineage.selectedVassalIds), entry.key))
            row.latestVassalEndSecond = std::max(row.latestVassalEndSecond,
                core::js::floor(vassal.endSec.value_or(vassal.deathSec.value_or(0))));
    }
}

}

SummaryHeader summarize(const sim::RuntimeState& state, std::span<SiteSummary> regions)
{
    if (regions.size() != state.hot.world.regions.size())
        throw std::invalid_argument("summary span must match the world region count");
    std::ranges::fill(regions, SiteSummary{});
    SummaryHeader row;
    row.second = state.hot.tSec;
    row.year = state.hot.year;
    const auto& civ = state.hot.civilization;
    row.prestige = civ.prestige.value_or(0);
    row.chaosPower = civ.chaos.chaosPower.value_or(0);
    row.monsterCount = civ.chaos.monsterCount;
    if (civ.chaos.lastMoonIncome) row.chaosRawPressure = civ.chaos.lastMoonIncome->rawPressure.value_or(0);
    if (territory::terminal(state)) {
        row.terminal = state.hot.runStatus->reason;
        row.lossSecond = state.hot.runStatus->tSec;
        row.lossYear = state.hot.runStatus->year;
    }
    read_vassal_markers(state, row);

    const auto& settings = state.compiledContent->settings();
    std::array<double, 4> faithPopulation{};
    double happinessPopulation = 0;
    auto& chronicle = row.chronicle;
    chronicle.controlSignature = 2166136261u;
    for (const auto& region : state.tables.view(state.hot.world.regions)) {
        chronicle.controlledRegions += region.controller == state.practiceVocabulary.player;
        chronicle.controlSignature = (chronicle.controlSignature ^ region.controller.value) * 16777619u;
        if (region.lostAtSec == row.second && chronicle.raids < 65535) ++chronicle.raids;
    }
    if (civ.currentMoonTurn && civ.currentMoonTurn->movements.size()) {
        const auto moves = state.tables.view(civ.currentMoonTurn->movements);
        if (moves.front().transferSecond == row.second)
            chronicle.migrations = static_cast<std::uint16_t>(std::min<std::size_t>(65535, moves.size()));
    }
    double deaths = 0;
    for (const auto id : state.indexes.detailedSites) {
        const auto& site = settlement::site_at(state, id);
        const auto& region = territory::region_at(state, site.regionId);
        const auto controller = region.controller;
        const auto player = controller == state.practiceVocabulary.player;
        auto& local = regions[site.regionId.value];
        const auto& detail = site.detailedState;
        if (detail.history && detail.history->lastDeathSec == row.second)
            deaths += detail.history->lastDeathCount.value_or(0);
        if (detail.lastDefense && detail.lastDefense->tSec == row.second && region.lostAtSec != row.second &&
            chronicle.raids < 65535)
            ++chronicle.raids;
        read_local_resources(state, site, local);
        const auto assigned = assigned_by_residency(state, site);
        const auto& totals = state.indexes.sites[id.value].byResidency;
        for (std::size_t i = 0; i < residencies.size(); ++i) {
            const auto& cohort = settlement::population_class(site.detailedState.populationByClass, residencies[i]);
            auto& series = local.residency[i];
            series.workers.population = static_cast<double>(totals[i].total());
            series.workers.freeWorkers = std::max(0.0, static_cast<double>(totals[i].adults + totals[i].elders) - assigned[i]);
            local.population += series.workers.population;
            const auto& tiers = state.faithStage.faith;
            const auto tier = std::ranges::find(tiers, cohort.faith.tier);
            if (cohort.faith.tier && tier != tiers.end()) {
                const auto index = tier - tiers.begin();
                series.faith = static_cast<double>(index + 1) * 25;
                if (player) faithPopulation[index] += series.workers.population;
            }
            const auto status = cohort.happiness.status;
            if (status && status == state.faithStage.happiness[0]) series.happiness = 0;
            if (status && status == state.faithStage.happiness[2]) series.happiness = 100;
            if (player) {
                row.residency[i].population += series.workers.population;
                row.residency[i].freeWorkers += series.workers.freeWorkers;
                happinessPopulation += series.happiness * series.workers.population;
            }
        }
        if (state.hot.rulesetId) {
            const auto pop = territory::resistance(state, site, controller);
            local.loyalSharePercent = pop.total > 0 ? 100 * (pop.loyal / pop.total) : 0;
            local.requiredForce = pop.loyal > 0 ? std::max(0.0,
                territory::holding_pressure(pop) * (.70 * pop.total / pop.loyal - 1)) : 0;
            local.holdingForce = territory::military(state, site.regionId, controller).force;
            const auto& control = site.detailedState.control;
            if (control && control->unrest) local.unrestYears = std::max(0.0, control->unrest->untilSec - row.second) /
                (4 * settings.seasonDurationSec);
        }
        if (player) {
            row.population += local.population;
            row.food += local.food;
            row.currency += local.currency;
            row.housing += local.housing;
        }
    }
    chronicle.deaths = static_cast<std::uint16_t>(std::clamp(deaths, 0.0, 65535.0));
    if (row.population > 0) {
        const double faith = 25 * faithPopulation[0] + 50 * faithPopulation[1] +
            75 * faithPopulation[2] + 100 * faithPopulation[3];
        chronicle.faith = static_cast<float>(faith / row.population);
        chronicle.happiness = static_cast<float>(happinessPopulation / row.population);
    }
    const auto resistance = 0.0 + faithPopulation[0] / settings.bronzeChaosResistancePopulation +
        faithPopulation[1] / settings.silverChaosResistancePopulation +
        faithPopulation[2] / settings.goldChaosResistancePopulation +
        faithPopulation[3] / settings.diamondChaosResistancePopulation;
    const auto unrounded = resistance * settings.populationChaosResistanceMultiplier + civ.phaseModifiers.faithResistance;
    row.chaosResistance = std::max(0.0, core::js::round(unrounded * 100000) / 100000);
    return row;
}

}
