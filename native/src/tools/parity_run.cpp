#include "tools/parity_run.hpp"

#include "sim/state/runtime_state.hpp"
#include "sim/step/advance_second.hpp"
#include "tools/json_file.hpp"
#include "tools/reference_topology.hpp"
#include "tools/replay_checks.hpp"

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
constexpr auto stride = sim::replay_anchor_stride;
constexpr std::string_view streamVersion = "waffle-state-digest-v1";

struct Options {
    std::filesystem::path from, hashes, expect, report, snapshot, topologyDir, actions, checkpoints, rejections;
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
        else if (flag == "--actions" && options.actions.empty()) options.actions = value;
        else if (flag == "--browser-checkpoints" && options.checkpoints.empty()) options.checkpoints = value;
        else if (flag == "--rejections" && options.rejections.empty()) options.rejections = value;
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
                                    "[--topology-dir <directory>] [--actions <journal.json>] "
                                    "[--browser-checkpoints <sha256.tsv>] [--rejections <cases.json>]");
    if (!options.checkpoints.empty() && !options.anchors)
        throw std::invalid_argument("run: --browser-checkpoints requires --anchors");
    if (options.hashes == options.expect)
        throw std::invalid_argument("run: --hashes and --expect need separate paths");
    return options;
}

Value number(std::size_t value) { return Value(static_cast<double>(value)); }

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

void verify_replay(sim::RuntimeState state, const sim::ActionJournal& journal,
                   std::span<const std::uint64_t> expected, std::string_view method)
{
    const auto anchor = state.hot.tSec;
    sim::ReplayCursor replay(journal, anchor, true);
    for (std::size_t i = 0; i < expected.size(); ++i) {
        if (i != 0) require_replay(replay.advance(state));
        if (digest(state) != expected[i])
            throw std::runtime_error(std::string(method) + " anchor " + std::to_string(anchor) +
                                     " diverged at second " + std::to_string(state.hot.tSec));
    }
}

Value verify_restores(const sim::RuntimeState& initial, const sim::ActionJournal& journal,
                      const std::vector<sim::RuntimeState>& anchors, const std::vector<std::uint64_t>& hashes,
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

        // Measure a full 63-second restore separately from hashing.
        const auto begin = Clock::now();
        const auto restored = sim::rebuildStateAtSecond(initial, journal, anchor.hot.tSec + remaining - 1, anchors);
        restore.push_back(elapsed_ms(begin));
        require_replay(restored.result);
        if (digest(*restored.state) != expected.back()) throw std::logic_error("timed restore diverged");
        verify_replay(anchor, journal, expected, "value copy");

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
        verify_replay(std::move(reloaded), journal, expected, "adapter");
        saves.emplace_back(Value::Object{{"second", Value(anchor.hot.tSec)}, {"jsonBytes", number(saved.size())}});
    }
    std::vector<double> randomTimes;
    std::uint32_t sampleSeed = 4221;
    for (std::size_t sample = 0; sample < 256; ++sample) {
        // This stream selects benchmark targets outside gameplay.
        sampleSeed = sampleSeed * 1664525u + 1013904223u;
        const auto offset = sampleSeed % hashes.size();
        const auto begin = Clock::now();
        const auto rebuilt = sim::rebuildStateAtSecond(initial, journal, initial.hot.tSec + offset, anchors);
        randomTimes.push_back(elapsed_ms(begin));
        require_replay(rebuilt.result);
        if (digest(*rebuilt.state) != hashes[offset]) throw std::logic_error("random restore diverged");
    }
    return Value(Value::Object{
        {"restoreAndReplay", percentiles(restore)}, {"save", percentiles(saveTimes)}, {"load", percentiles(loadTimes)},
        {"adapterSamples", Value(std::move(saves))}, {"randomRestore", percentiles(randomTimes)},
    });
}

std::vector<std::pair<double, std::string>> load_checkpoints(const std::filesystem::path& path)
{
    if (path.empty()) return {};
    std::ifstream stream(path, std::ios::binary);
    if (expected_line(stream) != "tSec\tsha256") throw std::invalid_argument("run: invalid browser checkpoint header");
    std::vector<std::pair<double, std::string>> rows;
    for (auto line = expected_line(stream); !line.empty(); line = expected_line(stream)) {
        const auto tab = line.find('\t');
        if (tab == std::string::npos || line.size() != tab + 65)
            throw std::invalid_argument("run: invalid browser checkpoint row");
        std::uint64_t second{};
        const auto end = line.data() + tab;
        const auto parsed = std::from_chars(line.data(), end, second);
        if (parsed.ec != std::errc{} || parsed.ptr != end || second >= (1ull << 53) ||
            (!rows.empty() && second <= rows.back().first))
            throw std::invalid_argument("run: invalid browser checkpoint second");
        rows.emplace_back(static_cast<double>(second), line.substr(tab + 1));
    }
    if (rows.empty() || !stream.eof()) throw std::invalid_argument("run: missing or invalid browser checkpoints");
    return rows;
}

void verify_checkpoint(const sim::RuntimeState& state, const std::string& expected, std::string_view method,
                       const std::filesystem::path& artifacts)
{
    const auto data = browser::export_game_state(sim::export_runtime(state));
    const auto actual = json::sha256_value(data);
    if (actual == expected) return;
    write_file(artifacts.string() + ".actual.json", json::stringify(data));
    throw std::runtime_error(std::string(method) + " browser hash at second " +
        std::to_string(static_cast<std::uint64_t>(state.hot.tSec)) + ": expected " + expected + ", got " + actual);
}

}

namespace {

struct Rejection {
    sim::ActionJournal journal;
    std::string reason;
};

std::vector<Rejection> load_rejections(const std::filesystem::path& path, double start, double end)
{
    std::vector<Rejection> result;
    if (path.empty()) return result;
    const auto data = json::parse(read_file(path));
    for (const auto& entry : data.as_array()) {
        const auto* action = entry.find("action");
        const auto* reason = entry.find("reason");
        if (!action || !reason) throw std::invalid_argument("run: rejection needs an action and a reason");
        auto journal = sim::ActionJournal::from_json(Value(Value::Array{*action}));
        const auto sec = journal.entries().front().tSec;
        if (sec < start || sec > end) throw std::invalid_argument("run: rejection outside the run");
        result.push_back({std::move(journal), reason->as_string()});
    }
    return result;
}

void verify_rejections(const sim::RuntimeState& state, std::span<const Rejection> cases)
{
    for (const auto& [journal, reason] : cases) {
        const auto& action = journal.entries().front();
        if (action.tSec != state.hot.tSec) continue;
        auto trial = state;
        sim::ReplayCursor replay(journal, action.tSec, false);
        const auto result = replay.apply_boundary(trial);
        const auto label = action.kind + " rejection at second " + std::to_string(static_cast<std::uint64_t>(action.tSec));
        if (result.action != &action || result.actionReason != reason)
            throw std::runtime_error(label + ": expected " + reason + ", got " + std::string(result.actionReason));
        if (digest(state) != digest(trial)) throw std::runtime_error(label + " changed the state digest");
    }
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
    if (!options.actions.empty()) sim::initialize_replay_clock(state);
    if (beginSec < 0 || beginSec >= 0x1p53 || static_cast<double>(seconds) > (0x1p53 - 1) - beginSec)
        throw std::invalid_argument("run: range falls outside nonnegative safe integer seconds");
    const auto initial = state;
    const auto journal = load_action_journal(options.actions);
    const auto checkpoints = load_checkpoints(options.checkpoints);
    const auto rejections = load_rejections(options.rejections, beginSec, beginSec + seconds);
    if (!checkpoints.empty() &&
        (checkpoints.front().first < beginSec || checkpoints.back().first > beginSec + seconds))
        throw std::invalid_argument("run: browser checkpoints outside the run");

    // Time a full uninterrupted advance pass before collecting hashes or
    // retaining anchors. Check its endpoint against the instrumented pass.
    double forecastMs;
    std::uint64_t forecastHash;
    Value forecastSize;
    {
        auto forecast = state;
        sim::ReplayCursor replay(journal, beginSec, false);
        const auto forecastBegin = Clock::now();
        require_replay(replay.advance_to(forecast, beginSec + seconds));
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
    std::size_t checkpointIndex = 0;
    sim::ReplayCursor replay(journal, beginSec, false);
    require_replay(replay.apply_boundary(state));
    const auto validationBegin = Clock::now();
    for (std::size_t i = 0; i <= seconds; ++i) {
        if (i != 0) require_replay(replay.advance(state));
        if (checkpointIndex < checkpoints.size() && checkpoints[checkpointIndex].first == state.hot.tSec)
            verify_checkpoint(state, checkpoints[checkpointIndex++].second, "continuous", options.hashes);
        verify_rejections(state, rejections);
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
        report.set("restore", verify_restores(initial, journal, anchors, hashes, topologyData, options.hashes));
        for (const auto& [second, expectedHash] : checkpoints) {
            const auto rebuilt = sim::rebuildStateAtSecond(initial, journal, second, anchors);
            require_replay(rebuilt.result);
            verify_checkpoint(*rebuilt.state, expectedHash, "anchored rebuild", options.hashes);
            const auto fromInitial = sim::rebuildStateAtSecond(initial, journal, second);
            require_replay(fromInitial.result);
            verify_checkpoint(*fromInitial.state, expectedHash, "initial-state rebuild", options.hashes);
        }
    }
    if (!options.report.empty()) write_file(options.report, json::stringify(report) + '\n');
    std::cout << "Checked " << seconds << " advances from second " << beginSec
              << " at " << 1000.0 * seconds / std::max(forecastMs, 0.001) << " sim-s/s";
    if (options.anchors) std::cout << ", " << anchors.size() << " anchors and sampled value/adapter restores";
    if (!checkpoints.empty()) std::cout << ", " << checkpoints.size() << " browser checkpoints in three replay modes";
    std::cout << '\n';
    return 0;
}

}
