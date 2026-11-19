#pragma once

#include "sim/content/vocabulary.hpp"

#include <memory>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace waffle::sim {

struct RuntimeState;

class WorldTopology {
public:
    std::string_view definition_id() const { return definitionId_; }
    std::optional<std::uint32_t> generator_revision() const { return generatorRevision_; }
    std::size_t region_count() const { return regionIds_.size(); }
    std::span<const runtime::RegionId> regions() const { return regionIds_; }
    std::span<const runtime::RegionId> neighbors(runtime::RegionId region) const
    {
        return rows_.at(region.value).neighbors;
    }
    content::Biome biome(runtime::RegionId region) const { return rows_.at(region.value).biome; }
    std::span<const runtime::RegionId> biome_component(runtime::RegionId region) const
    {
        return components_.at(rows_.at(region.value).component);
    }
    std::span<const runtime::RegionId> mountain_component(runtime::RegionId region) const
    {
        if (biome(region) != content::Biome::mountains) return {};
        return biome_component(region);
    }
    std::string_view region_name(runtime::RegionId region) const { return rows_.at(region.value).name; }
    std::optional<std::string_view> neutral_settlement_name(runtime::RegionId region) const
    {
        return rows_.at(region.value).neutralSettlementName;
    }

private:
    WorldTopology() = default;
    WorldTopology(const WorldTopology&) = delete;
    WorldTopology& operator=(const WorldTopology&) = delete;
    friend std::shared_ptr<const WorldTopology> load_world_topology(
        const RuntimeState&, const core::json::Value&);

    struct Region {
        content::Biome biome{};
        std::string name;
        std::optional<std::string> neutralSettlementName;
        std::vector<runtime::RegionId> neighbors;
        std::size_t component{};
    };

    std::string definitionId_;
    std::optional<std::uint32_t> generatorRevision_;
    std::vector<runtime::RegionId> regionIds_;
    std::vector<Region> rows_;
    std::vector<std::vector<runtime::RegionId>> components_;
};

// Maps the exact authored region order to the RuntimeState's interned IDs.
std::shared_ptr<const WorldTopology> load_world_topology(
    const RuntimeState& state, const core::json::Value& topology);

}
