#pragma once

#include "timegraph/forecast.hpp"

namespace waffle::connected {

using timegraph::Second;

enum class Series { population, food, currency, faith, happiness, prestige, regions, chaos, monsters, count };
using SeriesValues = std::array<float, static_cast<std::size_t>(Series::count)>;
inline constexpr std::size_t civilizationScope = 0; // Region ordinal + 1 for a settlement.
SeriesValues plotValues(const timegraph::SummaryHeader& header, const timegraph::SiteSummary* site = nullptr);

struct Band {
    float first{}, last{}, low{}, high{};
    void append(float value);
    void append(Band tail);
};

struct Column {
    Second first{}, last{};
    Band band;
};

enum EventKind : unsigned {
    deaths = 1, collapse = 2, migration = 4, raid = 8, territory = 16,
    outcome = 32, succession = 64, vassalEnd = 128, runEnd = 256,
};

struct ChronicleEvent {
    Second second{};
    unsigned kinds{};
    timegraph::ChronicleSummary figures;
    std::optional<sim::browser::RunEndReason> terminal;
    int regionDelta{};
};

std::string eventText(const ChronicleEvent& event);
const char* terminalText(sim::browser::RunEndReason reason);

// A running, interleaved min/max pyramid. Each full 16-second block is
// folded once. A wide viewport samples one level, in screen-sized work.
class Chart {
public:
    static constexpr Second blockSeconds = 16;
    static constexpr Second exactSeconds = 512;
    static constexpr std::size_t maxColumns = 224;

    void begin(const timegraph::Coverage& info);
    void append(const timegraph::SummaryHeader& header, std::span<const timegraph::SiteSummary> sites);
    void columns(Series series, std::size_t scope, Second first, Second last, std::size_t limit,
                 std::vector<Column>& out) const;
    std::size_t bytes() const;

    timegraph::GenerationId generation{};
    Second start{}, end{};
    std::optional<Second> through;
    std::optional<sim::browser::RunEndReason> terminal;
    std::vector<ChronicleEvent> events;
    std::vector<std::size_t> landmarks;

private:
    static constexpr std::size_t localCols = static_cast<std::size_t>(Series::happiness) + 1;
    static constexpr std::size_t civCols = std::tuple_size_v<SeriesValues>;
    std::size_t stride_{};
    std::vector<std::vector<Band>> levels_;
    timegraph::SummaryHeader previous_{};
};

struct TimeWindow {
    Second first{}, last{};
    friend bool operator==(const TimeWindow&, const TimeWindow&) = default;
    Second span() const { return last > first ? last - first : 1; }
    Second at(double fraction) const;
    double fraction(Second second) const;
    TimeWindow centered(Second second, Second width) const;
    TimeWindow zoom(Second anchor, double factor) const;
};

}
