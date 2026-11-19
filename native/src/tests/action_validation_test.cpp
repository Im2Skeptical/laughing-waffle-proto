#include "sim/step/replay.hpp"
#include "tools/json_file.hpp"

#include <iostream>

namespace {

using namespace waffle;
using core::json::Value;

void require(bool ok, std::string_view message)
{
    if (!ok) throw std::runtime_error(std::string(message));
}

void verify_rejections(sim::RuntimeState& state, const Value& cases)
{
    const auto expected = sim::state_digest(state);
    for (const auto& entry : cases.as_array()) {
        const auto journal = sim::ActionJournal::from_json(Value(Value::Array{*entry.find("action")}));
        sim::ReplayCursor cursor(journal, state.hot.tSec, false);
        const auto result = cursor.apply_boundary(state);
        require(!result && result.reason == "actionFailed" && result.action == &journal.entries().front(),
            "expected replay to report the failed action");
        require(result.actionReason == entry.find("reason")->as_string(), "action rejection reason differs from browser");
        require(sim::state_digest(state) == expected, "rejected replay action mutated state");
    }
}

void verify_order_and_ap(sim::RuntimeState state)
{
    state.hot.variantFlags.actionPointCostsEnabled = true;
    const auto journal = sim::ActionJournal::from_json(core::json::parse(R"([
        {"tSec":1,"kind":"debugSetCap","payload":{"cap":7}},
        {"tSec":0,"kind":"debugSetCap","payload":{"cap":9,"points":6}},
        {"tSec":0,"kind":"settlementRerollVassals","apCost":2,"payload":{"apCost":100}},
        {"tSec":0,"kind":"settlementRerollVassals","payload":{"apCost":5}}
    ])"));
    const auto parsed = sim::ActionJournal::from_json(journal.to_json());
    sim::ReplayCursor cursor(parsed, 0, false);
    const auto result = cursor.apply_boundary(state);
    require(result.actionReason == "insufficientAP", "expected final same-second action to fail AP gate");
    require(result.detail.find("needed")->as_number() == 5 && result.detail.find("current")->as_number() == 4,
        "AP rejection omitted the requested and available points");
    require(state.hot.actionPoints == 4 && state.hot.tSec == 0 &&
        state.hot.civilization.vassalLineage.candidateRerollCount == 1, "AP or journal order diverged");
    const auto expected = sim::state_digest(state);
    require(cursor.apply_boundary(state).actionReason == "insufficientAP", "rejected action advanced the cursor");
    require(sim::state_digest(state) == expected, "retrying rejected action mutated state");
    const sim::Action live{0, "settlementRerollVassals"};
    state.hot.paused = false;
    require(sim::apply_action(state, live, false).reason == "mustBePaused", "live pause gate diverged");
    const auto rebuilt = sim::rebuildStateAtSecond(state, parsed, 0);
    require(!rebuilt.state && rebuilt.result.actionReason == "insufficientAP", "failed rebuild published a state");
}

}

int main(int argc, char** argv)
{
    try {
        require(argc == 3, "expected initial state and rejection fixture");
        const auto data = core::json::parse(tools::read_file(argv[1]));
        auto state = sim::admit_runtime(sim::browser::import_game_state(data), nullptr, data.find("gameConfig"));
        verify_rejections(state, core::json::parse(tools::read_file(argv[2])));
        verify_order_and_ap(std::move(state));
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
