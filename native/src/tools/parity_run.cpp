#include "tools/parity_run.hpp"

#include "sim/state/runtime_state.hpp"
#include "sim/step/advance_second.hpp"
#include "tools/json_file.hpp"
#include "tools/reference_topology.hpp"

#include <algorithm>
#include <charconv>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <sstream>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <psapi.h>
#elif defined(__linux__)
#include <sys/resource.h>
#endif

namespace waffle::tools {
namespace {

namespace json = core::json;
namespace browser = sim::browser;
using json::Value;
using Clock = std::chrono::steady_clock;
constexpr std::size_t stride = 64;
constexpr std::string_view streamVersion = "waffle-state-digest-v1";

struct Options {
    std::filesystem::path from, hashes, expect, report, snapshot, topologyDir;
    std::optional<std::size_t> seconds;
    bool anchors = false;
};

Options parse_options(int argc, char** argv)
{
    Options options;
    for (int i = 2; i < argc; ++i) {
        const std::string_view flag = argv[i];
        if (flag == "--anchors" && !options.anchors) {
            options.anchors = true;
            continue;
        }
        if (i + 1 == argc) throw std::invalid_argument("run: missing value for " + std::string(flag));
        const std::string_view value = argv[++i];
        if (flag == "--from" && options.from.empty()) options.from = value;
        else if (flag == "--hashes" && options.hashes.empty()) options.hashes = value;
        else if (flag == "--expect" && options.expect.empty()) options.expect = value;
        else if (flag == "--report" && options.report.empty()) options.report = value;
        else if (flag == "--snapshot" && options.snapshot.empty()) options.snapshot = value;
        else if (flag == "--topology-dir" && options.topologyDir.empty()) options.topologyDir = value;
        else if (flag == "--seconds" && !options.seconds) {
            std::size_t seconds{};
            const auto end = value.data() + value.size();
            const auto parsed = std::from_chars(value.data(), end, seconds);
            if (parsed.ec != std::errc{} || parsed.ptr != end || seconds == SIZE_MAX)
                throw std::invalid_argument("run: --seconds must be a nonnegative integer below SIZE_MAX");
            options.seconds = seconds;
        } else {
            throw std::invalid_argument("run: unknown or repeated option " + std::string(flag));
        }
    }
    if (options.from.empty() || !options.seconds || options.hashes.empty())
        throw std::invalid_argument("Usage: waffle_parity run --from <state.json> --seconds <n> --hashes <path> "
                                    "[--expect <path>] [--anchors] [--report <path>] [--snapshot <path>] "
                                    "[--topology-dir <directory>]");
    if (options.hashes == options.expect)
        throw std::invalid_argument("run: --hashes and --expect need separate paths");
    return options;
}

Value number(std::size_t value) { return Value(static_cast<double>(value)); }

void advance(sim::RuntimeState& state)
{
    const auto second = state.hot.tSec;
    if (!sim::advance_one_second(state) || state.hot.tSec != second + 1)
        throw std::runtime_error("run: cannot advance from second " + std::to_string(second));
}

std::uint64_t digest(const sim::RuntimeState& state)
{
    try {
        return sim::state_digest(state);
    } catch (const std::exception& error) {
        throw std::runtime_error("run: second " + std::to_string(state.hot.tSec) + " $." + error.what());
    }
}

std::string expected_line(std::ifstream& expected)
{
    std::string line;
    std::getline(expected, line);
    if (!line.empty() && line.back() == '\r') line.pop_back();
    return line;
}

std::string snapshot(const sim::RuntimeState& state)
{
    return json::stringify(browser::export_game_state(sim::export_runtime(state)));
}

Value process_memory()
{
    Value result(Value::Object{});
#if defined(_WIN32)
    PROCESS_MEMORY_COUNTERS_EX counters{};
    counters.cb = sizeof(counters);
    if (!GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters), sizeof(counters)))
        throw std::runtime_error("GetProcessMemoryInfo failed");
    result.set("rssBytes", number(counters.WorkingSetSize));
    result.set("peakRssBytes", number(counters.PeakWorkingSetSize));
    result.set("privateBytes", number(counters.PrivateUsage));
#elif defined(__linux__)
    rusage usage{};
    if (getrusage(RUSAGE_SELF, &usage) == 0)
        result.set("peakRssBytes", number(static_cast<std::size_t>(usage.ru_maxrss) * 1024));
    std::ifstream status("/proc/self/status");
    for (std::string line; std::getline(status, line);) {
        if (line.starts_with("VmRSS:")) result.set("rssBytes", number(std::stoull(line.substr(6)) * 1024));
    }
#endif
    return result;
}

Value state_size(const sim::RuntimeState& state, std::size_t anchorCount)
{
    Value history(Value::Object{});
    std::size_t totalBytes = 0;
    state.histories.for_each_table([&](const auto& values) {
        using History = typename std::remove_cvref_t<decltype(values)>::value_type;
        std::size_t bytes = 0, rows = 0;
        for (const auto& log : values) {
            bytes += log.live_bytes();
            rows += log.size();
        }
        totalBytes += bytes;
        history.set(std::string(History::Name::name), Value(Value::Object{
            {"rows", number(rows)}, {"liveBytes", number(bytes)},
        }));
    });
    return Value(Value::Object{
        {"second", Value(state.hot.tSec)},
        {"anchors", number(anchorCount)},
        {"hotBytes", number(state.hot_bytes())},
        {"historyLiveBytes", number(totalBytes)},
        {"history", std::move(history)},
        {"process", process_memory()},
    });
}

double elapsed_ms(Clock::time_point begin)
{
    return std::chrono::duration<double, std::milli>(Clock::now() - begin).count();
}

Value percentiles(std::vector<double>& samples)
{
    if (samples.empty()) return Value(Value::Object{});
    std::ranges::sort(samples);
    const auto at = [&](std::size_t pct) { return Value(samples[(pct * samples.size() + 99) / 100 - 1]); };
    return Value(Value::Object{{"count", number(samples.size())}, {"p50Ms", at(50)}, {"p95Ms", at(95)}});
}

void verify_replay(sim::RuntimeState state, std::span<const std::uint64_t> expected, std::string_view method)
{
    const auto anchor = state.hot.tSec;
    for (std::size_t i = 0; i < expected.size(); ++i) {
        if (i != 0) advance(state);
        if (digest(state) != expected[i])
            throw std::runtime_error(std::string(method) + " anchor " + std::to_string(anchor) +
                                     " diverged at second " + std::to_string(state.hot.tSec));
    }
}

Value verify_restores(const std::vector<sim::RuntimeState>& anchors, const std::vector<std::uint64_t>& hashes,
                      const Value* topology, const std::filesystem::path& artifacts)
{
    const auto fullWindows = (hashes.size() - 1) / stride;
    const auto samples = std::min<std::size_t>(32, std::max<std::size_t>(1, fullWindows));
    std::vector<double> restore;
    std::vector<double> saveTimes, loadTimes;
    Value::Array saves;
    for (std::size_t sample = 0; sample < samples; ++sample) {
        const auto anchorIndex = samples == 1 ? 0 : sample * (fullWindows - 1) / (samples - 1);
        const auto& anchor = anchors[anchorIndex];
        const auto remaining = std::min(stride, hashes.size() - anchorIndex * stride);
        const auto expected = std::span(hashes).subspan(anchorIndex * stride, remaining);

        // Measure a copy plus a full 63-second scrub separately from hashing.
        const auto begin = Clock::now();
        auto restored = anchor;
        for (std::size_t i = 1; i < remaining; ++i) advance(restored);
        restore.push_back(elapsed_ms(begin));
        if (digest(restored) != expected.back()) throw std::logic_error("timed restore diverged");
        verify_replay(anchor, expected, "value copy");

        // Pick five anchors across the sampled range, including both ends.
        const auto adapterSamples = std::min<std::size_t>(5, samples);
        bool adapter = adapterSamples == 1;
        for (std::size_t i = 0; i < adapterSamples && adapterSamples > 1; ++i)
            adapter |= sample == i * (samples - 1) / (adapterSamples - 1);
        if (!adapter) continue;

        const auto saveBegin = Clock::now();
        const auto saved = snapshot(anchor);
        saveTimes.push_back(elapsed_ms(saveBegin));
        const auto loadBegin = Clock::now();
        const auto parsed = json::parse(saved);
        auto reloaded = sim::admit_runtime(browser::import_game_state(parsed), topology, parsed.find("gameConfig"));
        loadTimes.push_back(elapsed_ms(loadBegin));
        const auto roundTrip = snapshot(reloaded);
        if (roundTrip != saved || digest(reloaded) != expected.front()) {
            write_file(artifacts.string() + ".before.json", saved);
            write_file(artifacts.string() + ".after.json", roundTrip);
            throw std::runtime_error("adapter changed state at second " + std::to_string(anchor.hot.tSec) +
                                     " (see .before.json and .after.json next to the hash stream)");
        }
        verify_replay(std::move(reloaded), expected, "adapter");
        saves.emplace_back(Value::Object{{"second", Value(anchor.hot.tSec)}, {"jsonBytes", number(saved.size())}});
    }
    return Value(Value::Object{
        {"restoreAndReplay", percentiles(restore)}, {"save", percentiles(saveTimes)}, {"load", percentiles(loadTimes)},
        {"adapterSamples", Value(std::move(saves))},
    });
}

}

int parity_run(int argc, char** argv)
{
    const auto options = parse_options(argc, argv);
    const auto seconds = *options.seconds;
    const auto input = json::parse(read_file(options.from));
    const auto mirror = browser::import_game_state(input);
    const auto topology = reference_topology_override(options.topologyDir, WAFFLE_REFERENCE_TOPOLOGY_DIR,
                                                       mirror.world.definitionId);
    const auto* topologyData = topology ? &*topology : nullptr;
    auto state = sim::admit_runtime(mirror, topologyData, input.find("gameConfig"));
    const auto beginSec = state.hot.tSec;

    // Time a full uninterrupted advance pass before collecting hashes or
    // retaining anchors. Check its endpoint against the instrumented pass.
    double forecastMs;
    std::uint64_t forecastHash;
    Value forecastSize;
    {
        auto forecast = state;
        const auto forecastBegin = Clock::now();
        for (std::size_t i = 0; i < seconds; ++i) advance(forecast);
        forecastMs = elapsed_ms(forecastBegin);
        forecastHash = digest(forecast);
        forecastSize = state_size(forecast, 0);
    }

    std::ifstream expected;
    if (!options.expect.empty()) {
        expected.open(options.expect, std::ios::binary);
        if (expected_line(expected) != streamVersion)
            throw std::runtime_error("run: missing or invalid expected stream " + options.expect.string());
    }
    std::ofstream stream(options.hashes, std::ios::binary);
    stream << streamVersion << '\n';
    if (!stream) throw std::runtime_error("could not write " + options.hashes.string());

    std::vector<std::uint64_t> hashes;
    std::vector<sim::RuntimeState> anchors;
    std::vector<double> copyTimes;
    if (options.anchors) {
        hashes.reserve(seconds + 1);
        anchors.reserve(seconds / stride + 1);
        copyTimes.reserve(anchors.capacity());
    }
    Value::Array sizes;
    std::uint64_t lastHash{};
    const auto validationBegin = Clock::now();
    for (std::size_t i = 0; i <= seconds; ++i) {
        if (i != 0) advance(state);
        lastHash = digest(state);
        std::ostringstream line;
        line << static_cast<std::uint64_t>(state.hot.tSec) << '\t' << std::hex << std::setfill('0') << std::setw(16)
             << lastHash;
        stream << line.str() << '\n';
        if (expected.is_open()) {
            const auto wanted = expected_line(expected);
            if (wanted != line.str())
                throw std::runtime_error("run: expected \"" + wanted + "\", got \"" + line.str() + "\"");
        }
        if (options.anchors) {
            hashes.push_back(lastHash);
            if (i % stride == 0) {
                const auto copyBegin = Clock::now();
                anchors.push_back(state);
                copyTimes.push_back(elapsed_ms(copyBegin));
            }
        }
        if (i == 0 || i == seconds || i % std::max<std::size_t>(1, seconds / 4) == 0)
            sizes.push_back(state_size(state, anchors.size()));
    }
    if (expected.is_open() && expected.peek() != std::char_traits<char>::eof())
        throw std::runtime_error("run: extra rows in expected hash stream");
    stream.close();
    if (!stream) throw std::runtime_error("could not write " + options.hashes.string());
    if (lastHash != forecastHash) throw std::logic_error("instrumented pass changed final state");
    const auto validationMs = elapsed_ms(validationBegin);
    if (!options.snapshot.empty()) write_file(options.snapshot, snapshot(state));

    Value report(Value::Object{
        {"startSec", Value(beginSec)}, {"seconds", number(seconds)},
        {"forecastMs", Value(forecastMs)}, {"forecastFinal", forecastSize},
        {"forecastSimSecondsPerSecond", Value(forecastMs > 0 ? 1000.0 * seconds / forecastMs : 0.0)},
        {"validationMs", Value(validationMs)}, {"sizes", Value(std::move(sizes))},
    });
    if (options.anchors) {
        report.set("anchorCopy", percentiles(copyTimes));
        report.set("restore", verify_restores(anchors, hashes, topologyData, options.hashes));
    }
    if (!options.report.empty()) write_file(options.report, json::stringify(report) + '\n');
    std::cout << "Checked " << seconds << " advances from second " << beginSec
              << " at " << 1000.0 * seconds / std::max(forecastMs, 0.001) << " sim-s/s";
    if (options.anchors) std::cout << ", " << anchors.size() << " anchors and sampled value/adapter restores";
    std::cout << '\n';
    return 0;
}

}
