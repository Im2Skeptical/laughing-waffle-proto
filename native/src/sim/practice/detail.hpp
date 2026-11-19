#pragma once

#include "sim/content/compiled_content.hpp"
#include "sim/practice/practice.hpp"
#include "sim/settlement/population.hpp"
#include "sim/world/topology.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim::practice::detail {

using namespace runtime;

void admit(RuntimeState& state);
void prepare_recipe_storage(RuntimeState& state);

template<class Range, class T>
bool has(const Range& values, const T& value)
{
    return std::ranges::find(values, value) != std::ranges::end(values);
}

template<class L, class R>
bool intersects(const L& left, const R& right)
{
    return std::ranges::any_of(left, [&](auto value) { return has(right, value); });
}

inline auto event_id(const RuntimeState& state, EventKind kind)
{
    return state.practiceVocabulary.events[static_cast<std::size_t>(kind)];
}

inline const auto& region_at(const RuntimeState& state, RegionId region)
{
    return state.tables.rows<Region>()[state.hot.world.regions.begin + region.value];
}

inline FactionId holder(const RuntimeState& state, RegionId region)
{
    return region.value < state.hot.world.regions.size() ? region_at(state, region).controller : FactionId{};
}

inline auto roads(const RuntimeState& state, RegionId region)
{
    if (region.value >= state.indexes.roadsByRegion.size()) return std::span<const RegionId>{};
    const auto span = state.indexes.roadsByRegion[region.value];
    return std::span(state.indexes.roadNeighbors).subspan(span.begin, span.size());
}

inline auto neighbors(const RuntimeState& state, RegionId region)
{
    return state.topology ? state.topology->neighbors(region) : std::span<const RegionId>{};
}

inline auto season_id(const RuntimeState& state)
{
    return state.tables.view(state.hot.seasons)[static_cast<std::size_t>(state.hot.currentSeasonIndex)];
}

inline std::optional<content::Season> season(const RuntimeState& state)
{
    const auto& ids = state.practiceVocabulary.seasons;
    auto where = std::ranges::find(ids, season_id(state));
    if (where == ids.end()) return {};
    return static_cast<content::Season>(where - ids.begin());
}

inline const content::PracticeDefinition& definition(const RuntimeState& state, PracticeId id)
{
    return state.compiledContent->practices()[id.value].value;
}

inline const content::StructureDefinition& definition(const RuntimeState& state, StructureId id)
{
    return state.compiledContent->structures()[id.value].value;
}

inline bool terminal(const RuntimeState& state)
{
    return state.hot.runStatus && state.hot.runStatus->complete;
}

void trace(RuntimeState& state, PracticeEvent event, const EventData& data, bool includeId = false,
           std::string_view dynamicReason = {});
EventData read_event(const RuntimeState& state, std::size_t index, std::vector<Provider>& providers);

template<class Arena, class T>
Range<T> store(Arena& arena, std::span<const T> values)
{
    auto& rows = arena.template rows<T>();
    const auto start = checked_index(rows.size(), "Practice payload");
    rows.insert(rows.end(), values.begin(), values.end());
    return {start, checked_index(rows.size(), "Practice payload")};
}

template<class Arena>
Range<StockProvider> store_providers(Arena& arena, std::span<const Provider> providers)
{
    auto& rows = arena.template rows<StockProvider>();
    const auto start = checked_index(rows.size(), "Practice providers");
    for (const auto& item : providers) {
        auto row = item.record;
        row.traits = store(arena, item.traits);
        if (!item.substitution.empty()) row.substitution = store(arena, item.substitution);
        rows.push_back(row);
    }
    return {start, checked_index(rows.size(), "Practice providers")};
}

}
