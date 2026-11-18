#include "sim/step/advance_second.hpp"

#include "core/js_number.hpp"
#include "sim/stages/entries.hpp"
#include "sim/state/runtime_state.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim {
namespace {

namespace js = core::js;

bool terminal(const runtime::HotState& hot) noexcept
{
    return hot.runStatus && hot.runStatus->complete;
}

double phase_duration(double setting) noexcept
{
    return std::isfinite(setting) ? std::max(1.0, js::floor(setting)) : 1.0;
}

void dispatch_second(RuntimeState& state, StageContext& context)
{
    const auto& hot = state.hot;
    if (!hot.variantFlags.settlementPrototypeEnabled) return;

    run_stage(Stage::prelude, state, context);
    if (context.seasonChanged) {
        run_stage(Stage::seasonal_practices, state, context);
        if (terminal(hot)) {
            run_stage(Stage::final_flush, state, context);
            return;
        }
        const auto seasons = state.tables.view(hot.seasons);
        if (hot.currentSeasonIndex >= 0 && hot.currentSeasonIndex < static_cast<double>(seasons.size()) &&
            seasons[static_cast<std::size_t>(hot.currentSeasonIndex)] == state.settlementPrelude.spring) {
            run_stage(Stage::spring_death_baseline, state, context);
        }
    }
    if (hot.tSec >= state.nextLunarBoundarySec) {
        const double duration = phase_duration(state.content->config.settings.values.phaseDurationSec);
        context.lunar = lunar_schedule_at_second(hot.tSec, duration);
        const double sinceBoundary = context.lunar.boundary ? 0 : js::remainder(hot.tSec - 1, duration);
        state.nextLunarBoundarySec = hot.tSec + (duration - sinceBoundary);
        if (context.lunar.boundary) {
            const double chaosBefore = hot.civilization.chaos.chaosPower;
            switch (context.lunar.phase) {
            case LunarPhase::birth:
                run_stage(Stage::birth, state, context);
                break;
            case LunarPhase::food:
                run_stage(Stage::food, state, context);
                run_stage(Stage::after_meals_practices, state, context);
                run_stage(Stage::garrison_upkeep, state, context);
                break;
            case LunarPhase::housing:
                run_stage(Stage::housing, state, context);
                break;
            case LunarPhase::faith:
                run_stage(Stage::faith, state, context);
                break;
            case LunarPhase::migration:
                if (hot.rulesetId) run_stage(Stage::migration_practices, state, context);
                run_stage(Stage::migration, state, context);
                break;
            case LunarPhase::death:
                run_stage(Stage::death, state, context);
                run_stage(Stage::death_practices, state, context);
                run_stage(Stage::control_and_spatial_pressure, state, context);
                break;
            }
            context.chaosBefore = chaosBefore;
            run_stage(Stage::phase_events_and_drain, state, context);
            context.chaosBefore.reset();
        }
    }
    if (!terminal(hot)) run_stage(Stage::vassal_check, state, context);
    run_stage(Stage::final_flush, state, context);
}

} // namespace

LunarSchedule lunar_schedule_at_second(double second, double phaseDurationSec) noexcept
{
    second = std::max(0.0, js::floor(second));
    if (second == 0) return {LunarPhase::birth, 0, false};

    constexpr double phaseCount = 6;
    const double duration = phase_duration(phaseDurationSec);
    const double elapsed = second - 1;
    const double phaseIndex = js::remainder(js::floor(elapsed / duration), phaseCount);
    return {static_cast<LunarPhase>(static_cast<int>(phaseIndex)), js::floor(elapsed / (duration * phaseCount)),
            js::remainder(elapsed, duration) == 0};
}

bool advance_one_second(RuntimeState& state)
{
    const auto& hot = state.hot;
    if (hot.paused || terminal(hot)) return false;

    StageContext context{};
    context.seasonChanged = state.seasonChanged;
    run_stage(Stage::advance_clock, state, context);
    const bool advanced = context.clockBoundary.has_value();
    if (advanced) {
        dispatch_second(state, context);
        context.seasonChanged = false;
        if (context.clockBoundary->remainingTicks > 0 && !hot.paused && !terminal(hot))
            stages::finish_clock_tail(state, context);
    }
    state.seasonChanged = context.seasonChanged;
    return advanced;
}

}
