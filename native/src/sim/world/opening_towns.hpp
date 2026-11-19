#pragma once

#include "sim/browser/generated/game_state.hpp"

#include <string_view>

namespace waffle::sim::opening {

browser::DetailedSettlement empty_settlement();
browser::NeutralMarket town_market(std::string_view type);
void seed_population(browser::DetailedSettlement& settlement, std::string_view faction,
                     std::string_view crownRole, double population);

}
