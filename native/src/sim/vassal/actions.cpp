#include "sim/vassal/actions.hpp"

#include "sim/step/action_fields.hpp"
#include "sim/settlement/site_access.hpp"
#include "sim/vassal/detail.hpp"
#include "sim/vassal/vassal.hpp"
#include "sim/world/topology.hpp"

namespace waffle::sim::vassal {
namespace {

using namespace detail;
using namespace action_fields;

Vassal* current(RuntimeState& state)
{
    const auto index = state.indexes.currentVassal;
    return index ? &state.tables.at(index).value : nullptr;
}

bool overflow_pending(const RuntimeState& state)
{
    const auto& pending = state.hot.civilization.vassalLineage.pendingVaultOverflow;
    return pending && !read(state, *pending).empty();
}

ActionResult reroll_candidates(RuntimeState& state)
{
    auto& lineage = state.hot.civilization.vassalLineage;
    if (lineage.currentVassalId) return {"currentVassalAlive"};
    if (overflow_pending(state)) return {"heirloomOverflowPending"};
    lineage.candidateRerollCount = whole(lineage.candidateRerollCount) + 1;
    if (lineage.tenuresRemaining == 0) replace(state, lineage.pendingCandidates, browser::LineagePendingCandidates{});
    else generate_candidates(state);
    return {};
}

template<class Row>
Range<Row> append_row(RuntimeState& state, Range<Row> previous, Row row)
{
    const auto next = state.tables.table<Row>().append(previous.size() + 1, "Vassal selection");
    const auto rows = state.tables.view(next);
    std::ranges::copy(state.tables.view(previous), rows.begin());
    rows.back() = std::move(row);
    return next;
}

template<class Ref>
Ref new_history(RuntimeState& state)
{
    using Storage = typename Ref::Storage;
    auto& rows = state.histories.rows<Storage>();
    const auto index = checked_index(rows.size(), "Vassal history");
    rows.emplace_back();
    return {{index}};
}

ActionResult select_candidate(RuntimeState& state, const Value& payload)
{
    const auto index = number(payload, "candidateIndex");
    if (!index || !std::isfinite(*index)) return {"missingCandidateIndex"};
    auto& lineage = state.hot.civilization.vassalLineage;
    if (lineage.currentVassalId) return {"currentVassalAlive"};
    if (overflow_pending(state)) return {"heirloomOverflowPending"};
    auto pool = read(state, lineage.pendingCandidates);
    const auto slot = std::floor(*index);
    const bool inPool = slot >= 0 && slot < pool.size();
    const auto* override = payload.find("candidateOverride");
    const auto hash = string(payload, "expectedPoolHash");
    if (!hash.empty() || (override && override->kind() != Kind::null && inPool)) {
        auto candidates = browser::export_candidate_pool(pool).as_array();
        // This token is JSON.stringify on live candidate descriptors. Their
        // signature variants retain the original definition insertion order.
        for (auto& source : candidates) {
            const auto* signature = source.find("signatureNode");
            if (!signature || signature->kind() != Kind::object) continue;
            Value::Object fields;
            const auto add = [&](std::string_view key) {
                if (const auto* field = signature->find(key)) fields.push_back({std::string(key), *field});
            };
            const auto variant = string(*signature, "variantId");
            const bool taggedFamily = variant == "foodShop" || variant == "housingShop";
            add("id");
            if (!taggedFamily) add("groupId");
            for (const auto key : {"tag", "removalKind", "label", "glyph", "color", "description"}) add(key);
            if (taggedFamily) add("groupId");
            add("variantId");
            source.set("signatureNode", Value(std::move(fields)));
        }
        if (override && override->kind() != Kind::null && inPool) {
            if (override->kind() != Kind::object) return {"invalidCandidate"};
            Value::Object candidate;
            for (const auto& field : override->as_object())
                if (field.key != "candidateIndex") candidate.push_back(field);
            candidates[static_cast<std::size_t>(slot)] = Value(std::move(candidate));
        }
        const auto data = Value(std::move(candidates));
        if (!hash.empty()) {
            auto actual = core::json::stringify(data);
            if (actual != hash)
                return {"selectionPoolMismatch", Value(Value::Object{{"actualPoolHash", Value(std::move(actual))}})};
        }
        if (override && override->kind() != Kind::null && inPool) {
            try {
                pool = browser::import_candidate_pool(data);
            } catch (const std::invalid_argument&) {
                return {"invalidCandidate"};
            }
        }
    }
    if (!inPool) return {"invalidCandidate"};
    const auto& candidate = pool[static_cast<std::size_t>(slot)];
    const auto sites = player_sites(state);
    if (sites.empty()) return {"noPlayerSettlement"};
    auto location = state.find_id<RegionId>(candidate.locationRegionId);
    if (std::ranges::none_of(sites, [&](SiteId id) { return settlement::site_at(state, id).regionId == location; }))
        location = settlement::site_at(state, sites.front()).regionId;
    const auto idNumber = std::max(1.0, whole(lineage.nextVassalId));
    const auto id = "vassal-" + decimal(idNumber);
    auto seed = state.hot.rng.vassalLifeMapSeed;
    auto graph = action_graph(state, candidate, id, seed);
    if (!graph) return {"lifeMapGenerationUnavailable"};
    state.hot.rng.vassalLifeMapSeed = seed;
    auto actor = Vassal{
        .classId = candidate.classId,
        .archetype = intern<SymbolId>(state, candidate.archetype),
        .candidateId = intern<SymbolId>(state, candidate.candidateId),
        .locationRegionId = location,
        .originRegionId = intern<RegionId>(state, candidate.originRegionId),
        .prestige = candidate.prestige,
        .stats = {candidate.stats.cunning, candidate.stats.wisdom, candidate.stats.effectiveness, candidate.stats.intelligence},
        .portrait = store<decltype(Vassal::portrait)>(state, candidate.portrait),
        .vassalId = intern<VassalId>(state, id),
        .initialAge = whole(candidate.age), .selectedSec = state.hot.tSec,
        .selectedYear = std::max(1.0, whole(state.hot.year)),
        .developmentChoiceQueue = store<decltype(Vassal::developmentChoiceQueue)>(state, browser::VassalDevelopmentChoiceQueue{}),
        .nextDevelopmentChoiceId = 1,
        .lifeMap = {
            .graph = store<decltype(LifeMap::graph)>(state, *graph),
            .completedNodeIds = new_history<decltype(LifeMap::completedNodeIds)>(state),
            .availableNodeIds = store<decltype(LifeMap::availableNodeIds)>(state, graph->entryNodeIds),
            .nodeStates = store<decltype(LifeMap::nodeStates)>(state, browser::LifeMapNodeStates{}),
        },
        .lifeEvents = new_history<decltype(Vassal::lifeEvents)>(state),
        .heirlooms = store<decltype(Vassal::heirlooms)>(state, browser::VassalHeirlooms{}),
    };
    if (candidate.founderClassId) {
        actor.founderClassId = intern<SymbolId>(state, *candidate.founderClassId);
        lineage.founderClassId = *candidate.founderClassId == "scholar" ? browser::SpecialistClass::scholar
                                                                       : browser::SpecialistClass::warrior;
    }
    if (candidate.signatureNode)
        actor.signatureNode = store<decltype(Vassal::signatureNode)::value_type>(state, *candidate.signatureNode);
    const auto name = state.topology ? state.topology->region_name(location) : state.name(location);
    add_event(state, actor, "selected", id + ":selected", {}, {}, {}, "Selected at " + std::string(name));
    ensure_commission_offers(state, actor);
    lineage.nextVassalId = idNumber + 1;
    lineage.currentVassalId = actor.vassalId;
    lineage.selectedVassalIds = append_row(state, lineage.selectedVassalIds, actor.vassalId);
    lineage.vassalsById = append_row(state, lineage.vassalsById, Entry<VassalId, Vassal>{actor.vassalId, std::move(actor)});
    state.indexes.currentVassal = {lineage.vassalsById.end - 1};
    replace(state, lineage.pendingCandidates, browser::LineagePendingCandidates{});
    lineage.candidateRerollCount = 0;
    lineage.pendingHeirloomLoadout = std::ranges::any_of(read(state, state.hot.civilization.heirloomVault),
        [](const auto& item) { return item.has_value(); });
    reindex(state);
    return {};
}

std::optional<std::vector<std::string_view>> requested_items(const Value& payload, std::string_view key)
{
    std::vector<std::string_view> result;
    const auto* ids = payload.find(key);
    if (!ids || ids->kind() == Kind::null) return result;
    if (ids->kind() != Kind::array) return std::nullopt;
    for (const auto& entry : ids->as_array()) {
        if (entry.kind() == Kind::null) continue;
        if (entry.kind() != Kind::string) return std::nullopt;
        const auto& id = entry.as_string();
        if (!id.empty() && std::ranges::find(result, id) == result.end()) result.push_back(id);
    }
    return result;
}

template<class Items>
const browser::Heirloom* find_item(const Items& items, std::string_view id)
{
    // The browser's Map constructor keeps the last entry for duplicate IDs.
    for (auto it = items.rbegin(); it != items.rend(); ++it) {
        if constexpr (std::is_same_v<typename Items::value_type, browser::Heirloom>) {
            if (it->instanceId == id) return &*it;
        } else {
            if (*it && (*it)->instanceId == id) return &**it;
        }
    }
    return nullptr;
}

ActionResult resolve_overflow(RuntimeState& state, const Value& payload)
{
    if (!overflow_pending(state)) return {"overflowUnavailable"};
    auto& civ = state.hot.civilization;
    auto& lineage = civ.vassalLineage;
    const auto wanted = requested_items(payload, "keepInstanceIds");
    browser::VaultSlots vault{};
    if (!wanted || wanted->size() != vault.size()) return {"vaultSelectionRequired"};
    const auto& pending = read(state, *lineage.pendingVaultOverflow);
    for (std::size_t i = 0; i < wanted->size(); ++i) {
        const auto* item = find_item(pending, (*wanted)[i]);
        if (!item) return {"invalidVaultSelection"};
        vault[i] = *item;
    }
    replace(state, civ.heirloomVault, vault);
    lineage.pendingVaultOverflow.reset();
    if (lineage.lastInheritanceReport) {
        auto report = read(state, *lineage.lastInheritanceReport);
        report.overflowRequired = false;
        replace(state, *lineage.lastInheritanceReport, report);
    }
    return {};
}

ActionResult confirm_loadout(RuntimeState& state, const Value& payload)
{
    auto* actor = current(state);
    if (!actor) return {"noCurrentVassal"};
    if (overflow_pending(state)) return {"heirloomOverflowPending"};
    const auto wanted = requested_items(payload, "equippedInstanceIds");
    if (!wanted) return {"invalidLoadout"};
    browser::VassalHeirlooms loadout{};
    if (wanted->size() > loadout.equipped.size()) return {"tooManyEquippedHeirlooms"};
    auto& civ = state.hot.civilization;
    const auto& vault = read(state, civ.heirloomVault);
    for (std::size_t i = 0; i < wanted->size(); ++i) {
        const auto* item = find_item(vault, (*wanted)[i]);
        if (!item) return {"invalidLoadout"};
        auto equipped = *item;
        if (equipped.inheritanceState == browser::InheritanceState::sanctified)
            equipped.inheritanceState = browser::InheritanceState::unmarked;
        equipped.protectionSpent = false;
        loadout.equipped[i] = std::move(equipped);
    }
    browser::VaultSlots remaining{};
    std::size_t slot = 0;
    for (const auto& item : vault)
        if (item && std::ranges::find(*wanted, item->instanceId) == wanted->end()) remaining[slot++] = item;
    replace(state, civ.heirloomVault, remaining);
    replace(state, actor->heirlooms, loadout);
    civ.vassalLineage.pendingHeirloomLoadout = false;
    return {};
}

ActionResult choose_commission(RuntimeState& state, const Value& payload)
{
    auto* actor = current(state);
    if (!actor || class_name(*actor) != "scholar" || actor->isDead || actor->endedReason || actor->lifeMap.pendingResolution)
        return {"commissionUnavailable"};
    const auto wanted = state.find_id<SymbolId>(string(payload, "offerId"));
    const auto offers = state.tables.view(actor->commissionOffers.value_or(Range<CommissionOffer>{}));
    const auto offer = std::ranges::find(offers, wanted, &CommissionOffer::offerId);
    if (offer == offers.end() || (actor->commission.has_key() && actor->commission.value()))
        return {"staleCommissionOffer"};
    ActiveCommission goal{
        .id = offer->id, .difficulty = offer->difficulty,
        .label = store<decltype(goal.label)>(state, read(state, offer->label)),
        .description = store<decltype(goal.description)>(state, read(state, offer->description)),
        .event = offer->event, .prestige = offer->prestige, .offerId = offer->offerId,
        .parameter = offer->parameter, .tag = offer->tag, .statId = offer->statId,
        .regionId = offer->regionId, .minimumQuality = offer->minimumQuality, .nodeFamily = offer->nodeFamily,
        .amount = offer->amount, .acceptedSec = state.hot.tSec,
    };
    if (offer->statLabel) goal.statLabel = store<decltype(goal.statLabel)::value_type>(state, read(state, *offer->statLabel));
    if (offer->locationLabel) goal.locationLabel = store<decltype(goal.locationLabel)::value_type>(state, read(state, *offer->locationLabel));
    if (offer->nodeLabel) goal.nodeLabel = store<decltype(goal.nodeLabel)::value_type>(state, read(state, *offer->nodeLabel));
    if (goal.statId) {
        const auto stat = std::ranges::find(statIds, state.name(*goal.statId));
        if (stat != statIds.end()) goal.startingStat = whole(actor->stats.*statMembers[stat - statIds.begin()]);
    }
    actor->commission = browser::OptionalNullable<ActiveCommission>(goal);
    actor->commissionOffers = Range<CommissionOffer>{};
    reindex(state);
    return {};
}

ActionResult choose_development(RuntimeState& state, const Value& payload)
{
    auto* actor = current(state);
    if (!actor) return {"noCurrentVassal"};
    auto queue = read(state, actor->developmentChoiceQueue);
    if (queue.empty()) return {"noDevelopmentChoice"};
    const auto choice = string(payload, "choiceId");
    if (choice != queue.front().choiceId) return {"staleDevelopmentChoice"};
    const auto id = string(payload, "statId");
    const auto stat = std::ranges::find(statIds, id);
    if (stat == statIds.end() || std::ranges::find(queue.front().offeredStatIds, id) == queue.front().offeredStatIds.end())
        return {"invalidStat"};
    auto& value = actor->stats.*statMembers[stat - statIds.begin()];
    value = whole(value) + 1;
    if (actor->commission.has_key() && actor->commission.value() &&
        state.name(actor->commission.value()->event) == "statIncreased")
        step_commission(state, *actor);
    queue.erase(queue.begin());
    replace(state, actor->developmentChoiceQueue, queue);
    auto& events = state.histories.at(actor->lifeEvents.row);
    const auto eventId = std::string(state.name(actor->vassalId)) + ":developmentChosen:" + std::to_string(events.size());
    const auto kind = intern<EventKindId>(state, "developmentChosen");
    events.append([&](HistoryPayload& page) {
        return VassalLifeEventsEntry{
            .eventId = page.intern_text(eventId, "Development choice"), .kind = kind, .tSec = state.hot.tSec,
            .choiceId = page.intern_text(choice, "Development choice"), .statId = page.intern_text(id, "Development stat"),
        };
    });
    reindex(state);
    return {};
}

}

ActionResult apply_action(RuntimeState& state, const Action& action)
{
    const auto& kind = action.kind;
    const auto& payload = action.payload;
    if (kind == "settlementRerollVassals") return reroll_candidates(state);
    if (kind == "settlementSelectVassal") return select_candidate(state, payload);
    if (kind == "vassalResolveVaultOverflow") return resolve_overflow(state, payload);
    if (kind == "vassalConfirmHeirloomLoadout") return confirm_loadout(state, payload);
    if (kind == "vassalChooseCommission") return choose_commission(state, payload);
    if (kind == "vassalChooseDevelopmentStat") return choose_development(state, payload);
    return apply_node_action(state, action);
}

}
