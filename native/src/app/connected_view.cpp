#include "connected_view.hpp"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iterator>

namespace waffle::connected {
namespace {

using Colour = std::array<Uint8, 4>;

std::string readText(const std::filesystem::path& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("Could not open " + path.string());
    return {std::istreambuf_iterator<char>(file), {}};
}

std::string escape(std::string_view text)
{
    std::string result;
    for (char c : text) {
        switch (c) {
            case '<': result += "&lt;"; break;
            case '>': result += "&gt;"; break;
            case '&': result += "&amp;"; break;
            case '"': result += "&quot;"; break;
            default: result += c;
        }
    }
    return result;
}

std::string number(double value, int precision = 0)
{
    char buffer[48];
    std::snprintf(buffer, sizeof(buffer), "%.*f", precision, value);
    return buffer;
}

std::string button(std::string_view op, std::string_view id, std::string_view label,
                   std::string_view classes = "decision", std::string_view help = {}, bool disabled = false)
{
    return "<button class=\"button " + std::string(classes) + (disabled ? " disabled" : "") +
        "\" data-op=\"" + std::string(op) + "\" data-id=\"" + escape(id) +
        "\" data-help=\"" + escape(help) + (disabled ? "\" disabled=\"disabled" : "") +
        "\">" + escape(label) + "</button>";
}

bool contains(SDL_FRect rect, SDL_FPoint p)
{
    return SDL_PointInRectFloat(&p, &rect);
}

void colour(SDL_Renderer* renderer, Colour rgba)
{
    SDL_SetRenderDrawColor(renderer, rgba[0], rgba[1], rgba[2], rgba[3]);
}

void line(SDL_Renderer* renderer, SDL_FPoint a, SDL_FPoint b, Colour ink)
{
    colour(renderer, ink);
    SDL_RenderLine(renderer, a.x, a.y, b.x, b.y);
}

constexpr std::array<const char*, 4> holderClass{"player", "crown", "neutral", "monster"};
constexpr std::array holders{"Your holding", "Crown holding", "Unheld", "Creep"};

void show(Rml::Element& element, bool visible)
{
    element.SetProperty("display", visible ? "block" : "none");
}

}

View::View(Rml::Context& context, SDL_Renderer* renderer, Session& session, Selection& selection, Launch launch,
           Artwork art)
    : context_(context), renderer_(renderer), session_(session), selection_(selection), launch_(std::move(launch)),
      sprites_(std::move(art.sprites))
{
    if (!Rml::LoadFontFace(WAFFLE_CONNECTED_FONT, "Lato", Rml::Style::FontStyle::Normal,
            Rml::Style::FontWeight::Auto, true))
        throw std::runtime_error("Could not load native UI font");
    auto model = context_.CreateDataModel("connected");
    if (!model || !model.Bind("clock", &currentClock_) || !model.Bind("status", &currentStatus_) ||
        !model.Bind("progress", &currentProgress_))
        throw std::runtime_error("Could not bind the connected view");
    bindings_ = model.GetModelHandle();
    const std::filesystem::path source = WAFFLE_CONNECTED_RML;
    auto rml = readText(source);
    constexpr std::string_view styles = "<!-- interaction styles -->";
    const auto directory = source.parent_path();
    rml.replace(rml.find(styles), styles.size(), "<style>" + readText(directory / "interaction.rcss") +
        readText(directory / "connected-layout.rcss") + "</style>");
    constexpr std::string_view marker = "<!-- atlas styles -->";
    rml.replace(rml.find(marker), marker.size(), art.css);
    rml.insert(rml.find("</body>"),
        "<div style=\"position:absolute;width:1px;height:1px;decorator:image(card0 fill);\"></div>");
    document_ = context.LoadDocumentFromMemory(rml, "connected.rml");
    if (!document_) throw std::runtime_error("Could not load the connected view");
    document_->AddEventListener(Rml::EventId::Click, this);
    document_->Show(Rml::ModalFlag::None, Rml::FocusFlag::Document);
    resize();
}

View::~View()
{
    document_->RemoveEventListener(Rml::EventId::Click, this);
    document_->Close();
    context_.RemoveDataModel("connected");
}

SDL_FRect View::bounds(const char* id) const
{
    auto& node = element(id);
    const auto offset = node.GetAbsoluteOffset(Rml::BoxArea::Content);
    const auto size = node.GetBox().GetSize();
    return {offset.x, offset.y, size.x, size.y};
}

SDL_FRect View::plot() const { return bounds("plot"); }

void View::resize()
{
    int width = 0, height = 0;
    SDL_GetRenderOutputSize(renderer_, &width, &height);
    if (width <= 0 || height <= 0) return;
    context_.SetDimensions({width, height});
    context_.SetDensityIndependentPixelRatio(std::clamp(std::min(width / 1120.f, height / 640.f), .78f, 1.5f));
    markersDirty_ = true;
    context_.Update();
}

std::optional<std::string> View::hit(SDL_FPoint point) const
{
    const auto* view = session_.displayed();
    if (!view || session_.opening()) return {};
    const auto map = bounds("map");
    const auto& shapes = session_.shapes();
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto& polygon = shapes[i].outline;
        if (polygon.size() < 3) continue;
        bool inside = false;
        auto a = map_.project(polygon.back(), map);
        for (const auto& vertex : polygon) {
            const auto b = map_.project(vertex, map);
            if ((a.y > point.y) != (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x)
                inside = !inside;
            a = b;
        }
        if (inside) return view->regions[i].id;
    }
    return {};
}

std::optional<std::size_t> View::cardAt(SDL_FPoint point) const
{
    const auto* board = document_->GetElementById("board");
    if (!board || !contains(bounds("panel"), point)) return {};
    for (int i = 0; i < board->GetNumChildren(); ++i) {
        auto* card = board->GetChild(i);
        const auto offset = card->GetAbsoluteOffset(Rml::BoxArea::Border);
        const auto size = card->GetBox().GetSize(Rml::BoxArea::Border);
        if (contains({offset.x, offset.y, size.x, size.y}, point)) return static_cast<std::size_t>(i);
    }
    return {};
}

bool View::canStage(const Snapshot& snapshot, const Region* site) const
{
    return !session_.previewing() && !session_.busy() && site && site->holder == Holder::player &&
        site->id == snapshot.vassalRegion &&
        std::ranges::any_of(snapshot.choices, [](const auto& choice) { return choice.kind == Decision::reorder; });
}

void View::refreshMarkers(const Snapshot* snapshot)
{
    std::string markup;
    if (snapshot) {
        for (const auto& region : snapshot->regions) {
            markup += "<div class=\"marker " + std::string(holderClass[static_cast<std::size_t>(region.holder)]) +
                (region.id == selection_.region ? " selected" : "") + "\">" + escape(region.id) + "</div>";
        }
    }
    if (markerMarkup_ != markup) {
        element("markers").SetInnerRML(markerMarkup_ = std::move(markup));
        markersDirty_ = true;
    }
}

void View::positionMarkers()
{
    auto& markers = element("markers");
    if (!markers.GetNumChildren()) return;
    const auto area = bounds("map");
    const auto& shapes = session_.shapes();
    for (int i = 0; i < markers.GetNumChildren(); ++i) {
        auto& marker = *markers.GetChild(i);
        const auto point = map_.project(shapes[static_cast<std::size_t>(i)].label, area);
        marker.SetProperty("left", number(point.x - area.x) + "px");
        marker.SetProperty("top", number(point.y - area.y + 7) + "px");
    }
}

void View::refreshPanel(const Snapshot* snapshot)
{
    auto& content = element("panel-content");
    if (!snapshot) {
        if (!panelMarkup_.empty()) {
            panelMarkup_.clear();
            lastStats_.clear();
            lastPracticeValues_.clear();
            content.SetInnerRML("");
        }
        return;
    }
    std::string html;
    std::string stats, values;
    const auto* site = selection_.selected(snapshot);
    const bool editable = canStage(*snapshot, site);
    const bool showStage = selection_.destination && (editable || pendingAction_ == "reform");
    if (!site) {
        html = "<h2>Settlements</h2><p class=\"quiet rule\">Select a region to view its settlement.</p>";
    } else {
        const auto holder = static_cast<std::size_t>(site->holder);
        html = "<h2>" + escape(site->name) + "</h2><p class=\"quiet\">" + holders[holder];
        if (site->hasSite) html += " · " + escape(site->settlement);
        html += "</p>";
        if (site->hasSite) {
            html += "<p id=\"site-stats\" class=\"stats\"></p>";
            stats = "<span class=\"gold\">" + number(site->population) + "</span> residents &nbsp; · &nbsp; " +
                number(site->food, 1) + " Food &nbsp; · &nbsp; " + number(site->currency, 1) + " Currency";
        }
        if (site->detailed) {
            html += "<div id=\"board\">";
            for (std::size_t i = 0; i < site->cards.size(); ++i) {
                auto shown = i;
                if (showStage && selection_.card) {
                    const auto from = *selection_.card, to = *selection_.destination;
                    if (i == to) shown = from;
                    else if (from < to && i >= from && i < to) shown = i + 1;
                    else if (from > to && i > to && i <= from) shown = i - 1;
                }
                const auto& card = site->cards[shown];
                const bool placed = !card.id.empty();
                html += "<button class=\"card";
                if (!placed) html += " empty disabled";
                if (selection_.card == shown) html += " chosen";
                if (showStage && selection_.destination == i) html += " staged";
                const auto help = placed ? card.name + " · " + card.mode : card.locked ? "This slot is locked." : "No Practice is installed in this slot.";
                html += "\" data-op=\"card\" data-locked=\"" + std::string(card.locked ? "true" : "false") +
                    "\" data-id=\"" + std::to_string(shown) + "\" data-help=\"" +
                    escape(help) + (placed ? "\"" : "\" disabled=\"disabled\"") + ">";
                if (const auto art = sprites_.find(card.id); art != sprites_.end())
                    html += "<div class=\"card-art\" style=\"decorator:image(" + art->second + " fill);\"></div>";
                html += "<div class=\"card-slot\">" + std::to_string(i + 1) + "</div>";
                if (showStage && selection_.destination == i) html += "<div class=\"staged-mark\">Staged</div>";
                html += "<div class=\"card-name\">" + escape(placed ? card.name : card.locked ? "Locked" : "Empty") +
                    "</div></button>";
            }
            html += "</div>";
            if (selection_.card && !site->cards[*selection_.card].id.empty()) {
                const auto& card = site->cards[*selection_.card];
                if (showStage) {
                    html += "<div class=\"reform-controls\"><p class=\"pending\">Staged move to slot " +
                        std::to_string(*selection_.destination + 1);
                    if (snapshot->shopSeconds) html += " · " + std::to_string(*snapshot->shopSeconds) + " seconds";
                    html += "</p>";
                    const bool applying = pendingAction_ == "reform";
                    html += button("review", {}, applying ? "Applying reform" : "Review reform",
                        applying ? "decision primary busy" : "decision primary", "Review the time cost before committing.", applying);
                    html += button("undo", {}, "Undo", "decision", "Restore the committed order.", applying);
                    html += "</div>";
                } else if (editable) {
                    html += "<div class=\"reform-controls\">";
                    for (const int step : {-1, 1}) {
                        const auto next = static_cast<int>(*selection_.card) + step;
                        const bool outside = next < 0 || next >= static_cast<int>(site->cards.size());
                        const bool locked = !outside && site->cards[static_cast<std::size_t>(next)].locked;
                        html += button("stage", std::to_string(next), step < 0 ? "Move left" : "Move right", "decision",
                            outside ? "This Practice is at the edge of the board." : locked ? "The destination slot is locked." :
                            "Stage this move.", outside || locked);
                    }
                    html += "</div>";
                }
                html += "<div id=\"inspector\"><h2>" + escape(card.name) + "</h2><p class=\"quiet\">" +
                    escape(card.quality) + " · " + escape(card.mode);
                if (!card.tags.empty()) html += " · " + escape(card.tags);
                html += "</p><p class=\"rule\">" + escape(card.rule) + "</p>";
                html += "<div id=\"practice-values\"></div>";
                if (card.workerCapacity > 0) values += "<p class=\"quiet rule\">Worker capacity " + number(card.workerCapacity) + "</p>";
                if (card.stock) values += "<p class=\"quiet rule\">Stock " + number(*card.stock, 1) + "</p>";
                if (card.mode == "Charge") values += "<p class=\"quiet rule\">Charge " + number(card.charge, 1) + "</p>";
                if (session_.previewing()) {
                    html += "<p class=\"quiet rule\">Preview is read-only. Return to Live to make decisions.</p>";
                }
                html += "</div>";
            }
        } else if (site->hasSite) {
            html += "<p class=\"quiet rule\">Market settlement</p>";
        }
    }
    if (!session_.previewing()) {
        const auto& choices = snapshot->choices;
        if (!choices.empty() && choices.front().kind != Decision::reorder) {
            constexpr std::array labels{"Choose a Vassal", "Choose a Commission", "Life Map", "Practice Reform", "", ""};
            const auto label = std::string_view(labels[static_cast<std::size_t>(choices.front().kind)]);
            if (!label.empty()) html += "<p class=\"quiet rule\">" + std::string(label) + "</p>";
            for (std::size_t i = 0; i < choices.size(); ++i)
                html += button("choice", std::to_string(i), choices[i].label, "decision",
                    session_.busy() ? "Another decision is being applied." : "", session_.busy());
        } else if (editable && !selection_.card) {
            html += "<p class=\"quiet rule\">Practice Reform · Select a Practice to reorder it.</p>";
        }
    }
    const bool remount = html != panelMarkup_;
    const bool sameRegion = selectedRegion_ == selection_.region;
    if (remount) {
        auto& panel = element("panel");
        const auto scroll = panel.GetScrollTop();
        auto* focus = context_.GetFocusElement();
        auto* ancestor = focus;
        while (ancestor && ancestor != &content) ancestor = ancestor->GetParentNode();
        const bool restoreFocus = ancestor && focus->IsPseudoClassSet("focus-visible") && !dialog_;
        const auto op = focus ? focus->GetAttribute<Rml::String>("data-op", "") : "";
        const auto id = focus ? focus->GetAttribute<Rml::String>("data-id", "") : "";
        content.SetInnerRML(panelMarkup_ = std::move(html));
        content.SetClass("enter", !sameRegion);
        if (auto* inspector = document_->GetElementById("inspector"))
            inspector->SetClass("enter", selectedCard_ != selection_.card);
        if (sameRegion) panel.SetScrollTop(scroll);
        else panel.SetScrollTop(0);
        if (restoreFocus && !op.empty()) {
            Rml::ElementList controls;
            content.QuerySelectorAll(controls, "button");
            Rml::Element* next = nullptr;
            for (auto* control : controls) {
                if (control->HasAttribute("disabled")) continue;
                const auto operation = control->GetAttribute<Rml::String>("data-op", "");
                if (operation == op && control->GetAttribute<Rml::String>("data-id", "") == id) {
                    next = control;
                    break;
                }
                if (!next || operation == "review" || operation == "choice" ||
                    (op == "review" && operation == "stage")) next = control;
            }
            if (next) next->Focus(true);
        }
    }
    const auto updateValues = [&](const char* target, const std::string& value, std::string& previous, bool comparable) {
        const bool changed = value != previous;
        if (!remount && !changed) return;
        if (auto* node = document_->GetElementById(target)) {
            node->SetInnerRML(value);
            if (changed && comparable && !previous.empty() && !session_.previewing() && !previewing_) {
                node->SetClass("value-change", false);
                node->SetClass("value-change", true);
            }
        }
        previous = value;
    };
    updateValues("site-stats", stats, lastStats_, sameRegion);
    updateValues("practice-values", values, lastPracticeValues_, sameRegion && selectedCard_ == selection_.card);
}

void View::refresh()
{
    const auto* snapshot = session_.opening() ? nullptr : session_.displayed();
    if (session_.error() != lastError_) {
        lastError_ = session_.error();
        if (!lastError_.empty()) notify(lastError_, true);
    }
    if (!pendingAction_.empty() && !session_.busy()) {
        if (session_.generation() != pendingGeneration_) {
            if (pendingAction_ == "reform") {
                selection_.card.reset();
                selection_.destination.reset();
                show(element("reform-dialog"), false);
                dialogClosedAt_ = 0;
                notify("Practice Reform complete. Updating the forecast.");
            } else {
                notify("Decision recorded.");
            }
        }
        pendingAction_.clear();
    }
    if (revision_ != session_.viewRevision() || opening_ != session_.opening() || busy_ != session_.busy() ||
        previewing_ != session_.previewing() || selectedRegion_ != selection_.region ||
        selectedCard_ != selection_.card || staged_ != selection_.destination) {
        if (selectedRegion_ != selection_.region && snapshot && !selection_.region.empty()) {
            const auto chosen = std::ranges::find(snapshot->regions, selection_.region, &Region::id);
            if (chosen != snapshot->regions.end())
                map_.focus(session_.shapes()[static_cast<std::size_t>(chosen - snapshot->regions.begin())].label);
        }
        refreshPanel(snapshot);
        refreshMarkers(snapshot);
        revision_ = session_.viewRevision();
        opening_ = session_.opening();
        busy_ = session_.busy();
        previewing_ = session_.previewing();
        selectedRegion_ = selection_.region;
        selectedCard_ = selection_.card;
        staged_ = selection_.destination;
        const auto clock = snapshot ? "Year " + number(snapshot->year) + "  ·  " +
            number(snapshot->prestige) + " Prestige" : "";
        if (clock != currentClock_) {
            currentClock_ = clock;
            bindings_.DirtyVariable("clock");
        }
        element("timegraph").SetClass("preview", previewing_);
        element("live").SetClass("on", !previewing_);
        element("live").SetClass("primary", previewing_);
        element("live").SetInnerRML(previewing_ ? "Back to Live" : "Live");
        element("new-game").SetClass("busy", busy_);
        element("new-game").SetClass("disabled", busy_);
        element("new-game").SetAttribute("data-help", busy_ ? "A decision is being applied." : "Start a fresh run with the current seed.");
    }
    if (map_.animate(now_, reduced_) || markersDirty_) {
        positionMarkers();
        markersDirty_ = false;
    }
    const bool loading = session_.opening() || !session_.displayed();
    if (loading != loadingVisible_) {
        show(element("opening"), loading);
        if (!loading) map_.reveal(now_);
        loadingVisible_ = loading;
    }
    const auto& chart = session_.chart();
    const bool scrubEnabled = !loading && !busy_ && chart.through.has_value();
    element("plot").SetClass("unavailable", !scrubEnabled);
    const auto coverage = session_.coverage();
    const bool forecasting = coverage && (coverage->completion == timegraph::Completion::running ||
        chart.through != coverage->publishedThrough);
    const auto percentage = coverage && chart.through && coverage->target > coverage->start
        ? std::clamp(static_cast<double>(*chart.through - coverage->start) /
            static_cast<double>(coverage->target - coverage->start), 0., 1.) * 100 : 0;
    if (loading) {
        const auto progress = number(percentage, 1) + "%";
        if (progress != currentProgress_) {
            currentProgress_ = progress;
            bindings_.DirtyVariable("progress");
        }
    }
    std::string status;
    if (loading && !session_.error().empty()) status = session_.error();
    else if (const auto requested = session_.requested()) {
        const auto label = *requested < session_.liveSnapshot()->second ? "History preview · " : "Forecast preview · ";
        status = label + std::to_string(*requested) + " s";
        if (!session_.previewReady()) status += " · Restoring";
        else if (forecasting) status += " · Forecast " + number(percentage) + "%";
    }
    else if (session_.busy() && !loading) status = pendingAction_ == "reform" ? "Applying reform" : "Applying decision";
    else if (forecasting) status = (loading ? "" : "Live · ") + std::string("Forecasting ") +
        (percentage < 1 ? "<1" : number(percentage)) + "%";
    else if (chart.through) status = "Live · " + std::to_string(session_.liveSnapshot()->second) + " s";
    else status = "Preparing the forecast";
    if (status != currentStatus_) {
        currentStatus_ = status;
        bindings_.DirtyVariable("status");
    }
    const bool failed = loading && !session_.error().empty();
    if (failed != loadingFailed_) {
        element("loading-title").SetInnerRML(failed ? "Could not open the run" : "Preparing the forecast");
        loadingFailed_ = failed;
    }
    const auto start = chart.through ? std::to_string(chart.start) + " s" : "";
    const auto end = chart.through ? std::to_string(chart.end) + " s" : "";
    if (start != currentAxisStart_) element("axis-start").SetInnerRML(currentAxisStart_ = start);
    if (end != currentAxisEnd_) element("axis-end").SetInnerRML(currentAxisEnd_ = end);
    if (!notice_.empty() && !noticeError_ && now_ >= noticeUntil_) notify("");
    if (dialogClosedAt_ && (reduced_ || now_ - dialogClosedAt_ >= 90)) {
        show(element("reform-dialog"), false);
        dialogClosedAt_ = 0;
    }
    refreshReadout();
    refreshHelp();
}

void View::drawGraph()
{
    if (loadingVisible_) return;
    const auto area = plot();
    const SDL_Rect clip{static_cast<int>(area.x), static_cast<int>(area.y), static_cast<int>(area.w), static_cast<int>(area.h)};
    SDL_SetRenderClipRect(renderer_, &clip);
    colour(renderer_, previewing_ ? Colour{20, 30, 34, 255} : Colour{26, 27, 22, 255});
    SDL_RenderFillRect(renderer_, &area);
    const auto& chart = session_.chart();
    if (!chart.through) {
        SDL_SetRenderClipRect(renderer_, nullptr);
        return;
    }
    const auto end = xAt(*chart.through);
    const auto fill = [&](SDL_FRect rect, Colour ink) {
        colour(renderer_, ink);
        SDL_RenderFillRect(renderer_, &rect);
    };
    const auto height = area.h - 9;
    const auto published = end - area.x;
    fill({area.x, area.y, published, height}, previewing_ ? Colour{31, 48, 56, 255} : Colour{41, 45, 31, 255});
    fill({area.x, area.y + height + 3, area.w, 4}, {67, 61, 48, 255});
    fill({area.x, area.y + height + 3, published, 4}, {186, 155, 96, 255});
    for (int step = 0; step <= 2; ++step) {
        const auto y = area.y + (height - 1) * step / 2.f;
        line(renderer_, {area.x, y}, {area.x + area.w, y},
            previewing_ ? Colour{54, 68, 73, 255} : Colour{68, 65, 49, 255});
    }
    std::array<SDL_FPoint, Chart::width * 2> points;
    std::array<SDL_FRect, Chart::width> ranges;
    int count = 0, rangeCount = 0;
    const auto px = [&](float value) { return area.y + height - 2 - (height - 4) * value / chart.peak; };
    for (std::size_t i = 0; i < chart.population.size(); ++i) {
        const auto& band = chart.population[i];
        if (!band.count) continue;
        const float x = std::min(end, area.x + area.w * static_cast<float>(i) / (Chart::width - 1));
        if (band.low != band.high) ranges[rangeCount++] = {x, px(band.high), 1.f, px(band.low) - px(band.high)};
        points[count++] = {x, px(band.first)};
        if (band.first != band.last) points[count++] = {x, px(band.last)};
    }
    colour(renderer_, previewing_ ? Colour{101, 143, 153, 255} : Colour{116, 145, 103, 255});
    if (rangeCount) SDL_RenderFillRects(renderer_, ranges.data(), rangeCount);
    colour(renderer_, previewing_ ? Colour{155, 203, 211, 255} : Colour{188, 204, 139, 255});
    SDL_RenderLines(renderer_, points.data(), count);
    const auto grip = [&](Second second, Colour ink, bool active) {
        const auto x = xAt(second);
        line(renderer_, {x, area.y}, {x, area.y + area.h}, ink);
        const float size = active && drag_ == Drag::graph ? 16.f : 12.f;
        const auto left = std::clamp(x - size / 2, area.x, area.x + area.w - size);
        const auto y = area.y + height - 3;
        fill({left, y, size, 12}, {20, 22, 18, 255});
        fill({left + 1, y + 1, size - 2, 10}, ink);
        for (int offset : {-2, 1}) fill({left + size / 2 + offset, y + 3, 1, 6}, {53, 52, 39, 255});
    };
    if (const auto* live = session_.liveSnapshot()) grip(live->second, {236, 196, 118, 255}, !previewing_);
    if (const auto requested = session_.requested()) grip(*requested, {162, 216, 232, 255}, true);
    if (hoverSecond_ && drag_ != Drag::graph) {
        const auto x = xAt(*hoverSecond_);
        line(renderer_, {x, area.y}, {x, area.y + height}, {144, 151, 126, 255});
    }
    SDL_SetRenderClipRect(renderer_, nullptr);
}

void View::prepareFrame()
{
    now_ = SDL_GetTicks();
    refresh();
    context_.Update();
}

void View::drawFrame()
{
    SDL_SetRenderClipRect(renderer_, nullptr);
    colour(renderer_, {22, 24, 20, 255});
    SDL_RenderClear(renderer_);
    if (const auto* snapshot = session_.displayed(); snapshot && !session_.opening())
        map_.draw(renderer_, bounds("map"), *snapshot, session_.shapes(), selection_.region, hoveredRegion_,
            drag_ == Drag::map && !moved_, now_, reduced_);
    SDL_SetRenderDrawBlendMode(renderer_, SDL_BLENDMODE_BLEND_PREMULTIPLIED);
    context_.Render();
    SDL_SetRenderDrawBlendMode(renderer_, SDL_BLENDMODE_NONE);
    SDL_SetRenderClipRect(renderer_, nullptr);
    drawGraph();
}

bool View::scrubAt(float x)
{
    if (session_.busy() || session_.opening() || !session_.chart().through) return false;
    selection_.destination.reset();
    return session_.scrub(secondAt(x));
}

Second View::secondAt(float x) const
{
    const auto area = plot();
    const auto& chart = session_.chart();
    const float ratio = std::clamp((x - area.x) / std::max(1.f, area.w), 0.f, 1.f);
    const auto second = chart.start + static_cast<Second>(std::llround(ratio * static_cast<double>(chart.end - chart.start)));
    return std::min(second, chart.through.value_or(chart.start));
}

float View::xAt(Second second) const
{
    const auto area = plot();
    const auto& chart = session_.chart();
    const auto span = std::max<Second>(1, chart.end - chart.start);
    const auto part = std::clamp(second, chart.start, chart.end) - chart.start;
    return area.x + area.w * static_cast<float>(static_cast<double>(part) / static_cast<double>(span));
}

}
