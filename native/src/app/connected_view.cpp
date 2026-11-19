#include "connected_view.hpp"
#include "sdl_asset_file.hpp"

#include <RmlUi/Core/Elements/ElementFormControl.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <utility>

namespace waffle::connected {
namespace {

using Colour = std::array<Uint8, 4>;

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
                   std::string_view classes = "decision")
{
    return "<button class=\"" + std::string(classes) + "\" data-op=\"" + std::string(op) +
        "\" data-id=\"" + escape(id) + "\">" + escape(label) + "</button>";
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
constexpr std::array<Colour, 4> holderInk{{
    {149, 177, 116, 255}, {171, 126, 76, 255}, {106, 112, 83, 255}, {173, 95, 87, 255}}};
constexpr std::array<Colour, 7> terrain{{
    {103, 112, 69, 255}, {92, 91, 88, 255}, {60, 91, 65, 255}, {49, 79, 84, 255},
    {122, 116, 78, 255}, {71, 92, 77, 255}, {78, 85, 69, 255}}};

}

View::View(Rml::Context& context, SDL_Renderer* renderer, Session& session, Selection& selection, Shell& shell,
           Artwork art)
    : context_(context), renderer_(renderer), session_(session), selection_(selection), shell_(shell),
      sprites_(std::move(art.sprites))
{
    if (!Rml::LoadFontFace(WAFFLE_CONNECTED_FONT, "Lato", Rml::Style::FontStyle::Normal,
            Rml::Style::FontWeight::Auto, true))
        throw std::runtime_error("Could not load native UI font");
    auto rml = readAsset(WAFFLE_CONNECTED_RML);
    constexpr std::string_view marker = "<!-- atlas styles -->";
    rml.replace(rml.find(marker), marker.size(), art.css);
    rml.insert(rml.find("</body>"),
        "<div style=\"position:absolute;width:1px;height:1px;decorator:image(card0 fill);\"></div>");
    document_ = context.LoadDocumentFromMemory(rml, "connected.rml");
    if (!document_) throw std::runtime_error("Could not load the connected view");
    document_->AddEventListener(Rml::EventId::Click, this);
    document_->Show();
#if defined(__ANDROID__)
    element("safe-content").SetClass("touch", true);
#endif
    syncWindow();
}

View::~View()
{
    document_->RemoveEventListener(Rml::EventId::Click, this);
}

SDL_FRect View::bounds(const char* id) const
{
    auto& node = element(id);
    const auto offset = node.GetAbsoluteOffset(Rml::BoxArea::Content);
    const auto size = node.GetBox().GetSize();
    return {offset.x, offset.y, size.x, size.y};
}

SDL_FRect View::plot() const { return bounds("plot"); }

void View::syncWindow()
{
    int width = 0, height = 0;
    SDL_GetRenderOutputSize(renderer_, &width, &height);
    if (width <= 0 || height <= 0) return;
    context_.SetDimensions({width, height});
    const auto window = SDL_GetRenderWindow(renderer_);
#if defined(__ANDROID__)
    density_ = std::max(1.f, SDL_GetWindowDisplayScale(window));
#else
    density_ = std::clamp(std::min(width / 1120.f, height / 640.f), .73f, 1.5f);
#endif
    context_.SetDensityIndependentPixelRatio(density_);
    SDL_Rect safe{};
    SDL_FPoint start{}, end{static_cast<float>(width), static_cast<float>(height)};
    if (SDL_GetWindowSafeArea(window, &safe) && safe.w > 0 && safe.h > 0) {
        SDL_RenderCoordinatesFromWindow(renderer_, static_cast<float>(safe.x), static_cast<float>(safe.y),
            &start.x, &start.y);
        SDL_RenderCoordinatesFromWindow(renderer_, static_cast<float>(safe.x + safe.w),
            static_cast<float>(safe.y + safe.h), &end.x, &end.y);
    }
    auto& root = element("safe-content");
    root.SetProperty("left", number(start.x) + "px");
    root.SetProperty("top", number(start.y) + "px");
    root.SetProperty("width", number(end.x - start.x) + "px");
    root.SetProperty("height", number(end.y - start.y) + "px");
    markersDirty_ = true;
    context_.Update();
}

void View::refreshShell()
{
    if (shellRevision_ == shell_.revision()) return;
    shellRevision_ = shell_.revision();
    const auto screen = shell_.screen();
    const bool game = screen == Screen::game;
    element("shell").SetProperty("display", game ? "none" : "block");
    element("play").SetProperty("display", game || screen == Screen::save ? "block" : "none");
    if (game) {
        element("shell-panel").SetInnerRML("");
        return;
    }
    std::string html;
    if (screen == Screen::title) {
        html = "<h1 class=\"shell-title\">Laughing Waffle</h1>"
            "<label class=\"shell-field\" for=\"seed\">Seed (optional)</label>"
            "<input id=\"seed\" class=\"seed-input\" type=\"text\" maxlength=\"10\" value=\"" +
            escape(shell_.seedInput()) + "\" />";
        html += "<div class=\"shell-actions\">" + button("start", {}, "New Game", "primary");
        html += shell_.latest() ? button("continue", {}, "Continue") : "<button disabled>Continue</button>";
        html += button("load", {}, "Load") + "</div>";
    } else {
        const bool saving = screen == Screen::save;
        html = saving ? "<h2 class=\"shell-title\">Save Game</h2>" : "<h2 class=\"shell-title\">Load Game</h2>";
        for (const auto& row : shell_.list()) {
            const auto index = static_cast<int>(row.slot);
            if (saving && row.slot == Slot::autosave) continue;
            const auto name = index ? "Slot " + std::to_string(index) : "Autosave";
            html += "<div class=\"slot\"><div class=\"slot-info\"><div class=\"slot-name\">" + name +
                "</div><p class=\"quiet\">";
            if (const auto& meta = row.metadata) {
                html += "Year " + number(meta->year) + " · " + std::to_string(meta->second) + " s · " +
                    std::to_string(meta->regions) + " regions<br/>" + escape(meta->savedAt) + " · " + escape(meta->version);
            } else html += row.error.empty() ? "Empty" : escape(row.error);
            html += "</p></div>";
            if (saving || row.metadata) {
                const auto label = saving ? (shell_.overwrite() == row.slot ? "Overwrite" : "Save") : "Load";
                html += button("slot", std::to_string(index), label, "slot-action");
            }
            html += "</div>";
        }
        html += "<div class=\"shell-actions\">" + button(saving ? "back-game" : "back-title", {}, "Back") + "</div>";
    }
    if (!shell_.message().empty()) html += "<p class=\"shell-status\">" + escape(shell_.message()) + "</p>";
    element("shell-panel").SetInnerRML(html);
    markersDirty_ = true;
}

SDL_FPoint View::project(Point p, SDL_FRect map) const
{
    return {map.x + map.w * (.5f + static_cast<float>(p[0] - .5) * zoom_ * .94f) + pan_.x,
        map.y + map.h * (.47f + static_cast<float>(p[1] - .5) * zoom_ * .84f) + pan_.y};
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
        auto a = project(polygon.back(), map);
        for (const auto& vertex : polygon) {
            const auto b = project(vertex, map);
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
        const auto map = bounds("map");
        const auto& shapes = session_.shapes();
        for (std::size_t i = 0; i < shapes.size(); ++i) {
            const auto& region = snapshot->regions[i];
            const auto point = project(shapes[i].label, map);
            if (!contains(map, point)) continue;
            const bool selected = region.id == selection_.region;
            markup += "<div class=\"marker " + std::string(holderClass[static_cast<std::size_t>(region.holder)]) +
                (selected ? " selected" : "") + "\" style=\"left:" + number(point.x - map.x) +
                "px;top:" + number(point.y - map.y) + "px;\">";
            if (region.id == snapshot->capital) markup += "* ";
            markup += escape(region.id);
            if (selected && region.hasSite) markup += " · " + number(region.population);
            markup += "</div>";
        }
    }
    element("markers").SetInnerRML(markup);
}

void View::refreshPanel(const Snapshot* snapshot)
{
    if (!snapshot) {
        element("panel").SetInnerRML("");
        return;
    }
    std::string html;
    const auto* site = selection_.selected(snapshot);
    const bool editable = canStage(*snapshot, site);
    if (!site) {
        html = "<h2>Settlements</h2><p class=\"quiet rule\">Select a region to view its settlement.</p>";
    } else {
        const auto holder = static_cast<std::size_t>(site->holder);
        constexpr std::array holders{"Your holding", "Crown holding", "Unheld", "Creep"};
        html = "<h2>" + escape(site->name) + "</h2><p class=\"quiet\">" + holders[holder];
        if (site->hasSite) html += " · " + escape(site->settlement);
        html += "</p>";
        if (site->hasSite)
            html += "<p class=\"rule\">" + number(site->population) + " residents &nbsp; · &nbsp; " +
                number(site->food, 1) + " Food &nbsp; · &nbsp; " + number(site->currency, 1) + " Currency</p>";
        if (site->detailed) {
            html += "<div id=\"board\">";
            for (std::size_t i = 0; i < site->cards.size(); ++i) {
                auto shown = i;
                if (editable && selection_.card && selection_.destination) {
                    const auto from = *selection_.card, to = *selection_.destination;
                    if (i == to) shown = from;
                    else if (from < to && i >= from && i < to) shown = i + 1;
                    else if (from > to && i > to && i <= from) shown = i - 1;
                }
                const auto& card = site->cards[shown];
                const bool placed = !card.id.empty();
                html += "<button class=\"card";
                if (!placed) html += " empty";
                if (selection_.card == shown) html += " chosen";
                if (selection_.destination == i) html += " staged";
                html += "\" data-op=\"card\" data-id=\"" + std::to_string(shown) + "\">";
                if (const auto art = sprites_.find(card.id); art != sprites_.end())
                    html += "<div class=\"card-art\" style=\"decorator:image(" + art->second + " fill);\"></div>";
                html += "<div class=\"card-name\">" + escape(placed ? card.name : card.locked ? "Locked" : "Empty") +
                    "</div></button>";
            }
            html += "</div>";
            if (selection_.card && !site->cards[*selection_.card].id.empty()) {
                const auto& card = site->cards[*selection_.card];
                html += "<div id=\"inspector\"><h2>" + escape(card.name) + "</h2><p class=\"quiet\">" +
                    escape(card.quality) + " · " + escape(card.mode);
                if (!card.tags.empty()) html += " · " + escape(card.tags);
                html += "</p><p class=\"rule\">" + escape(card.rule) + "</p>";
                if (card.workerCapacity > 0) html += "<p class=\"quiet rule\">Worker capacity " + number(card.workerCapacity) + "</p>";
                if (card.stock) html += "<p class=\"quiet rule\">Stock " + number(*card.stock, 1) + "</p>";
                if (card.mode == "Charge") html += "<p class=\"quiet rule\">Charge " + number(card.charge, 1) + "</p>";
                if (editable) {
                    if (selection_.destination) {
                        html += "<p class=\"gold rule\">Move to slot " + std::to_string(*selection_.destination + 1);
                        if (snapshot->shopSeconds) html += " · " + std::to_string(*snapshot->shopSeconds) + " s";
                        html += "</p>";
                        html += button("confirm", {}, "Confirm", "decision primary") + button("undo", {}, "Undo");
                    } else {
                        for (const int step : {-1, 1}) {
                            const auto next = static_cast<int>(*selection_.card) + step;
                            if (next >= 0 && next < static_cast<int>(site->cards.size()) && !site->cards[next].locked)
                                html += button("stage", std::to_string(next), step < 0 ? "Move left" : "Move right");
                        }
                    }
                }
                html += "</div>";
            }
        } else if (site->hasSite) {
            html += "<p class=\"quiet rule\">Market settlement</p>";
        }
    }
    if (!session_.previewing() && !session_.busy()) {
        const auto& choices = snapshot->choices;
        if (!choices.empty() && choices.front().kind != Decision::reorder) {
            constexpr std::array labels{"Choose a Vassal", "Choose a Commission", "Life Map", "Practice Reform", "", ""};
            const auto label = std::string_view(labels[static_cast<std::size_t>(choices.front().kind)]);
            if (!label.empty()) html += "<p class=\"quiet rule\">" + std::string(label) + "</p>";
            for (std::size_t i = 0; i < choices.size(); ++i) html += button("choice", std::to_string(i), choices[i].label);
        } else if (editable && !selection_.card) {
            html += "<p class=\"quiet rule\">Practice Reform · Select a Practice to reorder it.</p>";
        }
    }
    const auto scroll = element("panel").GetScrollTop();
    element("panel").SetInnerRML(html);
    if (selectedRegion_ == selection_.region) element("panel").SetScrollTop(scroll);
}

void View::refresh()
{
    refreshShell();
    if (shell_.screen() == Screen::title || shell_.screen() == Screen::load) return;
    const auto* snapshot = session_.opening() ? nullptr : session_.displayed();
    if (revision_ != session_.viewRevision() || opening_ != session_.opening() || busy_ != session_.busy() ||
        previewing_ != session_.previewing() || selectedRegion_ != selection_.region ||
        selectedCard_ != selection_.card || staged_ != selection_.destination) {
        refreshPanel(snapshot);
        markersDirty_ = true;
        revision_ = session_.viewRevision();
        opening_ = session_.opening();
        busy_ = session_.busy();
        previewing_ = session_.previewing();
        selectedRegion_ = selection_.region;
        selectedCard_ = selection_.card;
        staged_ = selection_.destination;
        const auto clock = snapshot ? "Year " + number(snapshot->year) + " &nbsp; · &nbsp; " +
            number(snapshot->prestige) + " Prestige" : "";
        element("clock").SetInnerRML(clock);
    }
    if (markersDirty_) {
        refreshMarkers(snapshot);
        markersDirty_ = false;
    }
    const bool loading = session_.opening() || !session_.displayed();
    const auto setDisabled = [&](const char* id, bool disabled) {
        auto& button = element(id);
        if (disabled == button.HasAttribute("disabled")) return;
        if (disabled) button.SetAttribute("disabled", "");
        else button.RemoveAttribute("disabled");
    };
    setDisabled("save-game", session_.busy() || !session_.liveSnapshot());
    setDisabled("title-game", session_.busy());
    if (loading != loadingVisible_) {
        element("opening").SetProperty("display", loading ? "block" : "none");
        loadingVisible_ = loading;
    }
    const auto& chart = session_.chart();
    std::string status;
    if (!session_.error().empty()) status = session_.error();
    else if (const auto requested = session_.requested()) {
        const auto label = *requested < session_.liveSnapshot()->second ? "History preview · " : "Forecast preview · ";
        status = (session_.previewReady() ? label : "Restoring · ") + std::to_string(*requested) + " s";
    }
    else if (session_.busy() && !loading) status = "Applying decision";
    else if (!shell_.message().empty() && shell_.screen() == Screen::game) status = shell_.message();
    else if (chart.through) status = "Forecast through " + std::to_string(*chart.through) + " s";
    else if (!loading) status = "Preparing the forecast";
    if (status != currentStatus_) {
        element("graph-status").SetInnerRML(escape(status));
        element("loading-status").SetInnerRML(escape(status));
        currentStatus_ = status;
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
}

void View::drawMap(const Snapshot& snapshot)
{
    const auto map = bounds("map");
    const SDL_Rect clip{static_cast<int>(map.x), static_cast<int>(map.y), static_cast<int>(map.w), static_cast<int>(map.h)};
    SDL_SetRenderClipRect(renderer_, &clip);
    colour(renderer_, {36, 55, 54, 255});
    SDL_RenderFillRect(renderer_, &map);
    const auto& shapes = session_.shapes();
    std::vector<SDL_Vertex> fill;
    std::vector<int> indices;
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto& region = snapshot.regions[i];
        const auto& shape = shapes[i];
        const auto base = static_cast<int>(fill.size());
        auto ink = terrain.at(region.biome);
        const auto allegiance = holderInk[static_cast<std::size_t>(region.holder)];
        for (int channel = 0; channel < 3; ++channel)
            ink[channel] = static_cast<Uint8>((ink[channel] * 2 + allegiance[channel]) / 3);
        const SDL_FColor tint{ink[0] / 255.f, ink[1] / 255.f, ink[2] / 255.f, 1};
        fill.push_back({project(shape.label, map), tint, {}});
        for (const auto& corner : shape.outline) fill.push_back({project(corner, map), tint, {}});
        const auto count = static_cast<int>(shape.outline.size());
        for (int j = 0; j < count; ++j) {
            indices.push_back(base);
            indices.push_back(base + j + 1);
            indices.push_back(base + (j + 1) % count + 1);
        }
    }
    SDL_RenderGeometry(renderer_, nullptr, fill.data(), static_cast<int>(fill.size()), indices.data(), static_cast<int>(indices.size()));
    std::vector<SDL_FPoint> outline;
    const auto drawOutline = [&](std::size_t i, Colour ink) {
        outline.clear();
        for (const auto& vertex : shapes[i].outline) outline.push_back(project(vertex, map));
        if (outline.empty()) return;
        outline.push_back(outline.front());
        colour(renderer_, ink);
        SDL_RenderLines(renderer_, outline.data(), static_cast<int>(outline.size()));
    };
    for (std::size_t i = 0; i < shapes.size(); ++i) drawOutline(i, {40, 49, 40, 255});
    for (const auto& [a, b] : snapshot.roads)
        line(renderer_, project(shapes[a].label, map), project(shapes[b].label, map), {193, 163, 103, 255});
    for (std::size_t i = 0; i < shapes.size(); ++i)
        if (snapshot.regions[i].id == selection_.region) drawOutline(i, {243, 206, 121, 255});
    SDL_SetRenderClipRect(renderer_, nullptr);
}

void View::drawGraph()
{
    if (session_.opening()) return;
    const auto area = plot();
    colour(renderer_, {25, 27, 22, 255});
    SDL_RenderFillRect(renderer_, &area);
    const auto& chart = session_.chart();
    if (!chart.through) return;
    const auto span = static_cast<double>(chart.end - chart.start);
    const auto end = area.x + area.w * static_cast<float>(static_cast<double>(*chart.through - chart.start) / span);
    for (int step = 0; step <= 2; ++step) {
        const auto y = area.y + (area.h - 1) * step / 2.f;
        line(renderer_, {area.x, y}, {area.x + area.w, y}, {64, 59, 44, 255});
    }
    std::array<SDL_FPoint, Chart::width * 2> points;
    int count = 0;
    const auto px = [&](float value) { return area.y + area.h - 2 - (area.h - 4) * value / chart.peak; };
    for (std::size_t i = 0; i < chart.population.size(); ++i) {
        const auto& band = chart.population[i];
        if (!band.count) continue;
        const float x = std::min(end, area.x + area.w * static_cast<float>(i) / (Chart::width - 1));
        if (band.low != band.high) line(renderer_, {x, px(band.low)}, {x, px(band.high)}, {116, 145, 103, 255});
        points[count++] = {x, px(band.first)};
        if (band.first != band.last) points[count++] = {x, px(band.last)};
    }
    colour(renderer_, {167, 188, 128, 255});
    SDL_RenderLines(renderer_, points.data(), count);
    const auto x = [&](Second second) {
        return area.x + area.w * static_cast<float>(std::clamp(static_cast<double>(second - chart.start) / span, 0., 1.));
    };
    if (const auto* live = session_.liveSnapshot()) {
        const auto liveX = x(live->second);
        line(renderer_, {liveX, area.y}, {liveX, area.y + area.h}, {184, 148, 89, 255});
    }
    if (const auto requested = session_.requested()) {
        const auto cursor = x(*requested);
        line(renderer_, {cursor, area.y}, {cursor, area.y + area.h}, {245, 221, 152, 255});
    }
}

void View::frame()
{
    refresh();
    context_.Update();
    SDL_SetRenderClipRect(renderer_, nullptr);
    colour(renderer_, {23, 26, 22, 255});
    SDL_RenderClear(renderer_);
    const auto screen = shell_.screen();
    if (const auto* snapshot = session_.displayed(); snapshot && !session_.opening() &&
        (screen == Screen::game || screen == Screen::save)) drawMap(*snapshot);
    context_.Render();
    SDL_SetRenderClipRect(renderer_, nullptr);
    if (screen == Screen::game) drawGraph();
}

bool View::scrubAt(float x)
{
    const auto area = plot();
    if (area.w <= 0) return false;
    const auto& chart = session_.chart();
    const float ratio = std::clamp((x - area.x) / area.w, 0.f, 1.f);
    selection_.destination.reset();
    return session_.scrub(chart.start + static_cast<Second>(std::llround(ratio * static_cast<double>(chart.end - chart.start))));
}

bool View::input(SDL_Event event)
{
    if (event.type == SDL_EVENT_QUIT || event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED) return false;
    if (event.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED || event.type == SDL_EVENT_WINDOW_SAFE_AREA_CHANGED ||
        event.type == SDL_EVENT_WINDOW_DISPLAY_SCALE_CHANGED) syncWindow();
    if (event.type == SDL_EVENT_WINDOW_FOCUS_LOST) cancelInput();
    if (event.type == SDL_EVENT_TEXT_INPUT) context_.ProcessTextInput(event.text.text);
    if (event.type == SDL_EVENT_KEY_DOWN) {
        const bool editing = context_.GetFocusElement() == document_->GetElementById("seed") &&
            shell_.screen() == Screen::title;
        if (event.key.key == SDLK_ESCAPE) {
            if (shell_.screen() == Screen::save) shell_.show(Screen::game);
            else if (shell_.screen() == Screen::load) shell_.show(Screen::title);
            else if (editing) element("seed").Blur();
            else return false;
        } else if (editing) {
            using namespace Rml::Input;
            if (event.key.key == SDLK_RETURN || event.key.key == SDLK_KP_ENTER) startFromSeed();
            const int modifiers = (event.key.mod & SDL_KMOD_CTRL ? KM_CTRL : 0) |
                (event.key.mod & SDL_KMOD_SHIFT ? KM_SHIFT : 0);
            switch (event.key.key) {
                case SDLK_BACKSPACE: context_.ProcessKeyDown(KI_BACK, modifiers); break;
                case SDLK_DELETE: context_.ProcessKeyDown(KI_DELETE, modifiers); break;
                case SDLK_LEFT: context_.ProcessKeyDown(KI_LEFT, modifiers); break;
                case SDLK_RIGHT: context_.ProcessKeyDown(KI_RIGHT, modifiers); break;
                case SDLK_HOME: context_.ProcessKeyDown(KI_HOME, modifiers); break;
                case SDLK_END: context_.ProcessKeyDown(KI_END, modifiers); break;
                case SDLK_A: context_.ProcessKeyDown(KI_A, modifiers); break;
                default: break;
            }
        }
    }
    switch (event.type) {
        case SDL_EVENT_FINGER_DOWN:
        case SDL_EVENT_FINGER_MOTION:
        case SDL_EVENT_FINGER_UP:
        case SDL_EVENT_FINGER_CANCELED:
            if (SDL_ConvertEventToRenderCoordinates(renderer_, &event)) touch(event.tfinger);
            break;
        case SDL_EVENT_MOUSE_MOTION:
        case SDL_EVENT_MOUSE_BUTTON_DOWN:
        case SDL_EVENT_MOUSE_BUTTON_UP:
        case SDL_EVENT_MOUSE_WHEEL:
            if (!primary_ && !secondary_ && SDL_ConvertEventToRenderCoordinates(renderer_, &event)) pointer(event);
            break;
        default: break;
    }
    return true;
}

void View::cancelInput()
{
    primary_.reset();
    secondary_.reset();
    drag_ = Drag::none;
    context_.ProcessMouseLeave();
    context_.ProcessMouseButtonUp(0, 0);
}

void View::zoomMap(float factor, SDL_FPoint from, SDL_FPoint to)
{
    const auto map = bounds("map");
    const auto old = zoom_;
    zoom_ = std::clamp(zoom_ * factor, 1.f, 3.5f);
    const float ratio = zoom_ / old;
    const SDL_FPoint center{map.x + map.w * .5f, map.y + map.h * .47f};
    pan_.x = pan_.x * ratio + to.x - center.x - (from.x - center.x) * ratio;
    pan_.y = pan_.y * ratio + to.y - center.y - (from.y - center.y) * ratio;
    markersDirty_ = true;
}

void View::touch(const SDL_TouchFingerEvent& event)
{
    const SDL_FPoint point{event.x, event.y};
    const auto send = [&](Uint32 type) {
        SDL_Event mouse{};
        mouse.type = type;
        if (type == SDL_EVENT_MOUSE_MOTION) {
            mouse.motion.x = point.x;
            mouse.motion.y = point.y;
        } else {
            mouse.button.button = SDL_BUTTON_LEFT;
            mouse.button.x = point.x;
            mouse.button.y = point.y;
        }
        pointer(mouse);
    };
    if (event.type == SDL_EVENT_FINGER_DOWN) {
        if (!primary_ && !secondary_) {
            primary_ = Finger{event.fingerID, point};
            touchStart_ = point;
            scrolling_ = false;
            scrollId_ = shell_.screen() == Screen::game ? "panel" : "shell-panel";
            if (!contains(bounds(scrollId_), point)) scrollId_ = nullptr;
            send(SDL_EVENT_MOUSE_BUTTON_DOWN);
        } else if (primary_ && !secondary_ && drag_ == Drag::map && contains(bounds("map"), point)) {
            secondary_ = Finger{event.fingerID, point};
            drag_ = Drag::pinch;
        }
        return;
    }

    auto* finger = primary_ && primary_->id == event.fingerID ? &primary_ :
        secondary_ && secondary_->id == event.fingerID ? &secondary_ : nullptr;
    if (!finger) return;
    if (event.type == SDL_EVENT_FINGER_CANCELED) {
        cancelInput();
        return;
    }
    if (event.type == SDL_EVENT_FINGER_UP) {
        if (drag_ == Drag::pinch) {
            finger->reset();
            if (secondary_) primary_ = std::exchange(secondary_, {});
            last_ = primary_->point;
            moved_ = true;
            drag_ = Drag::map;
        } else {
            if (!scrolling_) send(SDL_EVENT_MOUSE_BUTTON_UP);
            primary_.reset();
        }
        return;
    }
    if (primary_ && secondary_) {
        const auto midpoint = [&] {
            return SDL_FPoint{(primary_->point.x + secondary_->point.x) / 2, (primary_->point.y + secondary_->point.y) / 2};
        };
        const auto distance = [&] {
            return std::hypot(primary_->point.x - secondary_->point.x, primary_->point.y - secondary_->point.y);
        };
        const auto from = midpoint();
        const auto before = distance();
        (*finger)->point = point;
        if (before > 1) zoomMap(distance() / before, from, midpoint());
        return;
    }

    if (!scrolling_ && scrollId_) {
        auto& target = element(scrollId_);
        const auto dy = std::abs(point.y - touchStart_.y);
        if (target.GetScrollHeight() > target.GetClientHeight() && dy > 8 * density_ &&
            dy > std::abs(point.x - touchStart_.x)) {
            context_.ProcessMouseLeave();
            context_.ProcessMouseButtonUp(0, 0);
            drag_ = Drag::none;
            scrolling_ = true;
        }
    }
    if (scrolling_) {
        auto& target = element(scrollId_);
        target.SetScrollTop(target.GetScrollTop() + primary_->point.y - point.y);
    } else send(SDL_EVENT_MOUSE_MOTION);
    primary_->point = point;
}

void View::pointer(const SDL_Event& event)
{
    const bool game = shell_.screen() == Screen::game;
    if (event.type == SDL_EVENT_MOUSE_MOTION) {
        const SDL_FPoint point{event.motion.x, event.motion.y};
        if (drag_ == Drag::graph) scrubAt(point.x);
        else if (drag_ == Drag::map) {
            moved_ |= std::hypot(point.x - pressed_.x, point.y - pressed_.y) > 4 * density_;
            if (moved_) {
                pan_.x += point.x - last_.x;
                pan_.y += point.y - last_.y;
                markersDirty_ = true;
            }
            last_ = point;
        } else {
            if (drag_ == Drag::card) moved_ |= std::hypot(point.x - pressed_.x, point.y - pressed_.y) > 4 * density_;
            context_.ProcessMouseMove(static_cast<int>(point.x), static_cast<int>(point.y), 0);
        }
    }
    if ((event.type == SDL_EVENT_MOUSE_BUTTON_DOWN || event.type == SDL_EVENT_MOUSE_BUTTON_UP) &&
        event.button.button == SDL_BUTTON_LEFT) {
        const SDL_FPoint point{event.button.x, event.button.y};
        if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN) {
            if (game && contains(plot(), point) && !session_.opening()) {
                drag_ = Drag::graph;
                scrubAt(point.x);
            } else if (game && contains(bounds("map"), point) && !session_.opening()) {
                drag_ = Drag::map;
                pressed_ = last_ = point;
                moved_ = false;
            } else {
                const auto* snapshot = session_.displayed();
                if (const auto slot = game ? cardAt(point) : std::nullopt;
                    slot && snapshot && canStage(*snapshot, selection_.selected(snapshot))) {
                    auto* card = element("board").GetChild(static_cast<int>(*slot));
                    draggedCard_ = card->GetAttribute<int>("data-id", static_cast<int>(*slot));
                    if (!selection_.selected(snapshot)->cards[draggedCard_].id.empty()) {
                        drag_ = Drag::card;
                        pressed_ = point;
                        moved_ = false;
                    }
                }
                context_.ProcessMouseMove(static_cast<int>(point.x), static_cast<int>(point.y), 0);
                context_.ProcessMouseButtonDown(0, 0);
            }
        } else {
            if (drag_ == Drag::map && !moved_) {
                if (auto selected = hit(point)) selection_.select(std::move(*selected));
            } else if (drag_ == Drag::graph) scrubAt(point.x);
            else if (drag_ == Drag::card && moved_) {
                context_.ProcessMouseLeave();
                context_.ProcessMouseButtonUp(0, 0);
                const auto* snapshot = session_.displayed();
                if (const auto target = cardAt(point); target && snapshot && canStage(*snapshot, selection_.selected(snapshot))) {
                    auto staged = selection_;
                    if (staged.inspect(snapshot, draggedCard_) && staged.stage(snapshot, *target)) selection_ = std::move(staged);
                }
            }
            else context_.ProcessMouseButtonUp(0, 0);
            drag_ = Drag::none;
        }
    }
    if (event.type == SDL_EVENT_MOUSE_WHEEL && drag_ == Drag::none) {
        const SDL_FPoint point{event.wheel.mouse_x, event.wheel.mouse_y};
        const auto map = bounds("map");
        if (game && contains(map, point)) {
            zoomMap(std::pow(1.16f, event.wheel.y), point, point);
        } else {
            context_.ProcessMouseWheel({-event.wheel.x, -event.wheel.y}, 0);
        }
    }
}

void View::startFromSeed()
{
    const auto& input = static_cast<Rml::ElementFormControl&>(element("seed"));
    shell_.start(input.GetValue());
    zoom_ = 1;
    pan_ = {};
}

void View::ProcessEvent(Rml::Event& event)
{
    auto* target = event.GetTargetElement();
    while (target && !target->HasAttribute("data-op")) target = target->GetParentNode();
    if (!target) return;
    const auto op = target->GetAttribute<Rml::String>("data-op", "");
    const auto id = target->GetAttribute<Rml::String>("data-id", "");
    if (op == "start") startFromSeed();
    else if (op == "continue") {
        shell_.continueGame();
        zoom_ = 1;
        pan_ = {};
    } else if (op == "load") shell_.show(Screen::load);
    else if (op == "save" && session_.liveSnapshot() && !session_.busy()) shell_.show(Screen::save);
    else if (op == "title") shell_.returnToTitle();
    else if (op == "back-game") shell_.show(Screen::game);
    else if (op == "back-title") shell_.show(Screen::title);
    else if (op == "slot") {
        if (shell_.screen() == Screen::load) {
            zoom_ = 1;
            pan_ = {};
        }
        shell_.selectSlot(static_cast<Slot>(std::stoi(id)));
    } else if (op == "live") {
        selection_.destination.reset();
        session_.live();
    } else if (op == "card") {
        selection_.inspect(session_.displayed(), std::stoul(id));
    } else if (op == "stage") {
        selection_.stage(session_.displayed(), std::stoul(id));
    } else if (op == "undo") {
        selection_.destination.reset();
    } else if (op == "confirm" && selection_.card && selection_.destination) {
        if (session_.reorder(selection_.region, *selection_.card, *selection_.destination)) {
            selection_.card.reset();
            selection_.destination.reset();
        }
    } else if (op == "choice" && session_.liveSnapshot()) {
        const auto index = std::stoul(id);
        const auto& view = *session_.liveSnapshot();
        if (index < view.choices.size()) {
            const auto& choice = view.choices[index];
            if (session_.choose(choice) && choice.kind == Decision::enterShop) selection_.select(view.vassalRegion);
        }
    }
}

}
