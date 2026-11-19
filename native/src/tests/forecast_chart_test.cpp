#include "ui/forecast_chart.hpp"

#include <algorithm>
#include <iostream>

namespace {

using namespace waffle::connected;
using namespace waffle::timegraph;

void expect(bool ok, const char* message)
{
    if (!ok) throw std::runtime_error(message);
}

void envelopes()
{
    Chart chart;
    chart.begin({.generation = 1, .start = 64, .target = 32064, .regions = 2});
    SummaryHeader header;
    std::array<SiteSummary, 2> sites;
    sites[0].population = 99;
    sites[1].population = 24;
    sites[1].residency[0] = {{18, 0}, 50, 100};
    sites[1].residency[1] = {{6, 0}, 100, 0};
    const auto values = plotValues(header, &sites[1]);
    expect(values[static_cast<std::size_t>(Series::faith)] == 62.5 &&
        values[static_cast<std::size_t>(Series::happiness)] == 75, "Settlement beliefs are not population weighted");
    std::vector<Column> columns;
    for (Second sec = 64; sec <= chart.end; ++sec) {
        header.second = static_cast<double>(sec);
        header.population = sec == 32063 ? 10000 : 123;
        sites[1].food = sec == 31997 ? 224 : 8;
        chart.append(header, sites);
        if (sec == 321) {
            chart.columns(Series::food, 2, chart.start, chart.end, Chart::maxColumns, columns);
            expect(!columns.empty() && columns.back().last == 321, "Published partial block did not reach the last row");
        }
    }
    chart.columns(Series::food, 2, chart.start, chart.end, Chart::maxColumns, columns);
    expect(columns.size() <= Chart::maxColumns + 1 && columns.back().last == chart.end, "Viewport scaled with the horizon");
    auto max = std::ranges::max_element(columns, {}, [](const auto& col) { return col.band.high; });
    expect(max != columns.end() && max->band.high == 224 && max->first <= 31997 && max->last >= 31997,
        "Decimation lost a single-second spike");
    chart.columns(Series::food, 1, 31900, chart.end, 40, columns);
    expect(!columns.empty() && columns.back().band.high == 0, "Settlement scopes share values");
    chart.columns(Series::population, 0, 31900, chart.end, 40, columns);
    max = std::ranges::max_element(columns, {}, [](const auto& col) { return col.band.high; });
    expect(max != columns.end() && max->band.high == 10000 && columns.back().band.last == 123,
        "Civilization tail lost its extrema or final point");
}

void chronicle()
{
    Chart chart;
    chart.begin({.generation = 2, .start = 100, .target = 500, .regions = 0});
    SummaryHeader row;
    row.second = 100;
    row.population = 118;
    row.chronicle.controlledRegions = 3;
    row.currentVassalResolutionSecond = 102;
    chart.append(row, {});
    row.second = 101;
    row.population = 85;
    row.chronicle.deaths = 5;
    row.chronicle.migrations = 2;
    chart.append(row, {});
    row.second = 102;
    row.currentVassalResolutionSecond = -1;
    row.currentVassal.value = 1;
    row.chronicle.controlSignature = 8;
    row.chronicle.controlledRegions = 2;
    row.chronicle.deaths = row.chronicle.migrations = 0;
    row.chronicle.raids = 1;
    chart.append(row, {});
    row.second = 103;
    row.terminal = waffle::sim::browser::RunEndReason::territorialLoss;
    row.chronicle.raids = 0;
    chart.append(row, {});
    expect(chart.through == 103 && chart.events.size() == 3 && chart.landmarks.size() == 3,
        "Chronicle did not keep ordered, notable event seconds");
    expect(chart.events[0].kinds == (deaths | collapse | migration) &&
        chart.events[1].kinds == (territory | outcome | succession | raid) && chart.events[1].regionDelta == -1,
        "Events at a shared second did not merge");
    expect(chart.events[2].terminal == row.terminal && eventText(chart.events[2]) == "All territory lost",
        "Run end event lost its specific reason");
    const TimeWindow bounds{64, 32064};
    const auto view = bounds.zoom(12064, .5);
    expect(view.span() == 16000 && view.fraction(12064) == bounds.fraction(12064),
        "Zoom did not keep time under the pointer");
    const auto ending = bounds.centered(32064, 400);
    expect(ending.first == 31664 && ending.at(.5) == 31864 && ending.last == 32064,
        "Overview pan did not stop at the horizon");
}

}

int main(int argc, char** argv)
{
    try {
        if (argc != 2) throw std::invalid_argument("Usage: forecast_chart_test <envelopes|chronicle>");
        const std::string_view mode = argv[1];
        if (mode == "envelopes") envelopes();
        else if (mode == "chronicle") chronicle();
        else throw std::invalid_argument("Unknown forecast chart test");
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
