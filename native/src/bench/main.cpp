#include "workload.hpp"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <type_traits>

namespace waffle::bench {
namespace {

using Timer = std::chrono::steady_clock;
using Microseconds = std::chrono::duration<double, std::micro>;
constexpr Id stride = 64;
constexpr Id horizon = 32000;
constexpr Id runs = 7;

template<typename T>
struct Checkpoints {
    Checkpoints(std::size_t slices, std::size_t width) : data(slices * width), width(width) {}

    void save(Id index, const T* source)
    {
        if (width) std::memcpy(data.data() + index * width, source, width * sizeof(T));
    }

    void restore(Id index, T* destination) const
    {
        if (width) std::memcpy(destination, data.data() + index * width, width * sizeof(T));
    }

    std::size_t buffer_bytes() const { return sizeof(T) * data.capacity(); }

    static_assert(std::is_trivially_copyable_v<T>);
    std::vector<T> data;
    std::size_t width;
};

struct Anchors {
    Anchors(Id slices, const State& state)
        : clocks(slices, 1), sites(slices, state.sites.size()), slots(slices, state.slots.size()),
          counts(slices, state.populations.size()) {}

    void save(Id index, const State& state)
    {
        clocks.save(index, &state.clock);
        sites.save(index, state.sites.data());
        slots.save(index, state.slots.data());
        counts.save(index, state.populations.data());
    }

    void restore(Id index, State& state) const
    {
        clocks.restore(index, &state.clock);
        sites.restore(index, state.sites.data());
        slots.restore(index, state.slots.data());
        counts.restore(index, state.populations.data());
    }

    std::size_t buffers_bytes() const
    {
        return clocks.buffer_bytes() + sites.buffer_bytes() + slots.buffer_bytes() + counts.buffer_bytes();
    }

    Checkpoints<ClockState> clocks;
    Checkpoints<SiteState> sites;
    Checkpoints<SlotState> slots;
    Checkpoints<Id> counts;
};

struct Rows {
    Rows(Id seconds, std::size_t width) : headers(seconds), sites(seconds * width), width(width) {}
    std::span<SiteRow> at(Id second) { return std::span(sites).subspan(second * width, width); }
    std::size_t buffers_bytes() const
    {
        return headers.capacity() * sizeof(HeaderRow) + sites.capacity() * sizeof(SiteRow);
    }
    std::vector<HeaderRow> headers;
    std::vector<SiteRow> sites;
    std::size_t width;
};

enum Bucket {
    clock, workers, birth_phase, food_phase, housing_phase, faith_phase, migration_phase,
    death_phase, season_phase, events, summary, snapshot, bucket_count
};
constexpr std::array labels{
    "clock", "workers", "birth", "food", "housing", "faith", "migration",
    "death", "season", "events", "summary", "snapshot_amortized"
};

struct Result {
    std::array<double, bucket_count> phases{};
    double forecast{}, copy{}, restore_copy{}, restore_p50{}, restore_p95{}, restore_max{};
    std::size_t snapshot_bytes{}, summary_bytes{}, peak_buffers{};
    std::uint64_t checksum{}, draws{}, discharges{}, shared_visits{};
};

template<bool Timed>
struct Measure {
    std::array<Timer::duration, bucket_count> elapsed{};

    template<typename F>
    auto operator()(Bucket bucket, F&& work)
    {
        if constexpr (!Timed) {
            return work();
        } else {
            const auto start = Timer::now();
            if constexpr (std::is_void_v<decltype(work())>) {
                work();
                elapsed[bucket] += Timer::now() - start;
            } else {
                auto value = work();
                elapsed[bucket] += Timer::now() - start;
                return value;
            }
        }
    }
};

template<bool Timed>
void step(State& state, const World& world, Scratch& scratch, Measure<Timed>& measure)
{
    const auto season_due = measure(clock, [&] { return advance(state, world); });
    measure(workers, [&] { assign_workers(state, world); });
    if (season_due) measure(season_phase, [&] { run_phase(state, world, scratch, season); });
    const auto phase = due_phase(state, world);
    if (phase != phase_count) measure(static_cast<Bucket>(birth_phase + phase), [&] {
        run_phase(state, world, scratch, phase);
    });
    measure(events, [&] { drain(state, world, scratch); });
}

std::size_t state_bytes(const State& state)
{
    return state.sites.capacity() * sizeof(SiteState) + state.slots.capacity() * sizeof(SlotState) +
        state.populations.capacity() * sizeof(Id);
}

template<bool Timed>
Result run(const Scenario& scenario, Id seconds, bool smoke)
{
    Result result;
    const World& world = scenario.world;
    State state = scenario.initial, preview = state;
    Scratch scratch(world), preview_scratch(world);
    const auto initial_scratch_bytes = scratch.buffers_bytes() + preview_scratch.buffers_bytes();
    const Id slices = 1 + (seconds + stride - 1) / stride;
    Anchors anchors(slices, state);
    Rows rows(seconds + 1, world.sites.size()), preview_rows(1, world.sites.size());
    result.peak_buffers = world.buffers_bytes() + state_bytes(scenario.initial) + state_bytes(state) +
        state_bytes(preview) + initial_scratch_bytes +
        anchors.buffers_bytes() + rows.buffers_bytes() + preview_rows.buffers_bytes();
    result.snapshot_bytes = sizeof(ClockState) + state.sites.size() * sizeof(SiteState) +
        state.slots.size() * sizeof(SlotState) + state.populations.size() * sizeof(Id);
    result.summary_bytes = sizeof(HeaderRow) + world.sites.size() * sizeof(SiteRow);
    Measure<Timed> measure;
    anchors.save(0, state);
    summarize(state, world, rows.headers[0], rows.at(0));
    const auto start = Timer::now();
    for (Id second = 1; second <= seconds; ++second) {
        step(state, world, scratch, measure);
        measure(summary, [&] { summarize(state, world, rows.headers[second], rows.at(second)); });
        if (second % stride == 0 || second == seconds) measure(snapshot, [&] {
            anchors.save((second + stride - 1) / stride, state);
        });
    }
    result.forecast = Microseconds(Timer::now() - start).count() / seconds;
    result.checksum = digest(rows.headers[seconds], rows.at(seconds));
    result.draws = scratch.draws;
    result.discharges = scratch.discharges;
    result.shared_visits = scratch.shared_visits;
    if constexpr (Timed) {
        for (Id i = 0; i < bucket_count; ++i) result.phases[i] = Microseconds(measure.elapsed[i]).count() / seconds;
        result.copy = Microseconds(measure.elapsed[snapshot]).count() / (slices - 1);
    }

    // Cover every anchor offset twice in full runs, spread across the forecast.
    // Smoke walks every second, including the short final anchor.
    std::array<double, 128> restore_us{};
    const Id queries = smoke ? seconds + 1 : static_cast<Id>(restore_us.size());
    Timer::duration copy_total{};
    Measure<false> no_timer;
    for (Id i = 0; i < queries; ++i) {
        const Id target = smoke ? i : ((i * 89) % (seconds / stride)) * stride + ((i * 23) % stride);
        const Id index = target == seconds ? slices - 1 : target / stride;
        const Id anchor_second = target == seconds ? target : index * stride;
        const auto query_start = Timer::now();
        anchors.restore(index, preview);
        const auto copy_end = Timer::now();
        for (Id replay = anchor_second; replay < target; ++replay) step(preview, world, preview_scratch, no_timer);
        summarize(preview, world, preview_rows.headers[0], preview_rows.at(0));
        restore_us[i] = Microseconds(Timer::now() - query_start).count();
        copy_total += copy_end - query_start;
        if (preview_rows.headers[0] != rows.headers[target] || !std::ranges::equal(preview_rows.at(0), rows.at(target)))
            throw std::runtime_error("restore differs at second " + std::to_string(target));
    }
    const auto end = restore_us.begin() + queries;
    std::sort(restore_us.begin(), end);
    result.restore_copy = Microseconds(copy_total).count() / queries;
    result.restore_p50 = restore_us[(queries - 1) / 2];
    result.restore_p95 = restore_us[(queries * 95 + 99) / 100 - 1];
    result.restore_max = *(end - 1);
    if (initial_scratch_bytes != scratch.buffers_bytes() + preview_scratch.buffers_bytes())
        throw std::runtime_error("scratch grew during forecast or restore");
    return result;
}

Scenario read_scenario(const char* path, Id scale)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("cannot open benchmark fixture");
    const std::string text((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    return load(core::json::parse(text), scale);
}

template<typename F>
void print_stat(std::string_view label, const std::vector<Result>& results, F value)
{
    std::vector<double> samples;
    for (const auto& result : results) samples.push_back(value(result));
    std::sort(samples.begin(), samples.end());
    std::cout << label << ' ' << samples[samples.size() / 2] << " [" << samples.front() << ", " << samples.back() << "]\n";
}

void report(const char* fixture, Id scale, bool smoke)
{
    const auto scenario = read_scenario(fixture, scale);
    const Id seconds = smoke ? 80 : horizon;
    const auto& world = scenario.world;
    if (world.sites.empty() || world.slots.empty() || world.bins.empty() || world.roads.empty())
        throw std::runtime_error("fixture does not exercise the benchmark workload");
    std::vector<Result> results;
    for (Id repeat = 0; repeat < (smoke ? 1 : runs); ++repeat) {
        auto measured = run<false>(scenario, seconds, smoke);
        const auto instrumented = run<true>(scenario, seconds, smoke);
        if (measured.checksum != instrumented.checksum || (!results.empty() && measured.checksum != results[0].checksum) ||
            !measured.draws || !measured.discharges || !measured.shared_visits)
            throw std::runtime_error("benchmark changed across repeats or a target path did not execute");
        measured.phases = instrumented.phases;
        measured.copy = instrumented.copy;
        results.push_back(measured);
    }
    const auto& r = results[0];
    std::uint64_t people = 0;
    std::size_t practices = 0;
    for (const auto& site : world.sites) practices += site.slots.size();
    for (const auto n : scenario.initial.populations) people += n;
    std::cout << scale << "x, seconds=" << seconds << ", samples=" << results.size() << ", stride=" << stride
        << ", sites=" << world.sites.size() << ", active=" << std::ranges::count(world.sites, true, &Site::active)
        << ", roads=" << world.roads.size() / 2 << ", practices=" << practices
        << ", structures=" << world.structures.size() << ", bins=" << world.bins.size() << ", people=" << people
        << ", stock_rows=" << world.slots.size() << ", trait_ids=" << world.trait_count << '\n'
        << "snapshot_bytes=" << r.snapshot_bytes << ", summary_bytes_per_second=" << r.summary_bytes
        << ", peak_buffer_bytes=" << r.peak_buffers << ", checksum=" << r.checksum
        << ", draws=" << r.draws << ", discharges=" << r.discharges << ", shared_neighbor_visits=" << r.shared_visits << '\n';
    std::cout << std::fixed << std::setprecision(3);
    for (Id i = 0; i < bucket_count; ++i)
        print_stat(labels[i], results, [i](const Result& row) { return row.phases[i]; });
    print_stat("total_us_per_sim_second", results, [](const Result& row) { return row.forecast; });
    print_stat("us_per_snapshot_write", results, [](const Result& row) { return row.copy; });
    print_stat("us_per_snapshot_read", results, [](const Result& row) { return row.restore_copy; });
    print_stat("us_per_restore_p50", results, [](const Result& row) { return row.restore_p50; });
    print_stat("us_per_restore_p95", results, [](const Result& row) { return row.restore_p95; });
    print_stat("us_per_restore_max", results, [](const Result& row) { return row.restore_max; });
}

}
}

int main(int argc, char** argv)
{
    using namespace waffle::bench;
    const bool smoke = argc > 1 && std::string_view(argv[1]) == "--smoke";
    if (argc != (smoke ? 3 : 2)) {
        std::cerr << "usage: waffle_bench [--smoke] seed-1-initial.json\n";
        return 2;
    }
    try {
        std::cout << "N03p access-pattern skeleton | " WAFFLE_BENCH_COMPILER " | " WAFFLE_BENCH_BUILD
            " | timing median [min, max]\n";
        for (Id scale : {1u, 2u, 4u}) {
            report(argv[smoke ? 2 : 1], scale, smoke);
            if (smoke) break;
        }
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "waffle_bench: " << error.what() << '\n';
        return 1;
    }
}
