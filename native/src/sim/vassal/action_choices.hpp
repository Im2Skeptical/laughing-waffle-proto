#pragma once

#include "sim/step/replay.hpp"
#include "sim/practice/stock.hpp"

namespace waffle::sim::vassal::detail {

double immediate_risk(const RuntimeState&, const runtime::Vassal&, const browser::LifeMapOption&);
bool create_node_choices(RuntimeState& state, const runtime::Vassal& actor, browser::LifeMapNodeState& node);
ActionResult commit_node_choice(RuntimeState& state, runtime::Vassal& actor,
                                browser::LifeMapNodeState& node, const browser::LifeMapOption& option,
                                double price);
ActionResult change_connection(RuntimeState& state, runtime::Vassal& actor, const browser::Intervention& action);
browser::LifeMapNodeStateOptions relic_options(RuntimeState& state, const runtime::Vassal& actor, bool special);
void roll_tour_reward(RuntimeState& state, const runtime::Vassal& actor, browser::LifeMapOption& option);
ActionResult acquire_relic(RuntimeState& state, runtime::Vassal& actor, std::string_view definition,
                           const core::json::Value& acquisition, bool commit);
double action_stock_total(const RuntimeState& state, const runtime::Site* site, runtime::TraitId trait);
practice::StockPlan action_stock_plan(const RuntimeState& state, const runtime::Site* site,
                                     const runtime::TraitId& trait, double amount);
bool campaign_blocked(const RuntimeState& state, const runtime::Vassal& actor, const browser::LifeMapOption& option);
ActionResult commit_campaign(RuntimeState& state, runtime::Vassal& actor, browser::LifeMapNodeState& node,
                             const browser::LifeMapOption& option, double price, double phaseCost);

}
