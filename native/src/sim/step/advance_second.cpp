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

template<class Run>
void dispatch_second(RuntimeState& state, StageContext& context, const Run& run)
{
    const auto& hot = state.hot;
    if (!hot.variantFlags.settlementPrototypeEnabled) return;

    run(Stage::prelude);
    if (context.seasonChanged) {
        run(Stage::seasonal_practices);
        if (terminal(hot)) {
            run(Stage::final_flush);
            return;
        }
        const auto seasons = state.tables.view(hot.seasons);
        if (hot.currentSeasonIndex >= 0 && hot.currentSeasonIndex < static_cast<double>(seasons.size()) &&
            seasons[static_cast<std::size_t>(hot.currentSeasonIndex)] == state.settlementPrelude.spring) {
            run(Stage::spring_death_baseline);
        }
    }
    if (hot.tSec >= state.nextLunarBoundarySec) {
        const double duration = phase_duration(state.content->config.settings.values.phaseDurationSec);
        context.lunar = lunar_schedule_at_second(hot.tSec, duration);
        const double sinceBoundary = context.lunar.boundary ? 0 : js::remainder(hot.tSec - 1, duration);
        state.nextLunarBoundarySec = hot.tSec + (duration - sinceBoundary);
        if (context.lunar.boundary) {
            const double chaosBefore = hot.civilization.chaos.chaosPower.value_or(0);
            switch (context.lunar.phase) {
            case LunarPhase::birth:
                run(Stage::birth);
                break;
            case LunarPhase::food:
                run(Stage::food);
                run(Stage::after_meals_practices);
                run(Stage::garrison_upkeep);
                break;
            case LunarPhase::housing:
                run(Stage::housing);
                break;
            case LunarPhase::faith:
                run(Stage::faith);
                break;
            case LunarPhase::migration:
                if (hot.rulesetId) run(Stage::migration_practices);
                run(Stage::migration);
                break;
            case LunarPhase::death:
                run(Stage::death);
                run(Stage::death_practices);
                run(Stage::control_and_spatial_pressure);
                break;
            }
            context.chaosBefore = chaosBefore;
            run(Stage::phase_events_and_drain);
            context.chaosBefore.reset();
        }
    }
    if (!terminal(hot)) run(Stage::vassal_check);
    run(Stage::final_flush);
}

template<bool Observe>
bool advance_second(RuntimeState& state, StageObserver observer, void* observation)
{
    const auto& hot = state.hot;
    if (hot.paused || terminal(hot)) return false;

    StageContext context{};
    context.seasonChanged = state.seasonChanged;
    const auto run = [&](Stage stage) {
        if constexpr (Observe) observer(observation, stage, true);
        run_stage(stage, state, context);
        if constexpr (Observe) observer(observation, stage, false);
    };
    run(Stage::advance_clock);
    const bool advanced = context.clockBoundary.has_value();
    if (advanced) {
        dispatch_second(state, context, run);
        context.seasonChanged = false;
        if (context.clockBoundary->remainingTicks > 0 && !hot.paused && !terminal(hot)) {
            if constexpr (Observe) observer(observation, Stage::advance_clock, true);
            stages::finish_clock_tail(state, context);
            if constexpr (Observe) observer(observation, Stage::advance_clock, false);
        }
    }
    state.seasonChanged = context.seasonChanged;
    return advanced;
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
    return advance_second<false>(state, nullptr, nullptr);
}

bool advance_one_second(RuntimeState& state, StageObserver observer, void* context)
{
    return observer ? advance_second<true>(state, observer, context) : advance_one_second(state);
}

}
