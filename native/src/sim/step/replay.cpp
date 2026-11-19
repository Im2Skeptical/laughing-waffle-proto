#include "sim/step/replay.hpp"

#include "sim/step/advance_second.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim {
namespace {

using core::json::Value;
using Kind = Value::Kind;

constexpr double maxSafeSecond = 0x1p53 - 1;

bool valid_second(double value)
{
    return value >= 0 && value <= maxSafeSecond;
}

}

ActionJournal ActionJournal::from_json(const Value& data)
{
    ActionJournal journal;
    if (data.kind() != Kind::array) throw std::invalid_argument("action journal must be an array");
    for (const auto& entry : data.as_array()) {
        const auto* second = entry.find("tSec");
        const auto* kind = entry.find("kind");
        const auto* payload = entry.find("payload");
        const auto* cost = entry.find("apCost");
        if (!second || second->kind() != Kind::number || !valid_second(second->as_number()) ||
            second->as_number() != std::floor(second->as_number()) || !kind ||
            kind->kind() != Kind::string || kind->as_string().empty() ||
            (payload && payload->kind() != Kind::object && payload->kind() != Kind::null))
            throw std::invalid_argument("invalid action journal entry");
        const auto topCost = cost && cost->kind() != Kind::null
            ? std::optional(cost->kind() == Kind::number ? cost->as_number() : 0) : std::nullopt;
        journal.entries_.push_back({second->as_number(), kind->as_string(),
            payload ? *payload : Value(Value::Object{}), topCost});
    }
    std::ranges::stable_sort(journal.entries_, {}, &Action::tSec);
    return journal;
}

Value ActionJournal::to_json() const
{
    Value::Array data;
    data.reserve(entries_.size());
    for (const auto& action : entries_) {
        Value entry(Value::Object{{"tSec", Value(action.tSec)}, {"kind", Value(action.kind)}, {"payload", action.payload}});
        if (action.apCost) entry.set("apCost", Value(*action.apCost));
        data.push_back(std::move(entry));
    }
    return Value(std::move(data));
}

ReplayCursor::ReplayCursor(const ActionJournal& journal, double startSec, bool actionsApplied)
{
    const auto entries = journal.entries();
    const auto first = actionsApplied ? std::ranges::upper_bound(entries, startSec, {}, &Action::tSec)
                                      : std::ranges::lower_bound(entries, startSec, {}, &Action::tSec);
    remaining_ = {first, entries.end()};
}

void initialize_replay_clock(RuntimeState& state)
{
    state.hot.paused = state.hot.runStatus && state.hot.runStatus->complete;
    state.hot.simStepIndex = state.hot.tSec * ticksPerSecond;
}

ReplayResult ReplayCursor::apply_boundary(RuntimeState& state)
{
    const auto second = state.hot.tSec;
    while (!remaining_.empty() && remaining_.front().tSec == second) {
        const auto& action = remaining_.front();
        auto result = apply_action(state, action);
        if (!result) return {"actionFailed", &action, result.reason, second, std::move(result.detail)};
        remaining_ = remaining_.subspan(1);
    }
    return {};
}

ReplayResult ReplayCursor::advance(RuntimeState& state)
{
    const auto before = state.hot.tSec;
    if (!remaining_.empty() && remaining_.front().tSec <= before)
        return {"unappliedBoundary", &remaining_.front(), {}, before};
    if (!advance_one_second(state) || state.hot.tSec != before + 1)
        return {"advanceFailed", nullptr, {}, before};
    return apply_boundary(state);
}

ReplayResult ReplayCursor::advance_to(RuntimeState& state, double targetSec)
{
    if (auto result = apply_boundary(state); !result) return result;
    while (state.hot.tSec < targetSec) {
        if (auto result = advance(state); !result) return result;
    }
    return {};
}

RebuildResult rebuildStateAtSecond(const RuntimeState& initial, const ActionJournal& journal,
                                  double targetSec, std::span<const RuntimeState> anchors)
{
    if (!valid_second(targetSec)) return {{"badTargetSec"}, {}};
    const auto target = std::floor(targetSec);
    if (target < initial.hot.tSec) return {{"beforeInitialState", nullptr, {}, initial.hot.tSec}, {}};
    const auto after = std::ranges::upper_bound(anchors, target, {},
        [](const RuntimeState& state) { return state.hot.tSec; });
    const auto* anchor = after == anchors.begin() ? nullptr : &*std::prev(after);
    auto state = anchor ? *anchor : initial;
    // Runtime anchors were produced by the replay driver at second boundaries.
    if (!anchor) initialize_replay_clock(state);
    ReplayCursor cursor(journal, state.hot.tSec, anchor != nullptr);
    const auto result = cursor.advance_to(state, target);
    if (!result) return {result, {}};
    return {{}, std::move(state)};
}

}
