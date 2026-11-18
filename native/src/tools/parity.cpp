#include "sim/browser/detail/json_path.hpp"
#include "sim/browser/generated/game_state.hpp"
#include "sim/state/runtime_state.hpp"
#include "sim/step/advance_second.hpp"
#include "tools/json_file.hpp"
#include "tools/parity_masks.hpp"

#include <algorithm>
#include <charconv>
#include <chrono>
#include <cmath>
#include <iostream>
#include <map>

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

struct StepOptions {
    std::filesystem::path from, expectDir, masks, report;
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
                                    "--expect-dir <directory> --masks <masks.json> [--report <path>] [--time]");
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
    const auto initial = sim::import_runtime(browser::import_game_state(json::parse(read_file(options.from))));
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

double median_copy_us(const sim::RuntimeState& state, std::size_t samples)
{
    using Clock = std::chrono::steady_clock;
    std::vector<double> timings;
    timings.reserve(samples);
    constexpr std::size_t warmup = 5;
    for (std::size_t i = 0; i < samples + warmup; ++i) {
        const auto begin = Clock::now();
        const auto copy = state;
        const auto elapsed = Clock::now() - begin;
        if (copy.content != state.content) throw std::logic_error("runtime copy changed captured content");
        if (i >= warmup) timings.push_back(std::chrono::duration<double, std::micro>(elapsed).count());
    }
    std::ranges::sort(timings);
    return timings[timings.size() / 2];
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
        {"medianCopyUs", Value(median_copy_us(state, samples))}
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

        throw std::invalid_argument("Usage: waffle_parity (roundtrip | runtime-roundtrip) <state.json> [--out <path>] | "
                                    "runtime-stats <state.json> | "
                                    "hash <state.json> | diff <a.json> <b.json> | step [options]");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }
}
