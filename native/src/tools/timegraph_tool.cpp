#include "tools/timegraph_tool.hpp"

#include "timegraph/forecast.hpp"
#include "timegraph/anchor.hpp"
#include "tools/json_file.hpp"
#include "tools/reference_topology.hpp"
#include "tools/replay_checks.hpp"

#include <algorithm>
#include <charconv>
#include <chrono>
#include <iostream>
#include <sstream>

#if defined(_WIN32)
#define NOMINMAX
#include <windows.h>
#include <psapi.h>
#endif

namespace waffle::tools {
namespace {

namespace graph = timegraph;
namespace json = core::json;
using json::Value;
using Clock = std::chrono::steady_clock;

struct Options {
    std::filesystem::path from, actions, topology, report, expected;
    std::size_t seconds = 32000, samples = 256, repeats = 3;
    bool longevity{}, memoryProfile{}, retainPrevious{};
};

std::size_t parse_count(std::string_view text)
{
    std::size_t value{};
    const auto end = text.data() + text.size();
    const auto result = std::from_chars(text.data(), end, value);
    if (result.ec != std::errc{} || result.ptr != end || value > 1000000)
        throw std::invalid_argument("timegraph: expected a count from 0 through 1000000");
    return value;
}

Options parse(int argc, char** argv)
{
    Options options;
    for (int i = 2; i < argc; ++i) {
        const std::string_view flag = argv[i];
        if (flag == "--longevity") {
            options.longevity = true;
            continue;
        }
        if (flag == "--memory-profile" || flag == "--retain-previous") {
            options.memoryProfile = true;
            options.retainPrevious |= flag == "--retain-previous";
            continue;
        }
        if (++i == argc) throw std::invalid_argument("timegraph: missing value for " + std::string(flag));
        const std::string_view value = argv[i];
        if (flag == "--from") options.from = value;
        else if (flag == "--actions") options.actions = value;
        else if (flag == "--topology-dir") options.topology = value;
        else if (flag == "--report") options.report = value;
        else if (flag == "--expect") options.expected = value;
        else if (flag == "--seconds") options.seconds = parse_count(value);
        else if (flag == "--samples") options.samples = parse_count(value);
        else if (flag == "--repeats") options.repeats = parse_count(value);
        else throw std::invalid_argument("timegraph: unknown flag " + std::string(flag));
    }
    if (options.from.empty() || !options.repeats)
        throw std::invalid_argument("Usage: waffle_parity timegraph --from <state.json> [--seconds <32000>] "
                                    "[--actions <journal.json>] [--topology-dir <dir>] [--longevity] "
                                    "[--samples <256>] [--repeats <3>] [--report <json>] [--expect <tsv>] "
                                    "[--memory-profile | --retain-previous]");
    return options;
}

sim::RuntimeState load(const Options& options)
{
    auto input = json::parse(read_file(options.from));
    if (options.longevity) {
        auto config = *input.find("gameConfig");
        auto settings = *config.find("settings");
        auto values = *settings.find("values");
        values.set("phaseDurationSec", Value(64.0));
        values.set("monsterExpansionThreshold", Value(1000000000.0));
        settings.set("values", std::move(values));
        config.set("settings", std::move(settings));
        input.set("gameConfig", std::move(config));
    }
    const auto mirror = sim::browser::import_game_state(input);
    const auto topology = reference_topology_override(options.topology, WAFFLE_REFERENCE_TOPOLOGY_DIR,
                                                      mirror.world.definitionId);
    return sim::admit_runtime(mirror, topology ? &*topology : nullptr, input.find("gameConfig"));
}

Value number(std::size_t value) { return Value(static_cast<double>(value)); }

Value process_private_bytes()
{
#if defined(_WIN32)
    PROCESS_MEMORY_COUNTERS_EX usage{};
    usage.cb = sizeof(usage);
    if (GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&usage), sizeof(usage)))
        return number(usage.PrivateUsage);
#endif
    return Value();
}

double elapsed(Clock::time_point begin)
{
    return std::chrono::duration<double, std::milli>(Clock::now() - begin).count();
}

const char* completion(graph::Completion result)
{
    switch (result) {
    case graph::Completion::horizon: return "horizon";
    case graph::Completion::terminal: return "terminal";
    case graph::Completion::storageLimit: return "storageLimit";
    default: throw std::logic_error("unexpected forecast completion");
    }
}

const char* terminal_reason(std::optional<sim::browser::RunEndReason> reason)
{
    if (!reason) return "";
    switch (*reason) {
    case sim::browser::RunEndReason::monsterOverrun: return "monsterOverrun";
    case sim::browser::RunEndReason::territorialLoss: return "territorialLoss";
    case sim::browser::RunEndReason::tenuresExhausted: return "tenuresExhausted";
    }
    throw std::logic_error("unknown terminal reason");
}

graph::Coverage finished(graph::Forecast& forecast, graph::GenerationId id)
{
    const auto coverage = forecast.wait(id);
    if (!coverage) throw std::runtime_error("forecast generation was lost");
    if (coverage->completion == graph::Completion::failed) throw std::runtime_error(coverage->error);
    if (!coverage->publishedThrough) throw std::runtime_error("forecast published no rows");
    return *coverage;
}

Value percentiles(std::vector<double>& timings)
{
    std::ranges::sort(timings);
    const auto pct = [&](std::size_t percentile) {
        return timings.empty() ? Value() : Value(timings[(percentile * timings.size() + 99) / 100 - 1]);
    };
    return Value(Value::Object{
        {"samples", number(timings.size())}, {"p50Ms", pct(50)}, {"p95Ms", pct(95)}, {"p99Ms", pct(99)},
    });
}

std::vector<double> measure_restores(graph::Forecast& forecast, const sim::RuntimeState& initial,
                                     const sim::ActionJournal& actions, const graph::Coverage& expected,
                                     std::size_t samples)
{
    std::vector<double> durations;
    durations.reserve(samples);
    if (!samples) return durations;
    const auto id = forecast.start(initial, actions, expected.target);
    const auto length = *expected.publishedThrough - expected.start;
    std::uint32_t random = 4221;
    for (std::size_t n = 1; n <= samples; ++n) {
        const auto milestone = expected.start + n * length / (samples + 1);
        const auto coverage = forecast.wait(id, milestone);
        if (!coverage || coverage->completion != graph::Completion::running) break;
        random = random * 1664525u + 1013904223u;
        const auto available = *coverage->publishedThrough - coverage->start + 1;
        const auto target = coverage->start + random % available;
        const auto begin = Clock::now();
        auto result = forecast.stateAtSecond(id, target).get();
        const auto duration = elapsed(begin);
        if (result.status != graph::RestoreStatus::ready || result.state->hot.tSec != static_cast<double>(target))
            throw std::runtime_error("random restore failed at second " + std::to_string(target));
        if (forecast.coverage(id)->completion == graph::Completion::running) durations.push_back(duration);
    }
    const auto through = finished(forecast, id);
    if (through.publishedThrough != expected.publishedThrough || through.completion != expected.completion)
        throw std::logic_error("restore load changed the forecast horizon");
    return durations;
}

std::size_t verify(graph::Forecast& forecast, const graph::Coverage& coverage, const std::filesystem::path& expected)
{
    std::ifstream input(expected, std::ios::binary);
    std::string line;
    std::getline(input, line);
    if (line != timegraphDigestHeader) throw std::runtime_error("invalid timegraph digest stream " + expected.string());
    graph::SummaryHeader header;
    std::vector<graph::SiteSummary> sites(coverage.regions);
    std::size_t anchors = 0;
    for (auto second = coverage.start; second <= *coverage.publishedThrough; ++second) {
        if (forecast.readSummaries(coverage.generation, second, std::span(&header, 1), sites) != 1)
            throw std::logic_error("missing row at " + std::to_string(second));
        std::optional<std::uint64_t> anchor;
        if ((second - coverage.start) % sim::replay_anchor_stride == 0 || second == *coverage.publishedThrough) {
            const auto restored = forecast.stateAtSecond(coverage.generation, second).get();
            if (restored.status != graph::RestoreStatus::ready)
                throw std::logic_error("missing anchor at " + std::to_string(second));
            anchor = sim::state_digest(*restored.state);
            ++anchors;
        }
        std::ostringstream actual;
        write_timegraph_digest(actual, header, sites, anchor);
        if (!std::getline(input, line) || actual.str() != line + '\n')
            throw std::runtime_error("timegraph hash mismatch at second " + std::to_string(second) +
                                     "\nexpected " + line + "\nactual   " + actual.str());
    }
    if (std::getline(input, line) || coverage.anchors != anchors)
        throw std::runtime_error("timegraph digest length or anchor count mismatch");
    return anchors;
}

void profile_memory(const Options& options, const sim::RuntimeState& initial, const sim::ActionJournal& actions)
{
    graph::Forecast forecast;
    const auto& arena = initial.practiceRecipeStorage.historyArena;
    const auto base = process_private_bytes();
    const auto baseArena = arena->storage();
    const auto start = static_cast<graph::Second>(initial.hot.tSec);
    const auto horizon = start + options.seconds;
    Value::Array runs;
    const auto profile = [&](std::optional<graph::Second> retain) {
        const auto coverage = finished(forecast, forecast.start(initial, actions, horizon,
                                                                graph::BoundaryActions::pending, retain));
        const auto storage = forecast.storage();
        const auto process = process_private_bytes();
        const auto history = arena->storage();
        runs.emplace_back(Value::Object{
            {"endSec", number(*coverage.publishedThrough)}, {"completion", Value(completion(coverage.completion))},
            {"summaryBytes", number(storage.summaries)}, {"anchorBytes", number(storage.anchors)},
            {"journalBytes", number(storage.journals)}, {"chargedBytes", number(storage.chargedBytes())},
            {"historyRetainedBytes", number(storage.historyRetained)},
            {"historyLiveBytes", number(storage.historyLive)},
            {"historyRecycledBytes", number(storage.historyRecycled)},
            {"forecastWorkingBytes", number(storage.forecastWorking)},
            {"restoreWorkingBytes", number(storage.restoreWorking)},
            {"arenaRetainedBytes", number(history.retained)}, {"arenaLiveBytes", number(history.live)},
            {"arenaRecycledBytes", number(history.recycled)},
            {"processPrivateBytes", process},
        });
        return coverage;
    };
    const auto first = profile({});
    std::vector coverages{first};
    if (options.retainPrevious) coverages.push_back(profile(first.publishedThrough));
    for (std::size_t i = 0; i < coverages.size(); ++i) {
        const auto& coverage = coverages[i];
        const auto windows = (*coverage.publishedThrough - start) / sim::replay_anchor_stride;
        const auto target = windows ? start + windows * sim::replay_anchor_stride - 1 : *coverage.publishedThrough;
        const auto before = forecast.storage().historyRetained;
        const auto restored = forecast.stateAtSecond(coverage.generation, target).get();
        if (restored.status != graph::RestoreStatus::ready) throw std::logic_error("profile restore failed");
        const auto after = forecast.storage().historyRetained;
        runs[i].set("restoreTargetSec", number(target));
        runs[i].set("restoredStateBytes", number(graph::detail::runtime_bytes(*restored.state)));
        runs[i].set("restoreHistoryGrowthBytes", number(after - std::min(after, before)));
    }
    const Value report(Value::Object{
        {"baselinePrivateBytes", base}, {"baselineArenaBytes", number(baseArena.retained)},
        {"runs", Value(std::move(runs))},
    });
    const auto output = json::stringify(report) + '\n';
    if (options.report.empty()) std::cout << output;
    else write_file(options.report, output);
}

}

int timegraph_tool(int argc, char** argv)
{
    const auto options = parse(argc, argv);
    const auto initial = load(options);
    const auto actions = load_action_journal(options.actions);
    if (options.memoryProfile) {
        profile_memory(options, initial, actions);
        return 0;
    }
    graph::Forecast forecast;
    const auto base = static_cast<graph::Second>(initial.hot.tSec);
    finished(forecast, forecast.start(initial, actions, base + std::min<std::size_t>(options.seconds, 512)));
    const auto horizon = base + options.seconds;
    Value::Array runs;
    for (std::size_t repeat = 0; repeat < options.repeats; ++repeat) {
        auto state = initial;
        auto journal = actions;
        const auto begin = Clock::now();
        const auto generation = forecast.start(std::move(state), std::move(journal), horizon);
        const auto coverage = finished(forecast, generation);
        const auto wall = elapsed(begin);
        const auto storage = forecast.storage();
        const auto processPrivate = process_private_bytes();
        const auto published = *coverage.publishedThrough - base;
        graph::SummaryHeader last;
        std::vector<graph::SiteSummary> sites(coverage.regions);
        forecast.readSummaries(generation, *coverage.publishedThrough, std::span(&last, 1), sites);
        if (!options.expected.empty() && repeat == 0) {
            const auto anchors = verify(forecast, coverage, options.expected);
            std::cout << "Matched " << published + 1 << " summary hashes and " << anchors << " anchor hashes\n";
        }
        // The loaded pass is separate so the throughput figure measures
        // publication and anchor capture without synthetic scrub traffic.
        auto timings = measure_restores(forecast, initial, actions, coverage, options.samples);
        const auto rate = 1000 * published / wall;
        std::cout << published << " sim-s in " << wall << " ms (" << rate << " sim-s/s), "
                  << completion(coverage.completion) << ' ' << terminal_reason(last.terminal)
                  << ", " << storage.chargedBytes() << " charged bytes, " << timings.size() << " loaded restores\n";
        runs.emplace_back(Value::Object{
            {"startSec", number(base)}, {"endSec", number(*coverage.publishedThrough)},
            {"advances", number(published)}, {"anchors", number(coverage.anchors)},
            {"completion", Value(completion(coverage.completion))}, {"terminalReason", Value(terminal_reason(last.terminal))},
            {"wallMs", Value(wall)}, {"simSecondsPerSecond", Value(rate)},
            {"microsecondsPerPublishedSecond", Value(1000 * wall / (published + 1))},
            {"summaryRowBytes", number(sizeof(graph::SummaryHeader) + coverage.regions * sizeof(graph::SiteSummary))},
            {"summaryBytes", number(storage.summaries)}, {"anchorBytes", number(storage.anchors)},
            {"journalBytes", number(storage.journals)}, {"historyRetainedBytes", number(storage.historyRetained)},
            {"forecastWorkingBytes", number(storage.forecastWorking)}, {"restoreWorkingBytes", number(storage.restoreWorking)},
            {"chargedBytes", number(storage.chargedBytes())}, {"processPrivateBytes", processPrivate},
            {"restore", percentiles(timings)},
        });
    }
    if (!options.report.empty()) {
        Value report(Value::Object{
            {"fixture", Value(options.longevity ? "N03g longevity (phaseDurationSec=64, Monster expansion suppressed)"
                                                 : "unmodified")},
            {"requestedAdvances", number(options.seconds)}, {"warmupAdvances", number(std::min<std::size_t>(options.seconds, 512))},
            {"runs", Value(std::move(runs))},
        });
        write_file(options.report, json::stringify(report) + '\n');
    }
    return 0;
}

}
