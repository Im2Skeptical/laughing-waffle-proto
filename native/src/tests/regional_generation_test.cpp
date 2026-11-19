#include "sim/world/generate.hpp"
#include "tools/json_file.hpp"

#include <filesystem>
#include <iostream>
#include <stdexcept>

int main(int argc, char** argv)
{
    using namespace waffle::core;
    try {
        if (argc != 2) throw std::invalid_argument("usage: waffle_regional_generation_test <topology-directory>");
        const std::filesystem::path directory = argv[1];
        const auto manifest = json::parse(waffle::tools::read_file(directory / "manifest.json"));
        const auto& entries = manifest.find("topologies")->as_array();
        constexpr std::string_view prefix = "regional-v2:";
        for (const auto& entry : entries) {
            const auto& id = entry.find("definitionId")->as_string();
            if (!id.starts_with(prefix)) throw std::invalid_argument("unsupported topology: " + id);
            const auto seed = static_cast<std::uint32_t>(std::stoull(id.substr(prefix.size())));
            const auto expected = json::parse(waffle::tools::read_file(directory / entry.find("file")->as_string()));
            const auto actual = waffle::sim::generate_regional_world(seed).topology_json();
            if (json::canonical_json(expected) == json::canonical_json(actual)) continue;
            for (const auto& field : expected.as_object()) {
                const auto* value = actual.find(field.key);
                if (!value || json::canonical_json(field.value) != json::canonical_json(*value)) {
                    if (field.key == "regions") {
                        const auto& expectedRegions = field.value.as_array();
                        const auto& actualRegions = value->as_array();
                        for (std::size_t i = 0; i < expectedRegions.size(); ++i) {
                            if (json::canonical_json(expectedRegions[i]) != json::canonical_json(actualRegions[i])) {
                                std::cerr << id << " expected " << json::stringify(expectedRegions[i])
                                    << "\nactual " << json::stringify(actualRegions[i]) << '\n';
                                break;
                            }
                        }
                    }
                    throw std::runtime_error(id + " differs from browser topology at " + field.key);
                }
            }
            throw std::runtime_error(id + " differs from browser topology");
        }
        std::cout << entries.size() << " generated topologies matched the browser.\n";
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
