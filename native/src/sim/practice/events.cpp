#include "sim/practice/detail.hpp"

namespace waffle::sim::practice {
namespace detail {
namespace {

constexpr std::array<std::string_view, static_cast<std::size_t>(EventKind::count)> eventNames{
    "monsterSpawn", "monsterPressure", "stockGenerated", "stockConsumed", "chaosIncreased",
    "candidateDevelopment", "supportContributed", "martialActionResolved", "populationDied",
    "monsterDestroyed", "defenseSucceeded", "practiceInstalled", "dangerSurvived", "campaignWon",
    "externalTrade", "challengeCompleted", "settlementLost", "crisisResolved",
    "scheduledActivation", "practiceResolved", "phaseResolved", "candidateDevelopmentBanked",
    "populationConverted", "activated", "discharged", "chargeGained", "cascadeDeferred",
    "dischargeBlocked", "cascadeSafetyCap",
};
constexpr std::array<std::string_view, 10> activationNames{
    "season", "birth", "food", "housing", "faith", "migration", "death", "charge", "passive", "crisis",
};
constexpr std::array<std::string_view, 4> seasonNames{"spring", "summer", "autumn", "winter"};
constexpr std::array<std::string_view, 3> poolNames{"common", "scholar", "warrior"};
constexpr std::array<std::string_view, 2> specialtyNames{"scholar", "warrior"};
constexpr std::array<std::string_view, 2> residencyNames{"villager", "stranger"};
constexpr std::array<std::string_view, 4> actionNames{"campaign", "defense", "hunt", "conquest"};

template<class Key, std::size_t N>
void initialize(RuntimeState& state, std::array<Key, N>& target,
                const std::array<std::string_view, N>& names)
{
    for (std::size_t index = 0; index < N; ++index)
        target[index] = state.intern<Key>(names[index], "Practice vocabulary");
}

template<class Key>
browser::OptionalNullable<Key> nullable(Key id)
{
    return id ? browser::OptionalNullable<Key>{id} : browser::OptionalNullable<Key>{std::nullopt};
}

template<class T, class Allocator>
void reserve(std::vector<T, Allocator>& rows, std::size_t count)
{
    rows.reserve(rows.size() + count);
}

PracticeEventTrace trace_fields(PracticeEvent event, const PracticeEventPayload& p, bool includeId)
{
    return {
        .tSec = event.tSec,
        .kind = event.kind,
        .regionId = event.regionId,
        .targetPracticeId = p.targetPracticeId,
        .slotIndex = p.slotIndex,
        .rootId = event.rootId,
        .parentId = event.parentId,
        .practiceId = p.practiceId,
        .id = includeId ? std::optional(event.id) : std::nullopt,
        .amount = p.amount,
        .scholarStaffed = p.scholarStaffed,
        .discharge = p.discharge,
        .premature = p.premature,
        .faction = p.faction,
        .controller = p.controller,
        .instanceId = p.instanceId,
        .targetRegionId = p.targetRegionId,
        .structureId = p.structureId,
        .previousController = p.previousController,
        .military = p.military,
        .untilSec = p.untilSec,
        .sourceRegionId = p.sourceRegionId,
        .strengthBefore = p.strengthBefore,
        .strengthAfter = p.strengthAfter,
        .martial = p.martial,
        .charge = p.charge,
        .threshold = p.threshold,
    };
}

void trace_text(const RuntimeState& state, HistoryPayload& page, PracticeEventTrace& row,
                const PracticeEventPayload& p, std::string_view reason)
{
    auto text = [&](const auto& id) -> std::optional<HistoryTextId> {
        if (!id) return {};
        return page.intern_text(state.name(*id), "Practice trace");
    };
    row.activationType = text(p.activationType);
    row.pool = text(p.pool);
    row.phase = text(p.phase);
    row.reason = reason.empty() ? text(p.reason) : page.intern_text(reason, "Practice trace reason");
    row.cause = text(p.cause);
    row.actionKind = text(p.actionKind);
    row.action = text(p.action);
    row.outcome = text(p.outcome);
    row.destinationId = text(p.destinationId);
    if (p.classId.has_key()) {
        const auto id = text(p.classId.value());
        row.classId = id ? browser::OptionalNullable<HistoryTextId>{*id}
                         : browser::OptionalNullable<HistoryTextId>{std::nullopt};
    }
}

template<class Build>
void append_trace(RuntimeState& state, PracticeEvent event, const Build& build)
{
    const auto& arena = state.practiceRecipeStorage.historyArena;
    state.histories.at(state.hot.civilization.practiceEvents.trace.row).append(build, arena);
    if (!event.regionId || event.regionId->value >= state.indexes.sitesByRegion.size()) return;
    const auto siteId = state.indexes.sitesByRegion[event.regionId->value];
    if (!siteId) return;
    auto& reference = settlement::site_at(state, siteId).detailedState.practiceActivationTrace;
    if (!reference) {
        using Ref = std::remove_reference_t<decltype(reference)>::value_type;
        reference = Ref{{state.histories.table<typename Ref::Storage>().append(1, "Practice history").begin}};
    }
    state.histories.at(reference->row).append(build, arena);
}

}

void admit(RuntimeState& state)
{
    auto& v = state.practiceVocabulary;
    initialize(state, v.events, eventNames);
    auto& kinds = state.practiceListeners.eventKinds;
    for (std::size_t i = 0; i < trigger_kind_count; ++i) {
        const auto key = v.events[i].value;
        if (key >= kinds.size()) kinds.resize(key + 1);
        kinds[key] = static_cast<EventKind>(i);
    }
    initialize(state, v.activations, activationNames);
    initialize(state, v.seasons, seasonNames);
    initialize(state, v.pools, poolNames);
    initialize(state, v.specialties, specialtyNames);
    initialize(state, v.residencies, residencyNames);
    initialize(state, v.martialActions, actionNames);
    auto sym = [&](std::string_view name) { return state.intern<SymbolId>(name, "Practice vocabulary"); };
    v.consume = sym("consume");
    v.require = sym("require");
    v.sacrifice = sym("sacrifice");
    v.alreadyDischarged = sym("Already Discharged in this root chain");
    v.capacityFull = sym("Stock capacity is full");
    v.noTraining = sym("No unclassed adults available for training");
    v.unmetCondition = sym("State / population requirements not satisfied");
    v.requiresScholar = sym("Requires a Scholar worker");
    v.noExternalTarget = sym("No eligible external target");
    v.player = state.intern<FactionId>("player", "Practice faction");
    v.frontier = state.intern<FactionId>("frontier", "Practice faction");
    v.external = state.intern<FactionId>("external-a", "Practice faction");
    v.neutral = state.intern<FactionId>("neutral", "Practice faction");
    v.beneficiary = state.intern<FactionId>("beneficiary", "Practice faction");
    v.knowledge = state.intern<TagId>("Knowledge", "Practice tag");
    v.food = state.intern<TagId>("Food", "Practice tag");
    v.currency = state.intern<TraitId>("Currency", "Practice trait");
    v.edible = state.intern<TraitId>("Edible", "Practice trait");
    v.record = state.intern<TraitId>("Record", "Practice trait");
    for (const auto& region : state.tables.view(state.hot.world.regions))
        v.regionSymbols.push_back(sym(state.name(region.id)));
    for (const auto& row : state.tables.rows<NeutralStock>())
        v.marketLabels.push_back(sym(state.cold.at(row.label.row).get()));

    const auto events = state.hot.world.sites.size() * 20u;
    reserve(state.tables.rows<PracticeEvent>(), events);
    reserve(state.eventPayloads, events);
    reserve(state.pendingPracticePayload.rows<TraitId>(), events * 3);
    reserve(state.pendingPracticePayload.rows<TagId>(), events * 3);
    reserve(state.pendingPracticePayload.rows<StockProvider>(), events * 3);
    reserve(state.pendingPracticePayload.rows<RegionId>(), events);
    auto& siteTraces = state.histories.rows<History<PracticeEventTrace, 100, DetailedSettlement_practiceActivationTrace>>();
    reserve(siteTraces, state.hot.world.sites.size());
    reserve(state.histories.rows<History<StockTransfersTransfersEntry, 0, PracticeEventJournalStockTransfers_transfers>>(), 1);
    // Keep provider capacity for additional live trace pages as sparse site
    // histories fill. Budget separate pages for site and civilization traces
    // and for the writer to detach from an anchor.
    const auto& historyArena = state.practiceRecipeStorage.historyArena;
    std::vector<void*> providerBlocks(state.hot.world.sites.size() * 3);
    for (std::size_t count = 1; count <= 16; count *= 2) {
        const auto bytes = count * sizeof(StockProvider);
        for (auto& block : providerBlocks) block = historyArena->allocate(bytes, alignof(StockProvider));
        for (auto* block : providerBlocks) historyArena->deallocate(block, bytes, alignof(StockProvider));
    }
    prepare_recipe_storage(state);
    rebuild_listeners(state);
}

void trace(RuntimeState& state, PracticeEvent event, const EventData& data,
           bool includeId, std::string_view dynamicReason)
{
    const auto fields = trace_fields(event, data.fields, includeId);
    append_trace(state, event, [&](PracticeEventTrace& row, HistoryPayload& page) {
        row = fields;
        trace_text(state, page, row, data.fields, dynamicReason);
        if (data.providers) row.providers = store_providers(page, *data.providers);
        if (data.traits) row.traits = store(page, *data.traits);
        if (data.tags) row.tags = store(page, *data.tags);
        if (data.sources) row.sourceRegionIds = store(page, *data.sources);
    });
}

void trace_pending(RuntimeState& state, PracticeEvent event, std::size_t index)
{
    const auto& p = state.eventPayloads[index];
    const auto& payload = state.pendingPracticePayload;
    const auto fields = trace_fields(event, p, true);
    append_trace(state, event, [&](PracticeEventTrace& row, HistoryPayload& page) {
        row = fields;
        trace_text(state, page, row, p, {});
        if (p.providers) {
            auto& providers = page.rows<StockProvider>();
            const auto start = checked_index(providers.size(), "Practice providers");
            for (auto provider : payload.view(*p.providers)) {
                provider.traits = store(page, payload.view(provider.traits));
                if (provider.substitution) provider.substitution = store(page, payload.view(*provider.substitution));
                providers.push_back(provider);
            }
            row.providers = Range<StockProvider>{start, checked_index(providers.size(), "Practice providers")};
        }
        if (p.traits) row.traits = store(page, payload.view(*p.traits));
        if (p.tags) row.tags = store(page, payload.view(*p.tags));
        if (p.sourceRegionIds) row.sourceRegionIds = store(page, payload.view(*p.sourceRegionIds));
    });
}

}

runtime::PracticeEvent emit(RuntimeState& state, EventKind kind,
                            std::optional<runtime::RegionId> region, EventData data)
{
    return emit(state, detail::event_id(state, kind), region, data);
}

runtime::PracticeEvent emit(RuntimeState& state, runtime::EventKindId kind,
                            std::optional<runtime::RegionId> region, EventData data)
{
    using namespace detail;
    auto& journal = state.hot.civilization.practiceEvents;
    auto& p = data.fields;
    FactionId defaultFaction;
    if (state.hot.rulesetId) {
        const auto controller = region ? holder(state, *region) : FactionId{};
        const PracticeSlot* slot = nullptr;
        if (region && region->value < state.indexes.sitesByRegion.size()) {
            const auto site = state.indexes.sitesByRegion[region->value];
            if (site) {
                const auto& board = settlement::site_at(state, site).detailedState.practiceSlots;
                if (p.slotIndex && *p.slotIndex >= 0 && *p.slotIndex < board.slots.size()) {
                    const auto row = board.slots[static_cast<std::size_t>(*p.slotIndex)];
                    if (row) slot = &state.tables.at(row);
                }
                if (!slot && p.practiceId) {
                    const auto rows = state.tables.view(board.rows);
                    const auto found = std::ranges::find(rows, *p.practiceId, &PracticeSlot::practiceId);
                    if (found != rows.end()) slot = &*found;
                }
            }
        }
        defaultFaction = slot ? slot->allegiance.value_or(controller) : controller;
        if (!p.controller.has_key()) p.controller = nullable(controller);
        if (!p.faction.has_key()) p.faction = nullable(defaultFaction);
        if (!p.instanceId.has_key()) p.instanceId = nullable(slot ? slot->instanceId.value_or(InstanceId{}) : InstanceId{});
    }
    const auto attributedFaction = p.faction.has_key() ? p.faction.value().value_or(defaultFaction) : defaultFaction;
    if (kind == event_id(state, EventKind::monsterDestroyed) &&
        (!state.hot.rulesetId || attributedFaction == state.practiceVocabulary.player))
        ++state.hot.civilization.history.monsterTrophies;
    const auto id = journal.nextId++;
    PracticeEvent event{state.hot.tSec, kind, region,
                        journal.activeRoot.value_or(id), journal.activeEvent, id};
    auto& arena = state.pendingPracticePayload;
    if (data.providers) p.providers = store_providers(arena, *data.providers);
    if (data.traits) p.traits = store(arena, *data.traits);
    if (data.tags) p.tags = store(arena, *data.tags);
    if (data.sources) p.sourceRegionIds = store(arena, *data.sources);
    state.tables.rows<PracticeEvent>().push_back(event);
    state.eventPayloads.push_back(p);
    journal.pending.end = checked_index(state.eventPayloads.size(), "Practice events");
    return event;
}

}
