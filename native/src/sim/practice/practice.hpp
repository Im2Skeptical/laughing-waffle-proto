#pragma once

#include "sim/content/vocabulary.hpp"
#include "sim/state/rows.generated.hpp"
#include "sim/practice/runtime.hpp"
#include "sim/territory/territory.hpp"

namespace waffle::sim {

struct RuntimeState;

namespace practice {

struct Provider {
    runtime::StockProvider record;
    std::span<const runtime::TraitId> traits;
    std::span<const runtime::TraitId> substitution;
};

// Optional spans distinguish an omitted field from an empty authored list.
// The emitter owns copies in the pending queue before it returns.
struct EventData {
    runtime::PracticeEventPayload fields;
    std::optional<std::span<const Provider>> providers;
    std::optional<std::span<const runtime::TraitId>> traits;
    std::optional<std::span<const runtime::TagId>> tags;
    std::optional<std::span<const runtime::RegionId>> sources;
};

runtime::PracticeEvent emit(RuntimeState& state, EventKind kind,
                            std::optional<runtime::RegionId> region = {}, EventData data = {});
// Producers can journal event kinds that have no compiled Charge trigger.
runtime::PracticeEvent emit(RuntimeState& state, runtime::EventKindId kind,
                            std::optional<runtime::RegionId> region = {}, EventData data = {});

// Reactions are synchronous. A call from inside a root leaves its work queued
// for the outer drain. Call at the original browser phase seam.
void drain(RuntimeState& state);
void activate(RuntimeState& state, content::Activation activation,
              std::optional<content::Stage> stage = {});
// Rebuild after a board or site membership change. Charge, staffing and
// upkeep are read live and do not invalidate the index.
void rebuild_listeners(RuntimeState& state);

}
}
