#include "sim/vassal/vassal.hpp"

#include "sim/vassal/detail.hpp"
#include "sim/settlement/site_access.hpp"

namespace waffle::sim::vassal {
using namespace detail;

namespace {

Vassal* current(RuntimeState& state)
{
    const auto index = state.indexes.currentVassal;
    return index ? &state.tables.at(index).value : nullptr;
}

double mortality_chance(double age)
{
    if (age < 40) return 0;
    if (age < 50) return .005;
    if (age < 60) return .02;
    if (age < 70) return .06;
    if (age < 80) return .15;
    return .35;
}

void enqueue_development(RuntimeState& state, Vassal& actor, std::size_t count)
{
    if (!count) return;
    auto queue = read(state, actor.developmentChoiceQueue);
    auto next = std::max(1.0, whole(actor.nextDevelopmentChoiceId));
    for (std::size_t i = 0; i < count; ++i) {
        const auto excluded = static_cast<std::size_t>(core::rng_next_seed_float(state.hot.rng.vassalDevelopmentSeed)
            * static_cast<double>(statIds.size()));
        browser::VassalDevelopmentChoiceQueueEntry entry;
        entry.choiceId = std::string(state.name(actor.vassalId)) + ":level:" + decimal(next++);
        for (std::size_t j = 0; j < statIds.size(); ++j)
            if (j != excluded) entry.offeredStatIds.emplace_back(statIds[j]);
        queue.push_back(std::move(entry));
    }
    replace(state, actor.developmentChoiceQueue, queue);
    actor.nextDevelopmentChoiceId = next;
}

void finish(RuntimeState& state, Vassal& actor, bool died)
{
    auto& civ = state.hot.civilization;
    auto& lineage = civ.vassalLineage;
    const auto kind = died ? "died"sv : "retired"sv;
    const auto cause = died ? "naturalMortality"sv : ""sv;
    lineage.tenuresRemaining = std::max(0.0, lineage.tenuresRemaining - 1);
    actor.isDead = died;
    actor.endedReason = intern<SymbolId>(state, kind);
    if (died) actor.deathCause = intern<SymbolId>(state, cause);
    else actor.deathCause.reset();
    actor.endSec = whole(state.hot.tSec);
    if (died) actor.deathSec = actor.endSec;
    actor.lifeMap.pendingResolution.reset();
    lineage.currentVassalId.reset();
    state.indexes.currentVassal = {};
    lineage.candidateRerollCount = 0;
    if (!died) {
        const auto classId = actor.classId ? std::optional(intern<SymbolId>(state, class_name(actor))) : std::nullopt;
        state.histories.at(civ.retiredVassals.row).append([&](HistoryPayload&) {
            return CivilizationRetiredVassalsEntry{actor.vassalId, actor.locationRegionId, classId,
                actor.completedCommissions.value_or(0), whole(actor.stats.cunning), whole(actor.stats.wisdom),
                whole(actor.stats.effectiveness), whole(actor.stats.intelligence)};
        });
    }
    add_event(state, actor, kind, {}, {}, {}, {},
        died ? "Died: naturalMortality"sv : "Retired after completing the life map"sv, cause);
    inherit(state, actor);
    if (lineage.tenuresRemaining == 0) {
        state.hot.runStatus = RunStatus{true, browser::RunEndReason::tenuresExhausted, state.hot.year, state.hot.tSec};
        state.hot.paused = true;
        state.hot.phase = browser::Phase::planning;
        replace(state, lineage.pendingCandidates, browser::LineagePendingCandidates{});
    } else {
        generate_candidates(state);
    }
}

bool complete(RuntimeState& state, Vassal& actor)
{
    auto& map = actor.lifeMap;
    const auto pending = *map.pendingResolution;
    const std::string key(state.name(pending.nodeId));
    auto states = read(state, map.nodeStates);
    const auto found = std::ranges::find(states, key, &browser::LifeMapNodeStates::value_type::first);
    if (found == states.end()) return false;
    auto& node = found->second;
    const bool encounter = pending.kind == browser::PendingLifeMapKind::campaignEncounter;
    if (pending.kind == browser::PendingLifeMapKind::shopDelve) return false;
    if (node.selectedOptionId) {
        const auto option = std::ranges::find(node.options, *node.selectedOptionId, &browser::LifeMapOption::id);
        if (option != node.options.end() && option->classAction && option->classAction->onCompletion.value_or(false))
            return false;
    }
    if (!encounter) {
        const auto mods = bonuses(state, actor);
        double territory = 0;
        if (state.hot.rulesetId) {
            for (const auto id : player_sites(state)) {
                const auto& people = settlement::population_totals(state, id).byResidency;
                territory += static_cast<double>((people[0].total() + people[1].total()) / 20);
            }
        }
        const auto income = core::js::round((3 + (has_identity(state, actor, "scholar") ? 0
            : whole(whole(actor.stats.cunning) + mods.cunning)))
            + (node.family == "patronage" ? mods.patronage : 0) + territory);
        if (state.hot.rulesetId) {
            *state.hot.civilization.prestige += income;
            state.hot.civilization.treasury->grossIncome += income;
        } else actor.prestige += income;
        actor.developmentProgress += 2 + whole(whole(actor.stats.wisdom) * mods.wisdomMultiplier)
            + mods.development + (node.family == "crossroads" ? mods.crossroads : 0);
    }
    std::size_t levels = 0;
    while (actor.developmentProgress >= 10) {
        actor.developmentProgress -= 10;
        ++levels;
    }
    const auto yearSec = static_cast<double>(state.hot.seasons.size() == 0 ? 4 : state.hot.seasons.size())
        * std::max(1.0, core::js::floor(state.hot.seasonDurationSec));
    const auto age = whole(actor.initialAge) + whole((whole(state.hot.tSec) - core::js::floor(actor.selectedSec)) / yearSec);
    const auto chance = mortality_chance(age);
    const auto mortalityRoll = roll(state);
    node.mortality = browser::LifeMapNodeStateMortality{age, chance, mortalityRoll};
    node.resolving = false;
    node.resolved = true;
    node.resolvedSec = whole(state.hot.tSec);
    map.pendingResolution.reset();
    if (!encounter) {
        auto& completed = state.histories.at(map.completedNodeIds.row);
        bool recorded = false;
        completed.for_each([&](const NodeId& id, const HistoryPayload&) { recorded |= id == pending.nodeId; });
        if (!recorded) completed.append([&](HistoryPayload&) { return pending.nodeId; });
    }
    bool died = false;
    node.resolutionResult = "survived";
    if (mortalityRoll < chance) {
        if (spend_mandate(state, actor)) {
            node.mandatePreventedDeath = true;
            node.resolutionResult = "mandatePrevented";
            add_event(state, actor, "mandatePrevented", {}, pending.nodeId, {}, {},
                      "Mandate of Heaven prevented natural mortality.", {}, "naturalMortality");
        } else {
            node.resolutionResult = "naturalDeath";
            died = true;
        }
    }
    add_event(state, actor, "nodeResolved", {}, pending.nodeId, *node.resolutionResult, age);
    if (died) {
        replace(state, map.nodeStates, states);
        finish(state, actor, true);
        return true;
    }
    if (encounter) {
        node.resolved = false;
        node.accumulatedPhaseCost = 0;
        node.selectedOptionId.reset();
        node.options = campaign_options(state, actor, node);
        replace(state, map.nodeStates, states);
        return true;
    }
    replace(state, map.nodeStates, states);
    map.currentNodeId.reset();
    browser::StringArray outgoing;
    const auto& graph = read(state, map.graph);
    for (const auto& edge : graph.edges)
        if (edge.fromNodeId == key) outgoing.push_back(edge.toNodeId);
    if (outgoing.empty()) finish(state, actor, false);
    else {
        replace(state, map.availableNodeIds, outgoing);
        enqueue_development(state, actor, levels);
    }
    return true;
}

bool commission_due(const RuntimeState& state, const Vassal& actor)
{
    if (class_name(actor) != "scholar" || actor.isDead || actor.endedReason) return false;
    const auto* goal = actor.commission.has_key() && actor.commission.value()
        ? &*actor.commission.value() : nullptr;
    if (!goal) return !actor.commissionOffers || actor.commissionOffers->size() == 0;
    if (!goal->statId || !goal->startingStat) return false;
    const auto stat = std::ranges::find(statIds, state.name(*goal->statId));
    return stat != statIds.end() && whole(actor.stats.*statMembers[stat - statIds.begin()]) > *goal->startingStat;
}

}

void reindex(RuntimeState& state)
{
    state.nextVassalCheckSec = std::numeric_limits<double>::infinity();
    const auto* actor = current(state);
    if (!actor) return;
    if (actor->lifeMap.pendingResolution)
        state.nextVassalCheckSec = core::js::floor(actor->lifeMap.pendingResolution->resolveSec);
    if (commission_due(state, *actor))
        state.nextVassalCheckSec = std::min(state.nextVassalCheckSec, state.hot.tSec);
}

bool resolve_due(RuntimeState& state)
{
    auto* actor = current(state);
    if (actor) {
        if (commission_due(state, *actor)) return false;
        if (actor->lifeMap.pendingResolution
            && whole(state.hot.tSec) >= core::js::floor(actor->lifeMap.pendingResolution->resolveSec)) {
            if (actor->commission.has_key() && actor->commission.value()
                && state.name(actor->commission.value()->event) == "prestigeGained") return false;
            if (!complete(state, *actor)) return false;
        }
    }
    reindex(state);
    return true;
}

namespace detail {

std::vector<SiteId> player_sites(const RuntimeState& state)
{
    std::vector<SiteId> sites;
    const auto regions = state.tables.view(state.hot.world.regions);
    for (auto id : settlement::detailed_sites(state))
        if (regions[settlement::site_at(state, id).regionId.value].controller == state.practiceVocabulary.player)
            sites.push_back(id);
    return sites;
}

void add_event(RuntimeState& state, Vassal& actor, std::string_view kind,
               const std::string& id, std::optional<NodeId> node, std::string_view result,
               std::optional<double> age, std::string_view text,
               std::optional<std::string_view> deathCause, std::string_view cause)
{
    auto& events = state.histories.at(actor.lifeEvents.row);
    const auto eventId = id.empty() ? std::string(state.name(actor.vassalId)) + ":" +
        std::string(kind) + ":" + std::to_string(events.size()) : id;
    const auto eventKind = intern<EventKindId>(state, kind);
    events.append([&](HistoryPayload& page) {
        const auto token = [&](std::string_view value) -> std::optional<HistoryTextId> {
            return value.empty() ? std::nullopt : std::optional(page.intern_text(value, "Vassal event"));
        };
        using DeathCause = browser::OptionalNullable<HistoryTextId>;
        return VassalLifeEventsEntry{
            .eventId = *token(eventId), .kind = eventKind, .tSec = whole(state.hot.tSec), .text = token(text),
            .nodeId = node, .result = token(result), .age = age,
            .causeOfDeath = !deathCause ? DeathCause{} : deathCause->empty()
                ? DeathCause(std::nullopt) : DeathCause(*token(*deathCause)),
            .cause = token(cause),
        };
    });
}

}
}
