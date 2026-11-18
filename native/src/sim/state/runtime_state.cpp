#include "sim/state/runtime_state.hpp"

#include "sim/browser/detail/json_path.hpp"

#include <algorithm>

namespace waffle::sim {
namespace runtime {

std::uint32_t checked_index(std::size_t value, std::string_view path)
{
    if (value >= no_index) throw std::invalid_argument(std::string(path) + ": exceeds 32-bit ordinal range");
    return static_cast<std::uint32_t>(value);
}

std::optional<std::uint32_t> Strings::find(std::string_view name) const
{
    for (std::uint32_t i = 0; i < offsets.size(); ++i) {
        if (at(i) == name) return i;
    }
    return std::nullopt;
}

std::string_view Strings::at(std::uint32_t ordinal) const
{
    const auto entry = offsets.at(ordinal);
    if (entry.size() == 0) return {};
    return {bytes.data() + entry.begin, entry.size()};
}

void Strings::append(std::string_view name, std::string_view path)
{
    checked_index(offsets.size(), path);
    const auto begin = checked_index(bytes.size(), path);
    if (name.size() >= no_index - begin) throw std::invalid_argument(std::string(path) + ": exceeds 32-bit string storage");
    const auto end = begin + static_cast<std::uint32_t>(name.size());
    if (!name.empty()) bytes.insert(bytes.end(), name.begin(), name.end());
    offsets.push_back({begin, end});
}

}
namespace {

using namespace runtime;

template<class T>
std::size_t live_bytes(const std::vector<T>& column)
{
    return column.size() * sizeof(T);
}

template<class T>
Range<T> appended_range(const std::vector<T>& rows, std::size_t begin, std::string_view path)
{
    return {checked_index(begin, path), checked_index(rows.size(), path)};
}

void add_count(std::uint64_t& total, std::uint64_t count, const std::string& path)
{
    if (count > std::numeric_limits<std::uint64_t>::max() - total)
        throw std::invalid_argument(path + ": population total exceeds 64-bit range");
    total += count;
}

void index_population(RuntimeState& state, const Site& site, SiteIndex& index,
                      LifeStageId children, LifeStageId adults, LifeStageId elder)
{
    const auto& populations = site.detailedState.populationByClass;
    const std::array classes{&populations.villager, &populations.stranger};
    const auto path = browser::detail::index_path("$.world.sites", site.id.value) + ".detailedState.populationByClass";
    auto& allegiance = state.indexes.allegianceTotals;
    const auto begin = allegiance.size();
    std::uint64_t siteTotal = 0;
    for (std::size_t residency = 0; residency < classes.size(); ++residency) {
        const auto& population = *classes[residency];
        auto& totals = index.byResidency[residency];
        if (!population.joint) {
            // Authored legacy scenarios have cohorts without allegiance.
            // Their browser summary uses the class rows directly.
            totals.children = population.children;
            totals.adults = population.adults;
            add_count(siteTotal, totals.children, path);
            add_count(siteTotal, totals.adults, path);
            for (const auto& cohort : state.tables.view(population.eldersByAge)) {
                add_count(siteTotal, cohort.count, path);
                totals.elders += cohort.count;
            }
            continue;
        }
        const auto range = *population.joint;
        for (auto i = range.begin; i < range.end; ++i) {
            const auto& key = state.tables.rows<JointCohort>().at(i);
            const auto count = state.jointCounts.at(i);
            add_count(siteTotal, count, path);
            if (key.kind == children) totals.children += count;
            else if (key.kind == adults) totals.adults += count;
            else if (key.kind == elder) totals.elders += count;

            const auto first = allegiance.begin() + begin;
            const auto found = std::find_if(first, allegiance.end(), [&](const auto& total) {
                return total.key == key.allegiance;
            });
            if (found != allegiance.end()) found->value += count;
            else allegiance.push_back({key.allegiance, count});
        }
    }
    index.byAllegiance = appended_range(allegiance, begin, path);
}

}

std::size_t RuntimeIndexes::live_bytes() const
{
    return sim::live_bytes(sitesByRegion) + sim::live_bytes(detailedSitesByRegion) +
           sim::live_bytes(detailedSites) + sim::live_bytes(activeSites) +
           sim::live_bytes(roadsByRegion) + sim::live_bytes(roadNeighbors) + sim::live_bytes(sites) +
           sim::live_bytes(allegianceTotals) + sizeof(currentVassal);
}

std::size_t RuntimeState::hot_bytes() const
{
    return sizeof(hot) + tables.live_bytes() + live_bytes(practiceStock) +
           live_bytes(practiceCharge) + live_bytes(jointCounts) + live_bytes(eventPayloads) +
           indexes.live_bytes() + addedIds.live_bytes();
}

void rebuild_runtime_indexes(RuntimeState& state)
{
    using namespace runtime;
    auto& index = state.indexes;
    const auto& world = state.hot.world;
    const auto sites = state.tables.view(world.sites);
    const auto roads = state.tables.view(world.connections);
    const auto detailed = state.find_id<SiteModeId>("detailed");
    const auto children = state.find_id<LifeStageId>("children");
    const auto adults = state.find_id<LifeStageId>("adults");
    const auto elder = state.find_id<LifeStageId>("elder");

    index.sitesByRegion.assign(world.regions.size(), {});
    index.detailedSitesByRegion.assign(world.regions.size(), {});
    index.detailedSites.clear();
    index.activeSites.clear();
    index.roadsByRegion.resize(world.regions.size());
    index.roadNeighbors.clear();
    index.sites.assign(sites.size(), {});
    index.allegianceTotals.clear();
    index.currentVassal = {};
    for (const auto& site : sites) {
        // Browser lookups choose the first site, or first detailed site.
        auto& regionSite = index.sitesByRegion.at(site.regionId.value);
        if (!regionSite) regionSite = site.id;
        if (site.simulationMode == detailed) {
            auto& detailedSite = index.detailedSitesByRegion.at(site.regionId.value);
            if (!detailedSite) detailedSite = site.id;
            index.detailedSites.push_back(site.id);
            if (!site.neutral) index.activeSites.push_back(site.id);
        }
        index_population(state, site, index.sites.at(site.id.value), children, adults, elder);
    }
    for (const auto& region : state.tables.view(world.regions)) {
        const auto begin = index.roadNeighbors.size();
        for (const auto& edge : roads) {
            if (edge.regionAId == region.id) index.roadNeighbors.push_back(edge.regionBId);
            else if (edge.regionBId == region.id) index.roadNeighbors.push_back(edge.regionAId);
        }
        index.roadsByRegion.at(region.id.value) = appended_range(index.roadNeighbors, begin, "$.world.connections");
    }

    const auto& lineage = state.hot.civilization.vassalLineage;
    if (lineage.currentVassalId) {
        const auto& rows = state.tables.rows<Entry<VassalId, Vassal>>();
        for (auto i = lineage.vassalsById.begin; i < lineage.vassalsById.end; ++i) {
            if (rows.at(i).key == *lineage.currentVassalId) {
                index.currentVassal = {i};
                break;
            }
        }
    }
}

}
