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

struct ShopSpan {
    std::size_t origin{}, width{};
    std::string replacement;
};

struct ShopItem {
    std::string id, label, art, description, cost, reason;
    std::vector<ShopSpan> spans;
    LifeCommand command;
};

struct ShopReading {
    std::string region, funds, total;
    std::vector<ShopItem> offers, staged;
    std::vector<std::string> cells;
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
    std::optional<ShopReading> shop;
    bool canReroll{};
};

LifeReading readLifeMap(const sim::RuntimeState& state, bool actionable, bool detail);
std::string actionReason(std::string_view code);

}
