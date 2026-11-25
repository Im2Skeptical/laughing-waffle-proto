#pragma once

#include "sim/settlement/site_access.hpp"
#include "sim/world/topology.hpp"

namespace waffle::sim::territory {

using namespace runtime;

template<class State>
decltype(auto) region_at(State& state, RegionId id)
{
    return state.tables.view(state.hot.world.regions)[id.value];
}

template<class State>
auto site_at_region(State& state, RegionId region)
{
    const auto site = state.indexes.sitesByRegion[region.value];
    return site ? &settlement::site_at(state, site) : nullptr;
}

inline auto neighbors(const RuntimeState& state, RegionId region)
{
    return state.topology ? state.topology->neighbors(region) : std::span<const RegionId>{};
}

inline auto roads(const RuntimeState& state, RegionId region)
{
    const auto range = state.indexes.roadsByRegion[region.value];
    return std::span<const RegionId>(state.indexes.roadNeighbors).subspan(range.begin, range.size());
}

inline bool terminal(const RuntimeState& state)
{
    return state.hot.runStatus && state.hot.runStatus->complete;
}

inline void end_run(RuntimeState& state, browser::RunEndReason reason)
{
    state.hot.runStatus = RunStatus{true, reason, state.hot.year, state.hot.tSec};
    state.hot.paused = true;
    state.hot.phase = browser::Phase::planning;
}

struct Force {
    double warriors{}, adultWarriors{}, force{}, defense{}, received{};
    double sentWarriors{}, sentAdultWarriors{};
};

struct Resistance {
    double total{}, loyal{}, units{};
};

inline constexpr double retaining_share = .70;
inline constexpr double repel_strength_gain = 1;
inline bool defense_holds(double defense, double strength) { return defense > 0 && defense >= strength; }
RegionId expansion_target(const RuntimeState& state, RegionId source);

enum class GarrisonTarget { eligible, noSettlement, notAllied, notConnected, noSupportingStructure };
bool can_assign_garrison(const RuntimeState& state, RegionId source);
GarrisonTarget garrison_target(const RuntimeState& state, const Site& source, RegionId target);

using SupportVisitor = void (*)(RegionId, double, void*);

Resistance resistance(const RuntimeState& state, const Site& site, FactionId holder);
Force military(const RuntimeState& state, RegionId region, FactionId faction,
               SupportVisitor visitor = nullptr, void* context = nullptr, bool assumeSupplied = false);
void occupy_campaign_site(RuntimeState& state, Site& site);
double holding_pressure(Resistance population);
double available_warriors(const RuntimeState& state, RegionId region);
double retinue(const RuntimeState& state, const Vassal& vassal);
SiteId first_player_site(const RuntimeState& state);
void recount_monsters(RuntimeState& state);
bool defend_legacy(RuntimeState& state, Site& site, double strength);
void evacuate_legacy(RuntimeState& state, const Site& source);

}
