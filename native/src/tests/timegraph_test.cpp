#include "timegraph/forecast.hpp"
#include "tools/replay_checks.hpp"
#include "tools/timegraph_tool.hpp"

#include <array>
#include <iostream>
#include <thread>

namespace {

namespace graph = waffle::timegraph;
namespace sim = waffle::sim;
namespace tools = waffle::tools;
using waffle::core::json::Value;

void expect(bool ok, std::string_view error)
{
    if (!ok) throw std::runtime_error(std::string(error));
}

sim::RuntimeState load(const char* filename, bool longevity)
{
    auto input = waffle::core::json::parse(tools::read_file(filename));
    if (longevity) {
        auto config = *input.find("gameConfig");
        auto settings = *config.find("settings");
        auto values = *settings.find("values");
        values.set("phaseDurationSec", Value(64.0));
        values.set("monsterExpansionThreshold", Value(1000000000.0));
        settings.set("values", std::move(values));
        config.set("settings", std::move(settings));
        input.set("gameConfig", std::move(config));
    }
    return sim::admit_runtime(sim::browser::import_game_state(input), nullptr, input.find("gameConfig"));
}

std::vector<std::uint64_t> direct_hashes(sim::RuntimeState state, std::size_t end)
{
    std::vector<std::uint64_t> hashes;
    const sim::ActionJournal actions;
    sim::initialize_replay_clock(state);
    sim::ReplayCursor replay(actions, state.hot.tSec, false);
    for (std::size_t i = 0; i <= end; ++i) {
        if (i) tools::require_replay(replay.advance(state));
        hashes.push_back(sim::state_digest(state));
    }
    return hashes;
}

graph::Coverage covered(graph::Forecast& forecast, graph::GenerationId id, graph::Second second)
{
    const auto coverage = forecast.wait(id, second);
    expect(coverage && coverage->publishedThrough && *coverage->publishedThrough >= second, "coverage missing");
    return *coverage;
}

sim::RuntimeState restore(graph::Forecast& forecast, graph::GenerationId id, graph::Second second)
{
    auto result = forecast.stateAtSecond(id, second).get();
    expect(result.status == graph::RestoreStatus::ready && result.generation == id &&
           result.second == second && result.state && result.state->hot.tSec == second,
           "restore metadata or state mismatched");
    return std::move(*result.state);
}

void restore_and_replace(const char* path)
{
    const auto initial = load(path, true);
    const auto hashes = direct_hashes(initial, 384);
    graph::Forecast forecast;
    const auto old = forecast.start(initial, {}, 32000);
    covered(forecast, old, 384);
    std::size_t loaded = 0;
    std::uint32_t sample = 4221;
    for (int i = 0; i < 64; ++i) {
        const auto wasRunning = forecast.coverage(old)->completion == graph::Completion::running;
        sample = sample * 1664525u + 1013904223u;
        const auto second = sample % hashes.size();
        auto restored = restore(forecast, old, second);
        const auto digest = sim::state_digest(restored);
        expect(digest == hashes[second], "random restore differed from continuous replay");
        loaded += wasRunning && forecast.coverage(old)->completion == graph::Completion::running;
    }
    expect(loaded > 0, "no restores actually overlapped forecasting");

    auto isolated = restore(forecast, old, 63);
    isolated.hot.actionPoints += 90;
    expect(sim::state_digest(restore(forecast, old, 63)) == hashes[63], "restore mutated cached state");

    const auto next = forecast.start(initial, {}, 385, graph::BoundaryActions::applied, 217);
    expect(next > old && forecast.coverage(old)->completion == graph::Completion::retained &&
           *forecast.coverage(old)->publishedThrough == 217, "retained prefix differs");
    expect(forecast.stateAtSecond(old, 218).get().status == graph::RestoreStatus::unavailable, "unrevealed old second restored");
    expect(sim::state_digest(restore(forecast, old, 217)) == hashes[217], "retained replay differed");
    covered(forecast, next, 385);
    std::array<graph::SummaryHeader, 3> headers;
    std::vector<graph::SiteSummary> sites(3 * initial.hot.world.regions.size());
    expect(forecast.readSummaries(old, 63, headers, sites) == 3 &&
           headers[0].second == 63 && headers[1].second == 64 && headers[2].second == 65,
           "summary read across a page boundary failed");
    const auto saved = tools::summary_digest(headers[0], std::span(sites).first(initial.hot.world.regions.size()));
    headers[0].population += 90;
    sites[0].food += 90;
    expect(forecast.readSummaries(old, 63, headers, sites) == 3 &&
           tools::summary_digest(headers[0], std::span(sites).first(initial.hot.world.regions.size())) == saved,
           "reader mutated cached summary");
    expect(forecast.readSummaries(old, 217, headers, sites) == 1, "read crossed previous reveal cutoff");
    forecast.releasePrevious();
    expect(!forecast.coverage(old), "released generation still accessible");

    const auto cancellable = forecast.start(initial, {}, 32000);
    covered(forecast, cancellable, 64);
    std::promise<std::future<graph::Restore>> submitted;
    auto queued = submitted.get_future();
    std::thread reader([&] { submitted.set_value(forecast.stateAtSecond(cancellable, 63)); });
    auto reply = queued.get();
    forecast.cancel(cancellable);
    reader.join();
    expect(reply.get().status != graph::RestoreStatus::failed, "cancel left a broken restore");
    expect(!forecast.coverage(cancellable) && forecast.readSummaries(cancellable, 0, headers, sites) == 0 &&
           forecast.stateAtSecond(cancellable, 63).get().status == graph::RestoreStatus::superseded,
           "cancelled generation still accessible");

    auto edited = initial;
    edited.hot.actionPoints += 90;
    const auto editedHash = sim::state_digest(edited);
    const auto latest = forecast.start(std::move(edited), {}, 0, graph::BoundaryActions::applied);
    forecast.cancel(cancellable);
    expect(sim::state_digest(restore(forecast, covered(forecast, latest, 0).generation, 0)) == editedHash,
           "stale cancel or publication changed the successor");
    graph::Forecast fresh;
    covered(fresh, fresh.start(initial, {}, 0), 0);
    expect(forecast.storage().chargedBytes() == fresh.storage().chargedBytes(), "obsolete forecast leaked charged storage");

    const auto actions = sim::ActionJournal::from_json(waffle::core::json::parse(
        R"([{"tSec":0,"kind":"settlementRerollVassals","payload":{}}])"));
    auto boundary = sim::rebuildStateAtSecond(initial, actions, 0);
    expect(boundary.result && boundary.state, "boundary action fixture failed");
    const auto expected = sim::state_digest(*boundary.state);
    const auto applied = forecast.start(std::move(*boundary.state), actions, 0, graph::BoundaryActions::applied);
    covered(forecast, applied, 0);
    expect(sim::state_digest(restore(forecast, applied, 0)) == expected, "applied action ran a second time");
    std::cout << "Checked " << loaded << " random restores under forecast load, isolation, cancellation and generation replacement\n";
}

void pressure(const char* path)
{
    const auto initial = load(path, true);
    constexpr std::size_t cap = 4 * 1024 * 1024;
    graph::Forecast forecast(cap);
    const auto previous = forecast.start(initial, {}, 320);
    const auto complete = forecast.wait(previous);
    expect(complete && complete->completion == graph::Completion::horizon, "small initial horizon should fit");
    const auto successor = forecast.start(initial, {}, 32000, graph::BoundaryActions::pending, 129);
    const auto limited = forecast.wait(successor);
    expect(limited && limited->completion == graph::Completion::storageLimit && limited->publishedThrough &&
           *limited->publishedThrough > 128 && *limited->publishedThrough < 32000 &&
           (*limited->publishedThrough + 1) % sim::replay_anchor_stride == 0 &&
           limited->anchors == (*limited->publishedThrough + 1) / sim::replay_anchor_stride,
           "storage pressure changed row/anchor spacing or failed to shorten the horizon");
    expect(forecast.storage().chargedBytes() <= cap, "combined generations exceeded cap");
    expect(forecast.coverage(previous)->publishedThrough == 129, "pressure trimmed revealed previous coverage");
    const auto last = *limited->publishedThrough;
    for (auto second : {std::uint64_t{129}, last}) {
        auto id = second == last ? successor : previous;
        const auto expected = sim::rebuildStateAtSecond(initial, {}, static_cast<double>(second));
        expect(expected.result && sim::state_digest(restore(forecast, id, second)) == sim::state_digest(*expected.state),
               "restore diverged under pressure");
    }
    std::cout << "Budget capped the new generation at " << last << " and preserved both scrub ranges\n";
}

void terminal(const char* path)
{
    namespace browser = sim::browser;
    auto state = load(path, false);
    graph::Forecast forecast;
    const auto verify = [&](sim::RuntimeState initial, graph::Second terminalSecond, browser::RunEndReason reason) {
        const auto id = forecast.start(std::move(initial), {}, 32000);
        const auto end = forecast.wait(id);
        expect(end && end->publishedThrough == terminalSecond && end->completion == graph::Completion::terminal,
               "terminal run published the wrong horizon");
        graph::SummaryHeader header;
        std::vector<graph::SiteSummary> sites(end->regions);
        expect(forecast.readSummaries(id, terminalSecond, std::span(&header, 1), sites) == 1 &&
               header.terminal == reason && header.lossSecond == terminalSecond,
               "terminal row or reason missing");
        auto restored = restore(forecast, id, terminalSecond);
        expect(restored.hot.runStatus && restored.hot.runStatus->reason == reason &&
               forecast.stateAtSecond(id, terminalSecond + 1).get().status == graph::RestoreStatus::unavailable,
               "restore crossed terminal second");
    };
    verify(state, 4890, browser::RunEndReason::monsterOverrun);

    auto input = waffle::core::json::parse(tools::read_file(path));
    auto config = *input.find("gameConfig");
    auto settings = *config.find("settings");
    auto values = *settings.find("values");
    values.set("monsterExpansionThreshold", Value(1000000000.0));
    settings.set("values", std::move(values));
    config.set("settings", std::move(settings));
    input.set("gameConfig", std::move(config));
    verify(sim::admit_runtime(browser::import_game_state(input), nullptr, input.find("gameConfig")),
           6516, browser::RunEndReason::territorialLoss);
    std::cout << "Verified Monster Overrun and territorial loss horizons\n";
}

}

int main(int argc, char** argv)
{
    try {
        if (argc != 3) throw std::invalid_argument("usage: waffle_timegraph_test <restore|pressure|terminal> <initial.json>");
        const std::string_view test = argv[1];
        if (test == "restore") restore_and_replace(argv[2]);
        else if (test == "pressure") pressure(argv[2]);
        else if (test == "terminal") terminal(argv[2]);
        else throw std::invalid_argument("unrecognized timegraph test");
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
