#pragma once

#include "connected_save.hpp"
#include "timegraph/forecast.hpp"
#include "ui/connected_model.hpp"
#include "ui/forecast_chart.hpp"
#include "ui/life_map.hpp"
#include "ui/settlement_model.hpp"

#include <chrono>
#include <filesystem>

namespace waffle::connected {

struct Launch {
    std::uint32_t seed = 42;
    std::filesystem::path save;
    Second horizon = 32000;
    bool nativeSave{};
    bool longBenchmark{};
};

class Session {
public:
    void open(const Launch& launch);
    void close();
    void suspend();
    void resume();
    bool save(const SaveSlots& slots, Slot slot) const;
    void update();
    void updatePreview();
    bool choose(const Choice& choice);
    bool submit(const LifeCommand& command);
    ShopDraft shopDraft() const;
    std::string checkout(const ShopDraft&, const LifeCommand& command);
    LifeReading lifeMap(bool detail) const;
    SettlementReading settlement(const Region& region, SettlementTab tab,
        std::optional<std::size_t> slot) const;
    bool reorder(std::string_view region, std::size_t from, std::size_t to);
    bool scrub(Second second);
    void live();

    const Snapshot* displayed() const { return preview_ ? &*preview_ : liveSnapshot(); }
    const Snapshot* liveSnapshot() const { return run_ ? &run_->snapshot : nullptr; }
    const std::vector<RegionShape>& shapes() const { return run_->geography->shapes; }
    std::shared_ptr<const MapGeography> mapGeography() const { return run_ ? run_->geography : nullptr; }
    const Chart& chart() const { return chart_; }
    const Chart& previousChart() const { return previousChart_; }
    std::optional<Second> divergence() const;
    std::optional<Second> browseThrough() const;
    void clearComparison();
    bool previousPreview() const { return requested_ && requestedGeneration_ != generation(); }
    std::size_t readPlot(timegraph::GenerationId generation, std::size_t scope, Second first,
                         std::span<SeriesValues> values);
    std::array<Second, 4> calendarSteps() const;
    std::optional<Second> requested() const { return requested_; }
    bool opening() const { return opening_; }
    bool busy() const { return job_.valid(); }
    bool previewing() const { return requested_.has_value(); }
    bool previewReady() const { return preview_ && preview_->second == requested_ && previewGeneration_ == requestedGeneration_; }
    const std::string& error() const { return error_; }
    timegraph::GenerationId generation() const { return run_ ? run_->generation : 0; }
    auto coverage() const { return forecast_.coverage(generation()); }
    auto storage() const { return forecast_.storage(); }
    std::uint64_t viewRevision() const { return viewRevision_; }
    double summaryMs() const { return summaryMs_; }
    std::vector<double> benchmarkReconstruction(std::span<const Second> targets);
    // Test-only reads. The preview digest is from the same state that fed the view.
    std::uint64_t displayedDigest() const;
    std::uint64_t replayDigest(Second second) const;
    sim::RuntimeState replayStateForTest(Second second) const;
    std::size_t actionCount() const { return run_->journal.entries().size(); }
    core::json::Value journalForTest() const { return run_->journal.to_json(); }
    bool suspended() const { return suspended_; }

private:
    struct Run {
        std::shared_ptr<const sim::RuntimeState> base, live;
        std::shared_ptr<const MapGeography> geography;
        sim::ActionJournal journal;
        timegraph::GenerationId generation{};
        Snapshot snapshot;
        Second horizon{};
        std::optional<Second> divergence;
    };

    void transact(std::vector<sim::Action> actions, bool resolve = false);
    void readChart(const timegraph::Coverage& coverage);

    timegraph::Forecast forecast_;
    std::future<std::shared_ptr<const Run>> job_;
    std::shared_ptr<const Run> run_;
    std::future<timegraph::Restore> restore_;
    timegraph::GenerationId requestedGeneration_{}, previewGeneration_{};
    std::optional<Second> requested_;
    std::optional<sim::RuntimeState> previewState_;
    std::optional<Snapshot> preview_;
    Chart chart_, previousChart_;
    std::array<timegraph::SummaryHeader, 64> headers_;
    std::vector<timegraph::SiteSummary> sites_;
    std::string error_;
    std::uint64_t viewRevision_{};
    double summaryMs_{};
    bool opening_{true};
    bool suspended_{};
};

}
