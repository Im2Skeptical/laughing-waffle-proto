#pragma once

#include "sim/step/replay.hpp"

namespace waffle::sim::vassal {

struct ChoicePrice {
    double prestige{}, seconds{};
};

// Prices use the same modifiers as the node action.
ChoicePrice quote_choice(const RuntimeState&, const runtime::Vassal&, const browser::LifeMapNodeState&,
                         const browser::LifeMapOption&);

struct AgeRisk {
    double age{}, chance{};
};

AgeRisk mortality_at(const RuntimeState&, const runtime::Vassal&, double second);

}
