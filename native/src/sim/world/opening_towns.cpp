#include "sim/world/opening_towns.hpp"

#include "core/js_number.hpp"

#include <algorithm>
#include <stdexcept>
#include <tuple>

namespace waffle::sim::opening {
namespace {

using namespace browser;
using namespace std::string_view_literals;

struct TownProfile {
    std::string_view type;
    std::string_view name;
    double housing;
    double defense;
    std::initializer_list<std::string_view> practices;
};

// Authored storefront and occupation recipes from neutral-market.js.
const TownProfile townProfiles[]{
    {"forager", "Forager Hamlet", 18, 3,
        {"rm_scrubForaging", "fm_hearthBarter", "rm_neglectedFlocks", "rm_withheldSpoils"}},
    {"grain", "Grain Village", 30, 4,
        {"fm_fallowFields", "fm_handQuern", "rm_scrubForaging", "fm_hearthBarter", "rm_saltMonopoly"}},
    {"timber", "Timber Village", 24, 4,
        {"fm_woodlotRights", "fm_hearthBarter", "rm_siltedChannels", "rm_rottingPulpVat", "rm_splinteredBowWorkshop"}},
    {"quarry", "Quarry Village", 30, 5,
        {"fm_rubblePicking", "fm_hearthBarter", "fm_scrapGathering", "fm_peatCutting", "rm_rustedArmoury"}},
    {"market", "Market Town", 60, 8,
        {"rm_scrubForaging", "fm_fallowFields", "fm_hearthBarter", "rm_falsifiedLedgers", "rm_saltMonopoly"}},
};

struct CrownOpening {
    std::string_view role;
    double population, loyal, warriors, loyalChildren;
};

constexpr CrownOpening crownOpenings[]{
    {"capital", 120, 108, 16, 27}, {"province", 60, 48, 8, 12},
    {"forager", 17, 8, 8, 0}, {"timber", 19, 9, 9, 0}, {"quarry", 19, 9, 9, 0},
    {"grain", 29, 14, 14, 0}, {"market", 29, 14, 14, 0},
};

NeutralStock goods(std::string id, std::string label, StringArray traits,
                   double price, double capacity, double replenishment)
{
    return {std::move(id), std::move(label), std::move(traits), price, capacity,
            replenishment, core::js::floor(capacity / 2)};
}

}

browser::DetailedSettlement empty_settlement()
{
    DetailedSettlement settlement;
    for (auto* population : {&settlement.populationByClass.villager, &settlement.populationByClass.stranger}) {
        population->faith.tier = "gold";
        population->happiness.status = "neutral";
    }
    settlement.elderOrder = {"elderOrder", "populationDecileVillagersFirst"};
    return settlement;
}

browser::NeutralMarket town_market(std::string_view type)
{
    const auto profile = std::ranges::find(townProfiles, type, &TownProfile::type);
    if (profile == std::end(townProfiles)) throw std::logic_error("Unknown opening town " + std::string(type));
    NeutralMarket market{std::string(profile->name), profile->defense, profile->housing};
    auto& practices = market.practices.emplace();
    for (auto id : profile->practices) practices.emplace_back(id);

    const bool majorMarket = type == "market";
    auto& stocks = market.stocks;
    if (type != "quarry")
        stocks.push_back(goods("food", "Provisions", {"Edible"}, 1, majorMarket ? 18 : 12, majorMarket ? 4 : 3));
    if (type == "timber" || majorMarket)
        stocks.push_back(goods("timber", "Timber", {"Timber", "Fuel", "Construction"}, 1,
                               majorMarket ? 12 : 10, majorMarket ? 3 : 2));
    if (type == "quarry" || majorMarket) {
        stocks.push_back(goods("stone", "Stone", {"Stone", "Construction"}, 2, majorMarket ? 12 : 10, 2));
        stocks.push_back(goods("ore", "Ore", {"Ore"}, 2, majorMarket ? 10 : 8, 2));
    }
    if (type == "grain")
        stocks.push_back(goods("grain", "Grain", {"Grain", "Edible"}, 1, 12, 3));
    return market;
}

void seed_population(browser::DetailedSettlement& settlement, std::string_view faction,
                     std::string_view crownRole, double population)
{
    const double share = faction == "player" ? 0.9 : 0;
    double children = core::js::floor(population / 4);
    double loyal = core::js::floor(population * share);
    double loyalChildren = core::js::floor(children * share);
    double warriors = 0;
    if (!crownRole.empty()) {
        const auto opening = std::ranges::find(crownOpenings, crownRole, &CrownOpening::role);
        if (opening == std::end(crownOpenings)) throw std::logic_error("Unknown Crown opening role");
        population = opening->population;
        children = core::js::floor(population / 4);
        loyal = opening->loyal;
        loyalChildren = opening->loyalChildren;
        warriors = opening->warriors;
    }

    auto& villager = settlement.populationByClass.villager;
    auto& bins = villager.joint.emplace();
    settlement.populationByClass.stranger.joint.emplace();
    const auto add = [&](std::string_view allegiance, std::string_view kind, double count,
                         std::string_view specialty = "ordinary") {
        if (count <= 0) return;
        bins.push_back({std::string(allegiance), std::string(specialty), std::string(kind), {}, count});
    };
    add(faction, "children", loyalChildren);
    add("neutral", "children", children - loyalChildren);
    add(faction, "adults", warriors, "warrior");
    add(faction, "adults", loyal - loyalChildren - warriors);
    add("neutral", "adults", population - loyal - children + loyalChildren);
    std::ranges::sort(bins, {}, [](const JointCohort& bin) {
        return std::tie(bin.allegiance, bin.specialty, bin.kind);
    });
    villager.children = children;
    villager.adults = population - children;
    villager.specialists.warrior.adults = warriors;
}

}
