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


struct ShopPlacement {
    std::size_t origin{}, width{};
    std::vector<std::string> demolished;
};

struct ShopQuote {
    browser::ShopOffer offer;
    browser::PurchaseReceipt price;
    std::string_view reason;
    std::vector<ShopPlacement> placements;
};

std::vector<ShopQuote> quote_shop(const RuntimeState&, const runtime::Vassal&, const browser::LifeMapNodeState&,
                                 bool validate);

struct ShopPractice {
    std::string id, receipt;
};

struct ShopPracticeBoard {
    std::vector<ShopPractice> order;
    std::size_t capacity{};
};

ShopPracticeBoard read_shop_practices(const RuntimeState&, const runtime::Site&, const browser::LifeMapNodeState&);

}
