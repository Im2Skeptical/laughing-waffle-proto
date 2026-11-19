#pragma once

#include "sim/state/runtime_state.hpp"

namespace waffle::sim {

struct Action {
    double tSec{};
    std::string kind;
    core::json::Value payload{core::json::Value::Object{}};
    std::optional<double> apCost;
};

// The journal owns JSON-compatible action data, indexed by second. Input
// order is retained for actions at the same second.
class ActionJournal {
public:
    static ActionJournal from_json(const core::json::Value& data);
    core::json::Value to_json() const;
    std::span<const Action> entries() const { return entries_; }

private:
    std::vector<Action> entries_;
};

struct ActionResult {
    std::string_view reason;
    core::json::Value detail;
    explicit operator bool() const { return reason.empty(); }
};

ActionResult apply_action(RuntimeState& state, const Action& action, bool isReplay = true);
void initialize_replay_clock(RuntimeState& state);

struct ReplayResult {
    std::string_view reason;
    const Action* action{};
    std::string_view actionReason;
    double tSec{};
    core::json::Value detail;
    explicit operator bool() const { return reason.empty(); }
};

// A forward cursor never re-applies an anchor's actions. It borrows an
// immutable journal, which also owns any failed action reported by the cursor.
class ReplayCursor {
public:
    ReplayCursor(const ActionJournal& journal, double startSec, bool actionsApplied);
    ReplayResult apply_boundary(RuntimeState& state);
    ReplayResult advance(RuntimeState& state);
    ReplayResult advance_to(RuntimeState& state, double targetSec);

private:
    std::span<const Action> remaining_;
};

struct RebuildResult {
    ReplayResult result;
    std::optional<RuntimeState> state;
};

inline constexpr std::size_t replay_anchor_stride = 64;

// Each anchor is a post-action runtime snapshot for this journal. The base
// state, when used without an anchor, is a pre-action snapshot.
RebuildResult rebuildStateAtSecond(const RuntimeState& initial, const ActionJournal& journal,
                                  double targetSec, std::span<const RuntimeState> anchors = {});

}
