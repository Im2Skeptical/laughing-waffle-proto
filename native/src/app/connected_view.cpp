#include "connected_view.hpp"
#include "connected_markup.hpp"
#include "sdl_asset_file.hpp"

#include <RmlUi/Core/Elements/ElementFormControl.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <utility>

namespace waffle::connected {
namespace {

using Colour = std::array<Uint8, 4>;

using namespace markup;

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

void show(Rml::Element& element, bool visible)
{
    element.SetProperty("display", visible ? "block" : "none");
}

}

View::View(Rml::Context& context, SDL_Renderer* renderer, Session& session, Selection& selection, Shell& shell,
           Artwork art)
    : context_(context), renderer_(renderer), session_(session), selection_(selection), shell_(shell),
      sprites_(std::move(art.sprites)), map_(std::move(art.map)), crests_(std::move(art.crests))
{
    if (!Rml::LoadFontFace(WAFFLE_CONNECTED_FONT, "Lato", Rml::Style::FontStyle::Normal,
            Rml::Style::FontWeight::Auto, true))
        throw std::runtime_error("Could not load native UI font");
    auto model = context_.CreateDataModel("connected");
    if (!model || !model.Bind("clock", &currentClock_) || !model.Bind("status", &currentStatus_) ||
        !model.Bind("progress", &currentProgress_))
        throw std::runtime_error("Could not bind the connected view");
    bindings_ = model.GetModelHandle();
    auto rml = waffle::readAsset(WAFFLE_CONNECTED_RML);
    constexpr std::string_view styles = "<!-- interaction styles -->";
    std::string directory = WAFFLE_CONNECTED_RML;
    directory.resize(directory.find_last_of('/') + 1);
    rml.replace(rml.find(styles), styles.size(), "<style>" + waffle::readAsset((directory + "interaction.rcss").c_str()) +
        waffle::readAsset((directory + "connected-layout.rcss").c_str()) +
        waffle::readAsset((directory + "connected-settlement.rcss").c_str()) + R"(
        #map-graphics { display: none; position: absolute; z-index: 2; right: 2%; top: 12%; width: 200dp; padding: 10dp; }
        #map-graphics .toggle { display: block; width: 100%; box-sizing: border-box; text-align: left;
            height: 32dp; margin-top: 3dp; }
        </style>)");
    rml.insert(rml.find("    <button id=\"life-toggle\""),
        R"(<button id="graphics" class="toggle" data-op="graphics" aria-expanded="false">Graphics</button>)");
    rml.insert(rml.find("<div id=\"opening\""), R"(
        <div id="map-graphics" class="panel" role="group" aria-label="Map graphics">
            <button id="graphics-fog" class="toggle on" data-op="graphics-fog" aria-pressed="true">Fog On</button>
            <button id="graphics-clouds" class="toggle on" data-op="graphics-clouds" aria-pressed="true">Clouds On</button>
            <button id="graphics-shadows" class="toggle on" data-op="graphics-shadows" aria-pressed="true">Cloud shadows On</button>
            <button id="graphics-wisps" class="toggle on" data-op="graphics-wisps" aria-pressed="true">Wisps On</button>
            <button id="graphics-water" class="toggle on" data-op="graphics-water" aria-pressed="true">Water animation On</button>
        </div>)");
    constexpr std::string_view marker = "<!-- atlas styles -->";
    rml.replace(rml.find(marker), marker.size(), art.css);
    rml.insert(rml.find("</body>"),
        "<div style=\"position:absolute;width:1px;height:1px;decorator:image(card0 fill);\"></div>");
    document_ = context.LoadDocumentFromMemory(rml, "connected.rml");
    if (!document_) throw std::runtime_error("Could not load the connected view");
    element("panel-content").SetInnerRML(
        "<div id=\"settlement-head\"></div><div id=\"settlement-time\"></div>"
        "<div id=\"settlement-scroll\" role=\"tabpanel\"></div>");
#if defined(__ANDROID__)
    document_->SetClass("touch-screen", true);
#endif
    document_->AddEventListener(Rml::EventId::Click, this);
    document_->Show(Rml::ModalFlag::None, Rml::FocusFlag::Document);
    mapHand_.reset(SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_POINTER));
    mapPan_.reset(SDL_CreateSystemCursor(SDL_SYSTEM_CURSOR_MOVE));
    syncWindow();
}

View::~View()
{
    if (mapCursor_) SDL_SetCursor(SDL_GetDefaultCursor());
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
    density_ = std::clamp(std::min(width / 1120.f, height / 640.f), .78f, 1.5f);
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
    if (runRevision_ != shell_.runRevision()) {
        runRevision_ = shell_.runRevision();
        map_.reset();
        crests_.reset();
        resetGraph();
        setLifeOpen(false);
        refreshMarkers(nullptr);
        hoveredRegion_.clear();
        hoverSecond_.reset();
        pendingAction_.clear();
        settlementTab_ = SettlementTab::overview;
        building_.reset();
        settlementDirty_ = true;
        notify("");
    }

    const auto screen = shell_.screen();
    const bool game = screen == Screen::game;
    auto& overlay = element("shell");
    auto& panel = element("shell-panel");
    if (shownScreen_ != screen) {
        if (graphicsOpen_) showGraphics(false);
        if (dialogClosedAt_) {
            show(element("reform-dialog"), false);
            dialogClosedAt_ = 0;
        }
        hoverSecond_.reset();
        hoveredRegion_.clear();
        refreshMapCursor();
        shownScreen_ = screen;
        show(overlay, !game);
        show(element("play"), game || screen == Screen::save);
        overlay.SetClass("over-game", screen == Screen::save);
        panel.SetClass("front-door", screen == Screen::title);
        panel.SetClass("slot-book", screen == Screen::load || screen == Screen::save);
        panel.SetClass("panel", !game);
        const auto* focus = context_.GetFocusElement();
        const bool keyboard = focus && focus != document_ && focus->IsPseudoClassSet("focus-visible");

        std::string html;
        if (screen == Screen::title) {
            std::string mural;
            if (const auto sprite = sprites_.find("titleArtwork"); sprite != sprites_.end())
                mural = " style=\"decorator:image(" + sprite->second + " cover);\"";
            html = "<div class=\"title-mural\"" + mural + "><div class=\"mural-border\"></div></div>"
                "<div class=\"title-menu enter\"><h1>Laughing Waffle</h1>"
                "<p class=\"title-motto\">The empire fell. What will you build?</p>"
                "<div class=\"title-rule\"></div>";

            if (const auto latest = shell_.latest()) {
                const auto& meta = *shell_.list().at(static_cast<std::size_t>(*latest)).metadata;
                html += button("continue", {}, "Continue", "primary menu-choice", "Resume the most recent save.");
                html += "<p class=\"continue-note quiet\">" + std::string(*latest == Slot::autosave ? "Autosave" :
                    "Slot " + std::to_string(static_cast<int>(*latest))) + " · Year " + number(meta.year) +
                    " · " + std::to_string(meta.second) + " s</p>";
            } else {
                html += button("continue", {}, "Continue", "menu-choice", {}, true);
                html += "<p class=\"continue-note quiet\">No saved run yet</p>";
            }
            html += "<div class=\"seed-row\"><label for=\"seed\">World seed</label>"
                "<input id=\"seed\" type=\"text\" maxlength=\"10\" placeholder=\"Random\" "
                "data-help=\"Leave blank to start with a random world seed.\" value=\"" +
                escape(shell_.seedInput()) + "\" /></div><div class=\"shell-actions\">";
            html += button("start", {}, "New Game", shell_.latest() ? "menu-choice" : "primary menu-choice",
                        "Start a new world with the seed above.") +
                button("load", {}, "Load", "menu-choice", "Browse Autosave and the manual slots.") + "</div>"
                "<p id=\"shell-status\" class=\"toast\" role=\"status\"></p></div>";
        } else if (!game) {
            const bool saving = screen == Screen::save;
            html = "<div class=\"slot-page enter\"><div class=\"slot-head\"><h2>" +
                std::string(saving ? "Save Game" : "Load Game") + "</h2>" +
                button(saving ? "back-game" : "back-title", {}, "Back", "slot-action") + "</div><div class=\"slot-list\">";
            for (const auto& row : shell_.list()) {
                const auto index = static_cast<int>(row.slot);
                if (saving && row.slot == Slot::autosave) continue;
                const auto name = index ? "Slot " + std::to_string(index) : "Autosave";
                const bool unavailable = !saving && !row.metadata;
                const bool recent = !saving && shell_.latest() == row.slot;
                const std::string label = saving ? (row.metadata || !row.error.empty() ? "Replace" : "Save") : "Load";
                html += "<div class=\"slot " + std::string(recent ? "latest-slot" : "") +
                    "\"><div class=\"slot-info\"><div class=\"slot-name\">" + name +
                    (recent ? " <span class=\"quiet gold\">· Most recent</span>" : "") + "</div>";
                if (const auto& meta = row.metadata) {
                    html += "<p class=\"quiet\">Year " + number(meta->year) + " · " + std::to_string(meta->second) +
                        " s · " + std::to_string(meta->regions) + " regions</p><p class=\"quiet\">" +
                        escape(meta->savedAt) + " · " + escape(meta->version) + "</p>";
                } else html += row.error.empty() ? "<p class=\"quiet\">Empty</p>" :
                    "<p class=\"error\">" + escape(row.error) + "</p>";
                html += "</div>" + button("slot", std::to_string(index), label, "slot-action",
                    unavailable ? "" : label + " " + name + ".", unavailable) + "</div>";
            }
            html += "</div><p id=\"shell-status\" class=\"toast\" role=\"status\"></p></div>";
        }
        panel.SetInnerRML(html);
        panel.SetScrollTop(0);
        if (game) {
            if (keyboard) element("map").Focus(true);
            else document_->Focus(false);
        }
        else if (auto* first = panel.QuerySelector(screen == Screen::title ?
            (shell_.latest() ? "[data-op=continue]" : "[data-op=start]") : ".slot-head button"))
            first->Focus(keyboard);
        markersDirty_ = true;
    }

    if (game) {
        if (!shell_.message().empty()) notify(shell_.message(), shell_.messageError());
    } else {
        auto& status = element("shell-status");
        status.SetClass("error", shell_.messageError());
        status.SetInnerRML(escape(shell_.message()));
        show(status, !shell_.message().empty());
        notify("");
    }
}

std::optional<std::string> View::hit(SDL_FPoint point) const
{
    const auto* view = session_.displayed();
    if (!view || session_.opening() || shell_.screen() != Screen::game || lifeOpen_ || dialog_) return {};
    const auto map = bounds("map");
    if (!contains(map, point) || contains(bounds("map-tools"), point) || contains(bounds("legend"), point)) return {};
    if (const auto* crest = crests_.hit(point)) return view->regions[crest->region].id;
    for (const auto& [label, index] : markerTargets_)
        if (index < view->regions.size() && contains(label, point)) return view->regions[index].id;
    if (const auto target = map_.hit(point, map, *view, session_.shapes())) return view->regions[target->region].id;
    return {};
}

std::optional<std::size_t> View::cardAt(SDL_FPoint point) const
{
    const auto* board = document_->GetElementById("board");
    if (!board || !contains(bounds("settlement-scroll"), point)) return {};
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

namespace {

std::string regionLabel(const Region& region)
{
    if (region.name.empty()) return region.id;
    constexpr std::pair<std::string_view, std::string_view> directions[] = {
        {"Northwestern ", "NW "}, {"Northeastern ", "NE "},
        {"Southwestern ", "SW "}, {"Southeastern ", "SE "}
    };
    for (const auto& [prefix, abbreviation] : directions)
        if (region.name.starts_with(prefix)) return std::string(abbreviation) + region.name.substr(prefix.size());
    return region.name;
}

}

void View::refreshMarkers(const Snapshot* snapshot)
{
    auto& markers = element("markers");
    if (!snapshot) {
        markerLeaders_.clear();
        markerTargets_.clear();
        markerPositions_.clear();
        if (markers.HasChildNodes()) markers.SetInnerRML("");
        return;
    }
    if (!markers.HasChildNodes()) {
        std::string markup;
        for (const auto& region : snapshot->regions)
            markup += "<div class=\"marker\">" + escape(regionLabel(region)) + "</div>";
        markers.SetInnerRML(markup);
        markerPositions_.assign(snapshot->regions.size(), {-1.f, -1.f});
        markersDirty_ = markerSizesDirty_ = true;
    }
    for (std::size_t i = 0; i < snapshot->regions.size(); ++i) {
        const auto& region = snapshot->regions[i];
        auto& marker = *markers.GetChild(static_cast<int>(i));
        const auto change = [&](const char* name, bool on) {
            if (marker.IsClassSet(name) == on) return false;
            marker.SetClass(name, on);
            return true;
        };
        for (std::size_t holder = 0; holder < holderClass.size(); ++holder) {
            const bool changed = change(holderClass[holder], holder == static_cast<std::size_t>(region.holder));
            if (holder == static_cast<std::size_t>(Holder::player) ||
                holder == static_cast<std::size_t>(Holder::monster)) markersDirty_ |= changed;
        }
        markersDirty_ |= change("selected", region.id == selection_.region);
    }
    markersDirty_ |= crests_.needsLayout(*snapshot, selection_.region);
}

void View::positionMarkers()
{
    auto& markers = element("markers");
    const auto* snapshot = session_.displayed();
    if (!snapshot || !markers.GetNumChildren()) return;
    if (markerSizesDirty_) {
        context_.Update();
        markerSizesDirty_ = false;
    }
    const auto area = bounds("map");
    const auto& shapes = session_.shapes();
    markerLeaders_.clear();
    markerTargets_.clear();
    auto& placed = mapObstacles_;
    placed.clear();
    placed.reserve(markers.GetNumChildren() * 2 + 2);
    placed.push_back(bounds("legend"));
    placed.push_back(bounds("map-tools"));
    crests_.position(map_, area, *snapshot, shapes, selection_.region, hoveredRegion_, density_, placed);
    const auto priority = [&](const Region& region) {
        if (region.id == selection_.region) return 0;
        if (region.id == hoveredRegion_) return 1;
        if (region.id == snapshot->capital || region.holder == Holder::player) return 2;
        return region.holder == Holder::monster ? 3 : 4;
    };
    for (int tier = 0; tier < 5; ++tier) {
        for (int i = 0; i < markers.GetNumChildren(); ++i) {
            const auto index = static_cast<std::size_t>(i);
            const auto& region = snapshot->regions[index];
            if (priority(region) != tier) continue;
            auto& marker = *markers.GetChild(i);
            marker.SetClass("hovered", region.id == hoveredRegion_);
            const auto point = map_.project(shapes[index].label, area);
            const auto size = marker.GetBox().GetSize(Rml::BoxArea::Border);
            const bool pinned = tier < 2;
            const bool inside = contains(area, point);
            bool visible = false;
            if ((inside || pinned) && size.x + 4 < area.w && size.y + 4 < area.h) {
                const float anchorX = std::clamp(point.x - area.x, 2.f, area.w - 2);
                const float anchorY = std::clamp(point.y - area.y, 2.f, area.h - 2);
                const float gap = 7.f * density_;
                const auto place = [&](float offsetX, float offsetY) {
                    const float x = std::clamp(anchorX - size.x / 2 + offsetX, 2.f, area.w - size.x - 2);
                    const float y = std::clamp(anchorY + offsetY, 2.f, area.h - size.y - 2);
                    const float padding = tier < 2 ? 2.f : 4.f * density_;
                    const SDL_FRect box{area.x + x - padding, area.y + y - padding, size.x + 2 * padding, size.y + 2 * padding};
                    if (std::ranges::any_of(placed, [&](const auto& other) { return SDL_HasRectIntersectionFloat(&box, &other); }))
                        return false;
                    auto& previous = markerPositions_[index];
                    if (previous.x != x) marker.SetProperty(Rml::PropertyId::Left, Rml::Property(x, Rml::Unit::PX));
                    if (previous.y != y) marker.SetProperty(Rml::PropertyId::Top, Rml::Property(y, Rml::Unit::PX));
                    previous = {x, y};
                    markerTargets_.emplace_back(SDL_FRect{area.x + x, area.y + y, size.x, size.y}, index);
                    placed.push_back(box);
                    const SDL_FPoint from{area.x + anchorX, area.y + anchorY};
                    const SDL_FPoint to{area.x + std::clamp(anchorX, x, x + size.x),
                        area.y + std::clamp(anchorY, y, y + size.y)};
                    if (pinned && (!inside || std::hypot(from.x - to.x, from.y - to.y) > gap + 2))
                        markerLeaders_.emplace_back(from, to);
                    return true;
                };
                const float above = -size.y - gap;
                visible = place(0, gap) || place(0, above);
                if (pinned && !visible)
                    visible = place(size.x * .45f, gap) || place(-size.x * .45f, gap) ||
                        place(size.x * .45f, above) || place(-size.x * .45f, above);
                if (pinned && !visible) {
                    // The selected and hovered names have first use of every
                    // open strip of the atlas, including when panned offscreen.
                    for (float y = 3; y + size.y < area.h && !visible; y += size.y + 4)
                        visible = place(0, y - anchorY) || place(-anchorX, y - anchorY) ||
                            place(area.w - anchorX, y - anchorY);
                }
            }
            marker.SetClass("occluded", !visible);
        }
    }
}

void View::refresh()
{
    refreshShell();
    if (dialogClosedAt_ && (reduced_ || now_ - dialogClosedAt_ >= 90)) {
        show(element("reform-dialog"), false);
        dialogClosedAt_ = 0;
    }
    if (shell_.screen() == Screen::title || shell_.screen() == Screen::load) {
        return;
    }
    if (const auto* live = session_.liveSnapshot()) map_.prepare(session_.mapGeography(), *live);
    const auto* snapshot = session_.opening() ? nullptr : session_.displayed();
    if (session_.error() != lastError_) {
        lastError_ = session_.error();
        if (!lastError_.empty()) {
            const auto split = lastError_.find(": ");
            if (pendingAction_ == "life" && split != std::string::npos)
                notify(actionReason(lastError_.substr(split + 2)), true);
            else notify(lastError_, true);
        }
    }
    if (!pendingAction_.empty() && !session_.busy()) {
        if (session_.generation() != pendingGeneration_) {
            if (pendingAction_ == "reform") {
                selection_.card.reset();
                selection_.destination.reset();
                show(element("reform-dialog"), false);
                dialogClosedAt_ = 0;
                notify("Practice Reform complete. Updating the forecast.");
            } else if (pendingAction_ == "life") {
                if (lifeActionKind_ == "vassalPurchaseShopOffer") {
                    lifeOffer_.clear();
                    lifeOrigin_.reset();
                }
                notify(lifeFeedback_ + ".");
            } else {
                notify("Decision recorded.");
            }
        }
        pendingAction_.clear();
    }
    if (revision_ != session_.viewRevision() || opening_ != session_.opening() || busy_ != session_.busy() ||
        previewing_ != session_.previewing() || selectedRegion_ != selection_.region ||
        selectedCard_ != selection_.card || staged_ != selection_.destination || settlementDirty_) {
        markerSizesDirty_ |= selectedRegion_.empty() != selection_.region.empty();
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
        if (previewing_ != session_.previewing()) {
            previewing_ = session_.previewing();
            element("timegraph").SetClass("preview", previewing_);
            element("live").SetClass("on", !previewing_);
            element("live").SetClass("primary", previewing_);
            element("live").SetInnerRML(previewing_ ? "Back to Live" : "Live");
        }
        selectedRegion_ = selection_.region;
        selectedCard_ = selection_.card;
        staged_ = selection_.destination;
        const auto clock = snapshot ? "Year " + number(snapshot->year) + "  ·  " +
            number(snapshot->prestige) + " Prestige" : "";
        if (clock != currentClock_) {
            currentClock_ = clock;
            bindings_.DirtyVariable("clock");
        }
    }
    if (snapshot && lifeOpen_) refreshLife(*snapshot);
    if (!lifeOpen_ && (map_.animate(now_, reduced_) || markersDirty_)) {
        positionMarkers();
        markersDirty_ = false;
    }
    const bool loading = session_.opening() || !session_.displayed();
    const auto setDisabled = [&](const char* id, bool disabled) {
        auto& button = element(id);
        if (disabled == button.HasAttribute("disabled")) return;
        if (disabled) button.SetAttribute("disabled", "");
        else button.RemoveAttribute("disabled");
    };
    setDisabled("life-toggle", !snapshot);
    setDisabled("save-game", session_.busy() || !session_.liveSnapshot());
    setDisabled("title-game", session_.busy());
    if (loading != loadingVisible_) {
        show(element("opening"), loading);
        if (!loading) map_.reveal(now_);
        loadingVisible_ = loading;
    }
    const bool failed = loading && !session_.error().empty();
    if (failed != loadingFailed_) {
        element("loading-title").SetInnerRML(failed ? "Could not open the run" : "Preparing the forecast");
        loadingFailed_ = failed;
    }
    if (!notice_.empty() && !noticeError_ && now_ >= noticeUntil_) notify("");
}

void View::prepareFrame()
{
    now_ = SDL_GetTicks();
    refresh();
    // Give a pending restore the rest of the frame's preparatory work to
    // finish. Update the seek labels only after this poll, so a ready snapshot
    // can replace the transient request before those labels trigger layout.
    if (session_.previewing() && !session_.previewReady()) {
        context_.Update();
        const auto revision = session_.viewRevision();
        session_.updatePreview();
        if (session_.viewRevision() != revision) refresh();
    }
    const auto refreshLabels = [&] {
        if (shell_.screen() != Screen::title && shell_.screen() != Screen::load) {
            refreshSettlementTime();
            refreshGraph(loadingVisible_);
            refreshReadout();
        }
        refreshHelp();
        context_.Update();
    };
    refreshLabels();
    // Last chance before drawing: a restore that finished during layout is
    // presented this frame instead of the next. That costs a second layout on
    // the frame where it lands, which is cheaper than a frame of scrub latency.
    if (session_.previewing() && !session_.previewReady()) {
        const auto revision = session_.viewRevision();
        session_.updatePreview();
        if (session_.viewRevision() != revision) {
            refresh();
            refreshLabels();
        }
    }
}

void View::drawFrame()
{
    SDL_SetRenderClipRect(renderer_, nullptr);
    colour(renderer_, {22, 24, 20, 255});
    SDL_RenderClear(renderer_);
    const auto screen = shell_.screen();
    if (const auto* snapshot = session_.displayed(); !lifeOpen_ && snapshot && !session_.opening() &&
        (screen == Screen::game || screen == Screen::save)) {
        const auto mapStart = measureMapDraw_ ? SDL_GetTicksNS() : 0;
        const RegionalMap::Display display{now_, session_.viewRevision(), reduced_, !session_.previewing() && drag_ != Drag::graph, graphics_};
        const bool pressed = drag_ == Drag::map && !moved_ && pressedRegion_ == hoveredRegion_;
        map_.draw(renderer_, bounds("map"), *snapshot, session_.shapes(), selection_.region, hoveredRegion_, pressed, display);
        crests_.draw(renderer_, map_, *snapshot, session_.shapes(), hoveredRegion_, pressed,
            element("map").IsPseudoClassSet("focus-visible"), display);
        if (mapStart) mapDrawMs_ = static_cast<double>(SDL_GetTicksNS() - mapStart) / 1e6;
        for (const auto& [anchor, label] : markerLeaders_)
            line(renderer_, anchor, label, {199, 175, 120, 255});
    }
    if (lifeOpen_ && (screen == Screen::game || screen == Screen::save)) drawLifePaths();
    SDL_SetRenderDrawBlendMode(renderer_, SDL_BLENDMODE_BLEND_PREMULTIPLIED);
    context_.Render();
    SDL_SetRenderDrawBlendMode(renderer_, SDL_BLENDMODE_NONE);
    SDL_SetRenderClipRect(renderer_, nullptr);
    if (screen == Screen::game) drawGraph();
}

}
