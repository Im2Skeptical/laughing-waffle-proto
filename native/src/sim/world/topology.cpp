#include "sim/world/topology.hpp"

#include "sim/state/runtime_state.hpp"

#include <algorithm>
#include <charconv>
#include <functional>

namespace waffle::sim {
namespace {

using core::json::Value;
using runtime::RegionId;
using content::Biome;

constexpr double formatVersion = 1;

[[noreturn]] void fail(std::string_view definitionId, const std::string& reason)
{
    throw std::invalid_argument("world topology for " + std::string(definitionId) + ": " + reason);
}

const Value& field(const Value& row, std::string_view key, Value::Kind kind,
                   std::string_view definitionId, bool nullable = false)
{
    const auto* value = row.kind() == Value::Kind::object ? row.find(key) : nullptr;
    if (!value || (value->kind() != kind && !(nullable && value->kind() == Value::Kind::null)))
        fail(definitionId, "missing or invalid " + std::string(key));
    return *value;
}

std::optional<std::uint32_t> revision_of(std::string_view id)
{
    constexpr std::string_view prefix = "regional-v";
    if (!id.starts_with(prefix)) return {};
    const auto colon = id.find(':', prefix.size());
    if (colon == id.npos || colon == prefix.size() || id[prefix.size()] == '0')
        fail(id, "invalid regional definition id");
    std::uint32_t revision{}, seed{};
    const auto end = id.data() + id.size();
    const auto middle = id.data() + colon;
    const auto version = std::from_chars(id.data() + prefix.size(), middle, revision);
    const auto parsedSeed = std::from_chars(middle + 1, end, seed);
    if (version.ec != std::errc{} || version.ptr != middle ||
        parsedSeed.ec != std::errc{} || parsedSeed.ptr != end)
        fail(id, "invalid regional definition id");
    return revision;
}

Biome read_biome(const Value& value, std::string_view definitionId)
{
    if (value.kind() == Value::Kind::null) return Biome::unspecified;
    const auto& name = value.as_string();
    if (name == "plains") return Biome::plains;
    if (name == "mountains") return Biome::mountains;
    if (name == "forest") return Biome::forest;
    if (name == "water") return Biome::water;
    if (name == "islands") return Biome::islands;
    if (name == "swamp") return Biome::swamp;
    fail(definitionId, "unknown biome " + name);
}

}

std::shared_ptr<const WorldTopology> load_world_topology(const RuntimeState& state, const Value& topology)
{
    const auto& definitionId = state.cold.at(state.hot.world.definitionId.row).get();
    if (field(topology, "formatVersion", Value::Kind::number, definitionId).as_number() != formatVersion)
        fail(definitionId, "unsupported formatVersion");
    if (field(topology, "definitionId", Value::Kind::string, definitionId).as_string() != definitionId)
        fail(definitionId, "definitionId does not match state.world.definitionId");
    const auto revision = revision_of(definitionId);
    const auto& encodedRevision = field(topology, "generatorRevision", Value::Kind::number, definitionId, true);
    if (revision ? (encodedRevision.kind() != Value::Kind::number || encodedRevision.as_number() != *revision)
                 : encodedRevision.kind() != Value::Kind::null)
        fail(definitionId, "generatorRevision does not match definitionId");

    auto result = std::shared_ptr<WorldTopology>(new WorldTopology);
    result->definitionId_ = definitionId;
    result->generatorRevision_ = revision;
    const auto& rows = field(topology, "regions", Value::Kind::array, definitionId).as_array();
    const auto liveRows = state.tables.view(state.hot.world.regions);
    if (rows.size() != liveRows.size()) fail(definitionId, "region count does not match state.world.regions");
    result->rows_.resize(rows.size());
    for (std::size_t index = 0; index < rows.size(); ++index) {
        const auto& id = field(rows[index], "id", Value::Kind::string, definitionId).as_string();
        const auto liveId = liveRows[index].id;
        if (liveId.value != index || state.name(liveId) != id)
            fail(definitionId, "region " + id + " does not match state.world.regions[" +
                std::to_string(index) + "] (" + std::string(state.name(liveId)) + ")");
        result->regionIds_.push_back(liveId);
    }
    const auto readRegion = [&](const Value& value) {
        if (value.kind() != Value::Kind::string) fail(definitionId, "expected a region id");
        const auto region = state.find_id<RegionId>(value.as_string());
        if (!region || region.value >= rows.size()) fail(definitionId, "unknown region " + value.as_string());
        return region;
    };
    for (const auto id : result->regions()) {
        const auto& row = rows[id.value];
        auto& stored = result->rows_[id.value];
        stored.biome = read_biome(field(row, "biome", Value::Kind::string, definitionId, true), definitionId);
        stored.name = field(row, "name", Value::Kind::string, definitionId).as_string();
        const auto& neutral = field(row, "neutralSettlementName", Value::Kind::string, definitionId, true);
        if (neutral.kind() == Value::Kind::string) stored.neutralSettlementName = neutral.as_string();
        for (const auto& neighbor : field(row, "neighbors", Value::Kind::array, definitionId).as_array()) {
            const auto next = readRegion(neighbor);
            if (next == id || (!stored.neighbors.empty() && next <= stored.neighbors.back()))
                fail(definitionId, "neighbors of " + std::string(state.name(id)) + " are not in authored order or contain a self-edge");
            stored.neighbors.push_back(next);
        }
    }
    for (const auto id : result->regions()) {
        for (const auto next : result->neighbors(id)) {
            if (!std::ranges::binary_search(result->neighbors(next), id))
                fail(definitionId, "asymmetric adjacency at " + std::string(state.name(id)) + " and " + std::string(state.name(next)));
        }
    }

    // Check the browser's component list, including the authored-root BFS order.
    const auto& components = field(topology, "biomeComponents", Value::Kind::array, definitionId).as_array();
    std::vector<bool> seen(rows.size());
    for (const auto root : result->regions()) {
        if (seen[root.value]) continue;
        const auto componentIndex = result->components_.size();
        auto& component = result->components_.emplace_back();
        component.push_back(root);
        seen[root.value] = true;
        for (std::size_t i = 0; i < component.size(); ++i) {
            const auto id = component[i];
            result->rows_[id.value].component = componentIndex;
            for (const auto next : result->neighbors(id)) {
                if (seen[next.value] || result->biome(next) != result->biome(root)) continue;
                seen[next.value] = true;
                component.push_back(next);
            }
        }
        if (componentIndex >= components.size() || components[componentIndex].kind() != Value::Kind::array ||
            !std::ranges::equal(component, components[componentIndex].as_array(), {}, std::identity{}, readRegion))
            fail(definitionId, "biome component differs at " + std::string(state.name(root)));
    }
    if (components.size() != result->components_.size()) fail(definitionId, "unexpected biome components");
    return result;
}

}
