#include "connected_view.hpp"
#include "connected_markup.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::connected {
namespace {

using Ink = std::array<Uint8, 3>;

struct Legend {
    const char* name;
    const char* colour;
    Ink ink;
    float minimumScale;
    const char* unit = "";
};

constexpr std::array<Legend, std::tuple_size_v<SeriesValues>> legends{{
    {"Population", "#d6e5aa", {196, 219, 140}, 1},
    {"Food", "#eed398", {228, 188, 107}, 1},
    {"Currency", "#f1cf82", {237, 190, 93}, 1},
    {"Faith", "#dbc9f2", {194, 165, 228}, 100, "%"},
    {"Happiness", "#a9dbc7", {132, 203, 173}, 100, "%"},
    {"Prestige", "#f2d386", {237, 190, 93}, 1},
    {"Controlled", "#d6e5aa", {196, 219, 140}, 1},
    {"Chaos", "#efa899", {223, 129, 111}, 1},
    {"Monsters", "#dfbd9b", {221, 163, 122}, 1},
}};
constexpr std::array groups{
    std::array{Series::population, Series::food}, std::array{Series::faith, Series::happiness},
    std::array{Series::food, Series::currency}, std::array{Series::prestige, Series::regions},
    std::array{Series::chaos, Series::monsters}};
constexpr std::array groupIds{"graph-people", "graph-belief", "graph-stock", "graph-realm", "graph-chaos"};
constexpr Uint64 comparisonMs = 8500, comparisonFadeMs = 1500, advanceMs = 380;

constexpr std::size_t index(Series series) { return static_cast<std::size_t>(series); }

bool contains(SDL_FRect area, SDL_FPoint point) { return SDL_PointInRectFloat(&point, &area); }

Ink mix(Ink a, Ink b, double part)
{
    for (std::size_t i = 0; i < a.size(); ++i) a[i] = static_cast<Uint8>(std::lerp(a[i], b[i], part));
    return a;
}

std::string axisText(Second second, Second year)
{
    if (second < year) return std::to_string(second) + " s";
    return "Y " + std::to_string(1 + second / year) + " · " + std::to_string(second) + "s";
}

class InkBatch {
public:
    InkBatch(SDL_Renderer* renderer, std::vector<SDL_Vertex>& vertices) : renderer_(renderer), vertices_(vertices)
    {
        vertices_.clear();
    }

    void rect(SDL_FRect r, Ink ink)
    {
        if (r.w <= 0 || r.h <= 0) return;
        quad({r.x, r.y}, {r.x + r.w, r.y}, {r.x + r.w, r.y + r.h}, {r.x, r.y + r.h}, ink);
    }

    void line(float x, float y, float x1, float y1, Ink ink)
    {
        const auto dx = x1 - x, dy = y1 - y;
        const auto length = std::max(std::abs(dx), std::abs(dy));
        if (length < .01f) {
            rect({x, y, 1, 1}, ink);
            return;
        }
        const auto nx = -.5f * dy / length, ny = .5f * dx / length;
        quad({x + nx, y + ny}, {x1 + nx, y1 + ny}, {x1 - nx, y1 - ny}, {x - nx, y - ny}, ink);
    }

    void path(std::span<const SDL_FPoint> points, Ink ink)
    {
        if (points.size() == 1) rect({points[0].x, points[0].y, 1, 1}, ink);
        for (std::size_t i = 1; i < points.size(); ++i)
            line(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, ink);
    }

    void submit()
    {
        if (vertices_.empty()) return;
        SDL_RenderGeometry(renderer_, nullptr, vertices_.data(), static_cast<int>(vertices_.size()), nullptr, 0);
        vertices_.clear();
    }

private:
    void quad(SDL_FPoint a, SDL_FPoint b, SDL_FPoint c, SDL_FPoint d, Ink ink)
    {
        const SDL_FColor rgba{ink[0] / 255.f, ink[1] / 255.f, ink[2] / 255.f, 1.f};
        for (const auto point : {a, b, c, a, c, d}) vertices_.push_back({point, rgba, {}});
    }

    SDL_Renderer* renderer_;
    std::vector<SDL_Vertex>& vertices_;
};

const char* endLabel(timegraph::Completion status)
{
    using enum timegraph::Completion;
    switch (status) {
    case storageLimit: return "Forecast storage limit";
    case failed: return "Forecast interrupted";
    default: return "";
    }
}

}

void View::resetGraph()
{
    graphWindow_ = graphBounds_ = {};
    graphGeneration_ = 0;
    graphOldLive_ = graphLive_ = 0;
    graphChangedAt_ = 0;
    graphGroup_ = graphScope_ = 0;
    localGraph_ = graphZoomed_ = false;
    hoverSecond_.reset();
    graphPin_.reset();
    readoutSecond_.reset();
    eventPins_.clear();
}

void View::refreshGraph(bool loading)
{
    const auto& chart = session_.chart();
    const auto& old = session_.previousChart();
    const auto* live = session_.liveSnapshot();
    const auto coverage = session_.coverage();
    const bool calculating = coverage && coverage->completion == timegraph::Completion::running;
    const bool publishing = coverage && chart.through != coverage->publishedThrough;
    const auto* terminal = chart.terminal ? terminalText(*chart.terminal) : nullptr;
    const bool working = graphWorking_ = calculating || publishing;
    if (live && (graphGeneration_ != session_.generation() || graphLive_ != live->second)) {
        graphOldLive_ = session_.divergence().value_or(graphLive_);
        graphLive_ = live->second;
        graphGeneration_ = session_.generation();
        graphChangedAt_ = now_;
        eventPins_.clear();
        hoverSecond_.reset();
        graphPin_.reset();
    }
    const bool comparison = old.through && session_.divergence() && *old.through > *session_.divergence();
    if (comparison && !working && !session_.previousPreview() && now_ - graphChangedAt_ >= comparisonMs)
        session_.clearComparison();

    if (live && coverage && !loading) {
        graphBounds_ = {coverage->start, std::max(coverage->start + 1, coverage->target)};
        if (!graphZoomed_) {
            graphWindow_ = graphBounds_;
            const auto& finished = chart.terminal ? chart : old;
            const auto limit = std::max(chart.through, old.through);
            if (finished.terminal && finished.through && limit) {
                const auto pad = std::max<Second>(8, (*finished.through - finished.start) / 12);
                graphWindow_.last = std::min(graphWindow_.last, std::max(*finished.through + pad, *limit));
            }
        }
    }

    std::size_t scope = civilizationScope;
    std::string_view scopeLabel = "Civilization";
    if (localGraph_ && live) {
        const auto region = std::ranges::find(live->regions,
            selection_.region.empty() ? live->capital : selection_.region, &Region::id);
        if (region != live->regions.end()) {
            scope = 1 + static_cast<std::size_t>(region - live->regions.begin());
            scopeLabel = region->name;
        }
    }
    graphScope_ = scope;
    if (scopeLabel != graphScopeLabel_) {
        graphScopeLabel_ = scopeLabel;
        auto& button = element("graph-scope");
        button.SetInnerRML(markup::escape(scopeLabel));
        button.SetClass("on", scope != civilizationScope);
        button.SetAttribute("aria-pressed", scope != civilizationScope ? "true" : "false");
    }
    if (graphPresentedGroup_ != graphGroup_) {
        graphPresentedGroup_ = graphGroup_;
        for (std::size_t i = 0; i < groupIds.size(); ++i) {
            auto& button = element(groupIds[i]);
            button.SetClass("on", i == graphGroup_);
            button.SetAttribute("aria-pressed", i == graphGroup_ ? "true" : "false");
        }
        const std::array labelIds{"graph-label-one", "graph-label-two"};
        for (std::size_t i = 0; i < labelIds.size(); ++i) {
            const auto& item = legends[index(groups[graphGroup_][i])];
            auto& label = element(labelIds[i]);
            label.SetInnerRML(item.name);
            label.SetProperty("color", item.colour);
        }
    }
    const bool moving = !loading && !session_.busy() && session_.browseThrough().has_value();
    element("plot").SetClass("unavailable", !moving);
    const auto percentage = coverage && chart.through && coverage->target > coverage->start
        ? std::clamp(static_cast<double>(*chart.through - coverage->start) / (coverage->target - coverage->start), 0., 1.) * 100 : 0;
    if (loading) {
        const auto progress = markup::number(percentage, 1) + "%";
        if (progress != currentProgress_) {
            currentProgress_ = progress;
            bindings_.DirtyVariable("progress");
        }
    }
    const bool showingComparison = !loading && session_.previousChart().through && comparison;
    const bool atFork = showingComparison && session_.divergence() &&
        *session_.divergence() >= graphWindow_.first && *session_.divergence() <= graphWindow_.last;
    if (showingComparison != comparisonVisible_) {
        comparisonVisible_ = showingComparison;
        element("graph-comparison").SetProperty("display", showingComparison ? "block" : "none");
    }
    if (showingComparison) {
        const std::string text = atFork ? "Before edit · " + std::to_string(*session_.divergence()) + " s" : "Before edit";
        if (graphComparisonLabel_ != text) element("graph-comparison").SetInnerRML(graphComparisonLabel_ = text);
    }
    std::string status;
    if (loading && !session_.error().empty()) status = session_.error();
    else if (const auto requested = session_.requested()) {
        const auto prefix = session_.previousPreview() ? "Previous forecast" :
            (*requested < live->second ? "History" : "Preview");
        status = std::string(prefix) + " · " + std::to_string(*requested) + " s";
        if (!session_.previewReady()) status += " · Restoring";
        else if (terminal && requested == chart.through && !session_.previousPreview())
            status = std::string(live->terminal ? "Ended · " : "Foreseen · ") + terminal;
    } else if (session_.busy() && !loading) {
        if (pendingAction_ == "reform") status = "Applying reform";
        else if (pendingAction_ == "run-advance") status = "Advancing Live";
        else status = "Applying decision";
    }
    else if (working) status = "Forecasting · " + (percentage < 1 ? std::string("<1") : markup::number(percentage)) + "%";
    else if (terminal) status = std::string(live && live->terminal ? "Run ended · " : "Foreseen · ") + terminal;
    else if (coverage && *endLabel(coverage->completion)) status = endLabel(coverage->completion);
    else if (live && !loading) status = "Live · " + std::to_string(live->second) + " s";
    else status = "Preparing the forecast";
    if (status != currentStatus_) {
        currentStatus_ = status;
        bindings_.DirtyVariable("status");
    }
    element("graph-status").SetClass("terminal", terminal && !session_.previewing() && !working);
    const auto year = session_.calendarSteps().back();
    const auto start = moving ? axisText(graphWindow_.first, year) : "";
    const auto end = moving ? axisText(graphWindow_.last, year) : "";
    if (start != currentAxisStart_) element("axis-start").SetInnerRML(currentAxisStart_ = start);
    if (end != currentAxisEnd_) element("axis-end").SetInnerRML(currentAxisEnd_ = end);
}

void View::refreshReadout()
{
    auto& node = element("readout");
    const auto* event = drag_ == Drag::graph && graphPin_ && !moved_ && (!touch_ || longPress_)
        ? eventAt(pressed_) : (!touch_ && drag_ == Drag::none ? eventAt(pointer_) : nullptr);
    const auto second = event ? std::optional(event->second) :
        drag_ == Drag::graph ? session_.requested() : hoverSecond_;
    if (loadingVisible_ || dialog_ || shell_.screen() != Screen::game || !second) {
        if (!currentReadout_.empty()) {
            node.SetProperty("display", "none");
            currentReadout_.clear();
        }
        return;
    }
    const auto& chart = session_.chart();
    const auto& old = session_.previousChart();
    const bool readingPrevious = old.through &&
        ((drag_ == Drag::graph && session_.previousPreview() && session_.requested() == second) ||
         !chart.through || *second > *chart.through);
    const auto gen = readingPrevious ? old.generation : chart.generation;
    std::string text = axisText(*second, session_.calendarSteps().back());
    if (event) text += " · " + eventText(*event);
    else {
        if (gen != readoutGeneration_ || second != readoutSecond_ || graphScope_ != readoutScope_ || !readoutExact_) {
            readoutExact_ = session_.readPlot(gen, graphScope_, *second, std::span(&readoutValues_, 1)) == 1;
            readoutGeneration_ = gen;
            readoutSecond_ = second;
            readoutScope_ = graphScope_;
        }
        if (readoutExact_) for (auto series : groups[graphGroup_]) {
            const auto i = index(series);
            text += " · " + std::string(legends[i].name) + " " + markup::number(readoutValues_[i]) + legends[i].unit;
        }
        if (gen == old.generation && old.generation) text += " · Previous";
    }
    if (currentReadout_ != text) {
        node.SetInnerRML(markup::escape(text));
        currentReadout_ = std::move(text);
        node.SetProperty("display", "block");
    }
    const auto area = bounds("timegraph");
    const auto x = std::clamp(xAt(*second) - area.x - 50.f, 4.f, std::max(4.f, area.w - 260.f * density_));
    node.SetProperty("left", std::to_string(static_cast<int>(x)) + "px");
}

void View::drawGraph()
{
    graphSampleMs_ = 0;
    const auto& chart = session_.chart();
    const auto& old = session_.previousChart();
    if (loadingVisible_ || !session_.browseThrough()) return;
    const auto area = plot();
    if (area.w < 2 || area.h < 18) return;
    const auto stop = chart.through.value_or(chart.start);
    const auto at = [&](Second second) {
        return area.x + area.w * static_cast<float>(graphWindow_.fraction(second));
    };
    const auto onScreen = [&](Second second) {
        return graphWindow_.first <= second && second <= graphWindow_.last;
    };
    const auto edge = [&](Second second) { return std::clamp(at(second), area.x, area.x + area.w - 1); };
    InkBatch batch(renderer_, graphInk_);
    const auto fill = [&](SDL_FRect rect, Ink ink) {
        batch.rect(rect, ink);
    };
    const auto line = [&](float x0, float y0, float x1, float y1, Ink ink) {
        batch.line(x0, y0, x1, y1, ink);
    };
    const SDL_Rect clip{static_cast<int>(area.x), static_cast<int>(area.y), static_cast<int>(area.w), static_cast<int>(area.h)};
    SDL_SetRenderClipRect(renderer_, &clip);
    const auto rail = 12.f * density_;
    const auto body = area.y + rail;
    const auto bottom = area.y + area.h - 1.f;
    const auto lane = (bottom - body) / 2;
    const auto bg = previewing_ ? Ink{24, 35, 40} : Ink{29, 32, 25};
    fill(area, {17, 22, 20});
    if (chart.through && stop >= graphWindow_.first)
        fill({area.x, area.y, std::max(1.f, edge(stop) - area.x), area.h}, bg);
    if (graphWindow_.first < graphLive_) {
        const auto past = std::min(graphLive_, stop);
        if (past >= graphWindow_.first)
            fill({area.x, body, edge(past) - area.x, bottom - body}, {41, 38, 28});
    }
    if (chart.terminal && stop < graphWindow_.last) {
        const auto x = edge(stop);
        fill({x, area.y, area.x + area.w - x, area.h}, {42, 26, 24});
        for (float hatch = x - area.h; hatch < area.x + area.w; hatch += 26.f) {
            const auto start = std::max(x, hatch);
            line(start, bottom - (start - hatch), hatch + area.h, area.y, {57, 35, 30});
        }
    }
    fill({area.x, area.y, area.w, rail}, {39, 35, 27});
    for (int i = 0; i <= 2; ++i)
        line(area.x, body + i * lane, area.x + area.w, body + i * lane, {77, 70, 52});
    for (int i = 1; i < 8; ++i) {
        const auto x = area.x + area.w * i / 8.f;
        line(x, body, x, bottom, {52, 52, 40});
    }

    const auto started = SDL_GetPerformanceCounter();
    const auto fork = session_.divergence().value_or(chart.start);
    const bool compare = comparisonVisible_ && old.through;
    const auto columns = std::clamp(static_cast<std::size_t>(area.w / 3.f), std::size_t{32}, Chart::maxColumns);
    const auto exact = [&](const Chart& source, ExactPlot& cache, Second first, Second last) {
        if (last < first) {
            cache.count = 0;
            return;
        }
        if (cache.generation != source.generation || cache.scope != graphScope_ || cache.first != first) {
            cache.generation = source.generation;
            cache.scope = graphScope_;
            cache.first = first;
            cache.count = 0;
        }
        const auto count = static_cast<std::size_t>(last - first + 1);
        if (cache.count < count) cache.count += session_.readPlot(source.generation, graphScope_, first + cache.count,
            std::span(cache.rows).subspan(cache.count, count - cache.count));
    };
    const auto collect = [&](const Chart& source, ExactPlot& cache, std::size_t slot, Second floor) {
        const auto first = std::max(graphWindow_.first, floor);
        const auto last = std::min(graphWindow_.last, source.through.value_or(0));
        const bool close = graphWindow_.span() <= Chart::exactSeconds && source.through && first <= last;
        if (close) exact(source, cache, first, last);
        for (std::size_t i = 0; i < 2; ++i) {
            auto& output = graphColumns_[slot + i];
            const auto series = groups[graphGroup_][i];
            if (close) {
                output.clear();
                for (std::size_t n = 0; n < std::min(cache.count, static_cast<std::size_t>(last - first + 1)); ++n) {
                    const auto value = cache.rows[n][index(series)];
                    output.push_back({first + n, first + n, {value, value, value, value}});
                }
            } else source.columns(series, graphScope_, first, graphWindow_.last, columns, output);
        }
    };
    collect(chart, exactCurrent_, 0, chart.start);
    if (compare) collect(old, exactPrevious_, 2, fork);
    else for (std::size_t i = 2; i < graphColumns_.size(); ++i) graphColumns_[i].clear();
    chart.columns(Series::population, civilizationScope, graphBounds_.first, graphBounds_.last, 88, overviewColumns_);
    graphSampleMs_ = 1000. * (SDL_GetPerformanceCounter() - started) / SDL_GetPerformanceFrequency();

    const auto age = now_ - graphChangedAt_;
    const auto oldStrength = reduced_ || session_.previousPreview() ? 1. :
        std::clamp(static_cast<double>(comparisonMs - std::min(comparisonMs, age)) / comparisonFadeMs, .2, 1.);
    std::array<SDL_FPoint, (Chart::exactSeconds + 2) * 2> points;
    for (std::size_t i = 0; i < 2; ++i) {
        const auto& legend = legends[index(groups[graphGroup_][i])];
        float peak = legend.minimumScale;
        for (auto slot : {i, i + 2})
            for (const auto& column : graphColumns_[slot]) peak = std::max(peak, column.band.high);
        const auto y = [&](float value) {
            return body + (i + 1) * lane - 2.f - std::max(1.f, lane - 4.f) * value / peak;
        };
        const auto trace = [&](const auto& columns, Second floor, Ink ink, double fillStrength) {
            if (columns.empty()) return;
            std::size_t count = 0;
            const auto rangeInk = mix(bg, ink, fillStrength);
            for (const auto& column : columns) {
                const auto x0 = edge(std::max(column.first, floor));
                const auto x1 = edge(column.last);
                const auto& band = column.band;
                points[count++] = {x0, y(band.first)};
                if (x0 < x1) points[count++] = {x1, y(band.last)};
                if (band.high != band.low)
                    fill({(x0 + x1) * .5f, y(band.high), 1.f, y(band.low) - y(band.high)}, rangeInk);
            }
            batch.path(std::span(points).first(count), ink);
        };
        trace(graphColumns_[i + 2], fork, mix(bg, {171, 157, 144}, oldStrength * .82), .75);
        trace(graphColumns_[i], chart.start, legend.ink, .66);
    }

    eventPins_.clear();
    const auto spacing = std::max<Second>(1, static_cast<Second>(std::ceil(graphWindow_.span() * 19. * density_ / area.w)));
    const auto drawPins = [&](auto&& first, auto end, auto getIndex) {
        const auto second = [&](const auto& item) { return chart.events[getIndex(item)].second; };
        auto it = std::ranges::lower_bound(first, end, graphWindow_.first, {}, second);
        while (it != end && second(*it) <= graphWindow_.last) {
            const auto next = std::ranges::lower_bound(it + 1, end,
                std::min(graphWindow_.last + 1, second(*it) + spacing), {}, second);
            const auto pin = getIndex(*(next - 1));
            const auto chosen = chart.events[pin].terminal ? pin : getIndex(*it);
            const auto& event = chart.events[chosen];
            const auto x = edge(event.second);
            const auto y = area.y + rail * .5f;
            eventPins_.push_back(chosen);
            if (event.kinds & (runEnd | outcome | succession | vassalEnd)) {
                const auto ink = event.terminal ? Ink{249, 147, 124} : Ink{236, 200, 119};
                const int radius = event.terminal ? 4 : 3;
                for (int dy = -radius; dy <= radius; ++dy) {
                    const auto half = static_cast<float>(radius - std::abs(dy));
                    line(x - half, y + dy, x + half, y + dy, ink);
                }
            } else if (event.kinds & (raid | collapse | territory)) {
                fill({x - 2, y - 2, 5, 5}, {219, 143, 102});
            } else {
                fill({x - 1, y - 1, 3, 3}, event.kinds & deaths ? Ink{192, 143, 107} : Ink{148, 191, 174});
            }
            it = next;
        }
    };
    if (spacing <= 12)
        drawPins(chart.events.begin(), chart.events.end(), [&](const ChronicleEvent& event) {
            return static_cast<std::size_t>(&event - chart.events.data());
        });
    else drawPins(chart.landmarks.begin(), chart.landmarks.end(), [](std::size_t pin) { return pin; });

    if (compare && onScreen(fork)) {
        const auto x = edge(fork);
        for (auto y = body; y < bottom; y += 7.f) line(x, y, x, std::min(bottom, y + 3.f), {189, 164, 142});
    }
    if (chart.through && onScreen(stop) && stop != graphLive_) {
        const bool progress = !chart.terminal && stop < chart.end;
        const bool animate = !reduced_ && progress && graphWorking_;
        const auto glow = animate ? std::pow(std::sin(age / 150.), 2.) * .4 : 0.;
        const auto x = edge(stop);
        if (animate) {
            const auto width = std::min(x - area.x, 18.f * density_);
            for (int band = 0; band < 3; ++band)
                fill({x - width * (band + 1) / 3, bottom - 2.f, width / 3, 2.f}, mix(bg, {218, 176, 85}, .9 - band * .25));
        }
        if (chart.terminal || progress)
            line(x, area.y, x, bottom, chart.terminal ? Ink{246, 143, 118} : mix({158, 126, 72}, {255, 217, 127}, glow));
    }
    if (!reduced_ && !session_.previewing() && graphOldLive_ < graphLive_ && age < advanceMs) {
        const auto t = 1. - std::pow(1. - static_cast<double>(age) / advanceMs, 3.);
        const auto now = graphOldLive_ + static_cast<Second>(t * (graphLive_ - graphOldLive_));
        const auto x = edge(now);
        fill({edge(graphOldLive_), body, x - edge(graphOldLive_), 2}, {199, 148, 68});
        fill({x - 2.f, body, 4.f, 5.f}, {255, 223, 146});
    }
    if (hoverSecond_ && drag_ != Drag::graph && onScreen(*hoverSecond_)) {
        const auto x = edge(*hoverSecond_);
        line(x, body, x, bottom, {155, 156, 133});
    }
    const auto grip = [&](Second second, Ink ink, bool active) {
        if (!onScreen(second)) return;
        const auto x = edge(second);
        line(x, body, x, bottom, ink);
        const float size = active && drag_ == Drag::graph ? 15.f : 11.f;
        const auto left = std::clamp(x - size / 2, area.x, area.x + area.w - size);
        fill({left, bottom - 10.f, size, 10.f}, {26, 27, 21});
        fill({left + 1, bottom - 9.f, size - 2, 8.f}, ink);
        for (int offset : {-2, 1}) fill({left + size / 2 + offset, bottom - 7.f, 1.f, 4.f}, {53, 52, 39});
    };
    grip(graphLive_, {248, 206, 124}, false);
    if (const auto requested = session_.requested()) grip(*requested, {163, 222, 240}, true);
    batch.submit();
    SDL_SetRenderClipRect(renderer_, nullptr);

    const auto overview = bounds("graph-overview");
    if (overview.w < 4) return;
    const auto ox = [&](Second second) {
        return overview.x + overview.w * static_cast<float>(std::clamp(graphBounds_.fraction(second), 0., 1.));
    };
    const auto oy = overview.y + 5.f * density_;
    const auto height = 12.f * density_;
    fill({overview.x, oy, overview.w, height}, {16, 20, 17});
    if (chart.through)
        fill({overview.x, oy, ox(stop) - overview.x, height}, {56, 65, 43});
    if (chart.terminal) fill({ox(stop), oy, overview.x + overview.w - ox(stop), height}, {58, 32, 28});
    float peak = 1;
    for (const auto& column : overviewColumns_) peak = std::max(peak, column.band.high);
    for (std::size_t i = 0; i < overviewColumns_.size(); ++i) {
        const auto& column = overviewColumns_[i];
        points[i] = {ox(column.last), oy + height - 2.f - (height - 4.f) * column.band.last / peak};
    }
    batch.path(std::span(points).first(overviewColumns_.size()), {161, 177, 118});
    const auto focus = SDL_FRect{ox(graphWindow_.first), oy, std::max(2.f, ox(graphWindow_.last) - ox(graphWindow_.first)), height};
    constexpr Ink frame{209, 177, 119};
    line(focus.x, oy, focus.x + focus.w, oy, frame);
    line(focus.x, oy + height, focus.x + focus.w, oy + height, frame);
    line(focus.x, oy, focus.x, oy + height, frame);
    line(focus.x + focus.w, oy, focus.x + focus.w, oy + height, frame);
    if (chart.terminal)
        line(ox(stop), oy - 1.f, ox(stop), oy + height, {244, 145, 120});
    batch.submit();
}

const ChronicleEvent* View::eventAt(SDL_FPoint point) const
{
    const auto area = plot();
    if (!contains(area, point) || point.y > area.y + (touch_ ? 22.f : 15.f) * density_) return nullptr;
    const ChronicleEvent* found = nullptr;
    auto distance = (touch_ ? 15.f : 10.f) * density_;
    const auto& events = session_.chart().events;
    for (const auto pin : eventPins_) {
        if (pin >= events.size()) continue;
        const auto dx = std::abs(xAt(events[pin].second) - point.x);
        if (dx <= distance) {
            found = &events[pin];
            distance = dx;
        }
    }
    return found;
}

bool View::scrubAt(float x)
{
    if (shell_.screen() != Screen::game || session_.busy() || session_.opening() || !session_.browseThrough()) return false;
    selection_.destination.reset();
    return session_.scrub(secondAt(x));
}

void View::releaseGraph()
{
    if (!moved_ && graphPin_) {
        if (!longPress_) {
            if (eventAt(pressed_)) {
                if (session_.scrub(*graphPin_)) selection_.destination.reset();
            } else returnLive();
        }
    } else scrubAt(pointer_.x);
    graphPin_.reset();
}

Second View::secondAt(float x) const
{
    const auto area = plot();
    return std::min(graphWindow_.at((x - area.x) / std::max(1.f, area.w)),
        session_.browseThrough().value_or(graphWindow_.first));
}

float View::xAt(Second second) const
{
    const auto area = plot();
    return std::clamp(area.x + area.w * static_cast<float>(graphWindow_.fraction(second)),
        area.x, area.x + std::max(0.f, area.w - 1.f));
}

void View::focusSecond(Second second)
{
    if (second < graphWindow_.first || second > graphWindow_.last)
        graphWindow_ = graphBounds_.centered(second, graphWindow_.span());
}

void View::zoomGraph(double factor, Second anchor)
{
    if (graphBounds_.last <= graphBounds_.first) return;
    const auto requested = graphWindow_.zoom(anchor, factor);
    if (requested.span() >= graphBounds_.span()) {
        graphZoomed_ = true;
        graphWindow_ = graphBounds_;
    } else {
        graphZoomed_ = true;
        const auto width = requested.span();
        const auto left = std::clamp(requested.first, graphBounds_.first, graphBounds_.last - width);
        graphWindow_ = {left, left + width};
    }
    hoverSecond_.reset();
}

void View::panGraph(float x)
{
    const auto area = bounds("graph-overview");
    graphZoomed_ = true;
    graphWindow_ = graphBounds_.centered(graphBounds_.at((x - area.x) / std::max(1.f, area.w)), graphWindow_.span());
    hoverSecond_.reset();
}

void View::jumpEvent(bool next)
{
    const auto* live = session_.liveSnapshot();
    if (!live) return;
    const auto at = session_.requested().value_or(live->second);
    const auto& events = session_.chart().events;
    auto it = std::ranges::lower_bound(events, at, {}, &ChronicleEvent::second);
    if (next) {
        if (it != events.end() && it->second == at) ++it;
        if (it == events.end()) return;
    } else {
        if (it == events.begin()) return;
        --it;
    }
    if (session_.scrub(it->second)) {
        selection_.destination.reset();
        focusSecond(it->second);
    }
}

bool View::activateGraph(std::string_view op)
{
    if (session_.opening() || !session_.liveSnapshot()) return false;
    if (op == "graph-scope") {
        localGraph_ = !localGraph_;
        if (localGraph_ && graphGroup_ >= 3) graphGroup_ = 0;
    } else if (const auto group = std::ranges::find_if(groupIds, [&](std::string_view id) { return id == op; });
               group != groupIds.end()) {
        graphGroup_ = static_cast<std::size_t>(group - groupIds.begin());
        if (graphGroup_ >= 3) localGraph_ = false;
    } else if (op == "graph-prev" || op == "graph-next") jumpEvent(op == "graph-next");
    else if (op == "graph-in" || op == "graph-out") {
        const auto at = session_.requested().value_or(graphLive_);
        const auto anchor = at >= graphWindow_.first && at <= graphWindow_.last ? at : graphWindow_.at(.5);
        zoomGraph(op == "graph-in" ? .5 : 2., anchor);
    } else return false;
    return true;
}

void View::graphKey(SDL_Keycode key, SDL_Keymod modifiers)
{
    if (key == SDLK_HOME) returnLive();
    if (key == SDLK_END && session_.browseThrough() && session_.scrub(*session_.browseThrough())) {
        selection_.destination.reset();
        focusSecond(*session_.requested());
    }
    if (key == SDLK_PAGEUP || key == SDLK_PAGEDOWN) jumpEvent(key == SDLK_PAGEDOWN);
    if (key == SDLK_EQUALS || key == SDLK_PLUS || key == SDLK_MINUS)
        activateGraph(key == SDLK_MINUS ? "graph-out" : "graph-in");
    if (key != SDLK_LEFT && key != SDLK_RIGHT) return;
    if (context_.GetFocusElement() == &element("graph-overview")) {
        const auto at = graphWindow_.at(.5);
        const auto step = std::max<Second>(1, graphWindow_.span() / 3);
        graphZoomed_ = true;
        graphWindow_ = graphBounds_.centered(key == SDLK_RIGHT ? at + step : at - std::min(at, step), graphWindow_.span());
        return;
    }
    const auto steps = session_.calendarSteps();
    const auto step = steps[modifiers & SDL_KMOD_ALT ? 3 : modifiers & SDL_KMOD_CTRL ? 2 : modifiers & SDL_KMOD_SHIFT ? 1 : 0];
    const auto at = session_.requested().value_or(graphLive_);
    const auto target = key == SDLK_RIGHT ? at + step : at - std::min(at, step);
    if (session_.scrub(target)) {
        selection_.destination.reset();
        focusSecond(*session_.requested());
    }
}

}
