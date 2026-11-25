#include "sim/vassal/actions.hpp"
#include "sim/vassal/presentation.hpp"

#include "sim/practice/detail.hpp"
#include "sim/practice/stock.hpp"
#include "sim/settlement/site_access.hpp"
#include "sim/step/action_fields.hpp"
#include "sim/vassal/action_choices.hpp"
#include "sim/vassal/action_structures.hpp"
#include "sim/vassal/detail.hpp"
#include "sim/vassal/vassal.hpp"

#include <numeric>
#include <ranges>

namespace waffle::sim::vassal {
namespace {

using namespace detail;
using namespace action_fields;
using Node = browser::LifeMapNodeState;
using Receipt = browser::PurchaseReceipt;

bool is_shop(const Node& node)
{
    constexpr std::array families{"practiceReform"sv, "publicWorks"sv, "neutralMarket"sv,
        "classMarket"sv, "foodShop"sv, "housingShop"sv, "stockShop"sv};
    return node.contentMode == "shop" || std::ranges::find(families, node.family) != families.end();
}

bool needs_specialty(const Node& node)
{
    return node.shopSelection.has_key() && node.shopSelection.value() && !node.shopSelection.value()->selectedTag;
}

bool has_heirloom(const RuntimeState& state, const Vassal& actor, std::string_view id)
{
    return std::ranges::any_of(read(state, actor.heirlooms).equipped,
        [&](const auto& item) { return item && item->definitionId == id; });
}

double prestige_cost(const RuntimeState& state, const Vassal& actor, double base, bool first = false)
{
    const auto stat = has_identity(state, actor, "warrior") ? 0 :
        whole(actor.stats.intelligence) + has_heirloom(state, actor, "abacus");
    auto cost = std::ceil(std::max(0.0, base) * (1 - std::min(.6, stat * .08)));
    if (first) {
        if (has_heirloom(state, actor, "royalWarrant")) cost = std::ceil(cost * (1 - .8));
        else if (has_heirloom(state, actor, "minorSeal")) cost = std::ceil(cost * (1 - .35));
    }
    return cost;
}

double phase_cost(const RuntimeState& state, const Vassal& actor, const Node& node, double base, bool travel = false)
{
    if (base <= 0) return 0;
    auto cost = std::max(1.0, std::ceil(base * (1 - std::min(.6, whole(actor.stats.effectiveness) * .08))));
    if (travel && has_heirloom(state, actor, "travellersBoots")) cost = std::ceil(cost * .7);
    if (!node.heirloomTimeActionUsed.value_or(false) && has_heirloom(state, actor, "hourglass"))
        cost = std::ceil(cost * .5);
    if (has_heirloom(state, actor, "crownOfAges")) cost = std::ceil(cost * .5);
    return cost;
}

double& prestige(RuntimeState& state, Vassal& actor)
{
    return state.hot.rulesetId ? *state.hot.civilization.prestige : actor.prestige;
}

void begin_resolution(RuntimeState& state, Vassal& actor, Node& node, NodeId id,
                      browser::PendingLifeMapKind kind, double cost)
{
    const auto sec = state.hot.tSec;
    node.resolving = true;
    if (kind != browser::PendingLifeMapKind::shopDelve) node.confirmedSec = sec;
    actor.lifeMap.pendingResolution = LifeMapPendingResolution{kind, id, sec,
        sec + cost * state.compiledContent->settings().phaseDurationSec, cost};
}

ActionResult enter(RuntimeState& state, Vassal* actor, std::string_view id)
{
    if (!actor) return {"noCurrentVassal"};
    if (actor->commissionOffers && actor->commissionOffers->size() > 0) return {"commissionRequired"};
    if (state.hot.civilization.vassalLineage.pendingHeirloomLoadout) return {"heirloomLoadoutRequired"};
    if (!read(state, actor->developmentChoiceQueue).empty()) return {"developmentChoiceRequired"};
    auto& map = actor->lifeMap;
    if (map.pendingResolution) return {"resolutionPending"};
    if (map.currentNodeId) return {"nodeAlreadyActive"};
    const auto& available = read(state, map.availableNodeIds);
    if (std::ranges::find(available, id) == available.end()) return {"nodeUnavailable"};
    const auto& graph = read(state, map.graph);
    const auto card = std::ranges::find(graph.nodes, id, &browser::LifeMapGraphNode::id);
    if (card == graph.nodes.end()) return {"invalidNode"};
    if (card->family == "campaign" && class_name(*actor) != "warrior") return {"warriorRequired"};
    auto nodes = read(state, map.nodeStates);
    if (std::ranges::find(nodes, id, &browser::LifeMapNodeStates::value_type::first) == nodes.end()) {
        Node node{.nodeId = card->id, .family = card->family, .signatureNode = card->signatureNode,
            .contentMode = "choice", .entered = true, .enteredSec = state.hot.tSec, .stockOutput = card->stockOutput};
        if (node.family == "relic") node.specialRelic = card->specialRelic.value_or(false);
        if (is_shop(node)) {
            node.contentMode = "shop";
            node.shopSelection = shop_specialties(state, *actor, node);
            node.inventory = shop_inventory(state, *actor, node);
        } else if (node.signatureNode &&
            (node.signatureNode->groupId == "tagShop" || node.signatureNode->groupId == "removal")) {
            node.contentMode = "shop";
            node.inventory = shop_inventory(state, *actor, node);
            if (node.signatureNode->groupId == "removal" && node.inventory.empty()) {
                node.contentMode = "choice";
                node.options.push_back({.id = "removalFallback", .label = "Reorganize Local Affairs",
                    .phaseCost = 0, .prestigeDelta = 10});
            }
        } else if (node.family == "campaign" ||
                   (node.signatureNode && node.signatureNode->variantId == "monsterHunt" && class_name(*actor) == "warrior")) {
            node.family = "campaign";
            node.campaign = browser::LifeMapNodeStateCampaign{.mode = "attack"};
            node.options = campaign_options(state, *actor, node);
        } else if (!create_node_choices(state, *actor, node)) return {"nodeFamilyNotPorted"};
        nodes.emplace_back(card->id, std::move(node));
        replace(state, map.nodeStates, nodes);
    }
    map.currentNodeId = intern<NodeId>(state, id);
    replace(state, map.availableNodeIds, browser::StringArray{});
    add_event(state, *actor, "nodeEntered", std::string(state.name(actor->vassalId)) + ":enter:" + card->id,
        map.currentNodeId, {}, {}, "Entered " + card->family);
    record_commission_event(state, *actor, "nodeEntered", card->family);
    reindex(state);
    return {};
}

ActionResult select_option(RuntimeState& state, Vassal& actor, Node& node, std::string_view id)
{
    if (needs_specialty(node)) {
        auto& selection = *node.shopSelection.value();
        const auto choice = std::ranges::find(selection.choices, id, &browser::ShopSelectionChoicesEntry::id);
        if (choice == selection.choices.end() || !choice->enabled) return {"invalidShopSpecialty"};
        selection.selectedTag = id;
        node.inventory = shop_inventory(state, actor, node);
        if (id == "random") {
            credit_prestige(state, actor, 10);
            record_commission_event(state, actor, "prestigeGained", {}, 10);
        }
        return {};
    }
    if (node.family == "campaign" && id.starts_with("campaign-mode:")) {
        const auto mode = id.substr(14);
        if (class_name(actor) != "warrior" || !node.campaign ||
            (mode != "attack" && mode != "duel" && mode != "quest") || node.rewardAcquisition)
            return {"invalidCampaignMode"};
        node.campaign->mode = mode;
        node.options = campaign_options(state, actor, node);
        const auto option = std::ranges::find_if(node.options,
            [](const auto& entry) { return entry.mode == "duel"; });
        node.selectedOptionId = mode == "duel" && option != node.options.end() ? std::optional(option->id) : std::nullopt;
        return {};
    }
    const auto option = std::ranges::find(node.options, id, &browser::LifeMapOption::id);
    if (option == node.options.end()) return {"invalidOption"};
    if (node.family == "campaign" && campaign_blocked(state, actor, *option)) return {"campaignUnavailable"};
    if (prestige_cost(state, actor, option->prestigeCost) > prestige(state, actor) &&
        !(state.hot.rulesetId && node.family == "campaign")) return {"insufficientPrestige"};
    node.selectedOptionId = id;
    return {};
}

struct DraftSlot {
    Index<PracticeSlot> confirmed;
    const Receipt* incoming{};
    std::string_view id;
    std::string_view instance;
};

struct PracticeDraft {
    ActionResult result;
    std::vector<DraftSlot> pool;
    std::size_t capacity{};
};

PracticeDraft practice_draft(const RuntimeState& state, const Site& site, const Node& node)
{
    const auto& local = site.detailedState;
    PracticeDraft draft{.capacity = local.unlockedPracticeSlots};
    auto& pool = draft.pool;
    const auto stop = [&](std::string_view reason) {
        return PracticeDraft{{reason}, {}, 0};
    };
    // Slot expansion is a separate receipt type, with a prescribed order.
    std::vector<double> unlocks;
    for (const auto& purchase : node.purchasedOffers)
        if (purchase.intervention.kind == "practiceSlot") unlocks.push_back(purchase.intervention.capacity.value_or(0));
    std::ranges::sort(unlocks);
    for (auto capacity : unlocks) {
        if (!state.hot.rulesetId || capacity != draft.capacity + 1 || draft.capacity >= 5) return stop("invalidPracticeUnlock");
        ++draft.capacity;
    }
    const auto confirmed = std::span(local.practiceSlots.slots).first(draft.capacity);
    const auto old_slot = [&](std::string_view id) {
        const auto found = std::ranges::find_if(confirmed, [&](auto row) {
            return row && state.name(state.tables.at(row).practiceId) == id;
        });
        return found == confirmed.end() ? Index<PracticeSlot>{} : *found;
    };
    const auto instance = [&](Index<PracticeSlot> index) {
        return index && state.tables.at(index).instanceId ? state.name(*state.tables.at(index).instanceId) : ""sv;
    };
    std::vector<std::string_view> consumed, removed;
    for (const auto& purchase : node.purchasedOffers) {
        const auto& change = purchase.intervention;
        if (change.kind != "practice") continue;
        if (!change.practiceId) return stop("practiceUnavailable");
        const auto& id = *change.practiceId;
        if (std::ranges::find(consumed, id) != consumed.end()) return stop("duplicatePractice");
        const auto existing = old_slot(id);
        if (change.mode == "learn" ? bool(existing) :
            !existing || change.tier != qualityIds[static_cast<std::size_t>(state.tables.at(existing).tier)])
            return stop("practiceUnavailable");
        consumed.push_back(id);
        if (change.mode == "remove") removed.push_back(id);
        else {
            const auto instanceId = instance(existing);
            pool.push_back({existing, &purchase, id, !instanceId.empty() ? instanceId :
                change.instanceId ? std::string_view(*change.instanceId) : std::string_view(purchase.offerId)});
        }
    }
    if (pool.size() > draft.capacity) return stop("practicePrefixFull");
    for (const auto index : confirmed) {
        if (!index) {
            pool.emplace_back();
            continue;
        }
        const auto id = state.name(state.tables.at(index).practiceId);
        if (std::ranges::find(consumed, id) == consumed.end()) pool.push_back({index, nullptr, id, instance(index)});
        else if (std::ranges::find(removed, id) != removed.end()) pool.emplace_back();
    }
    if (node.practiceDraftOrder) {
        std::erase_if(pool, [](const auto& slot) { return slot.id.empty(); });
        std::vector<DraftSlot> ordered;
        for (const auto& id : *node.practiceDraftOrder) {
            if (!id) ordered.emplace_back();
            else if (const auto found = std::ranges::find(pool, *id, &DraftSlot::id); found != pool.end()) {
                ordered.push_back(*found);
                pool.erase(found);
            }
        }
        pool.insert(pool.end(), ordered.begin(), ordered.end());
    }
    if (pool.size() < draft.capacity) pool.resize(draft.capacity);
    if (!node.practiceDraftOrder) {
        for (const auto& purchase : node.purchasedOffers) {
            if (purchase.intervention.kind != "practice" || !purchase.tableauIndex) continue;
            const auto position = *purchase.tableauIndex;
            if (position != whole(position) || position < 0 || position >= draft.capacity)
                return stop("invalidPurchaseOrder");
            const auto from = std::ranges::find(pool, *purchase.intervention.practiceId, &DraftSlot::id);
            if (from == pool.end()) continue;
            const auto card = *from;
            pool.erase(from);
            pool.insert(pool.begin() + static_cast<std::size_t>(position), card);
        }
    }
    return draft;
}

browser::PracticeDraftOrder draft_order(const PracticeDraft& draft)
{
    browser::PracticeDraftOrder order;
    for (const auto& slot : draft.pool)
        order.push_back(slot.id.empty() ? std::nullopt : std::optional(std::string(slot.id)));
    return order;
}

void reprice(RuntimeState& state, Vassal& actor, const Site& site, Node& node, const PracticeDraft& draft)
{
    if (!state.hot.rulesetId) return;
    struct Victim { std::string instance, practice, allegiance; bool charged{}; };
    std::vector<Victim> victims;
    const auto surviving = std::span(draft.pool).first(draft.capacity);
    for (auto index : site.detailedState.practiceSlots.slots) {
        if (!index) continue;
        const auto& row = state.tables.at(index);
        if (!row.instanceId || !row.allegiance || *row.allegiance == state.practiceVocabulary.player) continue;
        const auto instance = state.name(*row.instanceId);
        if (std::ranges::find(surviving, instance, &DraftSlot::instance) == surviving.end())
            victims.push_back({std::string(instance), std::string(state.name(row.practiceId)), std::string(state.name(*row.allegiance))});
    }
    std::vector<Receipt*> cards;
    auto available = prestige(state, actor);
    for (auto& p : node.purchasedOffers) {
        if (p.intervention.kind == "practiceSlot") available -= p.basePrestigeCost;
        else cards.push_back(&p);
    }
    std::ranges::stable_sort(cards, {}, [](const auto* p) { return p->purchaseSequence; });
    for (std::size_t i = 0; i < cards.size(); ++i) {
        auto& p = *cards[i];
        const auto& change = p.intervention;
        auto& receipts = p.removalReceipts.emplace();
        for (auto& victim : victims) {
            if (victim.charged || change.kind != "practice") continue;
            const bool matched = change.mode == "remove" ? change.practiceId == victim.practice :
                change.mode == "learn" && (p.replacedPracticeId == victim.practice || (p.displacedInstanceIds &&
                    std::ranges::find(*p.displacedInstanceIds, victim.instance) != p.displacedInstanceIds->end()));
            if (!matched) continue;
            victim.charged = true;
            receipts.push_back({.instanceId = victim.instance, .allegiance = victim.allegiance,
                .prestigeTax = 5, .pressureTax = 10});
        }
        const auto base = change.mode == "adopt" ? 10 : prestige_cost(state, actor, p.basePrestigeCost, i == 0);
        const auto charge = base + 5 * receipts.size();
        p.prestigeCost = charge > available ? 0 : charge;
        p.monsterPressureCost = 10 * receipts.size() + (charge > available ? charge : 0);
        available -= p.prestigeCost;
    }
    auto& extra = node.removalReceipts.emplace();
    for (const auto& victim : victims) {
        if (victim.charged) continue;
        const auto paid = available >= 5 ? 5.0 : 0.0;
        available -= paid;
        extra.push_back({.instanceId = victim.instance, .allegiance = victim.allegiance,
            .prestigeCost = paid, .monsterPressureCost = 15 - paid});
    }
}

void refresh_receipt_ids(Node& node)
{
    node.purchasedOfferIds.clear();
    for (const auto& receipt : node.purchasedOffers) node.purchasedOfferIds.push_back(receipt.offerId);
}

using Order = browser::PracticeDraftOrder;

Order cancel_draft(const Order& order, const Receipt& purchase, std::size_t capacity,
                   const browser::StringArray& later)
{
    const bool learn = purchase.intervention.mode == "learn";
    const auto& id = purchase.intervention.practiceId;
    const auto& replaced = learn ? purchase.replacedPracticeId : id;
    const auto& before = learn ? purchase.practiceDraftBeforeReplacement : purchase.practiceDraftBeforeMove;
    const auto at = std::ranges::find(order, id) - order.begin();
    const auto victim = std::ranges::find(order, replaced);
    const bool restore = before && replaced && at < order.size() && at < capacity &&
        (!learn || (victim != order.end() && victim - order.begin() >= capacity));
    auto next = order;
    std::erase_if(next, [&](const auto& entry) {
        return (learn && entry == id) || (restore && entry == replaced);
    });
    const auto fixed = [&](const auto& entry) {
        return entry && std::ranges::find(later, *entry) != later.end();
    };
    if (restore) {
        const auto saved = std::ranges::find(*before, replaced);
        const auto active = std::span(order).first(learn ? std::min(capacity, order.size()) : order.size());
        const auto usable = [&](const auto& entry) {
            return entry && entry != id && (learn || !fixed(entry)) &&
                std::ranges::find(active, entry) != active.end();
        };
        auto target = next.begin() + std::min<std::size_t>(at, next.size());
        if (saved != before->end()) {
            const auto preceding = std::ranges::find_if(std::make_reverse_iterator(saved), before->rend(), usable);
            const auto following = std::find_if(saved + 1, before->end(), usable);
            if (preceding != before->rend()) target = std::ranges::find(next, *preceding) + 1;
            else if (following != before->end()) target = std::ranges::find(next, *following);
        }
        next.insert(target, replaced);
    }
    if (!learn && !later.empty()) {
        auto movable = next;
        std::erase_if(movable, fixed);
        std::size_t cursor = 0;
        for (std::size_t i = 0; i < next.size(); ++i) {
            if (i < order.size() && fixed(order[i])) next[i] = order[i];
            else next[i] = cursor < movable.size() ? movable[cursor++] : std::nullopt;
        }
    }
    return next;
}

ActionResult undo_purchase(RuntimeState& state, Vassal& actor, Node& node, const Site& site, std::string_view id)
{
    auto selected = std::ranges::find(node.purchasedOffers, id, &Receipt::offerId);
    if (selected == node.purchasedOffers.end()) return {"purchaseUnavailable"};
    const Receipt purchase = *selected;
    const auto& change = purchase.intervention;
    if (change.kind == "practiceSlot") {
        const auto draft = practice_draft(state, site, node);
        if (!draft.result) return draft.result;
        if (change.capacity != draft.capacity || !draft.pool[draft.capacity - 1].id.empty())
            return {"practiceUnlockInUse"};
    }
    node.purchasedOffers.erase(selected);
    if (change.kind == "practice" && change.mode != "remove") {
        const auto projection = practice_draft(state, site, node);
        if (!projection.result) return projection.result;
        const auto capacity = projection.capacity;
        std::vector<Receipt*> later;
        for (auto& p : node.purchasedOffers) {
            if (p.purchaseSequence <= purchase.purchaseSequence || p.intervention.kind != "practice" ||
                p.intervention.mode == "remove" || !p.intervention.practiceId) continue;
            later.push_back(&p);
        }
        const auto ids_before = [&](double seq) {
            browser::StringArray ids;
            for (auto* p : later) if (p->purchaseSequence < seq) ids.push_back(*p->intervention.practiceId);
            return ids;
        };
        if (node.practiceDraftOrder)
            node.practiceDraftOrder = cancel_draft(*node.practiceDraftOrder, purchase, capacity,
                ids_before(std::numeric_limits<double>::infinity()));
        for (auto& p : node.purchasedOffers) {
            if (change.mode != "learn" && p.purchaseSequence < purchase.purchaseSequence) continue;
            const auto historyIds = ids_before(p.purchaseSequence);
            for (auto* field : {&p.practiceDraftBeforeReplacement, &p.practiceDraftBeforeMove})
                if (*field) *field = cancel_draft(**field, purchase, capacity, historyIds);
        }
        for (auto& p : node.purchasedOffers) {
            if (change.mode != "learn" || p.replacedPracticeId != change.practiceId) continue;
            p.replacedPracticeId = purchase.replacedPracticeId;
            p.practiceDraftBeforeReplacement = purchase.practiceDraftBeforeReplacement;
        }
        if (state.hot.rulesetId && change.mode != "learn") {
            const auto after = practice_draft(state, site, node);
            if (!after.result) return after.result;
            const auto kept = std::span(after.pool).first(after.capacity);
            for (auto* p : later) {
                if (p->intervention.mode != "learn") continue;
                auto alternate = node;
                std::erase_if(alternate.purchasedOffers, [&](const auto& row) { return row.offerId == p->offerId; });
                const auto before = practice_draft(state, site, alternate);
                if (!before.result) return before.result;
                auto& displaced = p->displacedInstanceIds.emplace();
                for (const auto& row : std::span(before.pool).first(before.capacity)) {
                    if (!row.instance.empty() && std::ranges::find(kept, row.instance, &DraftSlot::instance) == kept.end())
                        displaced.emplace_back(row.instance);
                }
            }
        }
    }
    if (purchase.placement && node.structureDraftEdits) {
        std::erase_if(*node.structureDraftEdits, [&](const auto& edit) {
            return edit.placementId == purchase.placement->placementId;
        });
    }
    if (!purchase.sourceOfferId && change.kind != "practiceSlot") {
        node.inventory.push_back({purchase.offerId, purchase.label.value_or(""), purchase.basePrestigeCost,
            purchase.basePhaseCost.value_or(0), change, purchase.baseCurrencyCost, purchase.priceQuality,
            whole(purchase.sourceInventoryIndex.value_or(node.inventory.size()))});
        std::ranges::stable_sort(node.inventory, {}, &browser::ShopOffer::inventoryIndex);
    }
    refresh_receipt_ids(node);
    node.accumulatedPhaseCost = std::max(0.0, node.accumulatedPhaseCost - std::max(0.0, purchase.phaseCost));
    if (purchase.hourglassApplied.value_or(false)) node.heirloomTimeActionUsed = false;
    const auto after = practice_draft(state, site, node);
    if (!after.result) return after.result;
    reprice(state, actor, site, node, after);
    return {};
}

ActionResult reorder_purchase(RuntimeState& state, Vassal& actor, Node& node, const Site& site, const Value& payload)
{
    const auto id = string(payload, "offerId");
    const auto target = number(payload, "toIndex").value_or(-1);
    const auto before = practice_draft(state, site, node);
    if (!before.result) return before.result;
    const auto capacity = before.capacity;
    if (id.starts_with("practice:")) {
        const auto practice = std::string(id.substr(9));
        auto order = draft_order(before);
        const auto found = std::ranges::find(order, std::optional(practice));
        if (found == order.end() || !(target >= 0 && (target < capacity || target == 5)) ||
            std::floor(target) != target) return {"invalidPurchaseOrder"};
        const auto from = static_cast<std::size_t>(found - order.begin());
        order.erase(found);
        if (target == 5) {
            if (from < capacity) order.insert(order.begin() + (capacity - 1), std::nullopt);
            order.insert(order.begin() + capacity, practice);
        } else {
            const auto prefix = std::span(order).first(std::min(order.size(), capacity));
            const auto hole = std::ranges::find(prefix, browser::StringOrNull{});
            if (from >= capacity && hole != prefix.end()) order.erase(order.begin() + (hole - prefix.begin()));
            order.insert(order.begin() + std::min(order.size(), static_cast<std::size_t>(target)), practice);
        }
        node.practiceDraftOrder = std::move(order);
    } else {
        const auto position = std::floor(target);
        if (!(position >= 0 && position < capacity)) return {"invalidPurchaseOrder"};
        std::vector<std::size_t> indices;
        for (std::size_t i = 0; i < node.purchasedOffers.size(); ++i)
            if (node.purchasedOffers[i].intervention.kind == "practice") indices.push_back(i);
        const auto index = std::ranges::find_if(indices, [&](auto i) { return node.purchasedOffers[i].offerId == id; });
        if (index == indices.end()) return {"invalidPurchaseOrder"};
        auto& purchase = node.purchasedOffers[*index];
        purchase.tableauIndex = position;
        const auto projected = practice_draft(state, site, node);
        if (!projected.result) return projected.result;
        auto order = draft_order(projected);
        auto found = std::ranges::find(order, purchase.intervention.practiceId);
        if (found == order.end()) found = std::prev(order.end());
        auto entry = std::move(*found);
        order.erase(found);
        order.insert(order.begin() + std::min(order.size(), static_cast<std::size_t>(position)), std::move(entry));
        node.practiceDraftOrder = std::move(order);
        const auto from = static_cast<std::size_t>(index - indices.begin());
        const auto to = static_cast<std::size_t>(position);
        if (from != to && to < indices.size()) {
            auto receipt = std::move(node.purchasedOffers[*index]);
            if (from < to) {
                for (auto i = from; i < to; ++i)
                    node.purchasedOffers[indices[i]] = std::move(node.purchasedOffers[indices[i + 1]]);
            } else {
                for (auto i = from; i > to; --i)
                    node.purchasedOffers[indices[i]] = std::move(node.purchasedOffers[indices[i - 1]]);
            }
            node.purchasedOffers[indices[to]] = std::move(receipt);
            refresh_receipt_ids(node);
        }
    }
    const auto after = practice_draft(state, site, node);
    if (!after.result) return after.result;
    reprice(state, actor, site, node, after);
    return {};
}

ActionResult validate_connections(const RuntimeState& state, const Node& node)
{
    std::vector<std::pair<RegionId, RegionId>> connections;
    for (const auto& edge : state.tables.view(state.hot.world.connections))
        connections.emplace_back(std::min(edge.regionAId, edge.regionBId), std::max(edge.regionAId, edge.regionBId));
    for (const auto& purchase : node.purchasedOffers) {
        const auto& change = purchase.intervention;
        if (change.kind != "connection") continue;
        const auto a = state.find_id<RegionId>(change.regionAId.value_or(""));
        const auto b = state.find_id<RegionId>(change.regionBId.value_or(""));
        const auto key = std::pair(std::min(a, b), std::max(a, b));
        const auto existing = std::ranges::find(connections, key);
        if ((change.mode == "add") == (existing != connections.end())) return {"connectionUnavailable"};
        if (change.mode == "add") connections.push_back(key);
        else connections.erase(existing);
    }
    return {};
}

double next_purchase_sequence(const Node& node)
{
    double sequence = 1;
    for (const auto& receipt : node.purchasedOffers) sequence = std::max(sequence, receipt.purchaseSequence + 1);
    return sequence;
}

std::pair<std::size_t, double> next_unlock(const Site& site, const Node& node)
{
    const auto staged = std::ranges::count_if(node.purchasedOffers,
        [](const auto& receipt) { return receipt.intervention.kind == "practiceSlot"; });
    const auto capacity = site.detailedState.unlockedPracticeSlots + staged + 1;
    return {capacity, capacity == 4 ? 10.0 : capacity == 5 ? 30.0 : 0.0};
}

ActionResult stage_unlock(RuntimeState& state, Vassal& actor, Node& node, const Site& site, std::string_view offerId)
{
    if (!state.hot.rulesetId || site.neutral) return {"practiceUnlockUnavailable"};
    auto reserved = std::accumulate(node.purchasedOffers.begin(), node.purchasedOffers.end(), 0.0,
        [](double sum, const auto& receipt) { return sum + receipt.prestigeCost; });
    if (node.removalReceipts) for (const auto& receipt : *node.removalReceipts) reserved += receipt.prestigeCost.value_or(0);
    const auto [capacity, price] = next_unlock(site, node);
    if (capacity > 5 || offerId != "practice-slot:" + std::to_string(capacity) || price > prestige(state, actor) - reserved)
        return {"practiceUnlockUnavailable"};
    node.purchasedOffers.push_back({.offerId = std::string(offerId), .basePrestigeCost = price,
        .intervention = {.kind = "practiceSlot", .targetRegionId = std::string(state.name(actor.locationRegionId)),
            .mode = "unlock", .capacity = static_cast<double>(capacity)},
        .prestigeCost = price, .purchasedSec = state.hot.tSec, .purchaseSequence = next_purchase_sequence(node)});
    refresh_receipt_ids(node);
    const auto draft = practice_draft(state, site, node);
    if (draft.result) reprice(state, actor, site, node, draft);
    return {};
}

ActionResult purchase(RuntimeState& state, Vassal& actor, Node& node, const Value& payload, Receipt* quote = nullptr)
{
    const auto wanted = string(payload, "offerId");
    const auto* site = settlement::detailed_site(state, actor.locationRegionId);
    if (!site) return {"shopUnavailable"};
    if (wanted.starts_with("practice-slot:")) return stage_unlock(state, actor, node, *site, wanted);
    const auto offer = std::ranges::find(node.inventory, wanted, &browser::ShopOffer::offerId);
    if (offer == node.inventory.end()) return {"offerUnavailable"};
    const auto before = practice_draft(state, *site, node);
    if (!before.result) return before.result;
    const auto to = number(payload, "toIndex");
    const auto* rawIndex = payload.find("toIndex");
    if (offer->intervention.kind == "practice" && rawIndex && rawIndex->kind() != Kind::null &&
        (!to || *to != std::floor(*to) || *to < 0 || *to >= before.capacity)) return {"invalidPurchaseOrder"};
    const bool practice = offer->intervention.kind == "practice";
    const bool structure = offer->intervention.kind == "structure";
    if (state.hot.rulesetId && site->neutral && (practice || structure)) return {"neutralStorefront"};
    const auto priorPrestige = std::accumulate(node.purchasedOffers.begin(), node.purchasedOffers.end(), 0.0,
        [](double sum, const auto& receipt) { return sum + std::max(0.0, receipt.prestigeCost); });
    const auto cost = prestige_cost(state, actor, offer->basePrestigeCost,
        std::ranges::none_of(node.purchasedOffers, [](const auto& p) { return p.intervention.kind != "practiceSlot"; }));
    const bool pressure = (practice || structure) && cost > std::max(0.0, prestige(state, actor) - priorPrestige) &&
        (state.hot.rulesetId || offer->intervention.mode != "remove");
    const auto currency = std::max(0.0, offer->baseCurrencyCost.value_or(0));
    const auto priorCurrency = std::accumulate(node.purchasedOffers.begin(), node.purchasedOffers.end(), 0.0,
        [](double sum, const auto& receipt) { return sum + std::max(0.0, receipt.currencyCost); });
    const auto time = state.hot.rulesetId && offer->intervention.mode == "adopt" ? offer->basePhaseCost :
        phase_cost(state, actor, node, offer->basePhaseCost);
    Receipt receipt{
        .offerId = offer->offerId, .label = offer->label, .basePrestigeCost = offer->basePrestigeCost,
        .basePhaseCost = offer->basePhaseCost, .intervention = offer->intervention, .baseCurrencyCost = offer->baseCurrencyCost,
        .priceQuality = offer->priceQuality, .inventoryIndex = offer->inventoryIndex, .prestigeCost = pressure ? 0 : cost,
        .monsterPressureCost = pressure ? cost : 0, .phaseCost = time, .currencyCost = currency,
        .purchasedSec = state.hot.tSec, .purchaseSequence = next_purchase_sequence(node), .sourceInventoryRoll = whole(node.inventoryRoll),
        .sourceInventoryIndex = whole(offer->inventoryIndex), .hourglassApplied = time > 0 ?
            std::optional(!node.heirloomTimeActionUsed.value_or(false)) : std::nullopt,
    };
    if (quote) *quote = receipt;
    if (!pressure && cost > prestige(state, actor) - priorPrestige) return {"insufficientPrestige"};
    if (currency > action_stock_total(state, site, state.practiceVocabulary.currency) - priorCurrency)
        return {"insufficientCurrency"};
    const auto& change = receipt.intervention;
    const auto id = change.practiceId.value_or("");
    if (structure) {
        const auto prepared = prepare_structure_purchase(state, actor, *site, node, payload, receipt);
        if (!prepared) return prepared;
    } else if (state.hot.rulesetId && change.mode == "learn") {
        receipt.intervention.instanceId = std::string(state.name(actor.vassalId)) + ":" + receipt.offerId;
    }
    if (practice && change.mode != "remove") {
        const auto& cards = state.content->config.gamepieces.practices;
        const auto def = std::ranges::find(cards, id, &browser::GamepiecesPractices::value_type::first);
        if (def == cards.end()) return {"practiceUnavailable"};
        receipt.tableauIndex = to;
        if (!to && change.mode == "learn" && (!def->second.consume.empty() || !def->second.require.empty())) {
            const auto installed = std::ranges::count_if(std::span(before.pool).first(before.capacity),
                [](const auto& slot) { return !slot.id.empty(); });
            receipt.tableauIndex = std::min<double>(before.capacity - 1, installed);
        }
        auto order = draft_order(before);
        const auto existing = std::ranges::find(order, std::optional(id));
        const auto hadExisting = existing != order.end();
        if (change.mode == "adopt" || change.mode == "upgrade") receipt.practiceDraftBeforeMove = order;
        if (hadExisting) order.erase(existing);
        const auto victimId = string(payload, "replacePracticeId");
        if (!victimId.empty() && victimId != id) {
            const auto victim = std::ranges::find(order, std::optional(std::string(victimId)));
            if (victim == order.end() || static_cast<std::size_t>(victim - order.begin()) >= before.capacity)
                return {"invalidReplacement"};
            if (change.mode == "learn") {
                receipt.replacedPracticeId = victimId;
                receipt.practiceDraftBeforeReplacement = order;
            }
            order.erase(victim);
            order.emplace_back(victimId);
        } else if (!hadExisting) {
            const auto prefix = std::span(order).first(std::min(order.size(), before.capacity));
            const auto hole = std::ranges::find(prefix, browser::StringOrNull{});
            if (hole != prefix.end()) order.erase(order.begin() + (hole - prefix.begin()));
        }
        order.insert(order.begin() + std::min<std::size_t>(order.size(), receipt.tableauIndex.value_or(0)), id);
        node.practiceDraftOrder = std::move(order);
    }
    std::size_t insert = 0;
    if (practice && to) {
        auto remaining = *to;
        for (; insert < node.purchasedOffers.size(); ++insert)
            if (node.purchasedOffers[insert].intervention.kind == "practice" && remaining-- == 0) break;
    }
    browser::StringArray oldInstances;
    for (const auto& old : std::span(before.pool).first(before.capacity))
        if (!old.instance.empty()) oldInstances.emplace_back(old.instance);
    node.purchasedOffers.insert(node.purchasedOffers.begin() + insert, std::move(receipt));
    const auto after = practice_draft(state, *site, node);
    if (!after.result) return after.result;
    if (structure) {
        const auto lattice = structure_draft(state, *site, node);
        if (!lattice.result) return lattice.result;
        ++node.nextCommissionId;
    } else if (practice && state.hot.rulesetId) {
        auto& displaced = node.purchasedOffers[insert].displacedInstanceIds.emplace();
        const auto kept = std::span(after.pool).first(after.capacity);
        for (const auto& old : oldInstances)
            if (std::ranges::find(kept, old, &DraftSlot::instance) == kept.end()) displaced.push_back(old);
    }
    if (const auto connections = validate_connections(state, node); !connections) return connections;
    if (!structure) node.inventory.erase(offer);
    refresh_receipt_ids(node);
    node.accumulatedPhaseCost += time;
    if (time > 0) node.heirloomTimeActionUsed = true;
    reprice(state, actor, *site, node, after);
    return {};
}

bool commit_practice_draft(RuntimeState& state, Site& site, const PracticeDraft& draft)
{
    const auto& old = site.detailedState.practiceSlots;
    const auto slots = std::span(draft.pool).first(draft.capacity);
    bool changed = false;
    std::size_t count = 0;
    for (std::size_t i = 0; i < slots.size(); ++i) {
        changed |= slots[i].incoming || slots[i].confirmed != old.slots[i];
        if (!slots[i].id.empty()) ++count;
    }
    site.detailedState.unlockedPracticeSlots = static_cast<std::uint32_t>(draft.capacity);
    if (!changed) return false;
    PracticeBoard board;
    board.rows = state.tables.table<PracticeSlot>().append(count, "shop Practice board");
    state.practiceStock.resize(board.rows.end);
    state.practiceCharge.resize(board.rows.end);
    auto index = board.rows.begin;
    for (std::size_t i = 0; i < slots.size(); ++i) {
        const auto& slot = slots[i];
        if (slot.id.empty()) continue;
        const auto previous = slot.confirmed;
        auto value = previous ? state.tables.at(previous) : PracticeSlot{};
        value.slot = static_cast<std::uint32_t>(i);
        if (slot.incoming) {
            const auto& change = slot.incoming->intervention;
            value.practiceId = state.find_id<PracticeId>(slot.id);
            value.tier = static_cast<browser::Quality>(quality_index(change.resultingTier.value_or("bronze")));
            if (!value.instanceId) value.instanceId = state.intern<InstanceId>(slot.instance, "shop Practice instance");
            const auto& def = practice::detail::definition(state, value.practiceId);
            using content::Category;
            if (def.category == Category::influence && (change.mode == "adopt" || !value.allegiance))
                value.allegiance = state.practiceVocabulary.player;
            else if (def.category == Category::resource) value.allegiance.reset();
            if (def.category != Category::influence) state.practiceStock[index] = 0;
        }
        if (previous) {
            state.practiceStock[index] = state.practiceStock[previous.value];
            state.practiceCharge[index] = state.practiceCharge[previous.value];
        }
        state.tables.at(Index<PracticeSlot>{index}) = value;
        board.slots[i] = {index++};
    }
    site.detailedState.practiceSlots = board;
    practice::rebuild_listeners(state);
    return true;
}

void intervention_event(RuntimeState& state, Vassal& actor, NodeId node, const Receipt& purchase)
{
    auto& events = state.histories.at(actor.lifeEvents.row);
    const auto event = intern<EventKindId>(state, "interventionApplied");
    const auto id = std::string(state.name(actor.vassalId)) + ":interventionApplied:" + std::to_string(events.size());
    const auto& change = purchase.intervention;
    const auto instance = change.instanceId
        ? std::optional(state.intern<InstanceId>(*change.instanceId, "shop Practice instance")) : std::nullopt;
    events.append([&](HistoryPayload& page) {
        const auto text = [&](std::string_view value) { return page.intern_text(value, "shop intervention"); };
        return VassalLifeEventsEntry{.eventId = text(id), .kind = event, .tSec = state.hot.tSec, .nodeId = node,
            .offerId = text(purchase.offerId), .intervention = LifeEventsIntervention{
                .kind = text(change.kind), .targetRegionId = change.targetRegionId ?
                    std::optional(state.find_id<RegionId>(*change.targetRegionId)) : std::nullopt,
                .practiceId = change.practiceId ? std::optional(state.find_id<PracticeId>(*change.practiceId)) : std::nullopt,
                .mode = text(change.mode), .tier = change.tier ? std::optional(text(*change.tier)) : std::nullopt,
                .resultingTier = change.resultingTier ? std::optional(text(*change.resultingTier)) : std::nullopt,
                .instanceId = instance,
                .structureId = change.structureId ? std::optional(state.find_id<StructureId>(*change.structureId)) : std::nullopt,
                .regionAId = change.regionAId ? std::optional(state.find_id<RegionId>(*change.regionAId)) : std::nullopt,
                .regionBId = change.regionBId ? std::optional(state.find_id<RegionId>(*change.regionBId)) : std::nullopt,
                .qualityBonus = change.qualityBonus, .capacity = change.capacity,
            }};
    });
}

ActionResult confirm(RuntimeState& state, Vassal& actor, Node& node, NodeId id, const Value& payload)
{
    if (needs_specialty(node)) return {"shopSpecialtyRequired"};
    if (!is_shop(node)) {
        const auto selected = std::ranges::find(node.options, node.selectedOptionId.value_or(""), &browser::LifeMapOption::id);
        auto* option = node.rewardAcquisition ? &*node.rewardAcquisition :
            selected == node.options.end() ? nullptr : &*selected;
        if (!option) return {"optionRequired"};
        if (option->randomReward.has_key() && option->randomReward.value()) {
            roll_tour_reward(state, actor, *option);
            if (option->definitionId) {
                node.rewardAcquisition = *option;
                return {};
            }
        }
        if (node.family == "campaign" && option->id != "campaign-leave" && !node.rewardAcquisition) {
            const auto fresh = campaign_options(state, actor, node);
            const auto match = std::ranges::find_if(fresh, [&](const auto& candidate) {
                return candidate.id == option->id && candidate.stage == option->stage;
            });
            if (match == fresh.end() || campaign_blocked(state, actor, *match)) return {"campaignUnavailable"};
            const auto time = state.compiledContent->values.lifeMapGenerator.design.enabled
                ? phase_cost(state, actor, node, match->phaseCost) : match->phaseCost;
            const auto result = commit_campaign(state, actor, node, *match, prestige_cost(state, actor, match->prestigeCost), time);
            if (!result || node.rewardAcquisition) return result;
            node.resolving = true;
            if (!state.hot.runStatus || !state.hot.runStatus->complete)
                begin_resolution(state, actor, node, id, browser::PendingLifeMapKind::campaignEncounter, time);
            return {};
        }
        const bool relic = node.family == "relic" || node.rewardAcquisition.has_value();
        const auto* acquisition = payload.find("acquire");
        const bool empty = option->emptyRelic.value_or(false);
        if (relic && !empty && (!acquisition || string(*acquisition, "destination").empty())) return {"acquireRequired"};
        if (relic && option->definitionId && acquisition) {
            const auto result = acquire_relic(state, actor, *option->definitionId, *acquisition, false);
            if (!result) return result;
        }
        auto time = phase_cost(state, actor, node, option->phaseCost, option->locationRegionId.has_value());
        if (state.hot.rulesetId && settlement::detailed_site(state, actor.locationRegionId)) node.removalReceipts.emplace();
        const auto result = commit_node_choice(state, actor, node, *option, prestige_cost(state, actor, option->prestigeCost));
        if (!result || actor.endedReason) return result;
        if (!relic && !state.compiledContent->values.lifeMapGenerator.design.enabled)
            time = phase_cost(state, actor, node, option->phaseCost, option->locationRegionId.has_value());
        if (relic && option->definitionId && acquisition) {
            const auto result = acquire_relic(state, actor, *option->definitionId, *acquisition, true);
            if (!result) return result;
        }
        node.rewardAcquisition.reset();
        if (node.family == "campaign" && relic) {
            if (time > 0) node.heirloomTimeActionUsed = true;
            begin_resolution(state, actor, node, id, browser::PendingLifeMapKind::campaignEncounter, time);
            return {};
        }
        node.accumulatedPhaseCost += time;
        if (time > 0) node.heirloomTimeActionUsed = true;
        begin_resolution(state, actor, node, id, browser::PendingLifeMapKind::nodeResolution, whole(node.accumulatedPhaseCost));
        return {};
    }
    auto* site = settlement::detailed_site(state, actor.locationRegionId);
    if (!site) return {"shopUnavailable"};
    if (state.hot.rulesetId && site->neutral && std::ranges::any_of(node.purchasedOffers, [](const auto& purchase) {
        return purchase.intervention.kind == "practice" || purchase.intervention.kind == "practiceSlot" || purchase.intervention.kind == "structure";
    })) return {"neutralStorefront"};
    const auto draft = practice_draft(state, *site, node);
    if (!draft.result) return draft.result;
    const auto structures = structure_draft(state, *site, node);
    if (!structures.result) return structures.result;
    if (const auto connections = validate_connections(state, node); !connections) return connections;
    reprice(state, actor, *site, node, draft);
    double charge = 0, pressure = 0, currency = 0;
    for (const auto& purchase : node.purchasedOffers) {
        charge += purchase.prestigeCost;
        pressure += purchase.monsterPressureCost;
        currency += std::max(0.0, purchase.currencyCost);
    }
    if (node.removalReceipts) for (const auto& receipt : *node.removalReceipts) {
        charge += receipt.prestigeCost.value_or(0);
        pressure += receipt.monsterPressureCost.value_or(0);
    }
    if (charge > prestige(state, actor)) return {"insufficientPrestige"};
    if (currency > 0) {
        const auto& trait = state.practiceVocabulary.currency;
        if (currency > action_stock_total(state, site, trait) ||
            !practice::apply_stock(state, *site, action_stock_plan(state, site, trait, currency))) return {"insufficientCurrency"};
    }
    prestige(state, actor) -= charge;
    const auto practicesChanged = commit_practice_draft(state, *site, draft);
    const auto structuresChanged = commit_structure_draft(state, *site, structures);
    if (structuresChanged) practice::rebuild_listeners(state);
    for (const auto& purchase : node.purchasedOffers | std::views::reverse) {
        const auto& change = purchase.intervention;
        if (change.kind == "practice" && change.mode == "learn") {
            record_commission_event(state, actor, "practiceInstalled", *change.practiceId);
            practice::EventData event;
            event.fields.practiceId = state.find_id<PracticeId>(*change.practiceId);
            practice::emit(state, practice::EventKind::practiceInstalled, actor.locationRegionId, event);
            practice::drain(state);
        }
        if (change.kind == "structure" && purchase.placement && change.structureId)
            record_commission_event(state, actor, "structureStarted", *change.structureId);
        if (change.kind == "connection") {
            if (const auto result = change_connection(state, actor, change); !result) return result;
        }
        intervention_event(state, actor, id, purchase);
    }
    if (!node.purchasedOffers.empty() || practicesChanged || structuresChanged) {
        practice::EventData event;
        event.fields.reason = intern<SymbolId>(state, "shopConfirmed");
        practice::emit(state, intern<EventKindId>(state, "settlementChanged"), actor.locationRegionId, event);
        practice::drain(state);
    }
    if (pressure > 0) territory::add_pressure(state, pressure);
    if (state.hot.runStatus && state.hot.runStatus->complete) {
        node.resolving = true;
        node.transactionId = std::string(state.name(actor.vassalId)) + ":" + node.nodeId + ":" + decimal(state.hot.tSec);
        return {};
    }
    if (node.purchasedOffers.empty()) {
        const auto& design = state.compiledContent->values.lifeMapGenerator.design;
        const auto base = year_phases(state, balance_value(design.shopServices.emptyConfirm.time, design.costBands.time));
        const auto time = phase_cost(state, actor, node, base);
        node.accumulatedPhaseCost += time;
        if (time > 0) node.heirloomTimeActionUsed = true;
    }
    begin_resolution(state, actor, node, id, browser::PendingLifeMapKind::nodeResolution, whole(node.accumulatedPhaseCost));
    return {};
}

ActionResult reroll_shop(RuntimeState& state, Vassal& actor, Node& node, NodeId id)
{
    if (class_name(actor) != "scholar") return {"scholarRequired"};
    if (needs_specialty(node)) return {"shopSpecialtyRequired"};
    if (!node.purchasedOffers.empty()) return {"stagedPurchases"};
    const auto& design = state.compiledContent->values.lifeMapGenerator.design;
    const auto base = year_phases(state, balance_value(design.shopServices.delve.time, design.costBands.time));
    const auto time = phase_cost(state, actor, node, base);
    if (time > 0) node.heirloomTimeActionUsed = true;
    begin_resolution(state, actor, node, id, browser::PendingLifeMapKind::shopDelve, time);
    return {};
}

ActionResult dispatch_node_action(RuntimeState& state, const Action& action)
{
    const auto& kind = action.kind;
    auto* actor = state.indexes.currentVassal ? &state.tables.at(state.indexes.currentVassal).value : nullptr;
    const auto nodeId = string(action.payload, "nodeId");
    if (kind == "vassalEnterLifeNode") return enter(state, actor, nodeId);
    const bool shop = kind == "vassalPurchaseShopOffer" || kind == "vassalUndoShopPurchase" ||
        kind == "vassalReorderShopPurchase" || kind == "vassalMoveShopStructure" || kind == "vassalRerollShop";
    const bool select = kind == "vassalSelectLifeOption";
    if (!shop && !select && kind != "vassalConfirmLifeNode") return {"unsupportedAction"};
    const auto* option = action.payload.find("optionId");
    if (select && (!option || option->kind() != Kind::string)) return {"invalidOption"};
    if (!actor || !actor->lifeMap.currentNodeId || state.name(*actor->lifeMap.currentNodeId) != nodeId)
        return {shop ? "shopUnavailable" : "nodeUnavailable"};
    auto nodes = read(state, actor->lifeMap.nodeStates);
    const auto found = std::ranges::find(nodes, nodeId, &browser::LifeMapNodeStates::value_type::first);
    if (found == nodes.end() || found->second.resolving || (shop && !is_shop(found->second)))
        return {shop ? "shopUnavailable" : "nodeUnavailable"};
    auto& node = found->second;
    ActionResult result;
    if (select) result = select_option(state, *actor, node, option->as_string());
    else if (kind == "vassalRerollShop") result = reroll_shop(state, *actor, node, *actor->lifeMap.currentNodeId);
    else if (kind == "vassalPurchaseShopOffer") result = purchase(state, *actor, node, action.payload);
    else if (kind == "vassalMoveShopStructure") {
        const auto* site = settlement::detailed_site(state, actor->locationRegionId);
        result = site ? move_structure(state, *site, node, action.payload) : ActionResult{"placementUnavailable"};
    } else if (kind == "vassalUndoShopPurchase" || kind == "vassalReorderShopPurchase") {
        const auto* site = settlement::detailed_site(state, actor->locationRegionId);
        if (!site) return {"shopUnavailable"};
        result = kind == "vassalUndoShopPurchase"
            ? undo_purchase(state, *actor, node, *site, string(action.payload, "offerId"))
            : reorder_purchase(state, *actor, node, *site, action.payload);
    } else result = confirm(state, *actor, node, *actor->lifeMap.currentNodeId, action.payload);
    if (result) {
        replace(state, actor->lifeMap.nodeStates, nodes);
        if (kind == "vassalConfirmLifeNode" && actor->lifeMap.pendingResolution &&
            actor->lifeMap.pendingResolution->kind == browser::PendingLifeMapKind::nodeResolution &&
            actor->lifeMap.pendingResolution->resolveSec <= state.hot.tSec && !resolve_due(state))
            return {"resolutionFailed"};
        reindex(state);
    }
    return result;
}

}

ChoicePrice quote_choice(const RuntimeState& state, const runtime::Vassal& actor,
                         const browser::LifeMapNodeState& node, const browser::LifeMapOption& option)
{
    const auto phases = node.family == "campaign" && !node.rewardAcquisition && option.id != "campaign-leave"
        ? (state.compiledContent->values.lifeMapGenerator.design.enabled
            ? phase_cost(state, actor, node, option.phaseCost) : option.phaseCost)
        : phase_cost(state, actor, node, option.phaseCost, option.locationRegionId.has_value());
    return {prestige_cost(state, actor, option.prestigeCost),
        phases * state.compiledContent->settings().phaseDurationSec};
}

ShopPracticeBoard read_shop_practices(const RuntimeState& state, const runtime::Site& site,
                                      const browser::LifeMapNodeState& node)
{
    const auto draft = practice_draft(state, site, node);
    if (!draft.result) return {};
    ShopPracticeBoard board{.capacity = draft.capacity};
    for (const auto& slot : draft.pool)
        board.order.push_back({std::string(slot.id), slot.incoming ? slot.incoming->offerId : std::string{}});
    return board;
}

std::vector<ShopQuote> quote_shop(const RuntimeState& state, const runtime::Vassal& actor,
                                 const browser::LifeMapNodeState& node, bool validate)
{
    std::vector<ShopQuote> offers;
    auto scratch = validate ? std::optional(state) : std::nullopt;
    auto detachedActor = actor;
    const auto* site = settlement::detailed_site(state, actor.locationRegionId);
    for (const auto& offer : node.inventory) {
        ShopQuote quote{.offer = offer};
        quote.price.prestigeCost = offer.basePrestigeCost;
        quote.price.currencyCost = offer.baseCurrencyCost.value_or(0);
        quote.price.phaseCost = offer.basePhaseCost;
        if (scratch) {
            auto trial = node;
            const Value::Object payload{{"offerId", Value(offer.offerId)}};
            const auto result = purchase(*scratch, detachedActor, trial, Value(payload), &quote.price);
            quote.reason = result.reason;
            if (result) {
                const auto sequence = next_purchase_sequence(node);
                const auto staged = std::ranges::find(trial.purchasedOffers, sequence, &Receipt::purchaseSequence);
                if (staged != trial.purchasedOffers.end()) quote.price = *staged;
            }
            if (quote.price.placement && site) {
                const auto board = structure_draft(state, *site, node);
                const auto width = static_cast<std::size_t>(quote.price.placement->width);
                const auto suggested = static_cast<std::size_t>(quote.price.placement->origin);
                for (std::size_t origin = 0; origin + width <= board.slots.size(); ++origin) {
                    trial = node;
                    auto placement = payload;
                    placement.emplace_back("origin", Value(double(origin)));
                    if (!purchase(*scratch, detachedActor, trial, Value(std::move(placement)))) continue;
                    ShopPlacement span{origin, width};
                    for (const auto& cell : board.slots) {
                        if (!cell) continue;
                        const auto& item = cell->placement;
                        if (item.origin < origin + width && item.origin + item.width > origin)
                            span.demolished.push_back(item.structureId);
                    }
                    quote.placements.push_back(std::move(span));
                }
                // Present the simulation's default placement first.
                const auto first = std::ranges::find(quote.placements, suggested, &ShopPlacement::origin);
                if (first != quote.placements.end()) std::rotate(quote.placements.begin(), first, first + 1);
            }
        }
        offers.push_back(std::move(quote));
    }
    if (site && state.hot.rulesetId && !site->neutral) {
        const auto [capacity, price] = next_unlock(*site, node);
        if (capacity <= 5) {
            ShopQuote quote;
            quote.offer.offerId = "practice-slot:" + std::to_string(capacity);
            quote.offer.label = "Unlock Practice slot " + std::to_string(capacity);
            quote.offer.intervention.kind = "practiceSlot";
            quote.price.prestigeCost = price;
            if (scratch) {
                auto trial = node;
                quote.reason = stage_unlock(*scratch, detachedActor, trial, *site, quote.offer.offerId).reason;
            }
            offers.push_back(std::move(quote));
        }
    }
    return offers;
}

ActionResult apply_node_action(RuntimeState& state, const Action& action)
{
    if (action.kind != "vassalConfirmLifeNode") return dispatch_node_action(state, action);
    auto next = state;
    const auto result = dispatch_node_action(next, action);
    if (result) state = std::move(next);
    return result;
}

}
