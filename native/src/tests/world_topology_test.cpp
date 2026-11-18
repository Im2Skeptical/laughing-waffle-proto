#include "sim/state/runtime_state.hpp"
#include "sim/world/topology.hpp"
#include "tools/json_file.hpp"

#include <algorithm>
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

void check_topology(const sim::browser::GameState& opening, const json::Value& data)
{
    const auto state = sim::admit_runtime(opening, &data);
    const auto copy = state;
    const auto& topology = *state.topology;
    require(copy.topology == state.topology, "runtime copy must share topology");
    require(topology.definition_id() == opening.world.definitionId, "wrong topology identity");
    require(topology.generator_revision() == data.find("generatorRevision")->as_number(), "wrong generator revision");
    require(topology.region_count() == opening.world.regions.size(), "wrong region count");
    require(copy.hot.world.connections.size() == opening.world.connections.size(), "admission changed the live roads");
    for (const auto region : topology.regions()) {
        require(state.name(region) == opening.world.regions.at(region.value).id, "wrong region ordinal");
        for (const auto neighbor : topology.neighbors(region)) {
            require(std::ranges::binary_search(topology.neighbors(neighbor), region), "asymmetric adjacency");
        }
        const auto& row = data.find("regions")->as_array().at(region.value);
        require(topology.region_name(region) == row.find("name")->as_string(), "wrong region name");
        require(topology.neutral_settlement_name(region) == row.find("neutralSettlementName")->as_string(),
            "wrong generated neutral settlement name");
        const auto& expectedNeighbors = row.find("neighbors")->as_array();
        const auto names = [&](sim::runtime::RegionId id) { return state.name(id); };
        require(std::ranges::equal(topology.neighbors(region), expectedNeighbors, {}, names, &json::Value::as_string),
            "neighbor order differs from the browser");
        if (row.find("biome")->as_string() == "mountains") {
            require(topology.biome(region) == sim::content::Biome::mountains, "wrong mountain biome");
            const auto& components = data.find("biomeComponents")->as_array();
            const auto component = std::ranges::find_if(components, [&](const auto& value) {
                return std::ranges::find(value.as_array(), state.name(region), &json::Value::as_string) != value.as_array().end();
            });
            require(component != components.end() &&
                std::ranges::equal(topology.mountain_component(region), component->as_array(),
                    {}, names, &json::Value::as_string), "mountain component differs from the browser");
        } else {
            require(topology.mountain_component(region).empty(), "non-mountain has a mountain component");
        }
    }
}

}

int main(int argc, char** argv)
{
    try {
        require(argc == 3, "expected a topology directory and opening fixture");
        const std::filesystem::path dir = argv[1];
        auto opening = sim::browser::import_game_state(json::parse(read_file(argv[2])));
        const auto manifest = json::parse(read_file(dir / "manifest.json"));
        const auto& entries = manifest.find("topologies")->as_array();
        require(!entries.empty(), "expected checked-in topologies");
        for (const auto& entry : entries) {
            opening.world.definitionId = entry.find("definitionId")->as_string();
            const auto data = json::parse(read_file(dir / entry.find("file")->as_string()));
            check_topology(opening, data);
        }

        opening.world.definitionId = "regional-v2:1";
        const auto data = json::parse(read_file(dir / "regional-v2_1.json"));
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
        std::cout << "Loaded and checked " << entries.size() << " world topologies and admission controls.\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
