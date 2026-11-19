#pragma once

#include "sim/content/vocabulary.hpp"

namespace waffle::sim {
struct RuntimeState;
namespace runtime { struct Site; }

namespace territory {

struct ExternalPlan {
    bool ok = true;
    double bonus{};
    runtime::RegionId target{};
};

void prepare(RuntimeState& state);
void resolve_control(RuntimeState& state);
void step_pressure(RuntimeState& state);
void finish_unrest_expiry(RuntimeState& state, runtime::Site& site);
void synchronize_sites(RuntimeState& state);

// Synchronous recipe hooks. Preflight is read-only. Commit is inside the
// recipe root, after Stock/population commits and before the effect list.
ExternalPlan plan_external(const RuntimeState& state, const runtime::Site& site, content::ExternalAction action);
void commit_external(RuntimeState& state, const runtime::Site& site, content::ExternalAction action,
                     runtime::PracticeId practice, ExternalPlan plan);
void add_pressure(RuntimeState& state, double amount);
void trigger_spawn(RuntimeState& state, double count);

}
}
