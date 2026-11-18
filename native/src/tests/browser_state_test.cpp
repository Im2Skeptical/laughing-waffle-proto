#include "sim/browser/generated/game_state.hpp"
#include "sim/state/runtime_state.hpp"
#include "tools/json_file.hpp"
#include "core/sha256.hpp"

#include <algorithm>
#include <filesystem>
#include <iostream>
#include <map>
#include <sstream>

namespace {

namespace browser = waffle::sim::browser;
namespace sim = waffle::sim;
namespace runtime = waffle::sim::runtime;
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

void round_trip(const fs::path& path, const Hashes* trace, bool throughRuntime)
{
    const auto input = json::parse(read_file(path));
    const auto state = browser::import_game_state(input);
    const auto output = browser::export_game_state(
        throughRuntime ? sim::export_runtime(sim::import_runtime(state)) : state);
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

void controls(const fs::path& path, bool throughRuntime)
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

    const auto exported = browser::export_game_state(
        throughRuntime ? sim::export_runtime(sim::import_runtime(state)) : state);
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

template<class Change>
void rejected_runtime(browser::GameState state, Change change, std::string_view path)
{
    change(state);
    try {
        sim::import_runtime(state);
    } catch (const std::invalid_argument& error) {
        expect(std::string_view(error.what()).starts_with(std::string(path) + ": "),
               "expected import error at " + std::string(path) + ", got " + error.what());
        return;
    }
    throw std::runtime_error("expected runtime rejection at " + std::string(path));
}

void runtime_controls(const fs::path& path)
{
    controls(path, true);
    const auto input = json::parse(read_file(path));
    const auto mirror = browser::import_game_state(input);
    const auto state = sim::import_runtime(mirror);
    const auto hash = [](const sim::RuntimeState& value) {
        return json::sha256_value(browser::export_game_state(sim::export_runtime(value)));
    };
    const auto expected = json::sha256_value(input);
    expect(state.content->configHash ==
           waffle::core::sha256_text(json::stringify(browser::export_game_config(mirror.gameConfig))),
           "captured config hash");
    expect(state.content->config.gamepieces.practices.front().first ==
           state.name(runtime::PracticeId{0}), "definition ordinals follow config dictionary order");
    expect(state.hot.rng.baseSeed == mirror.rng.baseSeed, "RNG provenance");
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        const auto& source = mirror.world.sites.at(site.id.value);
        expect(state.name(site.id) == source.id, "authored site order");
        expect(state.indexes.sitesByRegion.at(site.regionId.value) == site.id, "direct region to site index");
        const auto& board = site.detailedState.structureSlots;
        const auto cells = state.tables.view(board.footprint);
        for (const auto& structure : state.tables.view(board.origins)) {
            for (const auto cell : cells.subspan(structure.origin, structure.width))
                expect(&state.tables.at(cell) == &structure, "structure footprint refers to its sole origin");
        }
    }

    auto hot = state;
    expect(hot.content == state.content, "copies share immutable captured content");
    hot.hot.rng.seed += 1;
    hot.practiceCharge.at(0) += 1;
    hot.practiceStock.at(0) = hot.practiceStock.at(0).value_or(0) + 1;
    hot.jointCounts.at(0) += 1;
    hot.tables.rows<runtime::Region>().at(0).lostAtSec = 1;
    const auto fresh = hot.intern<runtime::InstanceId>("runtime-copy-only", "$.test");
    expect(hot.name(fresh) == "runtime-copy-only" && !state.find_id<runtime::InstanceId>("runtime-copy-only"),
           "post-admission IDs are value-owned");
    sim::rebuild_runtime_indexes(hot);
    expect(hash(hot) != expected && hash(state) == expected, "hot copy is independent");

    auto original = state;
    const auto traceRef = original.hot.civilization.practiceEvents.trace.row;
    auto& originalTrace = original.histories.at(traceRef);
    for (int i = 0; i < 100; ++i) {
        runtime::PracticeEventTrace event;
        event.kind = original.intern<runtime::EventKindId>("copy-test", "$.test");
        event.rootId = i;
        originalTrace.push(event);
    }
    original.histories.at(original.hot.gameEventFeed.row).push({42});
    const auto originalHash = hash(original);

    auto cold = original;
    const auto& firstSite = cold.tables.view(cold.hot.world.sites).front();
    auto& name = cold.cold.at(firstSite.name.row);
    name.replace(name.get() + " (copy)");
    cold.histories.at(cold.hot.gameEventFeed.row).push({43});
    auto& copyTrace = cold.histories.at(traceRef);
    auto next = originalTrace.at(99);
    next.rootId = 100;
    copyTrace.push(next);
    expect(copyTrace.size() == 100 && copyTrace.at(0).rootId == 1 &&
           originalTrace.at(0).rootId == 0, "fork evicts only its own head");
    const auto copyHash = hash(cold);
    expect(copyHash != originalHash && hash(original) == originalHash, "cold copy is independent");

    original.histories.at(original.hot.gameEventFeed.row).push({44});
    next.rootId = 101;
    originalTrace.push(next);
    expect(hash(original) != originalHash && hash(cold) == copyHash, "cold original is independent");

    auto legacy = mirror;
    auto& residency = legacy.world.sites[0].detailedState.populationByClass.villager;
    residency.joint.reset();
    const auto importedLegacy = sim::import_runtime(legacy);
    const auto& totals = importedLegacy.indexes.sites.at(0).byResidency[0];
    expect(totals.children == residency.children && totals.adults == residency.adults,
           "class-row totals survive an absent joint ledger");
    expect(!sim::export_runtime(importedLegacy).world.sites[0].detailedState.populationByClass.villager.joint,
           "absent joint ledger stays absent");

    auto reordered = mirror;
    auto& defs = reordered.gameConfig.gamepieces.practices;
    std::swap(defs.at(0), defs.at(1));
    const auto reorderedState = sim::import_runtime(reordered);
    expect(reorderedState.content->configHash != state.content->configHash &&
           reorderedState.name(runtime::PracticeId{0}) == defs.front().first,
           "definition dictionary order participates in the content identity");

    rejected_runtime(mirror, [](auto& changed) { changed.world.sites[0].regionId = "missing"; },
                     "$.world.sites[0].regionId");
    rejected_runtime(mirror, [](auto& changed) { changed.world.regions[0].structureCapacity = 0x1p32; },
                     "$.world.regions[0].structureCapacity");
    rejected_runtime(mirror, [](auto& changed) {
        auto& board = changed.world.sites[0].detailedState.structureSlots;
        auto slot = std::find_if(board.begin(), board.end(), [](const auto& cell) { return cell.has_value(); });
        expect(slot == board.begin(), "fixture has an origin at cell zero");
        (*slot)->width = 0;
    }, "$.world.sites[0].detailedState.structureSlots[0].width");
}

void history_retention(const fs::path& opening, const fs::path& expected)
{
    auto state = sim::import_runtime(browser::import_game_state(json::parse(read_file(opening))));
    const auto sites = state.tables.view(state.hot.world.sites).first(2);
    auto& civilization = state.histories.at(state.hot.civilization.practiceEvents.trace.row);
    using SiteHistory = decltype(sites[0].detailedState.practiceActivationTrace)::value_type::Storage;
    std::array<runtime::Index<SiteHistory>, 2> siteHistories;
    for (std::size_t i = 0; i < sites.size(); ++i) {
        auto& site = state.tables.rows<runtime::Site>().at(i);
        auto& ref = site.detailedState.practiceActivationTrace;
        if (!ref) {
            auto& histories = state.histories.rows<SiteHistory>();
            ref.emplace().row = {runtime::checked_index(histories.size(), "$.test")};
            histories.emplace_back();
        }
        siteHistories[i] = ref->row;
    }

    const auto kind = state.intern<runtime::EventKindId>("retention-test", "$.test");
    for (int i = 0; i < 250; ++i) {
        const auto site = static_cast<std::size_t>(i) % sites.size();
        const auto append = [&](runtime::HistoryPayload& page) {
            runtime::PracticeEventTrace event;
            event.tSec = state.hot.tSec;
            event.kind = kind;
            event.regionId = sites[site].regionId;
            event.rootId = i;
            event.reason = page.intern_text("sample-" + std::to_string(i), "$.test");
            return event;
        };
        civilization.append(append);
        state.histories.at(siteHistories[site]).append(append);
    }
    const auto actual = browser::export_game_state(sim::export_runtime(state));
    expect(civilization.size() == 100 &&
           state.histories.at(siteHistories[0]).size() == 100 &&
           state.histories.at(siteHistories[1]).size() == 100, "all tested rings must be saturated");
    expect(json::sha256_value(actual) == json::sha256_value(json::parse(read_file(expected))),
           "native retained trace windows differ from the browser");
}

struct Batch {
    bool throughRuntime = false;
    std::size_t tried = 0;
    std::size_t passed = 0;

    void check(const fs::path& path, const Hashes* trace)
    {
        ++tried;
        try {
            round_trip(path, trace, throughRuntime);
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

int corpus(int argc, char** argv, bool throughRuntime)
{
    Batch traces{throughRuntime};
    check_traces(traces, argv[2]);
    print_batch("Trace states", traces);
    Batch snapshots{throughRuntime};
    for (int i = 3; i < argc; ++i) check_directory(snapshots, argv[i], nullptr);
    print_batch("Schema snapshots", snapshots);
    return traces.tried == traces.passed && snapshots.tried == snapshots.passed ? 0 : 1;
}

}

int main(int argc, char** argv)
{
    try {
        const std::string_view command = argc > 1 ? argv[1] : "";
        if ((command == "fixtures" || command == "runtime-fixtures") && argc == 5) {
            const auto hashes = read_hashes(argv[4]);
            Batch fixtures{command == "runtime-fixtures"};
            fixtures.check(argv[2], &hashes);
            fixtures.check(argv[3], &hashes);
            print_batch("Checked-in states", fixtures);
            return fixtures.tried == fixtures.passed ? 0 : 1;
        }
        if (command == "controls" && argc == 3) {
            controls(argv[2], false);
            return 0;
        }
        if (command == "runtime-controls" && argc == 3) {
            runtime_controls(argv[2]);
            return 0;
        }
        if (command == "history-retention" && argc == 4) {
            history_retention(argv[2], argv[3]);
            return 0;
        }
        if ((command == "corpus" || command == "runtime-corpus") && argc >= 4)
            return corpus(argc, argv, command == "runtime-corpus");
        throw std::invalid_argument("expected fixtures or runtime-fixtures <core-state> <trace-state> <hashes.tsv>, "
                                    "controls or runtime-controls <state>, history-retention <opening> <expected>, "
                                    "or corpus or runtime-corpus <traces-dir> <snapshots-dir> [...]");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
