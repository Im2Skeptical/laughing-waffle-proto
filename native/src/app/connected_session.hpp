#pragma once

#include "timegraph/forecast.hpp"
#include "ui/connected_model.hpp"

#include <chrono>
#include <filesystem>

namespace waffle::connected {

struct Launch {
    std::uint32_t seed = 42;
    std::filesystem::path save;
    Second horizon = 32000;
};

struct Band {
    float first{}, last{}, low{}, high{};
    unsigned count{};
};

// The chart retains only a bounded envelope. Coverage advances only when the
// corresponding dense summary rows have been read.
struct Chart {
    static constexpr std::size_t width = 768;
    std::array<Band, width> population{};
    Second start{}, end{};
    std::optional<Second> through;
    float peak = 1;
};

class Session {
public:
    void open(const Launch& launch);
    void update();
    bool choose(const Choice& choice);
    bool reorder(std::string_view region, std::size_t from, std::size_t to);
    bool scrub(Second second);
    void live();

    const Snapshot* displayed() const { return preview_ ? &*preview_ : liveSnapshot(); }
    const Snapshot* liveSnapshot() const { return run_ ? &run_->snapshot : nullptr; }
    const std::vector<RegionShape>& shapes() const { return *run_->shapes; }
    const Chart& chart() const { return chart_; }
    std::optional<Second> requested() const { return requested_; }
    bool opening() const { return opening_; }
    bool busy() const { return job_.valid(); }
    bool previewing() const { return requested_.has_value(); }
    bool previewReady() const { return preview_ && preview_->second == requested_; }
    const std::string& error() const { return error_; }
    auto generation() const { return run_ ? run_->generation : 0; }
    auto coverage() const { return forecast_.coverage(generation()); }
    auto storage() const { return forecast_.storage(); }
    std::uint64_t viewRevision() const { return viewRevision_; }
    double summaryMs() const { return summaryMs_; }
    std::vector<double> benchmarkReconstruction(std::span<const Second> targets);
    // Test-only reads. The preview digest is from the same state that fed the view.
    std::uint64_t displayedDigest() const;
    std::uint64_t replayDigest(Second second) const;
    std::size_t actionCount() const { return run_->journal.entries().size(); }

private:
    struct Run {
        std::shared_ptr<const sim::RuntimeState> base, live;
        std::shared_ptr<const std::vector<RegionShape>> shapes;
        sim::ActionJournal journal;
        timegraph::GenerationId generation{};
        Snapshot snapshot;
        Second horizon{};
    };

    void transact(std::vector<sim::Action> actions, bool resolve = false);
    void readChart(const timegraph::Coverage& coverage);

    timegraph::Forecast forecast_;
    std::future<std::shared_ptr<const Run>> job_;
    std::shared_ptr<const Run> run_;
    std::future<timegraph::Restore> restore_;
    std::optional<Second> requested_;
    std::optional<sim::RuntimeState> previewState_;
    std::optional<Snapshot> preview_;
    Chart chart_;
    std::vector<float> samples_;
    std::array<timegraph::SummaryHeader, 64> headers_;
    std::vector<timegraph::SiteSummary> sites_;
    std::string error_;
    std::uint64_t viewRevision_{};
    double summaryMs_{};
    bool opening_{true};
};

}
