#include "ui/forecast_chart.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::connected {

SeriesValues plotValues(const timegraph::SummaryHeader& header, const timegraph::SiteSummary* site)
{
    if (site) {
        const auto& [villagers, strangers] = site->residency;
        const auto weight = [&](double villager, double stranger) {
            return site->population > 0 ? static_cast<float>((villager * villagers.workers.population +
                stranger * strangers.workers.population) / site->population) : 0.f;
        };
        return {static_cast<float>(site->population), static_cast<float>(site->food),
            static_cast<float>(site->currency), weight(villagers.faith, strangers.faith),
            weight(villagers.happiness, strangers.happiness)};
    }
    const auto& stats = header.chronicle;
    return {static_cast<float>(header.population), static_cast<float>(header.food),
        static_cast<float>(header.currency), stats.faith, stats.happiness,
        static_cast<float>(header.prestige), static_cast<float>(stats.controlledRegions),
        static_cast<float>(header.chaosPower), static_cast<float>(header.monsterCount)};
}

void Band::append(float value)
{
    last = value;
    low = std::min(low, value);
    high = std::max(high, value);
}

void Band::append(Band tail)
{
    last = tail.last;
    low = std::min(low, tail.low);
    high = std::max(high, tail.high);
}

void Chart::begin(const timegraph::Coverage& info)
{
    generation = info.generation;
    start = info.start;
    end = info.target;
    stride_ = civCols + info.regions * localCols;
    // Reserve each level up front. Published terminal runs grow only as far
    // as they publish, with no per-frame reallocation of large vectors.
    const auto reserveRows = info.publishedThrough && info.completion != timegraph::Completion::running
        ? *info.publishedThrough - start + 1 : end - start + 1;
    for (auto blocks = (reserveRows + blockSeconds - 1) / blockSeconds; blocks; blocks /= 2) {
        levels_.emplace_back();
        levels_.back().reserve(static_cast<std::size_t>(blocks) * stride_);
    }
}

void Chart::append(const timegraph::SummaryHeader& header, std::span<const timegraph::SiteSummary> sites)
{
    const auto second = static_cast<Second>(header.second);
    const auto offset = second - start;
    const auto index = offset % blockSeconds;
    auto& fine = levels_.front();
    if (!index) fine.resize(fine.size() + stride_);
    auto* dst = fine.data() + fine.size() - stride_;
    const auto put = [&](const SeriesValues& values, std::size_t count) {
        for (std::size_t column = 0; column < count; ++column, ++dst) {
            const auto value = values[column];
            if (index) dst->append(value);
            else *dst = {value, value, value, value};
        }
    };
    put(plotValues(header), civCols);
    for (const auto& site : sites) put(plotValues(header, &site), localCols);

    if (index == blockSeconds - 1) {
        auto complete = (offset + 1) / blockSeconds;
        for (std::size_t i = 1; complete % 2 == 0 && i < levels_.size(); ++i, complete /= 2) {
            const auto& child = levels_[i - 1];
            const auto* pair = child.data() + child.size() - 2 * stride_;
            auto& parent = levels_[i];
            for (std::size_t c = 0; c < stride_; ++c) {
                auto band = pair[c];
                band.append(pair[stride_ + c]);
                parent.push_back(band);
            }
        }
    }

    const auto& stats = header.chronicle;
    unsigned kinds = (stats.deaths ? deaths : 0u) | (stats.migrations ? migration : 0u) |
        (stats.raids ? raid : 0u) | (header.terminal ? runEnd : 0u);
    int delta = 0;
    if (through) {
        delta = static_cast<int>(stats.controlledRegions) - static_cast<int>(previous_.chronicle.controlledRegions);
        const bool changed = stats.controlSignature != previous_.chronicle.controlSignature;
        if (changed) kinds |= territory;
        if (!changed && previous_.population >= 8 && header.population <= previous_.population * .75)
            kinds |= collapse;
        if (previous_.currentVassalResolutionSecond == header.second &&
            header.currentVassalResolutionSecond != header.second) kinds |= outcome;
        if (header.currentVassal && header.currentVassal != previous_.currentVassal) kinds |= succession;
        if (header.latestVassalEndSecond > previous_.latestVassalEndSecond ||
            (!header.currentVassal && previous_.currentVassal)) kinds |= vassalEnd;
    } else if (header.currentVassal && !second) {
        kinds |= succession;
    }
    if (kinds) {
        if (kinds & ~(deaths | migration) || stats.deaths >= 3 || stats.migrations >= 3)
            landmarks.push_back(events.size());
        events.push_back({second, kinds, stats, header.terminal, delta});
    }
    through = second;
    terminal = header.terminal;
    previous_ = header;
}

void Chart::columns(Series series, std::size_t scope, Second first, Second last, std::size_t limit,
                    std::vector<Column>& out) const
{
    out.clear();
    if (!through || last < start || first > *through || !limit) return;
    auto column = static_cast<std::size_t>(series);
    if (scope) {
        if (column >= localCols) return;
        column += civCols + (scope - 1) * localCols;
    }
    if (column >= stride_) return;
    const auto lower = std::max(first, start) - start;
    const auto upper = std::min(last, *through) - start;
    if (lower > upper) return;
    Second step = blockSeconds;
    std::size_t level = 0;
    for (; (last - first) / step >= limit && level + 1 < levels_.size(); ++level) step *= 2;
    for (auto block = lower / step * step; block <= upper; block += step) {
        std::optional<Band> band;
        const auto end = std::min(block + step - 1, upper);
        std::size_t availableLevel = level;
        auto size = step;
        for (auto row = block; row <= end; row += size) {
            while (availableLevel && (row + size - 1 > end ||
                   (row / size) * stride_ + column >= levels_[availableLevel].size())) {
                --availableLevel;
                size /= 2;
            }
            const auto part = levels_[availableLevel][(row / size) * stride_ + column];
            if (band) band->append(part);
            else band = part;
        }
        out.push_back({start + block, start + end, *band});
    }
}

std::size_t Chart::bytes() const
{
    std::size_t total = events.capacity() * sizeof(ChronicleEvent) + landmarks.capacity() * sizeof(std::size_t) +
        levels_.capacity() * sizeof(levels_.front());
    for (const auto& level : levels_) total += level.capacity() * sizeof(Band);
    return total;
}

const char* terminalText(sim::browser::RunEndReason reason)
{
    using enum sim::browser::RunEndReason;
    switch (reason) {
    case monsterOverrun: return "Monster Overrun";
    case territorialLoss: return "All territory lost";
    case tenuresExhausted: return "No Vassals remain";
    }
    return "Run ended";
}

std::string eventText(const ChronicleEvent& event)
{
    std::string text;
    const auto add = [&](std::string label) {
        if (!text.empty()) text += "  ·  ";
        text += label;
    };
    if (event.terminal) add(terminalText(*event.terminal));
    if (event.kinds & territory) {
        if (event.regionDelta == 0) add("Territory changed");
        else add(std::to_string(std::abs(event.regionDelta)) +
            (event.regionDelta > 0 ? " gained" : " lost") + " · " +
            std::to_string(event.figures.controlledRegions) + " controlled");
    }
    if (event.kinds & raid) add(std::to_string(event.figures.raids) + (event.figures.raids == 1 ? " raid" : " raids"));
    if (event.kinds & collapse) add("Population collapse");
    if (event.kinds & deaths) add(std::to_string(event.figures.deaths) +
        (event.figures.deaths == 1 ? " death" : " deaths"));
    if (event.kinds & migration) add(std::to_string(event.figures.migrations) +
        (event.figures.migrations == 1 ? " migration" : " migrations"));
    if (event.kinds & outcome) add("Vassal decision resolved");
    if (event.kinds & succession) add("Vassal appointed");
    if (event.kinds & vassalEnd) add("Vassal tenure ended");
    return text;
}

Second TimeWindow::at(double ratio) const
{
    return first + static_cast<Second>(std::round(std::clamp(ratio, 0., 1.) * (last - first)));
}

double TimeWindow::fraction(Second second) const
{
    return (static_cast<double>(second) - static_cast<double>(first)) / span();
}

TimeWindow TimeWindow::centered(Second second, Second width) const
{
    width = std::min(width, last - first);
    const auto left = std::clamp(second - std::min(second, width / 2), first, last - width);
    return {left, left + width};
}

TimeWindow TimeWindow::zoom(Second anchor, double factor) const
{
    const auto width = std::max<Second>(8, static_cast<Second>(std::round(span() * factor)));
    const auto offset = static_cast<Second>(std::round(width * std::clamp(fraction(anchor), 0., 1.)));
    const auto left = anchor - std::min(anchor, offset);
    return {left, left + width};
}

}
