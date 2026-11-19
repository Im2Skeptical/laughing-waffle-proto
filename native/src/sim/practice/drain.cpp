#include "sim/practice/recipes.hpp"

#include <charconv>
#include <ranges>

namespace waffle::sim::practice {
namespace {

using namespace detail;
using namespace content;

const PracticeSlot* live_slot(const RuntimeState& state, Candidate candidate)
{
    const auto& site = settlement::site_at(state, candidate.site);
    const auto index = site.detailedState.practiceSlots.slots[candidate.slot];
    if (!index) return nullptr;
    const auto& slot = state.tables.at(index);
    return slot.practiceId == candidate.definition ? &slot : nullptr;
}

bool matches_event(const RuntimeState& state, const Site& site, const PracticeSlot& slot,
                   const PracticeDefinition& def, EventKind kind, PracticeEvent event,
                   const PracticeEventPayload& fields)
{
    const auto& trigger = def.charge->trigger;
    if (trigger.anotherPractice.value_or(false)) {
        const auto instance = fields.instanceId.has_key() ? fields.instanceId.value() : std::nullopt;
        if (instance ? slot.instanceId == instance : fields.practiceId == def.id && event.regionId == site.regionId)
            return false;
    }
    const auto& v = state.practiceVocabulary;
    const auto beneficiary = def.category == Category::influence ? slot.allegiance.value_or(FactionId{})
                                                                 : holder(state, site.regionId);
    const auto faction = fields.faction.has_key() ? fields.faction.value() : std::nullopt;
    if (state.hot.rulesetId && faction && kind == EventKind::defenseSucceeded && *faction != beneficiary)
        return false;
    const auto& t = state.compiledContent->tables;
    const auto& payload = state.pendingPracticePayload;
    const auto sourceHolder = event.regionId ? holder(state, *event.regionId) : FactionId{};
    auto expected = [&](FactionId filter) { return filter == v.beneficiary ? beneficiary : filter; };
    return std::ranges::any_of(t.view(trigger.any), [&](const auto& clause) {
        if (static_cast<unsigned>(trigger_kind(clause)) != static_cast<unsigned>(kind)) return false;
        return std::visit([&](const auto& c) {
            if (event.regionId != site.regionId && c.scope != TriggerScope::civilization) {
                if (!event.regionId) return false;
                if (c.scope == TriggerScope::adjacent) {
                    if (!has(neighbors(state, site.regionId), *event.regionId)) return false;
                } else if (c.scope == TriggerScope::connected) {
                    if (!has(roads(state, site.regionId), *event.regionId)) return false;
                } else return false;
            }
            if constexpr (requires { c.faction; })
                if (c.faction && faction.value_or(sourceHolder) != expected(*c.faction)) return false;
            if constexpr (requires { c.controller; }) {
                if (state.hot.rulesetId && c.controller == v.beneficiary && beneficiary == v.frontier &&
                    event.regionId != site.regionId) return false;
                if (c.controller) {
                    const auto controller = fields.controller.has_key() ? fields.controller.value() : std::nullopt;
                    if (controller.value_or(sourceHolder) != expected(*c.controller)) return false;
                }
            }
            if constexpr (requires { c.traitsAny; })
                if (c.traitsAny && (!fields.traits || !intersects(t.view(*c.traitsAny), payload.view(*fields.traits)))) return false;
            if constexpr (requires { c.tagsAny; })
                if (c.tagsAny && (!fields.tags || !intersects(t.view(*c.tagsAny), payload.view(*fields.tags)))) return false;
            if constexpr (requires { c.scholarStaffed; })
                if (c.scholarStaffed.value_or(false) && !fields.scholarStaffed.value_or(false)) return false;
            if constexpr (requires { c.pool; })
                if (c.pool && fields.pool != v.pools[static_cast<std::size_t>(*c.pool)]) return false;
            if constexpr (requires { c.classId; })
                if (c.classId && (!fields.classId.has_key() ||
                    fields.classId.value() != v.specialties[static_cast<std::size_t>(*c.classId)])) return false;
            if constexpr (requires { c.premature; })
                if (c.premature.value_or(false) && !fields.premature.value_or(false)) return false;
            if constexpr (requires { c.martial; })
                if (c.martial.value_or(false) && !fields.martial.value_or(false)) return false;
            if constexpr (requires { c.actionKindsAny; })
                if (c.actionKindsAny && !std::ranges::any_of(t.view(*c.actionKindsAny), [&](MartialAction action) {
                    return fields.actionKind == v.martialActions[static_cast<std::size_t>(action)];
                })) return false;
            if constexpr (requires { c.minimumSources; })
                if (c.minimumSources.value_or(0) > 0 &&
                    (!fields.sourceRegionIds || fields.sourceRegionIds->size() < *c.minimumSources)) return false;
            return true;
        }, clause);
    });
}

struct Identity {
    std::optional<InstanceId> instance;
    std::uint32_t listener;

    bool operator==(const Identity& other) const
    {
        return instance || other.instance ? instance == other.instance : listener == other.listener;
    }
};

struct Root {
    double id{};
    unsigned events{}, resolutions{};
    bool stopped{};
    std::uint32_t lastDischarge{no_index};
};

struct Resolved {
    Identity identity;
    std::uint32_t previous;
};

struct Deferred {
    std::uint32_t listener;
    Identity identity;
    PracticeEvent event;
    std::size_t payloadIndex;
    bool live{true};
};

struct ReactionScratch {
    std::vector<Root> roots;
    std::vector<Resolved> resolved;
    std::vector<Deferred> deferred;
    std::vector<Provider> providers;
};

ReactionScratch& reaction_scratch()
{
    thread_local ReactionScratch scratch;
    return scratch;
}

void stop_root(RuntimeState& state, Root& root, PracticeEvent event, unsigned cap)
{
    if (root.stopped) return;
    root.stopped = true;
    constexpr std::string_view prefix = "Practice reaction safety cap ";
    constexpr std::string_view suffix = " reached; remaining root events stopped";
    std::array<char, 96> reason;
    auto end = std::ranges::copy(prefix, reason.data()).out;
    end = std::to_chars(end, reason.data() + reason.size(), cap).ptr;
    end = std::ranges::copy(suffix, end).out;
    trace(state, {state.hot.tSec, event_id(state, EventKind::cascadeSafetyCap), {},
                  event.rootId, event.id, 0}, {}, false, {reason.data(), static_cast<std::size_t>(end - reason.data())});
}

void handle_charge(RuntimeState& state, std::uint32_t listener, std::optional<EventKind> kind,
                   PracticeEvent event, const PracticeEventPayload& fields)
{
    const auto candidate = state.practiceListeners.candidates[listener];
    const auto& site = settlement::site_at(state, candidate.site);
    const auto* slot = live_slot(state, candidate);
    const auto controller = holder(state, site.regionId);
    const auto& vocabulary = state.practiceVocabulary;
    if (!slot || site.neutral || settlement::detailed_site(state, site.regionId) != &site ||
        (!state.hot.rulesetId && controller != vocabulary.player && controller != vocabulary.external)) return;
    const auto& def = definition(state, slot->practiceId);
    auto& charge = state.practiceCharge[site.detailedState.practiceSlots.slots[candidate.slot].value];
    const bool gain = kind && (candidate.triggerKinds & mask_bit(*kind)) &&
        matches_event(state, site, *slot, def, *kind, event, fields);
    if (!gain && charge == 0) return;
    const auto worker = workers(state, site)[candidate.slot];
    const auto limit = threshold(state, site, def, worker.scholar);
    charge = std::min(limit, charge);
    if (!gain) return;
    const auto before = charge;
    charge = std::min(limit, charge + charge_gain(state, site, def, worker));
    if (charge <= before) return;
    EventData data{};
    data.fields.targetPracticeId = def.id;
    data.fields.slotIndex = candidate.slot;
    data.fields.amount = charge - before;
    data.fields.charge = charge;
    data.fields.threshold = limit;
    trace(state, {state.hot.tSec, event_id(state, EventKind::chargeGained), site.regionId,
                  event.rootId, event.id, 0}, data);
}

template<class Apply>
void merge_listeners(std::span<const std::uint32_t> remote, Range<std::uint32_t> local, Apply apply)
{
    auto next = remote.begin();
    for (auto row = local.begin; row < local.end; ++row) {
        while (next != remote.end() && *next < row) apply(*next++);
        if (next != remote.end() && *next == row) ++next;
        apply(row);
    }
    for (; next != remote.end(); ++next) apply(*next);
}

}

void rebuild_listeners(RuntimeState& state)
{
    auto& index = state.practiceListeners;
    index.candidates.clear();
    index.local.assign(state.hot.world.regions.size(), {});
    index.dynamicThreshold.clear();
    for (auto& rows : index.remoteByKind) rows.clear();
    const auto& t = state.compiledContent->tables;
    for (const auto id : settlement::active_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        const bool dynamic = std::ranges::any_of(state.tables.view(site.detailedState.structureSlots.origins),
            [&](const auto& cell) {
                const auto& def = definition(state, cell.structureId);
                return def.modifiers && std::ranges::any_of(t.view(*def.modifiers), [](const auto& mod) {
                    return mod.kind == ModifierKind::chargeThresholdReduction;
                });
            });
        auto& local = index.local[site.regionId.value];
        local.begin = checked_index(index.candidates.size(), "Practice listeners");
        const auto& slots = site.detailedState.practiceSlots.slots;
        for (std::uint32_t slot = 0; slot < slots.size(); ++slot) {
            if (!slots[slot]) continue;
            const auto& def = definition(state, state.tables.at(slots[slot]).practiceId);
            if (!def.charge || def.mode != Mode::charge) continue;
            const auto row = checked_index(index.candidates.size(), "Practice listeners");
            if (dynamic || state.practiceCharge[slots[slot].value] > def.charge->threshold)
                index.dynamicThreshold.push_back(row);
            unsigned kinds = 0, remoteKinds = 0;
            for (const auto& clause : t.view(def.charge->trigger.any)) {
                const auto bit = mask_bit(trigger_kind(clause));
                kinds |= bit;
                if (std::visit([](const auto& c) { return c.scope && c.scope != TriggerScope::local; }, clause))
                    remoteKinds |= bit;
            }
            index.candidates.push_back({id, slot, def.id, kinds});
            for (std::size_t i = 0; i < trigger_kind_count; ++i)
                if (remoteKinds & (1u << i)) index.remoteByKind[i].push_back(row);
        }
        local.end = checked_index(index.candidates.size(), "Practice listeners");
    }
}

namespace detail {

void drain_retries(RuntimeState& state, std::span<const Candidate> retries, Activation activation)
{
    auto& journal = state.hot.civilization.practiceEvents;
    if (journal.activeRoot || (journal.pending.size() == 0 && retries.empty())) return;
    auto& scratch = reaction_scratch();
    auto& roots = scratch.roots;
    auto& resolved = scratch.resolved;
    auto& deferred = scratch.deferred;
    roots.clear();
    resolved.clear();
    deferred.clear();
    auto root_for = [&](double id) -> Root& {
        const auto prior = std::ranges::lower_bound(roots, id, {}, &Root::id);
        return prior != roots.end() && prior->id == id ? *prior : *roots.insert(prior, Root{id});
    };
    const auto cap = static_cast<unsigned>(state.compiledContent->settings().practiceReactionResolutionCap);
    auto discharge = [&](std::uint32_t row, PracticeEvent event, std::size_t payloadIndex, Root& root, bool local) {
        if (root.stopped) return;
        const auto candidate = state.practiceListeners.candidates[row];
        const auto* slot = live_slot(state, candidate);
        if (!slot) return;
        const Identity identity{slot->instanceId, row};
        const auto same = [&](const auto& entry, double rootId) {
            return rootId == event.rootId && entry.identity == identity;
        };
        bool already = false;
        for (auto prior = root.lastDischarge; prior != no_index && !already; prior = resolved[prior].previous)
            already = resolved[prior].identity == identity;
        bool blocked = false;
        if (attempt(state, candidate, Activation::charge, local, event, &blocked, already)) {
            for (auto& entry : deferred)
                if (entry.live && same(entry, entry.event.rootId)) entry.live = false;
            const auto index = checked_index(resolved.size(), "Practice Discharges");
            resolved.push_back({identity, root.lastDischarge});
            root.lastDischarge = index;
            if (++root.resolutions >= cap) stop_root(state, root, event, cap);
        } else if (local && blocked && !std::ranges::any_of(deferred, [&](const auto& entry) {
            return entry.live && same(entry, entry.event.rootId);
        })) deferred.push_back({row, identity, event, payloadIndex});
    };

    auto& queue = state.tables.rows<PracticeEvent>();
    const auto& index = state.practiceListeners;
    std::size_t head = journal.pending.begin;
    std::size_t retry = 0;
    std::size_t deferredHead = 0;
    while (true) {
        while (head < journal.pending.end) {
            const auto event = queue[head];
            const auto fields = state.eventPayloads[head];
            auto& root = root_for(event.rootId);
            const auto row = head++;
            if (root.stopped) continue;
            journal.activeRoot = event.rootId;
            journal.activeEvent = event.id;
            trace(state, event, read_event(state, row, scratch.providers), true);

            const auto kind = event.kind.value < index.eventKinds.size() ? index.eventKinds[event.kind.value] : std::nullopt;
            const auto listeners = kind ? std::span<const std::uint32_t>(index.remoteByKind[static_cast<std::size_t>(*kind)])
                                        : std::span<const std::uint32_t>{};
            const auto local = event.regionId && event.regionId->value < index.local.size() ? index.local[event.regionId->value]
                                                                                            : Range<std::uint32_t>{};
            for (auto listener : index.dynamicThreshold)
                if ((listener < local.begin || listener >= local.end) && !std::ranges::binary_search(listeners, listener))
                    handle_charge(state, listener, {}, event, fields);
            merge_listeners(listeners, local, [&](auto listener) { handle_charge(state, listener, kind, event, fields); });
            merge_listeners(listeners, local, [&](auto listener) {
                if (listener < local.begin || listener >= local.end) {
                    const auto candidate = index.candidates[listener];
                    const auto* slot = live_slot(state, candidate);
                    const auto& site = settlement::site_at(state, candidate.site);
                    if (!slot || !matches_event(state, site, *slot, definition(state, slot->practiceId), *kind, event, fields))
                        return;
                }
                discharge(listener, event, row, root, true);
            });
            if (++root.events >= cap) stop_root(state, root, event, cap);
        }
        journal.activeRoot.reset();
        journal.activeEvent.reset();
        if (retry < retries.size()) {
            attempt(state, retries[retry++], activation, false);
            continue;
        }
        while (deferredHead < deferred.size() && !deferred[deferredHead].live) ++deferredHead;
        if (deferredHead == deferred.size()) break;
        const auto candidate = deferred[deferredHead++];
        deferred[deferredHead - 1].live = false;
        auto& root = root_for(candidate.event.rootId);
        if (root.stopped) continue;
        const auto receiver = index.candidates[candidate.listener];
        const auto* slot = live_slot(state, receiver);
        const auto& site = settlement::site_at(state, receiver.site);
        if (!slot) continue;
        if (site.regionId != candidate.event.regionId) {
            const auto& event = candidate.event;
            const auto kind = index.eventKinds[event.kind.value];
            if (!kind || !matches_event(state, site, *slot, definition(state, slot->practiceId), *kind,
                                        event, state.eventPayloads[candidate.payloadIndex])) continue;
        }
        journal.activeRoot = candidate.event.rootId;
        journal.activeEvent = candidate.event.id;
        discharge(candidate.listener, candidate.event, candidate.payloadIndex, root, false);
    }
    queue.clear();
    state.eventPayloads.clear();
    state.pendingPracticePayload.rows<StockProvider>().clear();
    state.pendingPracticePayload.rows<TraitId>().clear();
    state.pendingPracticePayload.rows<TagId>().clear();
    state.pendingPracticePayload.rows<RegionId>().clear();
    journal.pending = {};
}

}

void drain(RuntimeState& state)
{
    detail::drain_retries(state, {}, content::Activation::charge);
}

}
