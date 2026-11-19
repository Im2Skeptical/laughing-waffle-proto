#include "sim/vassal/detail.hpp"

#include "sim/practice/practice.hpp"
#include "sim/practice/detail.hpp"
#include "sim/settlement/site_access.hpp"

namespace waffle::sim::vassal::detail {
namespace {

bool place_structure(RuntimeState& state, Site& site, StructureId id)
{
    const auto width = static_cast<std::uint32_t>(practice::detail::definition(state, id).footprint);
    auto& board = site.detailedState.structureSlots;
    auto footprint = state.tables.view(board.footprint);
    if (width == 0 || width > footprint.size()) return false;
    std::size_t origin = 0;
    for (; origin + width <= footprint.size(); ++origin)
        if (std::ranges::none_of(footprint.subspan(origin, width), [](auto cell) { return bool(cell); })) break;
    if (origin + width > footprint.size()) return false;
    const auto placement = intern<InstanceId>(state,
        std::string(state.name(site.regionId)) + ":" + decimal(state.hot.tSec) + ":" + std::to_string(origin));
    const auto prior = board.origins;
    if (std::ranges::find(state.tables.view(prior), placement, &StructureCell::placementId)
        != state.tables.view(prior).end()) return false;
    board.origins = state.tables.table<StructureCell>().append(prior.size() + 1, "Vassal founding");
    const auto old = state.tables.view(prior);
    auto cells = state.tables.view(board.origins);
    const auto insertion = std::ranges::lower_bound(old, origin, {}, &StructureCell::origin);
    const auto next = std::copy(old.begin(), insertion, cells.begin());
    *next = {.structureId = id, .origin = static_cast<std::uint32_t>(origin), .width = width, .placementId = placement};
    std::copy(insertion, old.end(), next + 1);
    for (std::uint32_t i = 0; i < cells.size(); ++i) {
        const auto& cell = cells[i];
        std::ranges::fill(footprint.subspan(cell.origin, cell.width), Index<StructureCell>{board.origins.begin + i});
    }
    return true;
}

}

bool apply_timed_class_action(RuntimeState& state, Vassal& actor, const browser::LifeMapOptionClassAction& action)
{
    auto* site = settlement::detailed_site(state, actor.locationRegionId);
    const auto priorClass = class_name(actor);
    const auto trainingClass = action.classId ? std::string_view(*action.classId) : priorClass;
    if (action.kind != "train" || !site || (trainingClass != "scholar" && trainingClass != "warrior")) return false;
    const bool scholar = trainingClass == "scholar";
    const auto specialty = scholar ? content::SpecialistClass::scholar : content::SpecialistClass::warrior;

    // The browser roots Founding in vassalAction before the class is established.
    // Training and immediate placement emit no child Practice events.
    practice::EventData event;
    event.fields.classId = priorClass.empty() ? browser::OptionalNullable<SymbolId>{std::nullopt}
        : browser::OptionalNullable<SymbolId>{intern<SymbolId>(state, priorClass)};
    event.fields.actionKind = intern<SymbolId>(state, action.kind);
    practice::emit(state, intern<EventKindId>(state, "vassalAction"), actor.locationRegionId, event);
    practice::train_specialists(state, *site, action.count.value_or(scholar ? 2 : 10), specialty);
    if (action.structureId) {
        const auto id = state.find_id<StructureId>(*action.structureId);
        if (id && place_structure(state, *site, id)) practice::rebuild_listeners(state);
    }
    if (action.establishClass.value_or(false)) {
        const auto established = scholar ? browser::SpecialistClass::scholar : browser::SpecialistClass::warrior;
        state.hot.civilization.vassalLineage.establishedClassId = established;
        actor.classId = established;
        add_event(state, actor, "classFounded", std::string(state.name(actor.vassalId)) + ":founded", {}, {}, {},
            std::string(state.name(actor.archetype)) + (scholar ? " established Scholars" : " established Warriors"));
    }
    practice::drain(state);
    return true;
}

}
