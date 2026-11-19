#pragma once

#include "connected_model.hpp"
#include "core/json.hpp"

namespace waffle::sim { struct RuntimeState; }

namespace waffle::connected {

struct LifeCommand {
    std::string kind;
    core::json::Value::Object payload;
    std::string feedback;
    bool advance{};
};

struct LifeChoice {
    std::string label, detail, reason, art;
    LifeCommand command;
    bool selected{};
};

enum class NodeStatus { locked, available, current, completed };

struct LifeNode {
    std::string id, label, glyph, detail;
    double x{}, y{};
    NodeStatus status{};
};

struct LifeCandidate {
    std::string name, art, location;
    double age{}, prestige{};
    std::vector<std::pair<std::string, double>> stats;
    LifeCommand command;
};

struct LifeReading {
    std::string actor, name, location, summary, succession;
    std::string current, decision, decisionDetail;
    double tenures{}, rerolls{};
    std::vector<LifeCandidate> candidates;
    std::vector<LifeNode> nodes;
    std::vector<std::pair<std::size_t, std::size_t>> paths;
    std::vector<LifeChoice> choices;
    std::vector<std::pair<Second, std::string>> events;
    std::optional<std::pair<Second, Second>> progress;
    bool canReroll{};
};

LifeReading readLifeMap(const sim::RuntimeState& state, bool actionable, bool detail);
std::string actionReason(std::string_view code);

}
