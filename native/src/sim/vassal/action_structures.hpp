#pragma once

#include "sim/step/action_fields.hpp"

namespace waffle::sim::vassal::detail {

struct DraftStructure {
    browser::PurchaseReceiptPlacement placement;
    std::optional<runtime::StructureCell> confirmed;
};

struct StructureDraft {
    ActionResult result;
    std::vector<std::optional<DraftStructure>> slots;
    browser::StringArray stagedIds;
    browser::StringArray placementIds;
};

StructureDraft structure_draft(const RuntimeState& state, const runtime::Site& site,
                               const browser::LifeMapNodeState& node);
ActionResult prepare_structure_purchase(const RuntimeState& state, const runtime::Vassal& actor,
                                        const runtime::Site& site, const browser::LifeMapNodeState& node,
                                        const core::json::Value& payload, browser::PurchaseReceipt& receipt);
ActionResult move_structure(const RuntimeState& state, const runtime::Site& site,
                            browser::LifeMapNodeState& node, const core::json::Value& payload);
bool commit_structure_draft(RuntimeState& state, runtime::Site& site, const StructureDraft& draft);

}
