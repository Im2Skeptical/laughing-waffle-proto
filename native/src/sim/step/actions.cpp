#include "sim/step/action_fields.hpp"

#include "core/js_number.hpp"
#include "sim/practice/detail.hpp"
#include "sim/practice/stock.hpp"
#include "sim/territory/detail.hpp"
#include "sim/vassal/actions.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim {
namespace {

using namespace runtime;
using namespace action_fields;

ActionResult assign_garrison(RuntimeState& state, const Value& payload)
{
    const auto player = state.practiceVocabulary.player;
    const auto source = state.find_id<RegionId>(string(payload, "regionId"));
    if (!territory::can_assign_garrison(state, source))
        return {"garrisonUnavailable"};
    auto& site = *settlement::detailed_site(state, source);

    std::optional<RegionId> target;
    const auto* requested = payload.find("targetRegionId");
    if (requested && requested->kind() != Kind::null) {
        const auto id = state.find_id<RegionId>(string(payload, "targetRegionId"));
        if (territory::garrison_target(state, site, id) != territory::GarrisonTarget::eligible)
            return {"supportTargetUnavailable"};
        target = id;
    }

    auto& garrison = site.detailedState.garrison;
    if (!garrison) garrison.emplace().supplied = false;
    const auto assigned = target ? browser::OptionalNullable<RegionId>(*target)
                                 : browser::OptionalNullable<RegionId>(std::nullopt);
    garrison->supportTargetRegionId = assigned;
    practice::EventData event;
    event.fields.targetRegionId = assigned;
    event.fields.faction = browser::OptionalNullable<FactionId>(player);
    practice::emit(state, state.intern<EventKindId>("garrisonAssigned", "action"), source, event);
    return {};
}

ActionResult regional_practice(RuntimeState& state, const Value& payload, bool install)
{
    constexpr std::array<std::string_view, 6> practices{"cultivate", "store", "study", "mobilize", "administer", "exchange"};
    const auto practice = string(payload, "practiceId");
    if (install && std::ranges::find(practices, practice) == practices.end()) return {"invalidPracticeId"};
    const auto id = state.find_id<RegionId>(string(payload, "regionId"));
    if (!id || id.value >= state.hot.world.regions.size()) return {"invalidRegionId"};
    auto& region = territory::region_at(state, id);
    if (region.controller != state.practiceVocabulary.player) return {"notPlayerControlled"};
    // Ordinary v52 full-map regions have no legacy regional-Practice board.
    if (!region.installedPracticeIds) return {install ? "regionalPracticeBoardUnavailable" : "invalidInstalledIndex"};
    const auto old = *region.installedPracticeIds;
    if (!install) {
        const auto index = number(payload, "installedIndex").value_or(-1);
        if (!(index >= 0 && index < old.size()) || index != std::floor(index)) return {"invalidInstalledIndex"};
        auto ids = state.tables.view(old);
        std::ranges::move(ids.subspan(static_cast<std::size_t>(index) + 1), ids.begin() + static_cast<std::size_t>(index));
        --region.installedPracticeIds->end;
        return {};
    }
    // The v52 wire shape carries the installed list but omits the old capacity.
    const auto practiceId = state.intern<PracticeId>(practice, "regional Practice");
    const auto next = state.tables.table<PracticeId>().append(old.size() + 1, "regional Practice board");
    auto ids = state.tables.view(next);
    std::ranges::copy(state.tables.view(old), ids.begin());
    ids.back() = practiceId;
    region.installedPracticeIds = next;
    return {};
}

ActionResult debug_cap(RuntimeState& state, const Value& payload)
{
    auto& hot = state.hot;
    const auto cap = number(payload, "cap");
    const auto points = number(payload, "points");
    const auto* enabled = payload.find("enabled");
    if (enabled && enabled->kind() == Kind::boolean ? enabled->as_bool() : cap || points) {
        const auto overrideCap = std::max(0.0, std::floor(cap.value_or(hot.actionPointCap)));
        const auto overridePoints = std::floor(points.value_or(overrideCap));
        hot.apCapOverride = ApCapOverride{true, overrideCap, overridePoints};
        hot.actionPointCap = overrideCap;
        hot.actionPoints = std::clamp(overridePoints, 0.0, overrideCap);
    } else {
        hot.apCapOverride.reset();
        const auto phase = core::js::remainder(hot.tSec, 6);
        const auto baseCap = core::js::round(((phase <= 3 ? phase : 6 - phase) / 3) * 120);
        hot.actionPointCap = std::max(0.0, baseCap + std::floor(hot.skillRuntime.modifiers.global.apCapBonus));
        hot.actionPoints = std::min(hot.actionPoints, hot.actionPointCap);
    }
    return {};
}

}

ActionResult apply_action(RuntimeState& state, const Action& action, bool isReplay)
{
    auto& hot = state.hot;
    if (territory::terminal(state)) return {"runComplete"};
    if (action.kind.empty()) return {"badAction"};
    if (!isReplay && action.kind != "debugSetCap" && !hot.paused) return {"mustBePaused"};
    const double rawCost = action.apCost.value_or(number(action.payload, "apCost").value_or(0));
    const double cost = hot.variantFlags.actionPointCostsEnabled && std::isfinite(rawCost)
        ? std::max(0.0, std::floor(rawCost)) : 0;
    if (cost > 0 && hot.actionPoints < cost)
        return {"insufficientAP", Value(Value::Object{{"needed", Value(cost)}, {"current", Value(hot.actionPoints)}})};

    ActionResult result;
    const auto& kind = action.kind;
    if (kind == "debugSetCap") result = debug_cap(state, action.payload);
    else if (kind == "debugSetSettlementSlotOverrides") result = {"badOverrides"};
    else if (kind == "settlementAssignGarrison") result = assign_garrison(state, action.payload);
    else if (kind == "regionInstallPractice" || kind == "regionUninstallPractice")
        result = regional_practice(state, action.payload, kind == "regionInstallPractice");
    else result = vassal::apply_action(state, action);
    if (result && cost > 0) state.hot.actionPoints -= cost;
    return result;
}

}
