#pragma once

#include "sim/state/rows.generated.hpp"

#include <memory>

namespace waffle::sim {

struct CapturedContent {
    browser::GameConfig config;
    std::string configHash;
    // The baseline vocabularies are frozen at import. Config definition
    // dictionary order is the prefix of the corresponding definition IDs.
    runtime::IdTables ids;
};

struct PopulationTotals {
    std::uint64_t children{}, adults{}, elders{};
    std::uint64_t total() const { return children + adults + elders; }
};

struct SiteIndex {
    std::array<PopulationTotals, 2> byResidency;
    runtime::Range<runtime::Entry<runtime::FactionId, std::uint64_t>> byAllegiance;
};

struct RuntimeIndexes {
    std::vector<runtime::SiteId> sitesByRegion;
    std::vector<runtime::SiteId> detailedSitesByRegion;
    std::vector<runtime::SiteId> detailedSites;
    std::vector<runtime::SiteId> activeSites;  // Detailed sites without a neutral market.
    std::vector<runtime::Range<runtime::RegionId>> roadsByRegion;
    std::vector<runtime::RegionId> roadNeighbors;
    std::vector<SiteIndex> sites;
    std::vector<runtime::Entry<runtime::FactionId, std::uint64_t>> allegianceTotals;
    runtime::Index<runtime::Entry<runtime::VassalId, runtime::Vassal>> currentVassal;

    std::size_t live_bytes() const;
};

struct RuntimeState {
    runtime::HotState hot;
    runtime::HotTables tables;
    // The index of a side column equals the index of its PracticeSlot or
    // JointCohort row. Copying a state copies all of these value buffers.
    std::vector<std::optional<double>> practiceStock;
    std::vector<double> practiceCharge;
    std::vector<std::uint64_t> jointCounts;
    std::vector<runtime::PracticeEventPayload> eventPayloads;
    runtime::ColdTables cold;
    RuntimeIndexes indexes;
    std::shared_ptr<const CapturedContent> content;
    runtime::IdTables addedIds;

    template<class Key>
    Key find_id(std::string_view name) const
    {
        const auto& original = content->ids.get<Key>();
        if (const auto id = original.find(name)) return Key{*id};
        const auto extra = addedIds.get<Key>().find(name);
        if (!extra) return {};
        return Key{static_cast<std::uint32_t>(original.offsets.size() + *extra)};
    }

    template<class Key>
    Key intern(std::string_view name, std::string_view path)
    {
        if (const auto id = find_id<Key>(name)) return id;
        auto& extra = addedIds.get<Key>();
        const auto next = runtime::checked_index(content->ids.get<Key>().offsets.size() + extra.offsets.size(), path);
        extra.append(name, path);
        return Key{next};
    }

    template<class Key>
    std::string_view name(Key id) const
    {
        const auto& original = content->ids.get<Key>();
        if (id.value < original.offsets.size()) return original.at(id.value);
        return addedIds.get<Key>().at(id.value - static_cast<std::uint32_t>(original.offsets.size()));
    }

    std::size_t hot_bytes() const;
};

// Import checks representational bounds and live world links. Schema shape
// validation belongs to browser::import_game_state.
RuntimeState import_runtime(const browser::GameState& state);
browser::GameState export_runtime(const RuntimeState& state);

// Rebuild lookup and summary indexes after changing their authoritative inputs.
// Serialized population summary columns are independent caches at the adapter
// boundary and must be kept current by any future population writes.
void rebuild_runtime_indexes(RuntimeState& state);

}
