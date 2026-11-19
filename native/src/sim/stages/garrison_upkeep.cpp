#include "sim/stages/entries.hpp"

#include "sim/practice/stock.hpp"
#include "sim/settlement/site_access.hpp"

namespace waffle::sim::stages {

bool garrison_upkeep(RuntimeState& state, StageContext&)
{
    if (!state.hot.rulesetId) return true;
    const auto sites = settlement::active_sites(state);
    const auto pay = [&](runtime::Site& site, double cost, bool localOnly) {
        const auto supplied = practice::pay_garrison_stock(state, site, cost, localOnly);
        auto& record = site.detailedState.garrison;
        if (!record) record.emplace();
        record->supplied = supplied;
        record->paid = supplied ? cost : 0;
        record->required = cost;
        record->tSec = state.hot.tSec;
        return supplied;
    };
    auto& remaining = state.foodStage.garrisonCosts;
    bool retry = false;
    for (const auto id : sites) {
        auto& site = settlement::site_at(state, id);
        const auto cost = practice::garrison_upkeep_cost(state, site);
        const auto supplied = pay(site, cost, true);
        remaining[id.value] = supplied ? 0 : cost;
        retry |= !supplied;
    }
    if (retry) {
        for (const auto id : sites) {
            const auto cost = remaining[id.value];
            if (cost > 0) pay(settlement::site_at(state, id), cost, false);
        }
    }
    return true;
}

}
