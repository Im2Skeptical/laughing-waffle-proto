#include "sim/vassal/action_structures.hpp"
#include "sim/vassal/detail.hpp"

namespace waffle::sim::vassal::detail {
namespace {

using Slots = std::vector<std::optional<DraftStructure>>;

ActionResult placement_result(const Slots& slots, const browser::StringArray& staged,
                               double width, double origin, bool demolish)
{
    if (!(width >= 1 && width <= 3 && origin >= 0 && origin + width <= slots.size()) ||
        std::floor(width) != width || std::floor(origin) != origin) return {"outsideConstructionStrip"};
    bool overlap = false;
    for (const auto& slot : slots) {
        if (!slot) continue;
        const auto& p = slot->placement;
        if (p.origin >= origin + width || p.origin + p.width <= origin) continue;
        if (std::ranges::find(staged, p.placementId) != staged.end()) return {"stagedStructureOverlap"};
        overlap = true;
    }
    return overlap && !demolish ? ActionResult{"structureOccupied"} : ActionResult{};
}

ActionResult build(StructureDraft& draft, DraftStructure piece)
{
    auto& slots = draft.slots;
    const auto& next = piece.placement;
    const auto result = placement_result(slots, draft.stagedIds, next.width, next.origin, true);
    if (!result) return result;
    if (next.placementId.empty() || std::ranges::any_of(slots, [&](const auto& slot) {
        return slot && slot->placement.placementId == next.placementId;
    })) return {"duplicatePlacementIdentity"};
    for (auto& slot : slots) {
        if (!slot) continue;
        const auto& p = slot->placement;
        if (p.origin < next.origin + next.width && p.origin + p.width > next.origin) slot.reset();
    }
    slots[static_cast<std::size_t>(next.origin)] = std::move(piece);
    return {};
}

std::optional<double> read_origin(const core::json::Value& payload)
{
    using namespace action_fields;
    const auto* raw = payload.find("origin");
    if (raw && raw->kind() == Kind::null) return std::nullopt;
    return number(payload, "origin").value_or(-1);
}

}

StructureDraft structure_draft(const RuntimeState& state, const Site& site, const browser::LifeMapNodeState& node)
{
    const auto& board = site.detailedState.structureSlots;
    StructureDraft draft;
    draft.slots.resize(board.footprint.size());
    std::vector<DraftStructure> pool;
    for (const auto& row : state.tables.view(board.origins)) {
        DraftStructure piece{
            {std::string(state.name(row.placementId)), double(row.origin), double(row.width),
                std::string(state.name(row.structureId)), {row.construction ? row.construction->completedCycles : 0}, row.qualityBonus},
            row,
        };
        draft.slots[row.origin] = piece;
        draft.placementIds.push_back(piece.placement.placementId);
        pool.push_back(std::move(piece));
    }
    for (const auto& purchase : node.purchasedOffers) {
        if (purchase.intervention.kind != "structure") continue;
        if (!purchase.placement) { draft.result = {"invalidStructureAction"}; return draft; }
        auto placement = *purchase.placement;
        std::optional<double> origin = placement.origin;
        if (node.structureDraftEdits) {
            const auto& edits = *node.structureDraftEdits;
            for (const auto& edit : edits)
                if (edit.placementId == placement.placementId) origin = edit.origin;
        }
        draft.placementIds.push_back(placement.placementId);
        if (origin) {
            placement.origin = *origin;
            draft.result = build(draft, DraftStructure{std::move(placement), {}});
            if (!draft.result) return draft;
        }
        draft.stagedIds.push_back(purchase.placement->placementId);
    }
    if (!node.structureDraftEdits) return draft;
    for (const auto& edit : *node.structureDraftEdits) {
        if (std::ranges::find(draft.stagedIds, edit.placementId) != draft.stagedIds.end()) continue;
        const auto original = std::ranges::find_if(pool, [&](const auto& piece) {
            return piece.placement.placementId == edit.placementId;
        });
        if (original == pool.end()) continue;
        for (auto& slot : draft.slots)
            if (slot && slot->placement.placementId == edit.placementId) slot.reset();
        if (!edit.origin) continue;
        auto next = *original;
        next.placement.origin = *edit.origin;
        draft.result = build(draft, std::move(next));
        if (!draft.result) return draft;
    }
    return draft;
}

ActionResult prepare_structure_purchase(const RuntimeState& state, const Vassal& actor, const Site& site,
                                        const browser::LifeMapNodeState& node, const core::json::Value& payload,
                                        browser::PurchaseReceipt& receipt)
{
    const auto& change = receipt.intervention;
    if (change.mode == "remove") return {"standaloneDemolitionUnavailable"};
    if (!change.structureId) return {"invalidStructureAction"};
    const auto& defs = state.content->config.gamepieces.structures;
    const auto def = std::ranges::find(defs, *change.structureId, &browser::GamepiecesStructures::value_type::first);
    const auto width = def == defs.end() ? 1 : def->second.footprint;
    const auto draft = structure_draft(state, site, node);
    if (!draft.result) return draft.result;
    const auto* raw = payload.find("origin");
    auto origin = read_origin(payload);
    if (!raw || !origin) {
        origin.reset();
        for (const auto demolish : {false, true}) {
            for (double cell = 0; cell + width <= draft.slots.size(); ++cell) {
                if (!placement_result(draft.slots, draft.stagedIds, width, cell, demolish)) continue;
                origin = cell;
                break;
            }
            if (origin) break;
        }
        if (!origin) return {"noCompatibleSpan"};
    }
    receipt.sourceOfferId = receipt.offerId;
    if (node.nextCommissionId != 0) receipt.offerId += ":c" + decimal(node.nextCommissionId);
    receipt.placement = browser::PurchaseReceiptPlacement{
        std::string(state.name(actor.vassalId)) + ":" + receipt.offerId, *origin, width,
        *change.structureId, {0}, change.qualityBonus.value_or(0) != 0 ? change.qualityBonus : std::nullopt,
    };
    return {};
}

ActionResult move_structure(const RuntimeState& state, const Site& site, browser::LifeMapNodeState& node,
                            const core::json::Value& payload)
{
    const auto id = action_fields::string(payload, "offerId");
    const auto origin = read_origin(payload);
    if (id.starts_with("structure:")) {
        const auto before = structure_draft(state, site, node);
        if (!before.result || std::ranges::find(before.placementIds, id.substr(10)) == before.placementIds.end())
            return {"placementUnavailable"};
        if (!node.structureDraftEdits) node.structureDraftEdits.emplace();
        node.structureDraftEdits->push_back({std::string(id.substr(10)), origin});
    } else {
        const auto purchase = std::ranges::find(node.purchasedOffers, id, &browser::PurchaseReceipt::offerId);
        if (purchase == node.purchasedOffers.end() || !purchase->placement) return {"placementLocked"};
        purchase->placement->origin = origin.value_or(-1);
    }
    return structure_draft(state, site, node).result;
}

bool commit_structure_draft(RuntimeState& state, Site& site, const StructureDraft& draft)
{
    auto& board = site.detailedState.structureSlots;
    const auto before = state.tables.view(board.footprint);
    std::vector<StructureCell> rows;
    bool changed = false;
    for (std::size_t i = 0; i < draft.slots.size(); ++i) {
        const auto& slot = draft.slots[i];
        if (!slot) {
            changed |= before[i] && state.tables.at(before[i]).origin == i;
            continue;
        }
        const auto& p = slot->placement;
        auto cell = slot->confirmed.value_or(StructureCell{});
        cell.origin = static_cast<std::uint32_t>(p.origin);
        if (!slot->confirmed) {
            cell.placementId = state.intern<InstanceId>(p.placementId, "shop Structure placement");
            cell.structureId = state.find_id<StructureId>(p.structureId);
            cell.width = static_cast<std::uint32_t>(p.width);
            cell.qualityBonus = p.qualityBonus;
            cell.construction = StructureCellConstruction{p.construction.completedCycles};
        }
        changed |= !before[i] || state.tables.at(before[i]).placementId != cell.placementId ||
            state.tables.at(before[i]).origin != i;
        rows.push_back(cell);
    }
    if (!changed) return false;
    board.origins = state.tables.table<StructureCell>().append(rows.size(), "shop Structure board");
    std::ranges::copy(rows, state.tables.view(board.origins).begin());
    auto footprint = state.tables.view(board.footprint);
    std::ranges::fill(footprint, Index<StructureCell>{});
    for (std::size_t i = 0; i < rows.size(); ++i) {
        const auto& row = rows[i];
        std::ranges::fill(footprint.subspan(row.origin, row.width),
            Index<StructureCell>{board.origins.begin + static_cast<std::uint32_t>(i)});
    }
    return true;
}

}
