#include "sim/content/compiled_content.hpp"
#include "sim/state/runtime_state.hpp"
#include "sim/world/topology.hpp"
#include "tools/reference_topology.hpp"

#include <algorithm>
#include <array>
#include <iostream>

namespace {

namespace sim = waffle::sim;
namespace json = waffle::core::json;
using waffle::tools::read_file;

void require(bool condition, const char* message)
{
    if (!condition) throw std::runtime_error(message);
}

template<class Run>
void rejects(Run run, std::string_view message)
{
    try {
        run();
    } catch (const std::invalid_argument& error) {
        if (std::string_view(error.what()).find(message) == std::string_view::npos) throw;
        return;
    }
    throw std::runtime_error("admission accepted an invalid topology");
}

void check_topology(const std::filesystem::path& dir, const json::Value& input)
{
    using sim::content::Biome;
    const auto opening = sim::browser::import_game_state(input);
    const auto data = waffle::tools::read_reference_topology(dir, opening.world.definitionId);
    const auto state = sim::admit_runtime(opening, &data, input.find("gameConfig"));
    require(state.topology && state.compiledContent, "admission must retain topology and compiled content");
    const auto copy = state;
    const auto& topology = *state.topology;
    require(copy.topology == state.topology, "runtime copy must share topology");
    require(copy.compiledContent == state.compiledContent, "runtime copy must share compiled content");
    require(state.compiledContent->key.configHash == state.content->configHash, "wrong compiled content identity");
    require(topology.definition_id() == opening.world.definitionId, "wrong topology identity");
    const auto& revision = *data.find("generatorRevision");
    require(revision.kind() == json::Value::Kind::null ? !topology.generator_revision()
        : topology.generator_revision() == revision.as_number(), "wrong generator revision");
    require(topology.region_count() == opening.world.regions.size(), "wrong region count");
    require(json::sha256_value(sim::browser::export_game_state(sim::export_runtime(copy))) ==
            json::sha256_value(input), "admitted state failed L0 round-trip");
    constexpr std::array<std::string_view, 6> biomes{"plains", "mountains", "forest", "water", "islands", "swamp"};
    const auto& components = data.find("biomeComponents")->as_array();
    for (const auto region : topology.regions()) {
        require(state.name(region) == opening.world.regions.at(region.value).id, "wrong region ordinal");
        for (const auto neighbor : topology.neighbors(region)) {
            require(std::ranges::binary_search(topology.neighbors(neighbor), region), "asymmetric adjacency");
        }
        const auto& row = data.find("regions")->as_array().at(region.value);
        require(topology.region_name(region) == row.find("name")->as_string(), "wrong region name");
        const auto& neutralName = *row.find("neutralSettlementName");
        require(neutralName.kind() == json::Value::Kind::null ? !topology.neutral_settlement_name(region)
            : topology.neutral_settlement_name(region) == neutralName.as_string(), "wrong neutral settlement name");
        const auto& expectedNeighbors = row.find("neighbors")->as_array();
        const auto names = [&](sim::runtime::RegionId id) { return state.name(id); };
        require(std::ranges::equal(topology.neighbors(region), expectedNeighbors, {}, names, &json::Value::as_string),
            "neighbor order differs from the browser");
        const auto& biome = *row.find("biome");
        require(biome.kind() == json::Value::Kind::null ? topology.biome(region) == Biome::unspecified
            : biomes.at(static_cast<std::size_t>(topology.biome(region))) == biome.as_string(), "wrong biome");
        const auto component = std::ranges::find_if(components, [&](const auto& value) {
            return std::ranges::find(value.as_array(), state.name(region), &json::Value::as_string) != value.as_array().end();
        });
        require(component != components.end() &&
            std::ranges::equal(topology.biome_component(region), component->as_array(), {}, names, &json::Value::as_string),
            "biome component differs from the browser");
        const auto mountains = topology.mountain_component(region);
        if (topology.biome(region) == Biome::mountains)
            require(std::ranges::equal(mountains, topology.biome_component(region)), "mountain component differs from the browser");
        else require(mountains.empty(), "non-mountain has a mountain component");
    }
}

}

int main(int argc, char** argv)
{
    try {
        require(argc >= 3, "expected a topology directory, opening fixture and optional reference states");
        const std::filesystem::path dir = argv[1];
        const auto input = json::parse(read_file(argv[2]));
        const auto opening = sim::browser::import_game_state(input);
        const auto manifest = json::parse(read_file(dir / "manifest.json"));
        const auto& entries = manifest.find("topologies")->as_array();
        require(!entries.empty(), "expected checked-in topologies");
        auto example = input;
        auto world = *input.find("world");
        for (const auto& entry : entries) {
            world.set("definitionId", *entry.find("definitionId"));
            example.set("world", world);
            check_topology(dir, example);
        }

        const auto data = waffle::tools::read_reference_topology(dir, opening.world.definitionId);
        auto unknown = opening;
        unknown.world.definitionId = "regional-v2:999999";
        rejects([&] { sim::admit_runtime(unknown, nullptr); }, "regional-v2:999999: missing topology");
        rejects([&] { sim::admit_runtime(unknown, &data); }, "definitionId does not match");
        auto wrongOrder = opening;
        std::swap(wrongOrder.world.regions[0], wrongOrder.world.regions[1]);
        rejects([&] { sim::admit_runtime(wrongOrder, &data); }, "does not match state.world.regions[0]");
        auto wrongRevision = data;
        wrongRevision.set("generatorRevision", json::Value(1.0));
        rejects([&] { sim::admit_runtime(opening, &wrongRevision); }, "generatorRevision does not match");
        auto asymmetric = data;
        auto rows = data.find("regions")->as_array();
        auto neighbors = rows[0].find("neighbors")->as_array();
        require(!neighbors.empty(), "expected a neighbor for the asymmetric graph control");
        neighbors.pop_back();
        rows[0].set("neighbors", json::Value(std::move(neighbors)));
        asymmetric.set("regions", json::Value(std::move(rows)));
        rejects([&] { sim::admit_runtime(opening, &asymmetric); }, "asymmetric adjacency");
        for (int i = 3; i < argc; ++i) {
            try {
                check_topology(dir, json::parse(read_file(argv[i])));
            } catch (const std::exception& error) {
                throw std::runtime_error(std::string(argv[i]) + ": " + error.what());
            }
        }
        std::cout << "Loaded and checked " << entries.size() << " world topologies and admission controls.\n";
        if (argc > 3) std::cout << "Admission and L0 passed for " << argc - 3 << " reference states.\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
