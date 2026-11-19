#include "sim/stages/entries.hpp"
#include "sim/practice/practice.hpp"
#include "sim/state/runtime_state.hpp"

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
    practice::resolve_phase(state, state.settlementPrelude.phases[static_cast<unsigned>(context.lunar.phase)]);
    return true;
}

}
