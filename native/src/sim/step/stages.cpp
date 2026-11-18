#include "sim/step/stages.hpp"

#include "sim/stages/entries.hpp"

#include <array>

namespace waffle::sim {
namespace {

struct StageEntry {
    std::string_view name;
    bool (*run)(RuntimeState&, StageContext&);
};

constexpr std::array entries{
    StageEntry{"advance_clock", stages::advance_clock},
    StageEntry{"prelude", stages::prelude},
    StageEntry{"seasonal_practices", stages::seasonal_practices},
    StageEntry{"spring_death_baseline", stages::spring_death_baseline},
    StageEntry{"birth", stages::birth},
    StageEntry{"food", stages::food},
    StageEntry{"after_meals_practices", stages::after_meals_practices},
    StageEntry{"garrison_upkeep", stages::garrison_upkeep},
    StageEntry{"housing", stages::housing},
    StageEntry{"faith", stages::faith},
    StageEntry{"migration_practices", stages::migration_practices},
    StageEntry{"migration", stages::migration},
    StageEntry{"death", stages::death},
    StageEntry{"death_practices", stages::death_practices},
    StageEntry{"control_and_spatial_pressure", stages::control_and_spatial_pressure},
    StageEntry{"phase_events_and_drain", stages::phase_events_and_drain},
    StageEntry{"vassal_check", stages::vassal_check},
    StageEntry{"final_flush", stages::final_flush},
};
static_assert(entries.size() == static_cast<std::size_t>(Stage::final_flush) + 1);

}

std::optional<Stage> stage_from_name(std::string_view name) noexcept
{
    for (std::size_t index = 0; index < entries.size(); ++index) {
        if (entries[index].name == name) return static_cast<Stage>(index);
    }
    return std::nullopt;
}

std::string_view stage_name(Stage stage)
{
    return entries.at(static_cast<std::size_t>(stage)).name;
}

bool run_stage(Stage stage, RuntimeState& state, StageContext& context)
{
    return entries.at(static_cast<std::size_t>(stage)).run(state, context);
}

}
