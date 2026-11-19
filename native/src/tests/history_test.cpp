#include "core/sha256.hpp"
#include "sim/state/runtime_state.hpp"
#include "sim/step/advance_second.hpp"
#include "sim/step/stages.hpp"
#include "tools/json_file.hpp"
#include "tools/reference_topology.hpp"

#include <charconv>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <latch>
#include <new>
#include <thread>

namespace {

struct AllocationCalls {
    unsigned news{};
    unsigned deletes{};
};

thread_local AllocationCalls* countedCalls{};

void* allocate(std::size_t bytes)
{
    if (countedCalls) ++countedCalls->news;
    if (auto* pointer = std::malloc(std::max(bytes, std::size_t{1}))) return pointer;
    throw std::bad_alloc();
}

void* allocate_aligned(std::size_t bytes, std::size_t alignment)
{
    if (countedCalls) ++countedCalls->news;
    bytes = std::max(bytes, std::size_t{1});
#ifdef _WIN32
    if (auto* pointer = _aligned_malloc(bytes, alignment)) return pointer;
#else
    void* pointer{};
    if (posix_memalign(&pointer, alignment, bytes) == 0) return pointer;
#endif
    throw std::bad_alloc();
}

void release(void* pointer) noexcept
{
    if (pointer && countedCalls) ++countedCalls->deletes;
    std::free(pointer);
}

void release_aligned(void* pointer) noexcept
{
    if (pointer && countedCalls) ++countedCalls->deletes;
#ifdef _WIN32
    _aligned_free(pointer);
#else
    std::free(pointer);
#endif
}

}

void* operator new(std::size_t size) { return allocate(size); }
void* operator new[](std::size_t size) { return allocate(size); }
void operator delete(void* pointer) noexcept { release(pointer); }
void operator delete[](void* pointer) noexcept { release(pointer); }
void operator delete(void* pointer, std::size_t) noexcept { release(pointer); }
void operator delete[](void* pointer, std::size_t) noexcept { release(pointer); }
void* operator new(std::size_t size, std::align_val_t alignment)
{
    return allocate_aligned(size, static_cast<std::size_t>(alignment));
}
void* operator new[](std::size_t size, std::align_val_t alignment)
{
    return allocate_aligned(size, static_cast<std::size_t>(alignment));
}
void operator delete(void* pointer, std::align_val_t) noexcept { release_aligned(pointer); }
void operator delete[](void* pointer, std::align_val_t) noexcept { release_aligned(pointer); }
void operator delete(void* pointer, std::size_t, std::align_val_t) noexcept { release_aligned(pointer); }
void operator delete[](void* pointer, std::size_t, std::align_val_t) noexcept { release_aligned(pointer); }

namespace {

namespace sim = waffle::sim;
namespace browser = sim::browser;
namespace json = waffle::core::json;
using namespace waffle::sim::runtime;
using Trace = History<PracticeEventTrace, 100, PracticeEventJournal_trace>;
using Log = History<LegacyFeedEntry, 0, GameState_gameEventFeed>;

void expect(bool ok, const char* message)
{
    if (!ok) throw std::runtime_error(message);
}

void append_trace(Trace& history, int sequence)
{
    history.append([&](HistoryPayload& payload) {
        const auto providers = payload.table<StockProvider>().append(1, "providers");
        const auto traits = payload.table<TraitId>().append(2, "traits");
        payload.view(traits)[0] = TraitId{1};
        payload.view(traits)[1] = TraitId{2};
        payload.view(providers).front().traits = traits;
        std::array<char, 32> text;
        const auto formatted = std::to_chars(text.data(), text.data() + text.size(), sequence);
        PracticeEventTrace row;
        row.rootId = sequence;
        row.providers = providers;
        row.reason = payload.intern_text({text.data(), formatted.ptr}, "reason");
        return row;
    });
}

void clear_and_reuse()
{
    Trace live;
    append_trace(live, 10);
    const auto anchor = live;
    live.clear();
    expect(live.size() == 0 && anchor.size() == 1 && anchor.at(0).rootId == 10,
           "clearing history must preserve published rows");
    append_trace(live, 20);
    live.clear();
    append_trace(live, 30);
    live.for_each([](const auto& row, const auto& page) {
        expect(row.rootId == 30 && page.text.at(row.reason->value) == "30",
               "reused history page must publish its new row and text");
    });
    expect(live.size() == 1, "reused history must publish only new rows");
}

void copy_isolation()
{
    Trace left;
    for (int i = 0; i < 19; ++i) append_trace(left, i);
    const auto* sealedRow = &left.at(0);
    const auto* tailRow = &left.at(18);
    append_trace(left, 19);
    expect(&left.at(18) == tailRow, "private append should reuse the tail in place");

    const auto anchor = left;
    auto right = anchor;
    for (int i = 20; i < 141; ++i) {
        append_trace(left, i);
        append_trace(right, -i);
        if (i == 20) {
            expect(&left.at(0) == sealedRow && &right.at(0) == sealedRow, "sealed page should stay shared");
            expect(&left.at(18) != tailRow && &right.at(18) != tailRow, "branches must detach a shared tail");
        }
        expect(anchor.size() == 20 && anchor.at(19).rootId == 19, "anchor changed after a branch append");
    }
    int expected = 41;
    left.for_each([&](const auto& row, const HistoryPayload& payload) {
        expect(row.rootId == expected && row.reason && payload.text.at(row.reason->value) == std::to_string(expected),
               "left branch row or payload differs");
        ++expected;
    });
    expect(expected == 141 && left.size() == 100 && right.size() == 100, "retained sizes differ");
    for (int i = 0; i < 100; ++i)
        expect(right.at(i).rootId == -(41 + i), "right branch retained order differs");

    auto oversized = Trace::load(720, [](HistoryPayload&, std::size_t index) {
        PracticeEventTrace row;
        row.rootId = static_cast<double>(index);
        return row;
    });
    const auto original = oversized;
    append_trace(oversized, 720);
    expect(oversized.size() == 100 && oversized.at(0).rootId == 621 && oversized.at(99).rootId == 720 &&
           original.size() == 720 && original.at(0).rootId == 0 && original.at(719).rootId == 719,
           "oversized import must preserve the capture and trim only when appended to");
}

void failed_append()
{
    Trace trace;
    append_trace(trace, 1);
    try {
        trace.append([](HistoryPayload& payload) -> PracticeEventTrace {
            payload.table<StockProvider>().append(2, "providers");
            payload.intern_text("aborted", "reason");
            throw 1;
        });
    } catch (int) {
        expect(trace.size() == 1, "failed builder published a row");
        trace.for_each([](const auto& row, const HistoryPayload& payload) {
            expect(payload.rows<StockProvider>().size() == 1 && payload.text.offsets.size() == 1 &&
                   row.reason && payload.text.at(row.reason->value) == "1", "failed builder left partial payload data");
        });
        append_trace(trace, 2);
        expect(trace.size() == 2 && trace.at(1).rootId == 2, "append failed after rollback");
        return;
    }
    throw std::runtime_error("builder exception did not propagate");
}

void cross_thread_snapshot()
{
    Trace trace;
    for (int i = 0; i < 100; ++i) append_trace(trace, i);
    std::latch ready{1};
    std::latch writing{1};
    bool valid = true;
    std::jthread reader([snapshot = trace, &ready, &writing, &valid]() mutable {
        ready.count_down();
        writing.wait();
        for (int i = 0; i < 4000; ++i)
            valid &= snapshot.size() == 100 && snapshot.at(i % 100).rootId == i % 100;
        snapshot = {};
    });
    ready.wait();
    append_trace(trace, 100);
    writing.count_down();
    for (int i = 101; i < 4000; ++i) append_trace(trace, i);
    reader.join();
    expect(valid && trace.at(99).rootId == 3999, "published cursor changed or reclaim corrupted the writer");
}

constexpr int appendSeconds = 8192;

void append_seconds(Trace& trace, Log& log)
{
    // Keep one outstanding anchor. The ring evicts rows while the feed grows
    // across directory boundaries, including when a directory is shared.
    Trace traceAnchor;
    Log logAnchor;
    for (int second = 1; second <= appendSeconds; ++second) {
        append_trace(trace, second);
        log.push({static_cast<double>(second)});
        if (second % 64 == 0) {
            traceAnchor = trace;
            logAnchor = log;
        }
    }
}

void allocation_control()
{
    struct CountScope {
        explicit CountScope(AllocationCalls& calls) { countedCalls = &calls; }
        ~CountScope() { countedCalls = nullptr; }
    };

    AllocationCalls control;
    {
        CountScope count(control);
        auto* pointer = ::operator new(13);
        ::operator delete(pointer);
        auto* aligned = ::operator new[](64, std::align_val_t{64});
        ::operator delete[](aligned, std::align_val_t{64});
    }
    expect(control.news == 2 && control.deletes == 2, "global new/delete hooks are inactive");

    Trace trace;
    Log log;
    append_trace(trace, 0);
    log.push({0});
    const auto traceStart = trace;
    const auto logStart = log;
    append_seconds(trace, log);
    trace = traceStart;
    log = logStart;

    AllocationCalls steady;
    {
        CountScope count(steady);
        append_seconds(trace, log);
    }
    std::cout << "Steady state: " << appendSeconds << " seconds, " << steady.news
              << " global new, " << steady.deletes << " global delete calls\n";
    expect(steady.news == 0 && steady.deletes == 0, "warmed appends reached the global allocator");
    expect(trace.size() == 100 && trace.at(99).rootId == appendSeconds && log.size() == appendSeconds + 1,
           "allocation workload did not publish all records");
    int index = 0;
    log.for_each([&](const auto& row, const auto&) {
        expect(row.id == index++, "growing history directory lost record order");
    });
}

void restore_from_anchor(const char* fixture)
{
    auto live = sim::import_runtime(browser::import_game_state(json::parse(waffle::tools::read_file(fixture))));
    const auto kind = live.intern<EventKindId>("history-anchor-test", "$.test");
    const auto traceRef = live.hot.civilization.practiceEvents.trace.row;
    const auto hash = [](const auto& state) {
        return json::sha256_value(browser::export_game_state(sim::export_runtime(state)));
    };
    const auto advance = [&](sim::RuntimeState& state, int seconds) {
        auto& trace = state.histories.at(traceRef);
        for (int i = 0; i < seconds; ++i) {
            expect(sim::advance_one_second(state), "fixture should advance");
            trace.append([&](HistoryPayload& payload) {
                PracticeEventTrace row;
                row.kind = kind;
                row.tSec = state.hot.tSec;
                row.rootId = state.hot.tSec;
                row.reason = payload.intern_text("anchor-replay", "reason");
                return row;
            });
        }
    };

    advance(live, 37);
    const auto anchor = live;
    const auto anchorHash = hash(anchor);
    advance(live, 95);
    auto restored = anchor;
    advance(restored, 57);
    advance(live, 36);
    advance(restored, 74);
    expect(hash(anchor) == anchorHash && hash(restored) == hash(live),
           "restored continuation must match uninterrupted advance and leave the anchor intact");
}

void benchmark()
{
    using Clock = std::chrono::steady_clock;
    constexpr int appends = 100'000;
    Trace ring;
    for (int i = 0; i < 1000; ++i) append_trace(ring, i);
    std::array<double, 7> samples;
    for (auto& sample : samples) {
        const auto start = Clock::now();
        for (int i = 1000; i < 1000 + appends; ++i) append_trace(ring, i);
        sample = std::chrono::duration<double, std::nano>(Clock::now() - start).count() / appends;
    }
    if (ring.at(99).rootId != 1000 + appends - 1) throw std::logic_error("unexpected benchmark tail");
    std::ranges::sort(samples);
    std::cout << "Trace append ns, median [min, max] of 7 x " << appends << ": "
              << samples[samples.size() / 2] << " [" << samples.front() << ", " << samples.back() << "]\n";
}

struct PipelineAllocations {
    AllocationCalls calls;
    unsigned start{};
    std::array<unsigned, static_cast<std::size_t>(sim::Stage::final_flush) + 1> byStage{};

    static void observe(void* context, sim::Stage stage, bool entering)
    {
        auto& counts = *static_cast<PipelineAllocations*>(context);
        if (entering) counts.start = counts.calls.news;
        else counts.byStage[static_cast<std::size_t>(stage)] += counts.calls.news - counts.start;
    }
};

bool pipeline_allocations(const char* fixture, const char* topologies, double start)
{
    const auto input = json::parse(waffle::tools::read_file(fixture));
    const auto mirror = browser::import_game_state(input);
    const auto topology = waffle::tools::read_reference_topology(topologies, mirror.world.definitionId);
    auto state = sim::admit_runtime(mirror, &topology, input.find("gameConfig"));
    expect(state.hot.tSec == start, "unexpected allocation fixture second");

    constexpr int warmup = 512;
    constexpr int seconds = 3200;
    for (int i = 0; i < warmup; ++i)
        expect(sim::advance_one_second(state), "allocation fixture stopped during warmup");

    PipelineAllocations counts;
    struct Scope {
        explicit Scope(AllocationCalls& calls) { countedCalls = &calls; }
        ~Scope() { countedCalls = nullptr; }
    };
    {
        Scope counting(counts.calls);
        for (int i = 0; i < seconds; ++i)
            expect(sim::advance_one_second(state, PipelineAllocations::observe, &counts),
                   "allocation fixture stopped during measurement");
    }
    expect(state.hot.tSec == start + warmup + seconds, "allocation workload skipped seconds");
    std::cout << fixture << " allocated " << counts.calls.news << " times in " << seconds
              << " sim-seconds after " << warmup << " warmup seconds\n";
    for (std::size_t i = 0; i < counts.byStage.size(); ++i)
        if (counts.byStage[i])
            std::cout << "  " << sim::stage_name(static_cast<sim::Stage>(i)) << ' ' << counts.byStage[i] << '\n';
    return counts.calls.news == 0;
}

}

int main(int argc, char** argv)
{
    try {
        if (argc == 2 && std::string_view(argv[1]) == "--bench") {
            benchmark();
        } else if (argc == 5 && std::string_view(argv[1]) == "--pipeline-allocations") {
            const bool opening = pipeline_allocations(argv[2], argv[4], 0);
            const bool late = pipeline_allocations(argv[3], argv[4], 3200);
            return opening && late ? 0 : 1;
        } else {
            expect(argc == 2, "usage: waffle_history_test <fixture> | --bench");
            copy_isolation();
            clear_and_reuse();
            failed_append();
            cross_thread_snapshot();
            allocation_control();
            restore_from_anchor(argv[1]);
        }
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
