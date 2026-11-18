#include "sim/state/rows.generated.hpp"

#include <charconv>
#include <chrono>
#include <iostream>

namespace {

using namespace waffle::sim::runtime;
using Trace = History<PracticeEventTrace, 100, PracticeEventJournal_trace>;

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
    std::cout << "Trace append median ns: " << samples[samples.size() / 2] << '\n';
}

}

int main()
{
    benchmark();
}
