#include "sim/content/compiled_content.hpp"
#include "sim/state/runtime_state.hpp"
#include "tools/json_file.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <iostream>

namespace {

namespace fs = std::filesystem;
namespace sim = waffle::sim;
namespace browser = sim::browser;
namespace runtime = sim::runtime;
namespace content = sim::content;
namespace json = waffle::core::json;
using json::Value;
using waffle::tools::read_file;

void expect(bool ok, const std::string& message)
{
    if (!ok) throw std::runtime_error(message);
}

Value& field(Value& value, std::string_view name)
{
    // The test owns its JSON fixture and only edits existing object entries.
    if (const auto* found = value.find(name)) return const_cast<Value&>(*found);
    throw std::runtime_error("missing test fixture field " + std::string(name));
}

Value config_at(const fs::path& path)
{
    auto state = json::parse(read_file(path));
    return std::move(field(state, "gameConfig"));
}

std::shared_ptr<const sim::CompiledContent> compile(const Value& config)
{
    runtime::IdTables ids;
    return sim::compile_content(browser::import_game_config(config), ids, &config);
}

std::shared_ptr<const sim::CompiledContent> round_trip(const Value& captured)
{
    auto compiled = compile(captured);
    for (const auto& diagnostic : compiled->diagnostics) {
        std::cerr << diagnostic.path << " and " << diagnostic.otherPath << ": " << diagnostic.message << '\n';
    }
    expect(compiled->diagnostics.empty(), "captured config has order-sensitive key collisions");
    const auto original = sim::executable_content_fields(captured);
    const auto emitted = sim::decompile_content(*compiled);
    expect(json::stringify(emitted) == json::stringify(original), "compiled executable content differs from captured JSON");
    return compiled;
}

template<class F>
void rejected(F&& action, std::string_view path, std::string_view reason)
{
    try {
        action();
    } catch (const std::invalid_argument& error) {
        const std::string_view message(error.what());
        expect(message.starts_with(path) && message.substr(path.size()).starts_with(": ") &&
            message.find(reason) != std::string_view::npos, "unexpected error: " + std::string(message));
        return;
    }
    throw std::runtime_error("expected failure at " + std::string(path));
}

Value& definition(Value& config, std::string_view kind, std::string_view id)
{
    return field(field(field(config, "gamepieces"), kind), id);
}

void controls(const Value& source)
{
    static const std::string copying = "$.gameConfig.gamepieces.practices.copyingTexts";
    auto changed = source;
    auto& copyingTexts = definition(changed, "practices", "copyingTexts");
    const auto effects = field(copyingTexts, "effects").as_array();
    auto bad = effects;
    bad[0].set("op", Value("unexpectedOp"));
    copyingTexts.set("effects", Value(bad));
    rejected([&] { compile(changed); }, copying + ".effects[0].op", "discriminator");
    bad = effects;
    bad[0].set("amount", Value("three"));
    copyingTexts.set("effects", Value(bad));
    rejected([&] { compile(changed); }, copying + ".effects[0].amount", "number");
    copyingTexts.set("effects", Value(effects));
    auto mirror = browser::import_game_config(changed);
    auto practice = std::ranges::find_if(mirror.gamepieces.practices, [](const auto& entry) {
        return entry.first == "copyingTexts";
    });
    practice->second.degradedFrom = "missingPractice";
    runtime::IdTables ids;
    rejected([&] { sim::compile_content(mirror, ids); }, copying + ".degradedFrom", "unknown definition ID");
    expect(ids.get<runtime::PracticeId>().offsets.empty(), "failed compile published IDs");

    // Reproduce the saved configured-run regression without cloning the full
    // checked-in opening. The browser retained this amount after save/load.
    field(copyingTexts, "keywordOutputScale").set("amount", Value(0.5));
    const auto fractional = round_trip(changed);
    const auto id = fractional->ids.get<runtime::PracticeId>().find("copyingTexts").value();
    expect(fractional->practices()[id].value.keywordOutputScale->amount == 0.5, "fractional keyword amount");
    const auto original = compile(source);
    expect(fractional->key != original->key && fractional->key.compilerVersion == sim::content_compiler_version,
        "versioned content cache key");
    expect(original->key == compile(source)->key, "deterministic content identity");

    // Capture all 16 instructions, including the catalogue operations absent
    // from the opening: fixed Chaos and direct Monster Spawn.
    auto allEffects = effects;
    allEffects.front().set("keywordScale", json::parse(R"({"keyword":"synthesis","per":0.5,"amount":0.5,"cap":1.5})"));
    allEffects.push_back(json::parse(R"({"op":"addChaos","amount":0.5})"));
    allEffects.push_back(json::parse(R"({"op":"triggerMonsterSpawn","amount":2})"));
    copyingTexts.set("effects", Value(allEffects));
    const auto all = round_trip(changed);
    std::array<bool, std::variant_size_v<content::PracticeEffect>> seen{};
    for (const auto& row : all->practices()) {
        const auto instructions = all->tables.view(row.value.effects);
        std::vector<std::uint32_t> grouped;
        for (std::uint32_t i = 0; i < instructions.size(); ++i) {
            const auto op = content::opcode(instructions[i]);
            seen[static_cast<std::size_t>(op)] = true;
            if (op == content::EffectOp::convertPopulation) grouped.push_back(i);
        }
        expect(std::ranges::equal(grouped, all->tables.view(row.value.recipeEffects)), "conversion group order");
    }
    expect(seen.size() == 16 && std::ranges::all_of(seen, std::identity{}), "all catalogue effects exercised");

    auto& laboratory = definition(changed, "structures", "laboratory");
    auto modifiers = field(laboratory, "modifiers").as_array();
    auto twin = modifiers.at(1);
    auto reordered = twin.find("query")->as_object();
    std::ranges::reverse(reordered);
    twin.set("query", Value(reordered));
    modifiers.push_back(twin);
    laboratory.set("modifiers", Value(modifiers));
    const auto collision = compile(changed);
    expect(collision->diagnostics.size() == 1, "expected one order-sensitive modifier collision");
    expect(collision->diagnostics[0].path.ends_with("laboratory.modifiers[2].query") &&
        collision->diagnostics[0].otherPath.ends_with("laboratory.modifiers[1].query"), "wrong diagnostic paths");
    const auto laboratoryId = collision->ids.get<runtime::StructureId>().find("laboratory").value();
    const auto mods = collision->tables.view(*collision->structures()[laboratoryId].value.modifiers);
    expect(mods[1].queryIdentity == mods[2].queryIdentity, "native dedup key depends on property order");
}

void check(const fs::path& path)
{
    try {
        round_trip(config_at(path));
    } catch (const std::exception& error) {
        throw std::runtime_error(path.string() + ": " + error.what());
    }
}

void runtime_ids(const fs::path& path)
{
    const auto full = json::parse(read_file(path));
    const auto runtimeState = sim::import_runtime(browser::import_game_state(full));
    runtime::IdTables ids;
    ids.get<runtime::RegionId>() = runtimeState.content->ids.get<runtime::RegionId>();
    ids.get<runtime::PracticeId>() = runtimeState.content->ids.get<runtime::PracticeId>();
    ids.get<runtime::StructureId>() = runtimeState.content->ids.get<runtime::StructureId>();
    const auto result = sim::compile_content(runtimeState.content->config, ids, full.find("gameConfig"));
    expect(result->key.configHash == runtimeState.content->configHash, "runtime and compiler capture identity");
    expect(ids.get<runtime::RegionId>().offsets.size() == runtimeState.content->ids.get<runtime::RegionId>().offsets.size(),
        "content compile changed the runtime world domain");
}

void timing(const fs::path& path)
{
    const auto raw = config_at(path);
    const auto parsed = browser::import_game_config(raw);
    using Clock = std::chrono::steady_clock;
    std::array<double, 101> samples;
    for (std::size_t i = 0; i <= samples.size(); ++i) {
        runtime::IdTables ids;
        const auto start = Clock::now();
        const auto compiled = sim::compile_content(parsed, ids, &raw);
        const double millis = std::chrono::duration<double, std::milli>(Clock::now() - start).count();
        if (i) samples[i - 1] = millis;
        expect(compiled->diagnostics.empty(), "diagnostics during benchmark");
    }
    std::ranges::sort(samples);
    std::cout << "Compile default config (101 runs), median " << samples[50]
              << " ms, p95 " << samples[95] << " ms\n";
}

}

int main(int argc, char** argv)
{
    try {
        if (argc < 3) throw std::runtime_error("usage: waffle_content_tests fixtures|corpus|timing <paths...>");
        const std::string_view mode(argv[1]);
        if (mode == "timing") { timing(argv[2]); return 0; }
        std::size_t count = 0;
        for (int i = 2; i < argc; ++i) {
            const fs::path path(argv[i]);
            if (mode == "fixtures") { check(path); ++count; }
            else if (mode == "corpus") {
                std::vector<fs::path> files;
                for (const auto& entry : fs::recursive_directory_iterator(path)) {
                    if (entry.is_regular_file() && entry.path().extension() == ".json") files.push_back(entry.path());
                }
                expect(!files.empty(), "no capture files in " + path.string());
                std::ranges::sort(files);
                for (const auto& file : files) { check(file); ++count; }
                std::cout << path.string() << ": " << files.size() << " compiled and decompiled\n";
            } else throw std::runtime_error("unknown command " + std::string(mode));
        }
        if (mode == "fixtures") {
            controls(config_at(argv[2]));
            runtime_ids(argv[2]);
        }
        std::cout << count << " captured states passed\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
