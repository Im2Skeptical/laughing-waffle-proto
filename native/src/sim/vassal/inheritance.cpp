#include "sim/vassal/detail.hpp"

namespace waffle::sim::vassal::detail {
namespace {

const HeirloomDef* definition(const browser::Heirloom& item)
{
    const auto def = std::ranges::find(heirloomDefs, item.definitionId, &HeirloomDef::id);
    return def == std::end(heirloomDefs) ? nullptr : def;
}

std::string_view state_name(browser::InheritanceState state)
{
    using enum browser::InheritanceState;
    switch (state) {
    case sanctified: return "sanctified";
    case unmarked: return "unmarked";
    case fragile: return "fragile";
    }
    return {};
}

}

Bonuses bonuses(const RuntimeState& state, const Vassal& actor)
{
    Bonuses result;
    for (const auto& item : read(state, actor.heirlooms).equipped) {
        const auto* def = item ? definition(*item) : nullptr;
        if (!def) continue;
        result.patronage += def->patronage;
        result.development += def->development;
        result.crossroads += def->crossroads;
        result.cunning += def->cunning;
        result.wisdomMultiplier = std::max(result.wisdomMultiplier, def->wisdomMultiplier);
    }
    return result;
}

bool spend_mandate(RuntimeState& state, Vassal& actor)
{
    auto items = read(state, actor.heirlooms);
    for (auto& item : items.equipped) {
        const auto* def = item ? definition(*item) : nullptr;
        if (!def || !def->mandate) continue;
        if (item->protectionSpent) return false;
        item->protectionSpent = true;
        replace(state, actor.heirlooms, items);
        return true;
    }
    return false;
}

void inherit(RuntimeState& state, Vassal& actor)
{
    using enum browser::InheritanceState;
    auto& civ = state.hot.civilization;
    auto& lineage = civ.vassalLineage;
    browser::LineageLastInheritanceReport report;
    report.vassalId = state.name(actor.vassalId);
    report.endedReason = state.name(*actor.endedReason);
    browser::HeirloomArray combined;
    for (const auto& item : read(state, civ.heirloomVault))
        if (item) combined.push_back(*item);
    const auto& inventory = read(state, actor.heirlooms);
    for (const auto* slots : {&inventory.equipped, &inventory.carry}) {
        for (const auto& item : *slots) {
            if (!item) continue;
            const auto from = item->inheritanceState;
            const bool broke = from == fragile && roll(state) < .5;
            const auto to = from == sanctified ? sanctified : fragile;
            const auto* def = definition(*item);
            report.entries.push_back({
                item->instanceId, item->definitionId, def ? std::string(def->label) : item->definitionId,
                def ? std::string(def->quality) : "bronze", std::string(state_name(from)),
                broke ? "broke" : "survived", broke ? std::nullopt : std::optional(std::string(state_name(to))),
            });
            if (!broke) {
                auto survivor = *item;
                survivor.inheritanceState = to;
                survivor.protectionSpent = false;
                combined.push_back(std::move(survivor));
            }
        }
    }
    replace(state, actor.heirlooms, browser::VassalHeirlooms{});
    browser::VaultSlots vault;
    report.overflowRequired = combined.size() > vault.size();
    if (report.overflowRequired) {
        using Ref = decltype(lineage.pendingVaultOverflow)::value_type;
        if (lineage.pendingVaultOverflow) replace(state, *lineage.pendingVaultOverflow, combined);
        else lineage.pendingVaultOverflow = store<Ref>(state, combined);
    } else {
        std::move(combined.begin(), combined.end(), vault.begin());
        lineage.pendingVaultOverflow.reset();
    }
    replace(state, civ.heirloomVault, vault);
    using Ref = decltype(lineage.lastInheritanceReport)::value_type;
    if (lineage.lastInheritanceReport) replace(state, *lineage.lastInheritanceReport, report);
    else lineage.lastInheritanceReport = store<Ref>(state, report);
}

}
