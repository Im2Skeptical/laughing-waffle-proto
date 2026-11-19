#pragma once

#include "sim/step/replay.hpp"
#include "timegraph/summary.hpp"

#include <future>

namespace waffle::timegraph {

using Second = std::uint64_t;
using GenerationId = std::uint64_t;
inline constexpr std::size_t forecastStorageCap = 256 * 1024 * 1024;

enum class BoundaryActions { pending, applied };
enum class Completion { running, horizon, terminal, storageLimit, retained, failed };

struct Coverage {
    GenerationId generation{};
    Second start{}, target{};
    std::optional<Second> publishedThrough;
    std::size_t regions{}, anchors{};
    Completion completion{Completion::running};
    std::string error;
};

enum class RestoreStatus { ready, unavailable, superseded, failed };
struct Restore {
    GenerationId generation{};
    Second second{};
    RestoreStatus status{};
    std::optional<sim::RuntimeState> state;
    std::string error;
};

struct Storage {
    std::size_t summaries{}, anchors{}, journals{};
    std::size_t historyRetained{}, historyLive{}, historyRecycled{};
    std::size_t forecastWorking{}, restoreWorking{};
    std::size_t chargedBytes() const
    {
        return summaries + anchors + journals + historyRetained + forecastWorking + restoreWorking;
    }
};

class Forecast {
public:
    // A lower limit is useful for smaller devices and pressure tests.
    explicit Forecast(std::size_t storageBytes = forecastStorageCap);
    ~Forecast();
    Forecast(const Forecast&) = delete;
    Forecast& operator=(const Forecast&) = delete;

    GenerationId start(sim::RuntimeState initial, sim::ActionJournal actions, Second target,
                       BoundaryActions boundary = BoundaryActions::pending,
                       std::optional<Second> retainThrough = {});
    void cancel(GenerationId generation);
    void releasePrevious();

    std::optional<Coverage> coverage(GenerationId generation) const;
    // Wait for completion or an optional published point. Progress
    // notifications are emitted at page boundaries and on completion.
    std::optional<Coverage> wait(GenerationId generation, std::optional<Second> through = {}) const;
    Storage storage() const;
    // Copies up to one page (64 rows) of ready data into the supplied spans.
    // Sites are in dense time-major region order.
    std::size_t readSummaries(GenerationId generation, Second first, std::span<SummaryHeader> headers,
                              std::span<SiteSummary> sites) const;
    // At most one pending target is queued. Every reply carries the generation
    // to let the caller reject a result delivered before a later edit.
    std::future<Restore> stateAtSecond(GenerationId generation, Second second);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}
