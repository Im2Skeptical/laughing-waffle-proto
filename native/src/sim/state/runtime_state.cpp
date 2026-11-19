#include "sim/state/runtime_state.hpp"

#include <algorithm>

namespace waffle::sim {
namespace runtime {

HistoryTextId HistoryPayload::intern_text(std::string_view value, std::string_view path)
{
    if (const auto existing = text.find(value)) return {*existing};
    const auto id = checked_index(text.offsets.size(), path);
    if (id >= history_symbol_bit) throw std::length_error("history text exceeds page capacity");
    text.append(value, path);
    return {id};
}

std::uint32_t checked_index(std::size_t value, std::string_view path)
{
    if (value >= no_index) throw std::invalid_argument(std::string(path) + ": exceeds 32-bit ordinal range");
    return static_cast<std::uint32_t>(value);
}

template<template<class> class Allocator>
std::optional<std::uint32_t> BasicStrings<Allocator>::find(std::string_view name) const
{
    for (std::uint32_t i = 0; i < offsets.size(); ++i) {
        if (at(i) == name) return i;
    }
    return std::nullopt;
}

template<template<class> class Allocator>
std::string_view BasicStrings<Allocator>::at(std::uint32_t ordinal) const
{
    const auto entry = offsets.at(ordinal);
    if (entry.size() == 0) return {};
    return {bytes.data() + entry.begin, entry.size()};
}

template<template<class> class Allocator>
void BasicStrings<Allocator>::append(std::string_view name, std::string_view path)
{
    checked_index(offsets.size(), path);
    const auto begin = checked_index(bytes.size(), path);
    if (name.size() >= no_index - begin) throw std::invalid_argument(std::string(path) + ": exceeds 32-bit string storage");
    const auto end = begin + static_cast<std::uint32_t>(name.size());
    if (!name.empty()) bytes.insert(bytes.end(), name.begin(), name.end());
    offsets.push_back({begin, end});
}

template struct BasicStrings<std::allocator>;
template struct BasicStrings<std::pmr::polymorphic_allocator>;

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

void add_count(std::uint64_t& total, std::uint64_t count)
{
    if (count > std::numeric_limits<std::uint64_t>::max() - total)
        throw std::invalid_argument("populationByClass: population total exceeds 64-bit range");
    total += count;
}

void index_population(RuntimeState& state, const Site& site, SiteIndex& index,
                      LifeStageId children, LifeStageId adults, LifeStageId elder)
{
    const auto& populations = site.detailedState.populationByClass;
    const std::array classes{&populations.villager, &populations.stranger};
    auto& allegiance = state.indexes.allegianceTotals;
    index.byResidency = {};
    auto& storage = index.allegianceStorage;
    if (storage.size() == 0) {
        const auto begin = checked_index(allegiance.size(), "population allegiance");
        const auto end = checked_index(allegiance.size() + state.populationVocabulary.factions.size(), "population allegiance");
        allegiance.resize(end);
        storage = {begin, end};
    }
    auto used = storage.begin;
    std::uint64_t siteTotal = 0;
    for (std::size_t residency = 0; residency < classes.size(); ++residency) {
        const auto& population = *classes[residency];
        auto& totals = index.byResidency[residency];
        if (!population.joint) {
            // Authored legacy scenarios have cohorts without allegiance.
            // Their browser summary uses the class rows directly.
            totals.children = population.children;
            totals.adults = population.adults;
            add_count(siteTotal, totals.children);
            add_count(siteTotal, totals.adults);
            for (const auto& cohort : state.tables.view(population.eldersByAge)) {
                add_count(siteTotal, cohort.count);
                totals.elders += cohort.count;
            }
            continue;
        }
        const auto range = *population.joint;
        for (auto i = range.begin; i < range.end; ++i) {
            const auto& key = state.tables.rows<JointCohort>().at(i);
            const auto count = state.jointCounts.at(i);
            add_count(siteTotal, count);
            if (key.kind == children) totals.children += count;
            else if (key.kind == adults) totals.adults += count;
            else if (key.kind == elder) totals.elders += count;

            const auto first = allegiance.begin() + storage.begin;
            const auto end = allegiance.begin() + used;
            const auto found = std::find_if(first, end, [&](const auto& total) {
                return total.key == key.allegiance;
            });
            if (found != end) {
                found->value += static_cast<double>(count);
                continue;
            }
            if (used == storage.end) {
                // Preserve adapter support for states with additional factions.
                const auto begin = checked_index(allegiance.size(), "population allegiance");
                const auto limit = checked_index(allegiance.size() + storage.size() * 2ULL, "population allegiance");
                allegiance.resize(limit);
                std::copy_n(allegiance.begin() + storage.begin, storage.size(), allegiance.begin() + begin);
                used = begin + storage.size();
                storage = {begin, limit};
            }
            allegiance[used++] = {key.allegiance, static_cast<double>(count)};
        }
    }
    index.byAllegiance = {storage.begin, used};
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
           indexes.live_bytes() + addedIds.live_bytes() + sizeof(settlementPrelude) + sizeof(populationVocabulary) +
           sizeof(migration) + live_bytes(migration.storage);
}

void refresh_site_population_index(RuntimeState& state, runtime::SiteId id)
{
    using namespace runtime;
    const auto& stages = state.populationVocabulary.stages;
    index_population(state, state.tables.at(Index<Site>{id.value}), state.indexes.sites.at(id.value),
                     stages[1], stages[0], stages[2]); // children, adults, elder
}

void rebuild_runtime_indexes(RuntimeState& state)
{
    using namespace runtime;
    auto& index = state.indexes;
    const auto& world = state.hot.world;
    const auto sites = state.tables.view(world.sites);
    const auto roads = state.tables.view(world.connections);
    const auto detailed = state.find_id<SiteModeId>("detailed");

    index.sitesByRegion.assign(world.regions.size(), {});
    index.detailedSitesByRegion.assign(world.regions.size(), {});
    index.detailedSites.clear();
    index.activeSites.clear();
    index.roadsByRegion.resize(world.regions.size());
    index.roadNeighbors.clear();
    index.sites.resize(sites.size());
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
        refresh_site_population_index(state, site.id);
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
