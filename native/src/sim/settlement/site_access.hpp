#pragma once

#include "sim/state/runtime_state.hpp"

namespace waffle::sim::settlement {

// Both lists preserve world.sites order. Active sites exclude storefronts.
inline std::span<const runtime::SiteId> detailed_sites(const RuntimeState& state) noexcept
{
    return state.indexes.detailedSites;
}

inline std::span<const runtime::SiteId> active_sites(const RuntimeState& state) noexcept
{
    return state.indexes.activeSites;
}

template<class State>
decltype(auto) site_at(State& state, runtime::SiteId id)
{
    return state.tables.at(runtime::Index<runtime::Site>{id.value});
}

template<class State>
auto detailed_site(State& state, runtime::RegionId region)
{
    const auto& byRegion = state.indexes.detailedSitesByRegion;
    const auto id = region.value < byRegion.size() ? byRegion[region.value] : runtime::SiteId{};
    return id ? &site_at(state, id) : nullptr;
}

inline const SiteIndex& population_totals(const RuntimeState& state, runtime::SiteId id)
{
    return state.indexes.sites.at(id.value);
}

inline auto faction_totals(const RuntimeState& state, runtime::SiteId id)
{
    const auto range = population_totals(state, id).byAllegiance;
    return std::span(state.indexes.allegianceTotals).subspan(range.begin, range.size());
}

}
