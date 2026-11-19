#include "sim/stages/entries.hpp"
#include "sim/practice/practice.hpp"
#include "sim/settlement/site_access.hpp"

namespace waffle::sim::stages {

bool phase_events_and_drain(RuntimeState& state, StageContext& context)
{
    using practice::EventKind;
    const auto balance = state.hot.civilization.chaos.chaosPower.value_or(0);
    if (context.chaosBefore && balance > *context.chaosBefore) {
        practice::EventData event{};
        event.fields.amount = balance - *context.chaosBefore;
        practice::emit(state, EventKind::chaosIncreased, {}, event);
    }
    practice::EventData event{};
    event.fields.phase = state.settlementPrelude.phases[static_cast<unsigned>(context.lunar.phase)];
    for (const auto id : settlement::detailed_sites(state))
        practice::emit(state, EventKind::phaseResolved, settlement::site_at(state, id).regionId, event);
    practice::drain(state);
    return true;
}

}
