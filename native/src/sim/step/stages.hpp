#pragma once

#include "sim/step/advance_second.hpp"

#include <optional>
#include <string_view>

namespace waffle::sim {

enum class Stage {
    advance_clock,
    prelude,
    seasonal_practices,
    spring_death_baseline,
    birth,
    food,
    after_meals_practices,
    garrison_upkeep,
    housing,
    faith,
    migration_practices,
    migration,
    death,
    death_practices,
    control_and_spatial_pressure,
    phase_events_and_drain,
    vassal_check,
    final_flush,
};

struct StageContext {
    LunarSchedule lunar{};
    bool seasonChanged{};
    std::optional<bool> boardDirty;
    std::optional<double> chaosBefore;

    // Set by advance_clock when tSec reaches a dispatch boundary.
    // remainingTicks is nonzero only when starting from a mid-second anchor.
    struct ClockBoundary {
        double lastStepIndex;
        int remainingTicks;
    };
    std::optional<ClockBoundary> clockBoundary;
};

std::optional<Stage> stage_from_name(std::string_view name) noexcept;
std::string_view stage_name(Stage stage);

// Execute a single stage at its entry boundary. The caller owns scheduling.
// Return whether the whole stage is ported, including for an identity result.
bool run_stage(Stage stage, RuntimeState& state, StageContext& context);

}
