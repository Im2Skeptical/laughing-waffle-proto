#include "sim/browser/detail/json_path.hpp"
#include "sim/browser/generated/game_state.hpp"
#include "sim/state/runtime_state.hpp"
#include "sim/step/advance_second.hpp"
#include "sim/step/stages.hpp"
#include "tools/json_file.hpp"
#include "tools/parity_masks.hpp"

#include <algorithm>
#include <charconv>
#include <chrono>
#include <cmath>
#include <functional>
#include <iostream>
#include <map>
#include <tuple>

namespace {

namespace json = waffle::core::json;
namespace browser = waffle::sim::browser;
namespace sim = waffle::sim;
namespace runtime = waffle::sim::runtime;
using browser::detail::index_path;
using browser::detail::property_path;
using waffle::tools::read_file;
using waffle::tools::write_file;
using json::Value;

std::size_t leaf_count(const Value* value)
{
    if (!value) return 0;
    std::size_t count = 0;
    if (value->kind() == Value::Kind::array) {
        for (const auto& child : value->as_array()) count += leaf_count(&child);
    } else if (value->kind() == Value::Kind::object) {
        for (const auto& property : value->as_object()) count += leaf_count(&property.value);
    }
    return std::max<std::size_t>(1, count);
}

struct Diff {
    std::size_t differing_leaves = 0;
    std::string first_path;
};

void compare(Diff& diff, const std::string& path, const Value* left, const Value* right)
{
    if (left && right && left->kind() == right->kind()) {
        switch (left->kind()) {
        case Value::Kind::null: return;
        case Value::Kind::boolean:
            if (left->as_bool() == right->as_bool()) return;
            break;
        case Value::Kind::number:
            if (left->as_number() == right->as_number()) return;
            break;
        case Value::Kind::string:
            if (left->as_string() == right->as_string()) return;
            break;
        case Value::Kind::array: {
            const auto& a = left->as_array();
            const auto& b = right->as_array();
            for (std::size_t i = 0; i < std::max(a.size(), b.size()); ++i)
                compare(diff, index_path(path, i), i < a.size() ? &a[i] : nullptr, i < b.size() ? &b[i] : nullptr);
            return;
        }
        case Value::Kind::object: {
            struct Children {
                std::string_view key;
                const Value* left = nullptr;
                const Value* right = nullptr;
            };
            std::map<std::u16string, Children> children;
            for (const auto& prop : left->as_object()) {
                auto& child = children[json::utf16_sort_key(prop.key)];
                child.key = prop.key;
                child.left = &prop.value;
            }
            for (const auto& prop : right->as_object()) {
                auto& child = children[json::utf16_sort_key(prop.key)];
                child.key = prop.key;
                child.right = &prop.value;
            }
            for (const auto& entry : children) {
                const auto& child = entry.second;
                compare(diff, property_path(path, child.key), child.left, child.right);
            }
            return;
        }
        }
    }
    if (diff.differing_leaves == 0) diff.first_path = path;
    diff.differing_leaves += std::max(leaf_count(left), leaf_count(right));
}

int diff_files(const Value& left, const Value& right)
{
    Diff diff;
    compare(diff, "$", &left, &right);
    if (diff.differing_leaves == 0) {
        std::cout << "State values match.\n";
        return 0;
    }
    std::cout << diff.differing_leaves << " differing leaves.\n"
              << "First divergent path: " << diff.first_path << '\n';
    return 1;
}

#include "sim/state/mirror_fields.generated.inc"

// Bytes outside the enclosing object, counting live elements rather than
// vector capacity and excluding allocator/control-block overhead.
template<class T>
std::size_t mirror_dynamic_bytes(const T& value)
{
    if constexpr (std::is_same_v<T, std::string>) {
        const auto* begin = reinterpret_cast<const char*>(&value);
        const std::less<const void*> less;
        return less(value.data(), begin) || !less(value.data(), begin + sizeof(value))
            ? value.size() + 1 : 0;
    } else if constexpr (std::is_same_v<T, Value>) {
        switch (value.kind()) {
        case Value::Kind::string: return mirror_dynamic_bytes(value.as_string());
        case Value::Kind::array: return mirror_dynamic_bytes(value.as_array());
        case Value::Kind::object: return mirror_dynamic_bytes(value.as_object());
        default: return 0;
        }
    } else if constexpr (std::is_same_v<T, Value::Property>) {
        return mirror_dynamic_bytes(value.key) + mirror_dynamic_bytes(value.value);
    } else if constexpr (requires { value.has_key(); }) {
        return value.has_key() ? mirror_dynamic_bytes(value.value()) : 0;
    } else if constexpr (requires { value.has_value(); }) {
        return value ? mirror_dynamic_bytes(*value) : 0;
    } else if constexpr (requires { value.first; value.second; }) {
        return mirror_dynamic_bytes(value.first) + mirror_dynamic_bytes(value.second);
    } else if constexpr (std::ranges::range<T>) {
        std::size_t bytes = 0;
        if constexpr (requires { value.capacity(); }) bytes = value.size() * sizeof(typename T::value_type);
        for (const auto& element : value) bytes += mirror_dynamic_bytes(element);
        return bytes;
    } else if constexpr (requires { value.valueless_by_exception(); }) {
        return std::visit([](const auto& member) { return mirror_dynamic_bytes(member); }, value);
    } else if constexpr (requires { typename std::tuple_size<T>::type; }) {
        return std::apply([](const auto&... members) {
            return (std::size_t{0} + ... + mirror_dynamic_bytes(members));
        }, value);
    } else if constexpr (requires { mirror_fields(value, [](const auto&) {}); }) {
        std::size_t bytes = 0;
        mirror_fields(value, [&](const auto& field) { bytes += mirror_dynamic_bytes(field); });
        return bytes;
    } else {
        return 0;
    }
}


sim::RuntimeState admit_parity_state(const Value& input, const std::filesystem::path& topologyDir)
{
    const auto state = browser::import_game_state(input);
    auto file = state.world.definitionId;
    for (auto& ch : file) {
        const bool alphanumeric = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
            (ch >= '0' && ch <= '9');
        if (!alphanumeric && ch != '-' && ch != '_') ch = '_';
    }
    const auto dir = topologyDir.empty() ? std::filesystem::path(WAFFLE_REFERENCE_TOPOLOGY_DIR) : topologyDir;
    const auto path = dir / (file + ".json");
    if (!std::filesystem::exists(path))
        throw std::invalid_argument("world topology for " + state.world.definitionId + ": missing topology file " + path.string());
    const auto topology = json::parse(read_file(path));
    return sim::admit_runtime(state, &topology);
}

struct StepOptions {
    std::filesystem::path from, expectDir, masks, report, topologyDir;
    std::size_t seconds{};
    bool time{};
};

StepOptions parse_step_options(int argc, char** argv)
{
    StepOptions options;
    for (int index = 2; index < argc; ++index) {
        const std::string_view flag = argv[index];
        if (flag == "--time" && !options.time) {
            options.time = true;
            continue;
        }
        if (index + 1 == argc) throw std::invalid_argument("step: missing value for " + std::string(flag));
        const std::string_view value = argv[++index];
        if (flag == "--from" && options.from.empty()) options.from = value;
        else if (flag == "--expect-dir" && options.expectDir.empty()) options.expectDir = value;
        else if (flag == "--masks" && options.masks.empty()) options.masks = value;
        else if (flag == "--report" && options.report.empty()) options.report = value;
        else if (flag == "--topology-dir" && options.topologyDir.empty()) options.topologyDir = value;
        else if (flag == "--seconds" && options.seconds == 0) {
            const auto end = value.data() + value.size();
            const auto parsed = std::from_chars(value.data(), end, options.seconds);
            if (parsed.ec != std::errc{} || parsed.ptr != end || options.seconds == 0)
                throw std::invalid_argument("step: --seconds must be a positive integer");
        } else {
            throw std::invalid_argument("step: unknown or repeated option " + std::string(flag));
        }
    }
    if (options.from.empty() || options.expectDir.empty() || options.masks.empty() || options.seconds == 0)
        throw std::invalid_argument("Usage: waffle_parity step --from <state.json> --seconds <k> "
                                    "--expect-dir <directory> --masks <masks.json> "
                                    "[--report <path>] [--time] [--topology-dir <directory>]");
    return options;
}

struct StepTiming {
    std::size_t steps{};
    double microseconds{};
};

StepTiming time_steps(const sim::RuntimeState& initial, std::size_t seconds)
{
    using Clock = std::chrono::steady_clock;
    const std::size_t batches = std::clamp<std::size_t>(100000 / seconds, 1, 256);
    StepTiming timing;
    for (std::size_t batch = 0; batch < batches; ++batch) {
        auto state = initial;
        std::size_t advanced = 0;
        const auto begin = Clock::now();
        while (advanced < seconds && sim::advance_one_second(state)) ++advanced;
        const auto elapsed = Clock::now() - begin;
        timing.steps += advanced;
        timing.microseconds += std::chrono::duration<double, std::micro>(elapsed).count();
    }
    return timing;
}

int step(const StepOptions& options)
{
    const waffle::tools::ParityMasks masks(json::parse(read_file(options.masks)));
    const auto initial = admit_parity_state(json::parse(read_file(options.from)), options.topologyDir);
    auto state = initial;
    const double start = state.hot.tSec;
    constexpr double maxSafeInteger = 0x1p53 - 1;
    if (start < 0 || start > maxSafeInteger || static_cast<double>(options.seconds) > maxSafeInteger - start)
        throw std::invalid_argument("step: comparison range falls outside nonnegative safe integer seconds");

    Value report(Value::Object{{"startSec", Value(start)}, {"masks", Value(static_cast<double>(masks.size()))}});
    const auto write_report = [&] {
        if (!options.report.empty()) write_file(options.report, json::stringify(report) + '\n');
    };
    std::size_t advances = 0;
    for (std::size_t offset = 1; offset <= options.seconds; ++offset) {
        const auto target = static_cast<std::uint64_t>(start) + offset;
        const auto before = state.hot.tSec;
        advances += sim::advance_one_second(state);
        const auto source = options.expectDir / ("state-" + std::to_string(target) + ".json");
        auto expected = json::parse(read_file(source));
        auto actual = browser::export_game_state(sim::export_runtime(state));
        // A gate attempt must leave every byte of canonical state unchanged.
        // Leaving the masks off here also checks paused and runStatus themselves.
        const auto* expectedSec = expected.find("tSec");
        if (!expectedSec || expectedSec->kind() != Value::Kind::number ||
            (expectedSec->as_number() != before && expectedSec->as_number() != static_cast<double>(target)))
            throw std::invalid_argument("step: unexpected tSec in " + source.string());
        if (expectedSec->as_number() != before) {
            expected = masks.apply(expected);
            actual = masks.apply(actual);
        }
        const auto expectedHash = json::sha256_value(expected);
        const auto actualHash = json::sha256_value(actual);
        if (expectedHash == actualHash) continue;

        Diff diff;
        compare(diff, "$", &expected, &actual);
        report.set("ok", Value(false));
        report.set("compared", Value(static_cast<double>(offset)));
        report.set("targetSec", Value(static_cast<double>(target)));
        report.set("firstPath", Value(diff.first_path));
        report.set("differingLeaves", Value(static_cast<double>(diff.differing_leaves)));
        report.set("expectedHash", Value(expectedHash));
        report.set("actualHash", Value(actualHash));
        write_report();
        std::cout << "First divergent step toward second " << target << " (" << diff.differing_leaves
                  << " differing leaves)\nFirst divergent path: " << diff.first_path
                  << "\nExpected " << expectedHash << "\nActual   " << actualHash << '\n';
        return 1;
    }

    report.set("ok", Value(true));
    report.set("compared", Value(static_cast<double>(options.seconds)));
    report.set("advanced", Value(static_cast<double>(advances)));
    std::cout << "Step parity matched " << options.seconds << " comparisons (" << advances << " advancing, "
              << options.seconds - advances << " gated), " << masks.size() << " masks.\n";
    if (options.time && advances > 0) {
        const auto timing = time_steps(initial, advances);
        const double perSecond = timing.microseconds / static_cast<double>(timing.steps);
        report.set("timedSteps", Value(static_cast<double>(timing.steps)));
        report.set("microsecondsPerSimSecond", Value(perSecond));
        std::cout << perSecond << " us/sim-second (" << timing.steps << " timed advances).\n";
    }
    write_report();
    return 0;
}

struct StageOptions {
    std::string_view name;
    std::filesystem::path before, after, masks, topologyDir;
};

StageOptions parse_stage_options(int argc, char** argv)
{
    StageOptions options;
    for (int index = 2; index < argc; ++index) {
        const std::string_view flag = argv[index];
        if (index + 1 == argc) throw std::invalid_argument("stage: missing value for " + std::string(flag));
        const std::string_view value = argv[++index];
        if (value.empty()) throw std::invalid_argument("stage: empty value for " + std::string(flag));
        if (flag == "--stage" && options.name.empty()) options.name = value;
        else if (flag == "--before" && options.before.empty()) options.before = value;
        else if (flag == "--after" && options.after.empty()) options.after = value;
        else if (flag == "--masks" && options.masks.empty()) options.masks = value;
        else if (flag == "--topology-dir" && options.topologyDir.empty()) options.topologyDir = value;
        else throw std::invalid_argument("stage: unknown or repeated option " + std::string(flag));
    }
    if (options.name.empty() || options.before.empty() || options.after.empty())
        throw std::invalid_argument("Usage: waffle_parity stage --stage <name> --before <file> "
                                    "--after <file> [--masks <file>] [--topology-dir <directory>]");
    return options;
}

Value read_stage_boundary(const std::filesystem::path& path, sim::Stage stage)
{
    auto value = json::parse(read_file(path));
    const auto* version = value.find("formatVersion");
    const auto* state = value.find("state");
    const auto* sidecar = value.find("sidecar");
    if (!version || version->kind() != Value::Kind::number || version->as_number() != 1 ||
        !state || state->kind() != Value::Kind::object || !sidecar || sidecar->kind() != Value::Kind::object ||
        value.as_object().size() != 3)
        throw std::invalid_argument("stage: invalid boundary envelope in " + path.string());
    const auto* seasonChanged = sidecar->find("_seasonChanged");
    const auto* boardDirty = sidecar->find("_boardDirty");
    const auto* chaosBefore = sidecar->find("chaosBefore");
    const auto chaosKind = stage == sim::Stage::phase_events_and_drain ? Value::Kind::number : Value::Kind::null;
    if (!seasonChanged || seasonChanged->kind() != Value::Kind::boolean ||
        !boardDirty || (boardDirty->kind() != Value::Kind::null &&
            (boardDirty->kind() != Value::Kind::boolean || boardDirty->as_bool())) ||
        !chaosBefore || chaosBefore->kind() != chaosKind || sidecar->as_object().size() != 3)
        throw std::invalid_argument("stage: invalid or unsupported sidecar in " + path.string());
    return value;
}

int stage(const StageOptions& options)
{
    const auto selected = sim::stage_from_name(options.name);
    if (!selected) throw std::invalid_argument("stage: unknown stage " + std::string(options.name));
    const auto name = sim::stage_name(*selected);
    const auto before = read_stage_boundary(options.before, *selected);
    const auto after = read_stage_boundary(options.after, *selected);
    auto state = admit_parity_state(*before.find("state"), options.topologyDir);
    const auto& sidecar = *before.find("sidecar");
    sim::StageContext context{};
    context.seasonChanged = sidecar.find("_seasonChanged")->as_bool();
    if (const auto& dirty = *sidecar.find("_boardDirty"); dirty.kind() != Value::Kind::null)
        context.boardDirty = dirty.as_bool();
    if (const auto& chaos = *sidecar.find("chaosBefore"); chaos.kind() != Value::Kind::null)
        context.chaosBefore = chaos.as_number();
    const double second = state.hot.tSec;
    const bool clock = *selected == sim::Stage::advance_clock;
    if (clock) {
        if (state.hot.simStepIndex != second * sim::ticksPerSecond)
            throw std::invalid_argument("stage: advance_clock requires a second-aligned anchor");
        if (state.hot.paused || (state.hot.runStatus && state.hot.runStatus->complete))
            throw std::invalid_argument("stage: advance_clock requires an advancing anchor");
    } else {
        context.lunar = sim::lunar_schedule_at_second(second, state.content->config.settings.values.phaseDurationSec);
    }
    const bool ported = sim::run_stage(*selected, state, context);
    if (clock && !context.clockBoundary)
        throw std::invalid_argument("stage: advance_clock requires an advancing anchor");

    const Value actualSidecar(Value::Object{
        {"_seasonChanged", Value(context.seasonChanged)},
        {"_boardDirty", context.boardDirty ? Value(*context.boardDirty) : Value()},
        {"chaosBefore", context.chaosBefore ? Value(*context.chaosBefore) : Value()},
    });

    auto actual = browser::export_game_state(sim::export_runtime(state));
    auto expected = *after.find("state");
    if (!options.masks.empty()) {
        const waffle::tools::ParityMasks masks(json::parse(read_file(options.masks)));
        actual = masks.apply(actual);
        expected = masks.apply(expected);
    }
    const auto expectedHash = json::sha256_value(expected);
    const auto actualHash = json::sha256_value(actual);
    Diff diff;
    compare(diff, "$.sidecar", after.find("sidecar"), &actualSidecar);
    if (expectedHash != actualHash) compare(diff, "$", &expected, &actual);
    if (diff.differing_leaves == 0 && expectedHash == actualHash) {
        if (!ported) {
            std::cout << "Stage " << name << " not ported (compared fields matched).\n";
            return 3;
        }
        std::cout << "Stage parity matched " << name << ".\n";
        return 0;
    }
    std::cout << "Divergent stage " << name << (ported ? "" : " (not ported)") << " (" << diff.differing_leaves
              << " differing leaves)\nFirst divergent path: " << diff.first_path
              << "\nExpected state hash " << expectedHash << "\nActual state hash   " << actualHash << '\n';
    return 1;
}

template<class T, class Verify>
double median_copy_us(const T& source, std::size_t samples, Verify verify)
{
    using Clock = std::chrono::steady_clock;
    std::vector<double> timings;
    timings.reserve(samples);
    constexpr std::size_t warmup = 5;
    for (std::size_t i = 0; i < samples + warmup; ++i) {
        const auto begin = Clock::now();
        const auto copy = source;
        const auto elapsed = Clock::now() - begin;
        verify(copy);
        if (i >= warmup) timings.push_back(std::chrono::duration<double, std::micro>(elapsed).count());
    }
    std::ranges::sort(timings);
    return timings[timings.size() / 2];
}

Value cold_stats(const sim::RuntimeState& state, std::size_t samples)
{
    Value::Object breakdown;
    const auto measure = [&]<class T>(const std::vector<T>& values, auto size) {
        auto bytes = values.size() * sizeof(T);
        std::size_t records = 0;
        for (const auto& value : values) {
            const auto [entryBytes, entryRecords] = size(value);
            bytes += entryBytes;
            records += entryRecords;
        }
        const auto elapsed = median_copy_us(values, samples, [&](const auto& copy) {
            if (copy.size() != values.size()) throw std::logic_error("cold copy changed table size");
        });
        breakdown.push_back({std::string(T::Name::name), Value(Value::Object{
            {"cursors", Value(static_cast<double>(values.size()))},
            {"records", Value(static_cast<double>(records))},
            {"liveBytes", Value(static_cast<double>(bytes))},
            {"medianCopyUs", Value(elapsed)},
        })});
    };
    state.cold.for_each_table([&](const auto& values) {
        measure(values, [](const auto& value) {
            return std::pair{sizeof(value.get()) + mirror_dynamic_bytes(value.get()), std::size_t{1}};
        });
    });
    state.histories.for_each_table([&](const auto& values) {
        measure(values, [](const auto& history) {
            return std::pair{history.live_bytes(), history.size()};
        });
    });
    return Value(std::move(breakdown));
}

void runtime_stats(const sim::RuntimeState& state)
{
    const auto& hot = state.hot;
    const auto& tables = state.tables;
    std::size_t markets = 0;
    std::uint64_t population = 0;
    std::size_t populationBins = 0;
    std::size_t elderBins = 0;
    std::size_t practiceRows = 0;
    std::size_t structureOrigins = 0;
    std::size_t marketRows = 0;
    const auto elder = state.find_id<runtime::LifeStageId>("elder");
    for (const auto& site : tables.view(hot.world.sites)) {
        const auto& settlement = site.detailedState;
        practiceRows += settlement.practiceSlots.rows.size();
        structureOrigins += settlement.structureSlots.origins.size();
        for (const auto* residency : {&settlement.populationByClass.villager, &settlement.populationByClass.stranger}) {
            if (residency->joint) {
                populationBins += residency->joint->size();
                elderBins += std::ranges::count(tables.view(*residency->joint), elder, &runtime::JointCohort::kind);
            }
        }
        if (site.neutral) {
            ++markets;
            marketRows += tables.at(*site.neutral).stocks.size();
        }
        for (const auto& totals : state.indexes.sites.at(site.id.value).byResidency) population += totals.total();
    }
    constexpr std::size_t samples = 101;
    const auto fullCopy = median_copy_us(state, samples, [&](const auto& copy) {
        if (copy.content != state.content) throw std::logic_error("runtime copy changed captured content");
    });
    const Value result(Value::Object{
        {"tSec", Value(hot.tSec)},
        {"year", Value(hot.year)},
        {"regions", Value(static_cast<double>(hot.world.regions.size()))},
        {"sites", Value(static_cast<double>(hot.world.sites.size()))},
        {"activeSites", Value(static_cast<double>(state.indexes.activeSites.size()))},
        {"roads", Value(static_cast<double>(hot.world.connections.size()))},
        {"practices", Value(static_cast<double>(practiceRows))},
        {"structureOrigins", Value(static_cast<double>(structureOrigins))},
        {"markets", Value(static_cast<double>(markets))},
        {"marketRows", Value(static_cast<double>(marketRows))},
        {"marketTableRows", Value(static_cast<double>(tables.rows<runtime::NeutralStock>().size()))},
        {"populationBins", Value(static_cast<double>(populationBins))},
        {"elderBins", Value(static_cast<double>(elderBins))},
        {"population", Value(static_cast<double>(population))},
        {"pendingEvents", Value(static_cast<double>(hot.civilization.practiceEvents.pending.size()))},
        {"hotBytes", Value(static_cast<double>(state.hot_bytes()))},
        {"copySamples", Value(static_cast<double>(samples))},
        {"medianCopyUs", Value(fullCopy)},
        {"coldSubtrees", cold_stats(state, samples)}
    });
    std::cout << json::stringify(result) << '\n';
}

}

int main(int argc, char** argv)
{
    try {
        const std::string_view command = argc > 1 ? argv[1] : "";
        if ((command == "roundtrip" || command == "runtime-roundtrip") &&
            (argc == 3 || (argc == 5 && std::string_view(argv[3]) == "--out"))) {
            const auto input = json::parse(read_file(argv[2]));
            auto state = browser::import_game_state(input);
            if (command == "runtime-roundtrip") state = sim::export_runtime(sim::import_runtime(state));
            const auto output = json::stringify(browser::export_game_state(state));
            if (argc == 5) write_file(argv[4], output);
            else std::cout << output;
            return 0;
        }
        if (command == "runtime-stats" && argc == 3) {
            runtime_stats(sim::import_runtime(browser::import_game_state(json::parse(read_file(argv[2])))));
            return 0;
        }
        if (command == "hash" && argc == 3) {
            std::cout << json::sha256_value(json::parse(read_file(argv[2]))) << '\n';
            return 0;
        }
        if (command == "diff" && argc == 4)
            return diff_files(json::parse(read_file(argv[2])), json::parse(read_file(argv[3])));
        if (command == "step") return step(parse_step_options(argc, argv));
        if (command == "stage") return stage(parse_stage_options(argc, argv));

        throw std::invalid_argument("Usage: waffle_parity (roundtrip | runtime-roundtrip) <state.json> [--out <path>] | "
                                    "runtime-stats <state.json> | "
                                    "hash <state.json> | diff <a.json> <b.json> | step [options] | stage [options]");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }
}
