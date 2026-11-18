#include "sim/browser/generated/game_state.hpp"
#include "tools/json_file.hpp"

#include <algorithm>
#include <filesystem>
#include <iostream>
#include <map>
#include <sstream>

namespace {

namespace browser = waffle::sim::browser;
namespace fs = std::filesystem;
namespace json = waffle::core::json;
using json::Value;
using waffle::tools::read_file;

void expect(bool condition, const std::string& message)
{
    if (!condition) throw std::runtime_error(message);
}

using Hashes = std::map<double, std::string>;

Hashes read_hashes(const fs::path& path)
{
    std::istringstream input(read_file(path));
    std::string header;
    std::getline(input, header);
    expect(header == "tSec\tsha256", "wrong trace hash header in " + path.string());
    Hashes hashes;
    double second;
    std::string hash;
    while (input >> second >> hash) hashes.emplace(second, hash);
    return hashes;
}

void round_trip(const fs::path& path, const Hashes* trace)
{
    const auto input = json::parse(read_file(path));
    const auto state = browser::import_game_state(input);
    const auto output = browser::export_game_state(state);
    const auto observed = json::sha256_value(output);
    const auto original = json::sha256_value(input);
    expect(observed == original, "input hash " + original + " differs from round-trip hash " + observed);
    if (trace) {
        const auto ref = trace->find(state.tSec);
        expect(ref != trace->end(), "missing trace hash for tSec " + std::to_string(state.tSec));
        expect(observed == ref->second, "trace hash " + ref->second + " differs from round-trip hash " + observed);
    }
}

void rejected(const Value& input, std::string_view path, std::string_view reason)
{
    try {
        browser::import_game_state(input);
    } catch (const std::invalid_argument& error) {
        const std::string_view actual(error.what());
        expect(actual.starts_with(path) && actual.substr(path.size()).starts_with(": ") &&
                   actual.find(reason) != std::string_view::npos,
               "expected an error at " + std::string(path) + ", got " + std::string(actual));
        return;
    }
    throw std::runtime_error("expected rejection at " + std::string(path));
}

void controls(const fs::path& path)
{
    const auto original = json::parse(read_file(path));
    auto changed = original;
    changed.set("extra-field", Value(true));
    rejected(changed, R"($["extra-field"])", "unknown field");

    changed = original;
    changed.set("paused", Value("false"));
    rejected(changed, "$.paused", "expected boolean");
    changed.set("paused", Value());
    rejected(changed, "$.paused", "not nullable");

    auto fields = original.as_object();
    // Required even though the field's value is nullable.
    std::erase_if(fields, [](const auto& prop) { return prop.key == "apCapOverride"; });
    rejected(Value(std::move(fields)), "$.apCapOverride", "missing required field");

    changed = original;
    changed.set("phase", Value("new-phase"));
    rejected(changed, "$.phase", "expected a member");
    changed.set("phase", *original.find("phase"));
    changed.set("tSec", Value(0.5));
    rejected(changed, "$.tSec", "expected integer");
    changed.set("tSec", *original.find("tSec"));
    changed.set("skillProgressionDefs", json::parse(R"({"values":[1e400]})"));
    rejected(changed, "$.skillProgressionDefs.values[0]", "expected finite number");

    auto civ = *original.find("civilization");
    auto phase = *civ.find("phaseModifiers");
    phase.set("housingByRegion", json::parse(R"({"z":1,"10":2,"02":3,"2":4,"a":5,"4294967295":6,"4294967294":7})"));
    civ.set("phaseModifiers", phase);
    auto events = *civ.find("practiceEvents");
    events.set("pending", json::parse(R"([
        {"tSec":0,"kind":"test","rootId":1,"parentId":null,"id":1},
        {"tSec":0,"kind":"test","rootId":2,"parentId":null,"id":2,"targetRegionId":null},
        {"tSec":0,"kind":"test","rootId":3,"parentId":null,"id":3,"targetRegionId":"region"}
    ])"));
    civ.set("practiceEvents", events);
    changed = original;
    changed.set("civilization", civ);
    changed.set("skillProgressionDefs", json::parse(R"({"arbitrary":[null,{"__proto__":"opaque"}]})"));
    changed.set("tSec", Value(9007199254740992.0));

    const auto state = browser::import_game_state(changed);
    const auto& housing = state.civilization.phaseModifiers.housingByRegion;
    const std::vector<std::string> keys{"2", "10", "4294967294", "z", "02", "a", "4294967295"};
    expect(housing.size() == keys.size(), "dictionary size");
    for (std::size_t i = 0; i < keys.size(); ++i)
        expect(housing[i].first == keys[i], "dictionary order in mirror at " + keys[i]);
    const auto& pending = state.civilization.practiceEvents.pending;
    expect(!pending[0].targetRegionId.has_key(), "absent tri-state key");
    expect(pending[1].targetRegionId.has_key() && !pending[1].targetRegionId.value(), "null tri-state value");
    expect(pending[2].targetRegionId.has_key() && pending[2].targetRegionId.value() == "region", "present tri-state value");
    expect(state.tSec == 9007199254740992.0, "wide integer remains binary64");

    const auto exported = browser::export_game_state(state);
    const auto& object = exported.as_object();
    expect(object[0].key == "gameStateSchemaVersion" && object[1].key == "phase", "schema record order");
    const auto& exported_civ = *exported.find("civilization");
    const auto& exported_phase = *exported_civ.find("phaseModifiers");
    expect(json::stringify(*exported_phase.find("housingByRegion")) ==
               json::stringify(*phase.find("housingByRegion")), "dictionary order on export");
    expect(json::stringify(*exported_civ.find("practiceEvents")->find("pending")) ==
               json::stringify(*events.find("pending")), "tri-state values on export");
    expect(json::stringify(*exported.find("skillProgressionDefs")) ==
               json::stringify(*changed.find("skillProgressionDefs")), "opaque JSON on export");
    expect(json::sha256_value(exported) == json::sha256_value(changed), "controls round-trip hash");
}

struct Batch {
    std::size_t tried = 0;
    std::size_t passed = 0;

    void check(const fs::path& path, const Hashes* trace)
    {
        ++tried;
        try {
            round_trip(path, trace);
            ++passed;
        } catch (const std::exception& error) {
            if (tried - passed <= 12) std::cerr << path.string() << ": " << error.what() << '\n';
        }
    }
};

std::vector<fs::path> entries(const fs::path& directory)
{
    std::vector<fs::path> paths;
    for (const auto& entry : fs::directory_iterator(directory)) paths.push_back(entry.path());
    std::sort(paths.begin(), paths.end());
    return paths;
}

void check_directory(Batch& batch, const fs::path& directory, const Hashes* trace)
{
    const auto before = batch.tried;
    for (const auto& path : entries(directory)) {
        if (fs::is_regular_file(path) && path.extension() == ".json" &&
            (!trace || path.filename().string().starts_with("state-"))) batch.check(path, trace);
    }
    expect(batch.tried > before, "no full states in " + directory.string());
}

void check_traces(Batch& batch, const fs::path& directory)
{
    const auto before = batch.tried;
    for (const auto& path : entries(directory)) {
        if (fs::is_directory(path)) {
            const auto hashes = read_hashes(path / "hashes.tsv");
            check_directory(batch, path, &hashes);
        }
    }
    expect(batch.tried > before, "no traces in " + directory.string());
}

void print_batch(std::string_view label, const Batch& batch)
{
    std::cout << label << ": " << batch.passed << " passed of " << batch.tried << " tried.\n";
}

int corpus(int argc, char** argv)
{
    Batch traces;
    check_traces(traces, argv[2]);
    print_batch("Trace states", traces);
    Batch snapshots;
    for (int i = 3; i < argc; ++i) check_directory(snapshots, argv[i], nullptr);
    print_batch("Schema snapshots", snapshots);
    return traces.tried == traces.passed && snapshots.tried == snapshots.passed ? 0 : 1;
}

}

int main(int argc, char** argv)
{
    try {
        const std::string_view command = argc > 1 ? argv[1] : "";
        if (command == "fixtures" && argc == 5) {
            const auto hashes = read_hashes(argv[4]);
            Batch fixtures;
            fixtures.check(argv[2], &hashes);
            fixtures.check(argv[3], &hashes);
            print_batch("Checked-in states", fixtures);
            return fixtures.tried == fixtures.passed ? 0 : 1;
        }
        if (command == "controls" && argc == 3) {
            controls(argv[2]);
            return 0;
        }
        if (command == "corpus" && argc >= 4) return corpus(argc, argv);
        throw std::invalid_argument("expected fixtures <core-state> <trace-state> <hashes.tsv>, "
                                    "controls <state>, or corpus <traces-dir> <snapshots-dir> [...]");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
