#include "life_map.hpp"

#include "sim/step/replay.hpp"
#include "sim/settlement/site_access.hpp"
#include "sim/vassal/action_structures.hpp"
#include "sim/vassal/action_choices.hpp"
#include "sim/territory/detail.hpp"
#include "sim/vassal/detail.hpp"
#include "sim/vassal/presentation.hpp"
#include "sim/world/topology.hpp"

#include <algorithm>
#include <array>

namespace waffle::connected {
namespace {

using core::json::Value;
using sim::RuntimeState;
using sim::runtime::Vassal;
using namespace sim::vassal::detail;

std::string title(std::string_view id)
{
    std::string result;
    for (const char c : id) {
        if (c >= 'A' && c <= 'Z' && !result.empty()) result += ' ';
        result += c == '-' ? ' ' : c;
    }
    if (!result.empty() && result.front() >= 'a' && result.front() <= 'z') result.front() -= 'a' - 'A';
    return result;
}

std::string regionName(const RuntimeState& state, std::string_view id)
{
    const auto region = state.find_id<sim::runtime::RegionId>(id);
    return region ? std::string(state.topology->region_name(region)) : std::string(id);
}

std::string statLabel(std::string_view id, std::string_view identity)
{
    if (id == "cunning" && identity == "scholar") return "Ingenuity";
    if (id == "intelligence" && identity == "warrior") return "Prowess";
    return title(id);
}

std::string nodeLabel(const sim::browser::LifeMapGraphNode& node)
{
    if (node.signatureNode) return node.signatureNode->label;
    if (node.stockOutput) return *node.stockOutput + " Stock Supply";
    const auto family = node.specialRelic.value_or(false) ? "specialRelic" : node.family;
    const auto label = std::ranges::find(nodeFamilyLabels, family, &NodeFamilyLabel::id);
    return label == std::end(nodeFamilyLabels) ? title(family) : std::string(label->label);
}

std::string nodeGlyph(const sim::browser::LifeMapGraphNode& node, const std::string& label)
{
    if (node.signatureNode) return "*";
    if (node.family == "crisis") return "!";
    if (node.family == "crossroads") return "X";
    if (node.family == "relic") return "R";
    std::string glyph;
    for (const char c : label)
        if (c >= 'A' && c <= 'Z' && glyph.size() < 2) glyph += c;
    return glyph.empty() ? "?" : glyph;
}

std::string quoteReason(const RuntimeState& state, const LifeCommand& command)
{
    auto draft = state;
    const auto result = sim::apply_action(draft, {state.hot.tSec, command.kind, Value(command.payload), {}});
    return result ? "" : actionReason(result.reason);
}

LifeCommand nodeCommand(std::string kind, std::string_view id, std::string feedback,
                        Value::Object payload = {})
{
    payload.emplace_back("nodeId", Value(std::string(id)));
    return {std::move(kind), std::move(payload), std::move(feedback)};
}

void addChoice(LifeReading& view, const RuntimeState& state, LifeChoice choice, bool quote = false)
{
    if (quote && choice.reason.empty()) choice.reason = quoteReason(state, choice.command);
    view.choices.push_back(std::move(choice));
}

std::string relicLabel(std::string_view id)
{
    const auto entry = std::ranges::find(heirloomDefs, id, &HeirloomDef::id);
    return entry == std::end(heirloomDefs) ? title(id) : std::string(entry->label);
}

std::string optionDetail(const RuntimeState& state, const Vassal& actor,
                         const sim::browser::LifeMapNodeState& node, const sim::browser::LifeMapOption& option)
{
    const auto price = sim::vassal::quote_choice(state, actor, node, option);
    std::string result = decimal(price.seconds) + " s";
    const auto append = [&](std::string value) { result += " · " + std::move(value); };
    if (price.prestige) append(decimal(price.prestige) + " Prestige");
    if (option.foodCost.value_or(0)) append(decimal(*option.foodCost) + " Food");
    if (option.classAction && option.classAction->currency.value_or(0))
        append(decimal(*option.classAction->currency) + " Currency");
    if (option.risk.value_or(0)) append(decimal(std::round(*option.risk * 1000) / 10) + "% encounter risk");
    if (const auto risk = immediate_risk(state, actor, option); risk > 0)
        append(decimal(std::round(risk * 1000) / 10) + "% immediate death");
    const auto mortality = sim::vassal::mortality_at(state, actor, state.hot.tSec + price.seconds);
    if (mortality.chance > 0)
        append(decimal(std::round(mortality.chance * 1000) / 10) + "% age risk at " + decimal(mortality.age));
    if (option.force && option.defense) append(decimal(*option.force) + " force / " + decimal(*option.defense) + " defense");
    if (option.prestigeDelta.value_or(0))
        append(std::string(*option.prestigeDelta > 0 ? "+" : "") + decimal(*option.prestigeDelta) + " Prestige");
    if (option.statDelta && option.statId)
        append(std::string(*option.statDelta > 0 ? "+" : "") + decimal(*option.statDelta) + " " +
            option.statLabel.value_or(title(*option.statId)));
    if (option.lossStatDelta && option.lossStatId)
        append(decimal(*option.lossStatDelta) + " " + option.lossStatLabel.value_or(title(*option.lossStatId)));
    if (option.legacyReward) {
        const auto& reward = *option.legacyReward;
        append("+" + decimal(reward.amount) + (reward.statId ? " successor " + statLabel(*reward.statId,
            actor.classId ? class_name(actor) : std::string_view{}) : " legacy Prestige"));
    }
    if (option.legacyStartingPrestigeBonus) append("+" + decimal(*option.legacyStartingPrestigeBonus) + " successor Prestige");
    if (option.locationRegionId) append(regionName(state, *option.locationRegionId));
    if (option.description) append(*option.description);
    return result;
}

void confirmChoice(LifeReading& view, const RuntimeState& state, const Vassal& actor,
                   const sim::browser::LifeMapNodeState& node, const sim::browser::LifeMapOption& option,
                   bool actionable)
{
    const auto commands = [&](std::string label, Value::Object payload = {}) {
        auto command = nodeCommand("vassalConfirmLifeNode", node.nodeId, "Choice committed");
        if (!payload.empty()) command.payload.emplace_back("acquire", Value(std::move(payload)));
        addChoice(view, state, {std::move(label), optionDetail(state, actor, node, option), {}, option.definitionId.value_or(""), std::move(command)},
            actionable);
    };
    if ((node.family != "relic" && !node.rewardAcquisition) || option.emptyRelic.value_or(false)) {
        commands("Confirm " + option.label);
        return;
    }
    const auto& inventory = read(state, actor.heirlooms);
    const bool roomToEquip = std::ranges::any_of(inventory.equipped, [](const auto& item) { return !item; });
    const bool roomToCarry = std::ranges::any_of(inventory.carry, [](const auto& item) { return !item; });
    if (roomToEquip) commands("Equip " + option.label, {{"destination", Value("equip")}});
    else for (std::size_t i = 0; i < inventory.equipped.size(); ++i) {
        Value::Object acquire{{"destination", Value("equip")}, {"replaceEquippedIndex", Value(double(i))}};
        if (!roomToCarry) acquire.emplace_back("discard", Value(Value::Object{
            {"location", Value("equipped")}, {"index", Value(double(i))}}));
        commands(std::string(roomToCarry ? "Move to carry: " : "Discard and replace: ") +
            relicLabel(inventory.equipped[i]->definitionId), std::move(acquire));
    }
    if (roomToCarry) commands("Carry " + option.label, {{"destination", Value("carry")}});
    else for (std::size_t i = 0; i < inventory.carry.size(); ++i)
        commands("Replace carried " + relicLabel(inventory.carry[i]->definitionId),
            {{"destination", Value("carry")}, {"replaceCarryIndex", Value(double(i))}});
    commands("Decline relic", {{"destination", Value("decline")}});
}

std::string shopCost(double prestige, double currency, double pressure, double seconds)
{
    std::string cost;
    const auto append = [&](double amount, std::string_view unit) {
        if (!amount) return;
        if (!cost.empty()) cost += " · ";
        cost += decimal(amount) + " " + std::string(unit);
    };
    append(prestige, "Prestige");
    append(currency, "Currency");
    append(pressure, "Monster pressure");
    append(seconds, "s");
    return cost.empty() ? "Free" : cost;
}

std::string structureLabel(const RuntimeState& state, std::string_view id)
{
    const auto& defs = state.content->config.gamepieces.structures;
    const auto found = std::ranges::find(defs, id, &sim::browser::GamepiecesStructures::value_type::first);
    return found == defs.end() ? title(id) : found->second.label;
}

void readShop(LifeReading& view, const RuntimeState& state, const Vassal& actor,
              const sim::browser::LifeMapNodeState& node, bool actionable)
{
    auto& shop = view.shop.emplace();
    shop.region = view.location;
    const auto phase = state.compiledContent->settings().phaseDurationSec;
    if (const auto* site = sim::settlement::detailed_site(state, actor.locationRegionId)) {
        const auto draft = structure_draft(state, *site, node);
        shop.cells.resize(draft.slots.size());
        for (const auto& cell : draft.slots) {
            if (!cell) continue;
            const auto origin = static_cast<std::size_t>(cell->placement.origin);
            const auto width = static_cast<std::size_t>(cell->placement.width);
            std::fill_n(shop.cells.begin() + origin, width, structureLabel(state, cell->placement.structureId));
        }
        shop.funds = decimal(state.hot.civilization.prestige.value_or(actor.prestige)) + " Prestige · " +
            decimal(std::floor(action_stock_total(state, site, state.practiceVocabulary.currency) * 10) / 10) + " Currency";
    }
    for (const auto& quote : sim::vassal::quote_shop(state, actor, node, actionable)) {
        const auto& offer = quote.offer;
        const auto& change = offer.intervention;
        const auto& price = quote.price;
        ShopItem item{offer.offerId, offer.label, change.structureId.value_or(change.practiceId.value_or(""))};
        item.cost = shopCost(price.prestigeCost, price.currencyCost, price.monsterPressureCost, price.phaseCost * phase);
        if (!quote.reason.empty()) item.reason = actionReason(quote.reason);
        if (change.kind == "connection" && change.regionAId && change.regionBId) {
            item.label = change.mode == "add" ? "Build road" : "Remove road";
            item.description = title(change.mode) + " route · " + regionName(state, *change.regionAId) +
                " to " + regionName(state, *change.regionBId);
        } else if (change.kind == "practiceSlot") item.description = "Unlock a permanent space on this settlement's Practice board.";
        else if (change.structureId) {
            const auto& defs = state.content->config.gamepieces.structures;
            const auto def = std::ranges::find(defs, *change.structureId, &sim::browser::GamepiecesStructures::value_type::first);
            if (def != defs.end()) item.description = decimal(def->second.footprint) + "-space building";
        } else if (change.practiceId) {
            const auto& defs = state.content->config.gamepieces.practices;
            const auto def = std::ranges::find(defs, *change.practiceId, &sim::browser::GamepiecesPractices::value_type::first);
            if (def != defs.end()) item.description = def->second.ui.rule;
        }
        for (const auto& span : quote.placements) {
            ShopSpan available{span.origin, span.width};
            for (const auto& structure : span.demolished) {
                if (!available.replacement.empty()) available.replacement += ", ";
                available.replacement += structureLabel(state, structure);
            }
            item.spans.push_back(std::move(available));
        }
        item.command = nodeCommand("vassalPurchaseShopOffer", node.nodeId, "Staged " + item.label,
            {{"offerId", Value(item.id)}});
        shop.offers.push_back(std::move(item));
    }
    double prestige = 0, currency = 0, pressure = 0;
    for (const auto& receipt : node.purchasedOffers) {
        prestige += receipt.prestigeCost;
        currency += receipt.currencyCost;
        pressure += receipt.monsterPressureCost;
        std::string label = receipt.label.value_or(receipt.intervention.kind == "practiceSlot"
            ? "Unlock Practice slot " + decimal(receipt.intervention.capacity.value_or(0)) : title(receipt.intervention.kind));
        ShopItem staged{receipt.offerId, std::move(label)};
        staged.cost = shopCost(receipt.prestigeCost, receipt.currencyCost, receipt.monsterPressureCost, receipt.phaseCost * phase);
        const auto& change = receipt.intervention;
        if (change.kind == "connection" && change.regionAId && change.regionBId) {
            staged.label = change.mode == "add" ? "Build road" : "Remove road";
            staged.description = regionName(state, *change.regionAId) + " to " + regionName(state, *change.regionBId);
        }
        if (receipt.placement) {
            staged.description = (receipt.placement->width == 1 ? "Space " : "Spaces ") + decimal(receipt.placement->origin + 1);
            if (receipt.placement->width > 1)
                staged.description += "–" + decimal(receipt.placement->origin + receipt.placement->width);
        }
        staged.command = nodeCommand("vassalUndoShopPurchase", node.nodeId, "Purchase removed",
            {{"offerId", Value(receipt.offerId)}});
        shop.staged.push_back(std::move(staged));
    }
    if (node.removalReceipts) {
        for (const auto& receipt : *node.removalReceipts) {
            prestige += receipt.prestigeCost.value_or(0);
            pressure += receipt.monsterPressureCost.value_or(0);
        }
    }
    auto confirm = nodeCommand("vassalConfirmLifeNode", node.nodeId, "Shop committed");
    std::string error;
    auto seconds = node.accumulatedPhaseCost * phase;
    if (actionable) {
        auto draft = state;
        const auto result = sim::apply_action(draft, {state.hot.tSec, confirm.kind, Value(confirm.payload), {}});
        if (!result) error = actionReason(result.reason);
        else if (draft.indexes.currentVassal) {
            const auto& pending = draft.tables.at(draft.indexes.currentVassal).value.lifeMap.pendingResolution;
            if (pending) seconds = pending->resolveSec - state.hot.tSec;
        }
    }
    shop.total = shopCost(prestige, currency, pressure, seconds);
    if (!shop.staged.empty()) confirm.feedback = "Shop committed · " + shop.total;
    view.choices.push_back({shop.staged.empty() ? "Leave shop" : "Review checkout", shop.total,
        std::move(error), {}, std::move(confirm)});
    if (class_name(actor) == "scholar") {
        auto delve = nodeCommand("vassalRerollShop", node.nodeId, "Delve begun");
        std::string reason;
        std::string detail = "Spend time to refresh this shop.";
        if (actionable) {
            auto draft = state;
            const auto result = sim::apply_action(draft, {state.hot.tSec, delve.kind, Value(delve.payload), {}});
            if (!result) reason = actionReason(result.reason);
            else if (const auto& pending = draft.tables.at(draft.indexes.currentVassal).value.lifeMap.pendingResolution)
                detail = decimal(pending->resolveSec - state.hot.tSec) + " s · Refresh the offers.";
        }
        view.choices.push_back({"Delve", std::move(detail), std::move(reason), {}, std::move(delve)});
    }
}

void activeChoices(LifeReading& view, const RuntimeState& state, const Vassal& actor,
                   const sim::browser::LifeMapNodeState& node, bool actionable)
{
    if (node.contentMode == "shop") {
        if (node.shopSelection.has_key() && node.shopSelection.value() && !node.shopSelection.value()->selectedTag) {
            view.decisionDetail = "Choose a specialty to reveal its offers.";
            for (const auto& option : node.shopSelection.value()->choices)
                addChoice(view, state, {option.label, option.description, option.enabled ? "" : "Specialty unavailable.",
                    {}, nodeCommand("vassalSelectLifeOption", node.nodeId, "Specialty chosen", {{"optionId", Value(option.id)}})});
        } else {
            readShop(view, state, actor, node, actionable);
        }
        return;
    }
    if (node.campaign && node.campaign->lastResult) view.decisionDetail = node.campaign->lastResult->text;
    if (node.rewardAcquisition) {
        view.decisionDetail = "Claim your reward: " + node.rewardAcquisition->label;
        confirmChoice(view, state, actor, node, *node.rewardAcquisition, actionable);
        return;
    }
    if (node.campaign) {
        for (const auto* mode : {"attack", "duel", "quest"}) {
            addChoice(view, state, {title(mode), {}, {}, {}, nodeCommand("vassalSelectLifeOption", node.nodeId,
                "Campaign mode set", {{"optionId", Value(std::string("campaign-mode:") + mode)}}),
                node.campaign->mode == mode}, actionable);
        }
    }
    const sim::browser::LifeMapOption* selected = nullptr;
    for (const auto& option : node.options) {
        const bool chosen = node.selectedOptionId == option.id;
        if (chosen) selected = &option;
        addChoice(view, state, {option.label, optionDetail(state, actor, node, option), {}, option.definitionId.value_or(""),
            nodeCommand("vassalSelectLifeOption", node.nodeId, "Option selected", {{"optionId", Value(option.id)}}),
            chosen}, actionable);
    }
    if (selected) confirmChoice(view, state, actor, node, *selected, actionable);
}

void readEvents(LifeReading& view, const RuntimeState& state, const Vassal& actor)
{
    const auto& history = state.histories.at(actor.lifeEvents.row);
    history.for_each([&](const auto& row, const auto& page) {
        const auto kind = state.name(row.kind);
        std::string text;
        if (kind == "nodeEntered" && row.nodeId) {
            const auto& graph = read(state, actor.lifeMap.graph);
            const auto node = std::ranges::find(graph.nodes, state.name(*row.nodeId), &sim::browser::LifeMapGraphNode::id);
            if (node != graph.nodes.end()) text = "Entered " + nodeLabel(*node);
        }
        if (text.empty()) text = row.text ? std::string(page.text.at(row.text->value)) : title(kind);
        view.events.emplace_back(static_cast<Second>(row.tSec), row.result
            ? text + " · " + title(page.text.at(row.result->value)) : text);
        if (view.events.size() > 8) view.events.erase(view.events.begin());
    });
    std::ranges::reverse(view.events);
}

}

std::string actionReason(std::string_view code)
{
    constexpr std::pair<std::string_view, std::string_view> messages[]{
        {"insufficientPrestige", "You have insufficient Prestige."},
        {"insufficientCurrency", "This settlement has insufficient available Currency."},
        {"practiceUnlockUnavailable", "This slot is unavailable or you have insufficient Prestige."},
        {"offerUnavailable", "That offer is no longer in this shop."},
        {"nodeUnavailable", "This node cannot be entered from your current path."},
        {"nodeAlreadyActive", "Finish the current node first."},
        {"resolutionPending", "Advance to resolve the current decision."},
        {"commissionRequired", "Choose a Commission first."},
        {"heirloomLoadoutRequired", "Set the successor's Heirloom loadout first."},
        {"developmentChoiceRequired", "Choose a development stat first."},
        {"campaignUnavailable", "This encounter is unavailable with your current force or resources."},
        {"warriorRequired", "This node requires an established Warrior."},
        {"shopSpecialtyRequired", "Choose a shop specialty first."},
        {"connectionUnavailable", "This route already exists or cannot be removed."},
        {"shopUnavailable", "There is no active shop at this site."},
        {"outsideConstructionStrip", "The building extends beyond the construction strip."},
        {"stagedStructureOverlap", "That footprint overlaps a staged building."},
        {"noCompatibleSpan", "There is no compatible span in the construction strip."},
        {"scholarRequired", "Only an established Scholar can Delve."},
        {"stagedPurchases", "Remove staged purchases before delving."},
        {"neutralStorefront", "A neutral storefront cannot install this card."},
        {"heirloomOverflowPending", "Choose which Heirlooms to keep in the vault first."}
    };
    const auto match = std::ranges::find(messages, code, &std::pair<std::string_view, std::string_view>::first);
    return match == std::end(messages) ? title(code) + "." : std::string(match->second);
}

LifeReading readLifeMap(const RuntimeState& state, bool actionable, bool detail)
{
    LifeReading view;
    const auto& lineage = state.hot.civilization.vassalLineage;
    const bool terminal = state.hot.runStatus && state.hot.runStatus->complete;
    view.tenures = lineage.tenuresRemaining;
    view.rerolls = lineage.candidateRerollCount;
    const auto* actor = state.indexes.currentVassal ? &state.tables.at(state.indexes.currentVassal).value : nullptr;
    const bool choosing = !actor;
    if (choosing) {
        const auto& pool = read(state, lineage.pendingCandidates);
        for (std::size_t i = 0; i < pool.size(); ++i) {
            const auto& source = pool[i];
            const auto identity = source.founderClassId.value_or(source.classId == sim::browser::SpecialistClass::warrior
                ? "warrior" : "scholar");
            LifeCandidate candidate{source.archetype, identity, regionName(state, source.locationRegionId),
                source.age, source.prestige};
            const std::array values{source.stats.cunning, source.stats.wisdom, source.stats.effectiveness, source.stats.intelligence};
            for (std::size_t stat = 0; stat < statIds.size(); ++stat)
                candidate.stats.emplace_back(statLabel(statIds[stat], identity), values[stat]);
            candidate.command = {"settlementSelectVassal", {{"candidateIndex", Value(double(i))}}, source.archetype + " appointed"};
            view.candidates.push_back(std::move(candidate));
        }
        const bool overflow = lineage.pendingVaultOverflow && !read(state, *lineage.pendingVaultOverflow).empty();
        view.canReroll = actionable && !terminal && !overflow && !pool.empty();
        if (overflow) {
            view.decision = "Heirloom vault overflow";
            view.decisionDetail = "The vault holds six Heirlooms. Select six to keep and confirm the inheritance.";
            for (const auto& item : read(state, *lineage.pendingVaultOverflow))
                view.choices.push_back({relicLabel(item.definitionId), {}, {}, item.definitionId,
                    {"vassalResolveVaultOverflow", {{"instanceId", Value(item.instanceId)}}, {}}});
        }
        const auto actors = state.tables.view(lineage.vassalsById);
        if (!actors.empty()) {
            actor = &actors.back().value;
            if (actor->endedReason) {
                view.succession = std::string(state.name(actor->archetype)) + (actor->isDead ? " died" : " retired");
                if (actor->deathCause) view.succession += " · " + title(state.name(*actor->deathCause));
                if (actor->endSec) view.succession += " at " + decimal(*actor->endSec) + " s";
            }
        }
    }
    if (!actor) return view;
    view.actor = state.name(actor->vassalId);
    view.name = state.name(actor->archetype);
    view.location = regionName(state, state.name(actor->locationRegionId));
    const auto identity = actor->classId ? class_name(*actor) : actor->founderClassId
        ? state.name(*actor->founderClassId) : std::string_view{};
    const auto age = sim::vassal::mortality_at(state, *actor, actor->endSec.value_or(state.hot.tSec)).age;
    view.summary = "Age " + decimal(age) + " / " + decimal(state.hot.civilization.prestige.value_or(actor->prestige)) + " Prestige · " +
        decimal(actor->developmentProgress) + " Development";
    if (identity == "warrior") view.summary += " · " + decimal(sim::territory::retinue(state, *actor)) + " Retinue";
    if (detail) readEvents(view, state, *actor);
    const auto& map = actor->lifeMap;
    const auto& graph = read(state, map.graph);
    const auto& available = read(state, map.availableNodeIds);
    const auto& states = read(state, map.nodeStates);
    if (map.currentNodeId) view.current = state.name(*map.currentNodeId);
    view.nodes.reserve(graph.nodes.size());
    for (const auto& source : graph.nodes) {
        auto label = nodeLabel(source);
        LifeNode node{source.id, label, nodeGlyph(source, label), {}, source.position.x, source.position.y};
        const auto existing = std::ranges::find(states, source.id, &sim::browser::LifeMapNodeStates::value_type::first);
        if (source.id == view.current && !choosing) {
            node.status = NodeStatus::current;
            view.decision = label;
        } else if (existing != states.end() && existing->second.resolved) {
            node.status = NodeStatus::completed;
            node.detail = "Completed" + (existing->second.resolvedSec ? " at " + decimal(*existing->second.resolvedSec) + " s" : "") +
                (existing->second.resolutionResult ? " · " + title(*existing->second.resolutionResult) : "");
        } else if (!terminal && !choosing && std::ranges::find(available, source.id) != available.end()) {
            auto command = nodeCommand("vassalEnterLifeNode", source.id, "Entered " + label);
            node.detail = actionable ? quoteReason(state, command) : "Return to Live to enter this node.";
            if (node.detail.empty() || !actionable) node.status = NodeStatus::available;
        } else node.detail = "Locked · This node is not a direct continuation of your route.";
        view.nodes.push_back(std::move(node));
    }
    const auto index = [&](std::string_view id) {
        return static_cast<std::size_t>(std::ranges::find(view.nodes, id, &LifeNode::id) - view.nodes.begin());
    };
    for (const auto& edge : graph.edges) {
        const auto from = index(edge.fromNodeId), to = index(edge.toNodeId);
        if (from < view.nodes.size() && to < view.nodes.size()) view.paths.emplace_back(from, to);
    }
    if (!detail || choosing || terminal) return view;
    if (map.pendingResolution) {
        const auto& pending = *map.pendingResolution;
        view.progress.emplace(static_cast<Second>(pending.startSec), static_cast<Second>(pending.resolveSec));
        view.decisionDetail = pending.kind == sim::browser::PendingLifeMapKind::shopDelve ? "Delve in progress" :
            pending.kind == sim::browser::PendingLifeMapKind::campaignEncounter ? "Campaign encounter in progress" : "Resolution in progress";
        view.choices.push_back({"Advance to " + decimal(pending.resolveSec) + " s", {}, {}, {},
            {{}, {}, "Resolution complete", true}});
    } else if (lineage.pendingHeirloomLoadout) {
        view.decision = "Successor's Heirlooms";
        view.decisionDetail = "Choose up to three Heirlooms from the vault, then confirm the loadout.";
        for (const auto& item : read(state, state.hot.civilization.heirloomVault))
            if (item) view.choices.push_back({relicLabel(item->definitionId), {}, {}, item->definitionId,
                {"vassalConfirmHeirloomLoadout", {{"instanceId", Value(item->instanceId)}}, {}}});
    } else if (const auto& queue = read(state, actor->developmentChoiceQueue); !queue.empty()) {
        view.decision = "Development";
        view.decisionDetail = "Choose the stat to improve.";
        for (const auto& id : queue.front().offeredStatIds)
            view.choices.push_back({statLabel(id, identity), {}, {}, {}, {"vassalChooseDevelopmentStat",
                {{"choiceId", Value(queue.front().choiceId)}, {"statId", Value(id)}}, "Stat improved"}});
    } else if (actor->commissionOffers && actor->commissionOffers->size()) {
        view.decision = "Commission";
        view.decisionDetail = "Choose a goal for this tenure.";
        for (const auto& offer : state.tables.view(*actor->commissionOffers))
            view.choices.push_back({read(state, offer.label), read(state, offer.description) + " · " +
                decimal(offer.prestige) + " Prestige", {}, {}, {"vassalChooseCommission",
                {{"offerId", Value(std::string(state.name(offer.offerId)))}}, "Commission accepted"}});
    } else if (!view.current.empty()) {
        const auto node = std::ranges::find(states, view.current, &sim::browser::LifeMapNodeStates::value_type::first);
        if (node != states.end()) activeChoices(view, state, *actor, node->second, actionable);
    }
    return view;
}

}
