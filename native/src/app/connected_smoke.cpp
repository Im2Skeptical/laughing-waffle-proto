#include "connected_smoke.hpp"
#include "connected_view.hpp"
#include "core/sha256.hpp"
#include "sdl_asset_file.hpp"
#include "sim/practice/stock.hpp"
#include "sim/territory/detail.hpp"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <thread>

namespace waffle::connected {
namespace {

void require(bool condition, const char* message)
{
    if (!condition) throw std::runtime_error(message);
}

bool canReorder(const Snapshot& view)
{
    return std::ranges::any_of(view.choices, [](const auto& choice) { return choice.kind == Decision::reorder; });
}

}

struct InteractionProbe {
    View& view;
    const SmokeFrame& present;

    void lifeMap(Session& session, const SaveSlots& store, const std::filesystem::path& shop);
    void settlement(Session& session);
    void crests(Session& session);
    void run(Session& session, const SaveSlots& store);
    void territory(Session& session, const SaveSlots& store, const std::filesystem::path& fixture);
    bool reduced() const { return view.document_->IsClassSet("reduce-motion"); }

    Rml::Element& control(const char* selector)
    {
        auto* element = view.document_->QuerySelector(selector);
        require(element != nullptr, "Interactive control is missing");
        return *element;
    }

    SDL_FPoint center(Rml::Element& element)
    {
        const auto at = element.GetAbsoluteOffset(Rml::BoxArea::Border) +
            element.GetBox().GetSize(Rml::BoxArea::Border) * .5f;
        return {at.x, at.y};
    }

    void pointer(Uint32 type, SDL_FPoint point, bool touch = false)
    {
        SDL_RenderCoordinatesToWindow(view.renderer_, point.x, point.y, &point.x, &point.y);
        SDL_Event event{};
        event.type = type;
        if (type == SDL_EVENT_MOUSE_MOTION) {
            event.motion.x = point.x;
            event.motion.y = point.y;
            event.motion.which = touch ? SDL_TOUCH_MOUSEID : 0;
        } else {
            event.button.button = SDL_BUTTON_LEFT;
            event.button.x = point.x;
            event.button.y = point.y;
            event.button.which = touch ? SDL_TOUCH_MOUSEID : 0;
        }
        require(view.input(event), "Pointer closed the connected view");
    }

    void key(SDL_Keycode keycode, SDL_Keymod modifiers = SDL_KMOD_NONE)
    {
        SDL_Event event{};
        event.type = SDL_EVENT_KEY_DOWN;
        event.key.key = keycode;
        event.key.mod = modifiers;
        require(view.input(event), "Keyboard closed the connected view");
        event.type = SDL_EVENT_KEY_UP;
        require(view.input(event), "Keyboard release closed the connected view");
    }

    void finger(Uint32 type, SDL_FingerID id, SDL_FPoint point)
    {
        int width{}, height{};
        require(SDL_GetWindowSize(SDL_GetRenderWindow(view.renderer_), &width, &height), "Missing touch window size");
        SDL_RenderCoordinatesToWindow(view.renderer_, point.x, point.y, &point.x, &point.y);
        SDL_Event event{};
        event.type = type;
        event.tfinger.fingerID = id;
        event.tfinger.x = point.x / width;
        event.tfinger.y = point.y / height;
        require(view.input(event), "Finger closed the connected view");
    }

    void click(const char* selector, bool touch = false)
    {
        auto& button = control(selector);
        button.ScrollIntoView(Rml::ScrollAlignment::Nearest);
        present(nullptr);
        const auto at = center(button);
        pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, at, touch);
        pointer(SDL_EVENT_MOUSE_BUTTON_UP, at, touch);
        present(nullptr);
    }

    void scrub(Second second, Uint32 type)
    {
        const auto area = view.plot();
        finger(type, 1, {view.xAt(second), area.y + area.h / 2});
    }

    void touchHelp()
    {
        auto& card = control("[data-op=card][data-id='1']");
        card.ScrollIntoView(Rml::ScrollAlignment::Nearest);
        present(nullptr);
        const auto at = center(card);
        finger(SDL_EVENT_FINGER_DOWN, 1, at);
        SDL_Delay(460);
        present(nullptr);
        require(view.longPress_ && !view.currentHelp_.empty(), "Touch hold did not expose Practice help");
        finger(SDL_EVENT_FINGER_UP, 1, at);
        present(nullptr);
    }

    void selectCapital(const Session& session, const Selection& selection)
    {
        const auto& regions = session.displayed()->regions;
        const auto capital = std::ranges::find(regions, session.displayed()->capital, &Region::id);
        require(capital != regions.end(), "Capital marker is missing");
        const auto i = static_cast<std::size_t>(capital - regions.begin());
        const auto point = view.map_.project(session.shapes()[i].label, view.bounds("map"));
        finger(SDL_EVENT_FINGER_DOWN, 1, point);
        finger(SDL_EVENT_FINGER_UP, 1, point);
        pointer(SDL_EVENT_MOUSE_MOTION, {5, 5});
        require(selection.region == capital->id, "Map selection did not open the capital");
    }

    void touchCamera()
    {
        const auto area = view.bounds("map");
        const SDL_FPoint left{area.x + area.w * .35f, area.y + area.h * .4f};
        const SDL_FPoint right{area.x + area.w * .65f, left.y};
        const auto original = view.map_.project({.2, .2}, area);
        finger(SDL_EVENT_FINGER_DOWN, 1, left);
        finger(SDL_EVENT_FINGER_MOTION, 1, {left.x + 25, left.y});
        require(std::abs(view.map_.project({.2, .2}, area).x - original.x) > 15, "Finger pan did not move the camera");
        finger(SDL_EVENT_FINGER_DOWN, 2, right);
        const auto before = view.map_.project({.8, .2}, area).x - view.map_.project({.2, .2}, area).x;
        finger(SDL_EVENT_FINGER_MOTION, 2, {right.x + 30, right.y});
        const auto after = view.map_.project({.8, .2}, area).x - view.map_.project({.2, .2}, area).x;
        require(after > before + 10, "Pinch did not increase camera scale");
        finger(SDL_EVENT_FINGER_UP, 1, {left.x + 25, left.y});
        finger(SDL_EVENT_FINGER_UP, 2, {right.x + 30, right.y});
        require(view.drag_ == View::Drag::none && view.selection_.region.empty(), "Pinch release selected a region");
        view.map_.reset();
        view.markersDirty_ = true;
        present(nullptr);
    }

    void shell(Session& session, const SaveSlots& store);
    void forecast(Session& session);
    void mapInteraction(Session& session);
    void mapTransition(Session& session);
    void mapScrub(Session& session);
    void mapGraphics(Session& session);

    void reform(Session& session, Selection& selection)
    {
        const auto actions = session.actionCount();
        const auto second = session.liveSnapshot()->second;
        selection.destination.reset();
        present(nullptr);
        control("#board").ScrollIntoView(Rml::ScrollAlignment::Nearest);
        present(nullptr);
        const auto from = center(*control("#board").GetChild(0));
        const auto locked = center(*control("#board").GetChild(4));
        require(control("#board").GetChild(4)->GetAttribute<bool>("data-locked", false), "Smoke requires a locked Practice slot");
        pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, from);
        pointer(SDL_EVENT_MOUSE_MOTION, locked);
        pointer(SDL_EVENT_MOUSE_BUTTON_UP, locked);
        present(nullptr);
        require(!selection.destination && view.noticeError_ && view.notice_.find("locked") != std::string::npos,
            "Locked drop was not rejected with a reason");
        require(session.actionCount() == actions && session.liveSnapshot()->second == second, "Rejected drop changed Live");
        key(SDLK_ESCAPE);
        require(view.notice_.empty(), "Escape did not clear the rejection notice");

        control("[data-op=stage][data-id='1']").Focus(true);
        key(SDLK_RETURN);
        present(nullptr);
        require(selection.destination == 1 && view.context_.GetFocusElement() == &control("[data-op=review]"),
            "Keyboard staging did not move focus to Review");
        key(SDLK_ESCAPE);
        present(nullptr);
        require(!selection.destination, "Escape did not undo the staged order");

        const auto touchFrom = center(*control("#board").GetChild(0));
        const auto to = center(*control("#board").GetChild(1));
        pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, touchFrom, true);
        pointer(SDL_EVENT_MOUSE_MOTION, to, true);
        present(nullptr);
        if (!control("#board").GetChild(1)->IsClassSet("drop")) {
            const auto area = view.bounds("panel");
            std::fprintf(stderr, "Touch drag: from %.0f,%.0f to %.0f,%.0f in panel %.0f,%.0f %.0fx%.0f. Drag %d, target %d.\n",
                touchFrom.x, touchFrom.y, to.x, to.y, area.x, area.y, area.w, area.h, static_cast<int>(view.drag_),
                view.dropTarget_ ? static_cast<int>(*view.dropTarget_) : -1);
            throw std::runtime_error("Touch drag did not show its destination");
        }
        pointer(SDL_EVENT_MOUSE_BUTTON_UP, to, true);
        present("04-reform-staged");
        require(selection.destination == 1 && session.actionCount() == actions, "Touch staging committed an action");
        click("[data-op=review]");
        require(view.dialog_ && session.actionCount() == actions && session.liveSnapshot()->second == second,
            "Review consumed the Practice cost before confirmation");
        require(control("#dialog-cost").GetInnerRML().find(std::to_string(*session.liveSnapshot()->shopSeconds)) != std::string::npos,
            "Confirmation omitted the time cost");
        present("05-reform-confirm");
        key(SDLK_ESCAPE);
        present(nullptr);
        require(!view.dialog_ && selection.destination == 1 && session.actionCount() == actions,
            "Escape did not return to the staged order");
        click("[data-op=review]");
        key(SDLK_TAB);
        require(view.context_.GetFocusElement() == &control("#dialog-confirm"), "Confirmation did not retain keyboard focus");
        key(SDLK_RETURN);
        require(!view.dialog_ && session.busy(), "Keyboard confirmation did not submit the Practice Reform");
    }
};

namespace {

std::vector<std::uint8_t> atlasPixels(SDL_Renderer* renderer, SDL_FRect area)
{
    const SDL_Rect crop{static_cast<int>(area.x), static_cast<int>(area.y), static_cast<int>(area.w),
        static_cast<int>(area.h)};
    const std::unique_ptr<SDL_Surface, decltype(&SDL_DestroySurface)> raw(
        SDL_RenderReadPixels(renderer, &crop), SDL_DestroySurface);
    require(raw != nullptr, "Could not read the atlas for pixel comparison");
    const std::unique_ptr<SDL_Surface, decltype(&SDL_DestroySurface)> pixels(
        SDL_ConvertSurface(raw.get(), SDL_PIXELFORMAT_RGBA32), SDL_DestroySurface);
    require(pixels != nullptr, "Could not normalize the atlas pixels");
    std::vector<std::uint8_t> result;
    const auto* data = static_cast<const std::uint8_t*>(pixels->pixels);
    for (int y = 0; y < pixels->h; ++y)
        result.insert(result.end(), data + y * pixels->pitch, data + y * pixels->pitch + pixels->w * 4);
    return result;
}

}

void InteractionProbe::mapInteraction(Session& session)
{
    const auto& snapshot = *session.displayed();
    const auto& shapes = session.shapes();
    const auto area = view.bounds("map");
    const auto capital = std::ranges::find(snapshot.regions, snapshot.capital, &Region::id);
    require(capital != snapshot.regions.end(), "Map smoke has no capital");
    const auto at = view.map_.project(shapes[capital - snapshot.regions.begin()].label, area);
    pointer(SDL_EVENT_MOUSE_MOTION, at);
    present(nullptr);
    require(view.hoveredRegion_ == capital->id && control("#markers").GetChild(
        static_cast<int>(capital - snapshot.regions.begin()))->IsClassSet("hovered"),
        "Mouse did not highlight the capital and its label");
    pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, at);
    require(view.pressedRegion_ == capital->id && view.selection_.region.empty(),
        "Mouse press did not hold the settlement before committing");
    present("n04k-map-pressed");
    pointer(SDL_EVENT_MOUSE_BUTTON_UP, at);
    present("n04k-map-selected");
    require(view.selection_.region == capital->id && control("#markers").GetChild(
        static_cast<int>(capital - snapshot.regions.begin()))->IsClassSet("selected"),
        "Mouse release did not select the capital");
    view.selection_.select({});
    view.map_.overview();
    view.map_.animate(SDL_GetTicks(), true);
    present(nullptr);

    // Use a point inside a province but beyond the settlement glyph's target.
    std::optional<SDL_FPoint> field;
    for (float y = area.y + 9; y < area.y + area.h - 9 && !field; y += 5) {
        for (float x = area.x + 9; x < area.x + area.w - 9; x += 5) {
            const auto target = view.map_.hit({x, y}, area, snapshot, shapes);
            if (target && !target->settlement && snapshot.regions[target->region].id != capital->id &&
                view.hit({x, y}) == snapshot.regions[target->region].id) {
                field = SDL_FPoint{x, y};
                break;
            }
        }
    }
    require(field.has_value(), "Map smoke has no exposed province to touch");
    const auto id = view.hit(*field);
    finger(SDL_EVENT_FINGER_DOWN, 1, *field);
    require(view.hoveredRegion_ == *id && view.pressedRegion_ == *id && view.selection_.region.empty(),
        "Touch did not give immediate province press feedback");
    SDL_Delay(460);
    present(nullptr);
    require(view.longPress_ && !view.currentHelp_.empty(), "Province hold did not expose map help");
    finger(SDL_EVENT_FINGER_UP, 1, *field);
    require(view.selection_.region.empty() && view.hoveredRegion_.empty(), "Map help hold selected a province");
    finger(SDL_EVENT_FINGER_DOWN, 1, *field);
    finger(SDL_EVENT_FINGER_UP, 1, *field);
    require(view.selection_.region == *id && view.hoveredRegion_.empty(), "Touch tap did not select a province");
    view.selection_.select({});
    view.map_.reset();
    view.markersDirty_ = true;
    present(nullptr);
}

void InteractionProbe::mapTransition(Session& session)
{
    const auto& exact = *session.displayed();
    auto advanced = exact;
    ++advanced.second;
    require(advanced.regions.size() > 3 && !advanced.roads.empty(), "Map motion fixture is incomplete");
    advanced.regions[0].holder = Holder::monster;
    advanced.regions[0].occupied = true;
    advanced.regions[1].population = 275.;
    advanced.regions[1].hasSite = true;
    advanced.regions[2].hasSite = false;
    advanced.regions[2].holder = Holder::neutral;
    advanced.roads.erase(advanced.roads.begin());
    const auto newRoad = [](auto edge) { return edge == std::pair<std::size_t, std::size_t>{0, 2} ||
        edge == std::pair<std::size_t, std::size_t>{2, 0}; };
    if (std::ranges::none_of(advanced.roads, newRoad)) advanced.roads.emplace_back(0, 2);

    RegionalMap map(view.map_.art_);
    const auto area = view.bounds("map");
    map.prepare(session.mapGeography(), exact);
    waitFor(session, [&] { return map.terrainReady(); }, [&](const char*) {
        map.draw(view.renderer_, area, exact, session.shapes(), {}, {}, false, {1000, 1, false, true});
    });
    const auto crown = std::ranges::find(exact.regions, CrownRank::capital, &Region::crown);
    require(crown != exact.regions.end(), "Opening map has no Crown art identity");
    const auto& crownPlan = map.baked_->sites[static_cast<std::size_t>(crown - exact.regions.begin())];
    require(crownPlan.buildings.size() > 3 && !map.baked_->roads.empty(), "Illustrated city or roads were not planned");
    if (area.w < 415.f) require(map.terrainLod_ >= 1, "Compact map uploaded the full terrain level");
    const auto draw = [&](const Snapshot& state, RegionalMap::Display display) {
        display.graphics = stillMap;
        SDL_SetRenderClipRect(view.renderer_, nullptr);
        SDL_RenderClear(view.renderer_);
        map.draw(view.renderer_, area, state, session.shapes(), {}, {}, false, display);
        return atlasPixels(view.renderer_, area);
    };
    const auto initial = draw(exact, {1000, 1, false, true});
    require(draw(advanced, {1010, 2, false, true}) == initial && map.transitioning(),
        "Live map did not retain its starting ink on the first transition frame");
    const auto midway = draw(advanced, {1080, 2, false, true});
    const auto restored = draw(advanced, {1090, 2, false, false});
    require(!map.transitioning() && midway != initial && midway != restored && restored != initial,
        "Map did not ease in Live and snap on entering a scrub");
    require(draw(advanced, {1100, 3, true, false}) == restored, "Reduced motion changed exact preview ink");
    require(draw(exact, {1110, 4, true, false}) == initial, "Reverse preview did not render the exact prior map");
    map.invalidateTerrain();
    require(!map.terrainReady() && map.textureBytes() == 0, "Backgrounding retained atlas textures");
    require(draw(exact, {1120, 4, true, false}) == initial, "Terrain release and bake changed the resumed map");
    require(draw(exact, {1130, 5, true, true}) == initial &&
        draw(advanced, {1140, 6, true, true}) == restored && !map.transitioning(),
        "Reduced motion eased a Live state change");
    present(nullptr);
}

void InteractionProbe::mapScrub(Session& session)
{
    const auto graphics = view.graphics_;
    view.graphics_ = stillMap;
    const auto live = session.liveSnapshot()->second;
    const auto through = *session.chart().through;
    for (const bool reduce : {false, true}) {
        if (reduced() != reduce) click("#motion");
        const auto target = std::min(live + (reduce ? 91 : 57), through);
        scrub(live + 2, SDL_EVENT_FINGER_DOWN);
        scrub(target, SDL_EVENT_FINGER_MOTION);
        waitFor(session, [&] { return session.previewReady(); }, present);
        require(view.drag_ == View::Drag::graph && session.displayed()->second == target &&
            session.displayedDigest() == session.replayDigest(target), "Dragging did not restore the requested exact map");
        require(!view.map_.transitioning(), "First restored frame still had Live map easing");
        // Compare the first rendered restore with a forced snap at the same camera/second.
        const auto area = view.bounds("map");
        view.drawFrame();
        const auto first = atlasPixels(view.renderer_, area);
        view.reduced_ = !reduce;
        view.drawFrame();
        require(atlasPixels(view.renderer_, area) == first, "First scrub frame depends on Motion");
        view.reduced_ = reduce;
        scrub(target, SDL_EVENT_FINGER_UP);
        click("#live");
    }
    click("#motion");
    view.graphics_ = graphics;
}

void InteractionProbe::mapGraphics(Session& session)
{
    const auto live = session.liveSnapshot()->second;
    const auto target = std::min(live + 152, *session.chart().through);
    scrub(target, SDL_EVENT_FINGER_DOWN);
    scrub(target, SDL_EVENT_FINGER_UP);
    waitFor(session, [&] { return session.previewReady(); }, present);
    require(session.displayed()->second == target && view.graphics_ == MapGraphics{}, "Graphics should start enabled");
    const auto before = session.displayedDigest();
    const auto area = view.bounds("map");
    auto& ambient = view.map_.atmosphere_;
    waitFor(session, [&] { return ambient.sampled_ == target; }, present);
    view.drawFrame();
    const auto full = atlasPixels(view.renderer_, area);
    require(ambient.water_ && ambient.sky_ && ambient.sampled_ == target, "Enabled graphics did not sample the viewed instant");
    click("#graphics");
    require(view.graphicsOpen_, "Could not open graphics settings");
    const auto frame = ambient.samples_;
    present(nullptr);
    require(ambient.samples_ == frame, "Paused view repainted unchanged weather");
    for (const auto* name : {"#graphics-fog", "#graphics-clouds", "#graphics-shadows", "#graphics-wisps", "#graphics-water"}) {
        const auto previous = ambient.samples_;
        click(name, true);
        require(control(name).GetAttribute<Rml::String>("aria-pressed", "") == "false" &&
            ambient.samples_ == previous + 1 && ambient.graphics_ == view.graphics_,
            "Setting did not refresh paused weather exactly once");
    }
    require(view.graphics_ == stillMap && !ambient.water_ && !ambient.sky_ && ambient.sampled_ == 0,
        "All-off graphics retained animated layers or a nonzero sample time");
    present("n04l-graphics-off");
    view.drawFrame();
    const auto still = atlasPixels(view.renderer_, area);
    require(still != full, "Graphics did not affect the map pixels");
    click("#motion");
    view.drawFrame();
    require(atlasPixels(view.renderer_, area) == still, "Motion changed the phase-zero atlas");
    for (const auto* name : {"#graphics-fog", "#graphics-clouds", "#graphics-shadows", "#graphics-wisps", "#graphics-water"})
        click(name);
    require(!ambient.water_ && ambient.sky_ && ambient.sampled_ == 0, "Reduced Motion left an animated phase active");
    click("#motion");
    click("#graphics");
    present("n04l-graphics-on");
    view.drawFrame();
    require(atlasPixels(view.renderer_, area) == full, "Re-enabling graphics did not restore the exact held phase");
    view.releaseTerrain();
    require(!view.mapTextureBytes(), "Backgrounding retained graphics textures");
    view.drawFrame();
    require(atlasPixels(view.renderer_, area) == full, "Re-upload changed the restored graphics");
    const auto sample = ambient.samples_;
    ambient.update(view.renderer_, view.map_.art_, view.map_.baked_, session.mapGeography()->seed,
        target + 1, ambient.lastPaint_ + 1, view.graphics_, false);
    require(ambient.samples_ == sample && !ambient.pending_.valid(), "Weather submitted a sample within the 30 Hz interval");
    scrub(target + 5, SDL_EVENT_FINGER_DOWN);
    scrub(target + 5, SDL_EVENT_FINGER_UP);
    waitFor(session, [&] { return session.previewReady() && ambient.sampled_ == target + 5; }, present);
    scrub(target, SDL_EVENT_FINGER_DOWN);
    scrub(target, SDL_EVENT_FINGER_UP);
    waitFor(session, [&] { return session.previewReady() && ambient.sampled_ == target; }, present);
    view.drawFrame();
    require(atlasPixels(view.renderer_, area) == full, "Rewinding weather did not restore the exact held pixels");
    require(session.displayedDigest() == before && session.displayedDigest() == session.replayDigest(target),
        "Changing graphics altered the restored state");
    click("#live");
}

void InteractionProbe::forecast(Session& session)
{
    const auto& chart = session.chart();
    const auto live = session.liveSnapshot()->second;
    require(view.comparisonVisible_ && session.previousChart().through && session.divergence() &&
        *session.divergence() < live, "Previous forecast and its divergence did not display after the reform");
    present("n04i-01-comparison");

    click("#graph-belief");
    require(control("#graph-label-one").GetInnerRML() == "Faith" &&
        control("#graph-label-two").GetInnerRML() == "Happiness", "Series switch did not update both lanes");
    click("#graph-scope", true);
    require(view.graphScope_ != civilizationScope && !view.graphColumns_[0].empty(), "Settlement scope did not publish local ink");
    present("n04i-02-settlement-belief");
    click("#graph-realm");
    require(view.graphScope_ == civilizationScope && control("#graph-label-two").GetInnerRML() == "Controlled",
        "Realm did not switch to civilization totals");
    click("#graph-people");

    const auto boundsBefore = view.graphWindow();
    click("#graph-in", true);
    require(view.graphWindow().span() < boundsBefore.span(), "Time zoom did not narrow the viewport");
    while (view.graphWindow().span() > Chart::exactSeconds) click("#graph-in");
    require(view.exactCurrent_.count > 0, "Close zoom did not read exact summary rows");
    const auto overview = view.bounds("graph-overview");
    pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, {overview.x + overview.w * .95f, overview.y + overview.h / 2}, true);
    pointer(SDL_EVENT_MOUSE_BUTTON_UP, {overview.x + overview.w * .95f, overview.y + overview.h / 2}, true);
    present(nullptr);
    require(view.graphWindow().first > boundsBefore.first, "Time overview did not pan");
    click("#live");
    require(view.graphWindow().first <= live && view.graphWindow().last >= live, "Live did not recenter the viewport");
    control("#plot").Focus(true);
    auto target = live;
    const auto steps = session.calendarSteps();
    const std::array<SDL_Keymod, 4> mods{SDL_KMOD_NONE, SDL_KMOD_SHIFT, SDL_KMOD_CTRL, SDL_KMOD_ALT};
    for (std::size_t i = 0; i < steps.size(); ++i) {
        key(SDLK_RIGHT, mods[i]);
        target += steps[i];
        require(session.requested() == target, "Keyboard calendar step did not select the expected second");
    }
    key(SDLK_HOME);
    require(!session.previewing(), "Home did not return to Live");
    key(SDLK_PAGEDOWN);
    require(session.requested() && *session.requested() > live, "Next event did not move the cursor");
    const auto next = *session.requested();
    key(SDLK_PAGEUP);
    require(session.requested() && *session.requested() < next, "Previous event did not move the cursor");
    key(SDLK_HOME);
    view.graphZoomed_ = false;
    present(nullptr);

    require(chart.terminal && !view.eventPins_.empty() && chart.events.back().terminal,
        "Run end was not marked on the timegraph");
    const auto terminal = chart.events.back().second;
    const auto plot = view.plot();
    const SDL_FPoint marker{view.xAt(terminal), plot.y + 5 * view.density_};
    pointer(SDL_EVENT_MOUSE_MOTION, marker);
    present(nullptr);
    require(view.currentReadout_.find(terminalText(*chart.terminal)) != std::string::npos,
        "Event hover did not identify the terminal reason");
    finger(SDL_EVENT_FINGER_DOWN, 1, marker);
    SDL_Delay(460);
    present(nullptr);
    present(nullptr);
    require(view.longPress_ && view.currentReadout_.find(terminalText(*chart.terminal)) != std::string::npos,
        "Event long press did not identify the terminal reason");
    finger(SDL_EVENT_FINGER_UP, 1, marker);
    require(!session.previewing(), "Releasing an event help hold changed the scrub");
    pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, marker);
    pointer(SDL_EVENT_MOUSE_BUTTON_UP, marker);
    require(session.requested() == terminal, "Clicking the event marker did not jump to its exact second");
    waitFor(session, [&] { return session.previewReady(); }, present);
    require(session.displayed()->second == terminal && session.displayedDigest() == session.replayDigest(terminal),
        "Event preview differs from authoritative replay");
    present("n04i-03-run-end");
    click("#live");
    require(!session.previewing() && session.displayed()->second == live, "Live did not clear the event preview");
    std::printf("Forecast interaction passed: comparison, series and scope, pan and zoom, calendar and events, terminal t=%llu\n",
        static_cast<unsigned long long>(terminal));
}

void waitFor(Session& session, const std::function<bool()>& condition, const SmokeFrame& frame)
{
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(30);
    do {
        session.update();
        if (!session.error().empty()) throw std::runtime_error(session.error());
        if (frame) frame(nullptr);
        if (condition()) return;
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    } while (std::chrono::steady_clock::now() < deadline);
    throw std::runtime_error("Session checkpoint timed out");
}

void preparePracticeShop(Session& session, Selection& selection, const SmokeFrame& frame)
{
    waitFor(session, [&] { return !session.opening(); }, frame);
    const auto* opening = session.displayed();
    require(opening && opening->regions.size() == 20, "Missing opening world");
    selection.select(opening->capital);
    require(selection.inspect(opening, 0), "Opening inspection failed");
    for (int decision = 0; decision < 6 && !canReorder(*session.displayed()); ++decision) {
        const auto& choices = session.displayed()->choices;
        require(!choices.empty(), "No path to the Practice shop");
        const auto random = std::ranges::find(choices, "random", &Choice::id);
        require(session.choose(random == choices.end() ? choices.front() : *random), "Shop decision rejected");
        waitFor(session, [&] { return !session.busy(); }, frame);
    }
    const auto& view = *session.displayed();
    require(canReorder(view), "Practice shop is unavailable");
    selection.select(view.vassalRegion);
    require(selection.inspect(&view, 0), "Practice inspection failed");
    require(selection.stage(&view, 1), "Could not stage Practice reorder");
}

void smoke(Session& session, Selection& selection, const SmokeFrame& frame, View* view)
{
    waitFor(session, [&] { return !session.opening(); }, frame);
    const auto openingSecond = session.displayed()->second;
    const auto openingActions = session.actionCount();
    require(session.displayedDigest() == session.replayDigest(openingSecond), "Opening differs from authoritative replay");
    if (view) waitFor(session, [&] { return view->terrainReady(); }, frame);
    if (frame) frame("01-regional-map");
    if (frame) {
        if (view) {
            InteractionProbe probe{*view, frame};
            probe.touchCamera();
            probe.mapInteraction(session);
            probe.mapTransition(session);
            probe.selectCapital(session, selection);
        }
        else selection.select(session.displayed()->capital);
        frame("02-settlement");
        if (view) {
            InteractionProbe probe{*view, frame};
            probe.click("[data-op=settlement-tab][data-id='3']");
            probe.click("[data-op=card][data-id='0']");
            require(selection.card == 0, "Card click did not open Practice inspection");
            probe.touchHelp();
            require(selection.card == 0, "Releasing touch help activated the Practice");
            probe.pointer(SDL_EVENT_MOUSE_MOTION, {5, 5});
        } else require(selection.inspect(session.displayed(), 0), "Opening inspection failed");
        frame("03-practice-inspection");
    }
    preparePracticeShop(session, selection, frame);
    waitFor(session, [&] {
        const auto coverage = session.coverage();
        return coverage && coverage->completion != timegraph::Completion::running &&
            session.chart().through == coverage->publishedThrough;
    }, frame);
    const auto* original = selection.selected(session.displayed());
    require(original && !original->cards[1].id.empty(), "Smoke requires two real Practices");
    const auto first = original->cards[0].id;
    const auto second = original->cards[1].id;
    const auto generation = session.generation();
    const auto count = session.actionCount();
    const auto before = session.displayed()->second;
    const auto duration = session.displayed()->shopSeconds;
    require(duration.has_value(), "Practice decision did not quote its time cost");
    if (view) InteractionProbe{*view, frame}.reform(session, selection);
    else {
        if (frame) frame("04-reform-staged");
        require(session.reorder(selection.region, *selection.card, *selection.destination), "Board change rejected");
        selection.destination.reset();
        selection.card.reset();
    }
    if (view) {
        waitFor(session, [&] { return !session.busy(); }, frame);
        require(view->liveMapTransitioning(), "Committed time did not start a Live map transition");
        for (const auto* shot : {"n04k-live-00", "n04k-live-01", "n04k-live-02", "n04k-live-03"}) {
            frame(shot);
            SDL_Delay(58);
        }
        SDL_Delay(55);
        frame("n04k-live-04");
    }
    if (frame) {
        waitFor(session, [&] {
            const auto coverage = session.coverage();
            return !session.busy() && coverage && (coverage->completion != timegraph::Completion::running ||
                session.chart().through.value_or(0) >= session.liveSnapshot()->second + 320);
        }, frame);
        frame("06-forecast-running");
    }
    waitFor(session, [&] {
        const auto coverage = session.coverage();
        return !session.busy() && coverage && coverage->publishedThrough && session.chart().through == coverage->publishedThrough &&
            coverage->completion != timegraph::Completion::running;
    }, frame);
    require(session.generation() > generation && session.actionCount() == count + 2, "Board change did not replace forecast");
    const auto* changed = selection.selected(session.displayed());
    require(changed && changed->cards[0].id == second && changed->cards[1].id == first, "Committed Practice order did not change");
    const auto liveSecond = session.displayed()->second;
    require(liveSecond == before + *duration, "Live time differs from Practice quote");
    require(session.previousChart().through && session.divergence() == before,
        "Practice action did not retain the revealed predecessor and edit second");
    if (view) {
        InteractionProbe probe{*view, frame};
        probe.forecast(session);
        probe.mapScrub(session);
        probe.mapGraphics(session);
    }
    const auto liveDigest = session.displayedDigest();
    require(*session.chart().through >= liveSecond + 2, "Forecast stopped before a second can be scrubbed");
    const auto target = std::min(liveSecond + 79, *session.chart().through);
    require(session.scrub(liveSecond + 1), "Scrub initiation failed");
    if (view) {
        InteractionProbe probe{*view, frame};
        probe.scrub(liveSecond, SDL_EVENT_FINGER_DOWN);
        probe.scrub(target, SDL_EVENT_FINGER_MOTION);
    }
    else require(session.scrub(target), "Scrub replacement failed");
    waitFor(session, [&] { return session.previewReady(); }, frame);
    require(session.displayed()->second == target, "Obsolete scrub won");
    require(session.displayedDigest() == session.replayDigest(target), "Displayed restore differs from authoritative replay");
    require(!session.reorder(selection.region, 1, 0), "Forecast preview accepted a live edit");
    require(selection.inspect(session.displayed(), 1), "Preview Practice inspection failed");
    if (frame) frame("07-forecast-preview");
    if (view) InteractionProbe{*view, frame}.scrub(target, SDL_EVENT_FINGER_UP);
    require(session.scrub(liveSecond + 1), "Return-to-live cancellation setup failed");
    if (view) InteractionProbe{*view, frame}.click("#live");
    else session.live();
    session.update();
    require(!session.previewing() && session.displayed()->second == liveSecond && session.displayedDigest() == liveDigest,
            "Return to live failed");
    if (frame) frame("08-return-to-live");
    std::printf("Connected smoke passed: opening t=%llu with %zu actions, generation %llu, %zu actions, scrub t=%llu, live t=%llu\n",
        static_cast<unsigned long long>(openingSecond), openingActions,
        static_cast<unsigned long long>(session.generation()), session.actionCount(),
        static_cast<unsigned long long>(target), static_cast<unsigned long long>(liveSecond));
    if (view) {
        InteractionProbe probe{*view, frame};
        probe.click("#motion");
        require(probe.reduced(), "Motion toggle did not update the presentation");
        probe.click("#motion");
    }
}

void InteractionProbe::settlement(Session& session)
{
    const auto tab = [&](unsigned index) {
        return "[data-op=settlement-tab][data-id='" + std::to_string(index) + "']";
    };
    const auto checkOverview = [&](const sim::RuntimeState& state) {
        using namespace sim::runtime;
        const auto regionId = state.find_id<RegionId>(view.selection_.region);
        const auto sites = state.tables.view(state.hot.world.sites);
        const auto site = std::ranges::find(sites, regionId, &Site::regionId);
        require(site != sites.end() && view.settlementReading_.overview.has_value(), "Census missing");
        const auto& local = site->detailedState;
        const auto& reading = *view.settlementReading_.overview;
        const auto independentCount = [&](const auto& classRow, const Census& actual) {
            double elders = 0, scholars = static_cast<double>(classRow.specialists.scholar.adults + classRow.specialists.scholar.children);
            for (const auto& cohort : state.tables.view(classRow.eldersByAge)) elders += cohort.count;
            for (const auto& cohort : state.tables.view(classRow.specialists.scholar.eldersByAge)) scholars += cohort.count;
            return actual.children == classRow.children && actual.adults == classRow.adults &&
                actual.elders == elders && actual.scholars == scholars;
        };
        require(independentCount(local.populationByClass.villager, reading.census[0]) &&
            independentCount(local.populationByClass.stranger, reading.census[1]), "Overview census differs from replay");
        require(reading.meal.has_value() == local.lastMeal.has_value(), "Overview meal presence differs");
        if (local.lastMeal) {
            const auto& expected = state.tables.at(*local.lastMeal);
            require(reading.meal->consumed == expected.consumed && reading.meal->demand == expected.demand &&
                reading.meal->second == expected.tSec, "Overview meal differs from replay");
        }
        require(view.settlementReadSecond_ == state.hot.tSec &&
            view.element("settlement-time").GetInnerRML().ends_with(std::to_string(view.settlementReadSecond_.value())),
            "Settlement reading and displayed clock disagree");
        const auto& capacities = state.content->migration.structureHousing;
        double capacity = 0;
        for (const auto& cell : state.tables.view(local.structureSlots.origins))
            if (!cell.construction)
                capacity += std::floor(capacities[cell.structureId.value] * (1 + .25 * std::max(0., cell.qualityBonus.value_or(0))));
        require(view.selection_.selected(session.displayed())->housing == capacity, "Overview housing differs from replay");
        return local;
    };

    waitFor(session, [&] { return !session.opening(); }, present);
    selectCapital(session, view.selection_);
    present("01-overview-live");
    const auto capital = view.selection_.region;
    const auto live = session.displayed()->second;
    checkOverview(session.replayStateForTest(live));

    auto& overviewBody = view.element("settlement-scroll");
    overviewBody.Focus(true);
    key(SDLK_PAGEDOWN);
    present(nullptr);
    require(view.context_.GetFocusElement() == &overviewBody && overviewBody.IsPseudoClassSet("focus-visible"),
        "Overview scroll area did not retain keyboard focus");
    require(overviewBody.GetScrollHeight() <= overviewBody.GetClientHeight() || overviewBody.GetScrollTop() > 0,
        "Keyboard could not scroll the Overview");
    control(tab(1).c_str()).Focus(true);
    auto* structureTab = &control(tab(2).c_str());
    key(SDLK_RIGHT);
    present("01b-tab-focus");
    require(view.settlementTab_ == SettlementTab::structures &&
        view.context_.GetFocusElement() == structureTab && structureTab->IsPseudoClassSet("focus-visible") &&
        structureTab->GetAttribute<Rml::String>("aria-selected", "") == "true",
        "Keyboard did not select Structures and keep its tab focused");
    const auto& board = *view.settlementReading_.structures;
    require(board.capacity > 0 && board.occupied > 0 && !board.buildings.empty(), "Capital construction board is empty");
    const auto building = "[data-op=settlement-building][data-id='" + std::to_string(board.buildings.front().origin) + "']";
    const auto at = center(control(building.c_str()));
    finger(SDL_EVENT_FINGER_DOWN, 1, at);
    finger(SDL_EVENT_FINGER_UP, 1, at);
    present("02-structure-inspection");
    require(view.building_.has_value() && !control("#structure-inspector").GetInnerRML().empty(),
        "Touch did not inspect a structure");
    key(SDLK_ESCAPE);
    present(nullptr);
    require(!view.building_ && view.settlementTab_ == SettlementTab::structures, "Escape did not close structure inspection");
    view.element("map").Focus(true);
    for (const auto direction : {SDLK_LEFT, SDLK_RIGHT, SDLK_UP, SDLK_DOWN}) {
        key(direction);
        present(nullptr);
        if (view.selection_.region != capital) break;
    }
    require(view.selection_.region != capital && view.settlementTab_ == SettlementTab::structures,
        "Selecting another region did not preserve the settlement tab");
    view.selectRegion(capital);
    present(nullptr);
    click(tab(3).c_str());
    click("[data-op=card][data-id='0']");
    pointer(SDL_EVENT_MOUSE_MOTION, {5, 5});
    present("03-practice-board");
    require(view.settlementReading_.practice.has_value(), "Practice details missing");
    control("#inspector h3").ScrollIntoView(Rml::ScrollAlignment::Start);
    present("04-practice-inspection");
    key(SDLK_ESCAPE);
    present(nullptr);
    require(!view.selection_.card && view.settlementTab_ == SettlementTab::practices, "Escape did not close Practice inspection");

    click(tab(0).c_str());
    const auto target = std::min<Second>(live + 108, *session.chart().through);
    require(target > live, "Settlement smoke lacks future coverage");
    scrub(target, SDL_EVENT_FINGER_DOWN);
    scrub(target, SDL_EVENT_FINGER_UP);
    waitFor(session, [&] { return session.previewReady(); }, present);
    require(session.displayed()->second == target && session.displayedDigest() == session.replayDigest(target),
        "Settlement preview differs from authoritative replay");
    const auto replay = session.replayStateForTest(target);
    const auto local = checkOverview(replay);
    require(view.document_->QuerySelector(".reading-changed"), "Scrubbed values did not highlight changes");
    present("05-overview-preview");
    view.element("settlement-scroll").SetScrollTop(view.element("settlement-scroll").GetScrollHeight());
    present("05b-overview-ledgers");
    click(tab(1).c_str());
    const auto& moon = view.settlementReading_.moon;
    require(moon && moon->phases.size() == 6, "Moon preview lacks the six phase readings");
    const auto& civilization = replay.hot.civilization;
    const auto& expectedMoon = civilization.currentMoonTurn ? civilization.currentMoonTurn : civilization.lastMoonTurn;
    require(expectedMoon && moon->index == expectedMoon->moonIndex && moon->started == expectedMoon->startedSec,
        "Displayed Moon differs from replay");
    present("06-moon-report");
    view.element("settlement-scroll").SetScrollTop(view.element("settlement-scroll").GetScrollHeight());
    present("06b-moon-later-phases");
    click(tab(3).c_str());
    click("[data-op=card][data-id='0']");
    const auto& practice = view.settlementReading_.practice;
    const auto slot = local.practiceSlots.slots[0].value;
    require(practice && practice->stock == replay.practiceStock[slot] &&
        (!practice->chargeMode || practice->charge == replay.practiceCharge[slot]), "Practice Stock or Charge differs from replay");
    require(!view.document_->QuerySelector("[data-op=stage]"), "Preview exposed a Practice Reform command");
    control("#inspector h3").ScrollIntoView(Rml::ScrollAlignment::Start);
    present("07-practice-preview");
    const auto& regions = session.displayed()->regions;
    const auto charged = std::ranges::find_if(regions, [](const auto& region) {
        return std::ranges::any_of(region.cards, [](const auto& card) { return card.mode == "Charge"; });
    });
    if (charged != regions.end()) {
        const auto card = std::ranges::find(charged->cards, "Charge", &Card::mode) - charged->cards.begin();
        view.selectRegion(charged->id);
        present(nullptr);
        click(("[data-op=card][data-id='" + std::to_string(card) + "']").c_str());
        const auto& charge = view.settlementReading_.practice;
        const auto regionId = replay.find_id<sim::runtime::RegionId>(charged->id);
        const auto sites = replay.tables.view(replay.hot.world.sites);
        const auto site = std::ranges::find(sites, regionId, &sim::runtime::Site::regionId);
        require(site != sites.end(), "Charge Practice has no settlement in replay");
        const auto chargeSlot = site->detailedState.practiceSlots.slots[card].value;
        require(charge && charge->threshold >= 1 && charge->charge == replay.practiceCharge[chargeSlot],
            "Charge inspector omitted the threshold or disagrees with the preview");
        control("#inspector h3").ScrollIntoView(Rml::ScrollAlignment::Start);
        present("08-charge-inspection");
        control("[data-reading=practice-charge]").ScrollIntoView(Rml::ScrollAlignment::Start);
        present("08b-charge-meter");
    }
    key(SDLK_ESCAPE);
    present(nullptr);
    require(!session.previewing() && session.displayed()->second == live, "Escape did not return to Live");
    std::printf("Settlement smoke passed: four tabs, touch and keyboard, structure and Practice inspection, authoritative residents, meal, Moon and Stock at s %llu.\n",
        static_cast<unsigned long long>(target));
}

void settlementSmoke(Session& session, View& view, const SmokeFrame& frame)
{
    InteractionProbe{view, frame}.settlement(session);
}

void InteractionProbe::territory(Session& session, const SaveSlots& store, const std::filesystem::path& fixture)
{
    using namespace sim::runtime;
    using core::json::Value;
    const auto idle = [&] { waitFor(session, [&] { return !session.opening() && !session.busy(); }, present); };
    const auto pick = [&](const char* id) {
        view.selectRegion(id);
        present(nullptr);
        const auto* selected = view.selection_.selected(session.displayed());
        require(selected && selected->id == id, "Territory fixture is missing the selected region");
        return *selected;
    };
    const auto restore = [&](Second second) {
        require(session.scrub(second), "Could not request territory fixture second");
        waitFor(session, [&] { return session.previewReady(); }, present);
        require(session.displayed()->second == second && view.settlementReadRevision_ == session.viewRevision() &&
            session.displayedDigest() == session.replayDigest(second), "Territory panel missed the authoritative restore");
    };
    const auto tap = [&](const char* selector) {
        auto& button = control(selector);
        button.ScrollIntoView(Rml::ScrollAlignment::Nearest);
        present(nullptr);
        const auto at = center(button);
        finger(SDL_EVENT_FINGER_DOWN, 1, at);
        finger(SDL_EVENT_FINGER_UP, 1, at);
        present(nullptr);
    };
    const auto checkRuin = [&](std::string_view heading) {
        require(view.selection_.selected(session.displayed())->ruin && !view.settlementReading_.overview &&
            !view.document_->GetElementById("settlement-tabs") && !view.document_->GetElementById("overview-total") &&
            view.panelMarkup_.find(heading) != std::string::npos, "Ruin exposed an active settlement readout");
    };

    idle();
    waitFor(session, [&] { return view.terrainReady(); }, present);
    pick("R12");
    const auto& economy = view.settlementReading_.overview->economy;
    const auto hosted = std::ranges::find_if(economy, [](const auto& row) {
        return row.key.starts_with("stock-") && row.detail.find("1 linked") != std::string::npos;
    });
    require(hosted != economy.end() && hosted->sources.empty(), "Hosted Stock fixture did not show linked providers");
    const auto providers = "[data-op=settlement-stock][data-id='" + hosted->key + "']";
    click(providers.c_str());
    const auto named = control("#stock-drilldown .stock-source-list").GetInnerRML();
    require(named.find("Central Plains") != std::string::npos && named.find('\n') != std::string::npos,
        "Hosted Stock omitted the named provider breakdown");
    present("01a-hosted-providers");
    click("[data-op=settlement-stock-back]");
    click("[data-op=settlement-stock][data-id='market-stock']");
    require(control("#stock-drilldown .stock-source-list").GetInnerRML().find("Currency / unit") != std::string::npos,
        "Stock disclosure did not show named offers");
    present("01-stock-sources");
    pick("R04");
    const auto& market = view.settlementReading_.storefront;
    require(market && market->identity == "Grain Village" && !market->offers.empty() &&
        market->offers.front().value.find('/') != std::string::npos &&
        market->offers.front().detail.find("each Food phase") != std::string::npos,
        "Neutral storefront omitted its identity, capacity or replenishment");
    present("02-neutral-storefront");

    pick("R16");
    restore(1584);
    checkRuin("Monster-held ruin · Strength 3");
    require(view.panelMarkup_.find("Repelled") != std::string::npos &&
        view.panelMarkup_.find("Next attack target") != std::string::npos &&
        view.selection_.selected(session.displayed())->population == 0, "Ruin threat or graph population changed");
    const auto at1584 = session.replayStateForTest(1584);
    const auto* ruin = sim::territory::site_at_region(at1584, at1584.find_id<RegionId>("R16"));
    require(ruin->detailedState.populationByClass.villager.children == 6 &&
        ruin->detailedState.populationByClass.villager.adults == 18, "Ruin lost the dormant census");
    present("03-monster-ruin");

    view.shell_.open({.save = fixture});
    idle();
    waitFor(session, [&] { return view.terrainReady(); }, present);
    require(session.liveSnapshot() && session.liveSnapshot()->second == 9, "Prepared territory run did not open");
    const auto restored = pick("R12");
    require(restored.detailed && !restored.ruin && restored.population > 0 && view.settlementReading_.overview &&
        view.document_->GetElementById("settlement-tabs") && view.document_->GetElementById("overview-total"),
        "Conquered ruin did not restore its active census and boards");
    present("04-restored-settlement");
    restore(0);
    checkRuin("Unrestored ruin");
    present("05-cleared-ruin");
    click("#live");

    pick("R16");
    click("[data-op=settlement-tab][data-id='3']");
    click("#graph-scope");
    const auto oldScope = view.localGraph_;
    tap("[data-op=settlement-cycle][data-id=next]");
    require(view.selection_.region == "R09" && view.settlementTab_ == SettlementTab::practices &&
        oldScope && view.localGraph_ && view.graphScopeLabel_ == view.selection_.selected(session.displayed())->name,
        "Touch settlement cycle lost world order, tab or plot scope");
    key(SDLK_LEFTBRACKET);
    present(nullptr);
    require(view.selection_.region == "R16" && view.settlementTab_ == SettlementTab::practices,
        "Keyboard settlement cycle did not wrap in reverse");
    click("[data-op=settlement-cycle][data-id=next]");
    require(view.selection_.region == "R09", "Mouse settlement cycle did not select the next holding");
    key(SDLK_LEFTBRACKET);
    present(nullptr);
    click("[data-op=settlement-tab][data-id='0']");

    control("[data-op=settlement-garrison]").Focus(true);
    key(SDLK_RETURN);
    present(nullptr);
    const auto& choices = view.settlementReading_.overview->garrison->choices;
    const auto legal = std::ranges::find(choices, "R09", &GarrisonChoice::id);
    require(legal != choices.end() && legal->reason.empty() &&
        std::ranges::find(view.map_.garrisonTargets_, legal->region) != view.map_.garrisonTargets_.end(),
        "Legal garrison target was not highlighted");
    const auto live = session.replayStateForTest(9);
    require(legal->defense == sim::territory::military(live, live.find_id<RegionId>("R09"),
        live.practiceVocabulary.player).defense, "Garrison chooser Defense differs from replay");
    const auto* ally = "[data-op=settlement-garrison-target][data-id=R09]";
    require(view.context_.GetFocusElement() == &control(ally), "Keyboard focus did not enter the garrison choices");
    const auto invalid = std::ranges::find_if(choices, [](const auto& choice) { return !choice.reason.empty(); });
    require(invalid != choices.end(), "Missing an ineligible garrison target");
    const auto invalidControl = "[data-op=settlement-garrison-target][data-id='" + invalid->id + "']";
    require(control(invalidControl.c_str()).HasAttribute("disabled") &&
        view.panelMarkup_.find(invalid->reason) != std::string::npos, "Ineligible garrison target has no disabled reason");
    const auto startingActions = session.actionCount();
    tap(invalidControl.c_str());
    require(!view.dialog_ && session.actionCount() == startingActions, "Touch on ineligible target submitted an action");

    view.element("settlement-scroll").SetScrollTop(0);
    present("06-garrison-choices");
    control(ally).Focus(true);
    key(SDLK_RETURN);
    present("07-garrison-confirm");
    require(view.dialog_ && session.actionCount() == startingActions, "Garrison choice skipped confirmation");
    key(SDLK_ESCAPE);
    present(nullptr);
    require(view.garrisonChoosing_ && !view.dialog_ && session.actionCount() == startingActions,
        "Cancel committed or discarded the garrison chooser");
    click(ally);
    tap("#dialog-confirm");
    idle();

    const auto verifyAssignment = [&](std::size_t expectedCount, const char* target) {
        const auto second = session.displayed()->second;
        require(second == 9 && expectedCount == session.actionCount() &&
            session.displayedDigest() == session.replayDigest(second), "Applied support diverges from authoritative replay");
        require(session.save(store, Slot::first), "Could not inspect the UI journal");
        const auto save = readNativeSave(store.path(Slot::first));
        const auto& entry = save.journal.entries().back();
        const auto* source = entry.payload.find("regionId");
        const auto* destination = entry.payload.find("targetRegionId");
        require(entry.tSec == second && entry.kind == "settlementAssignGarrison" && source &&
            source->as_string() == "R16" && destination && (target ? destination->as_string() == target :
            destination->kind() == Value::Kind::null), "Garrison journal payload differs from the browser action");
        const auto* guard = sim::settlement::detailed_site(save.live, save.live.find_id<RegionId>("R16"));
        const auto& assigned = guard->detailedState.garrison->supportTargetRegionId;
        require(assigned.has_key() && (target ? assigned.value() == save.live.find_id<RegionId>(target) :
            !assigned.value()), "The restored garrison disagrees with its journal");
    };
    verifyAssignment(startingActions + 1, "R09");
    require(view.map_.garrisonTargets_.empty() && view.settlementReading_.overview->garrison->supported != "Local",
        "Committed assignment left highlights or failed to update the Overview");
    present("08-support-assigned");
    click("[data-op=settlement-garrison]");
    tap("[data-op=settlement-garrison-target][data-id='']");
    control("#dialog-confirm").Focus(true);
    key(SDLK_RETURN);
    idle();
    verifyAssignment(startingActions + 2, nullptr);
    require(view.settlementReading_.overview->garrison->supported == "Local", "Local support label did not return");
    std::puts("Territory smoke passed: s 1584 ruin, restored settlement, market and Stock, cycling, disabled and legal support, local recall and replay.");
}

void territorySmoke(Session& session, View& view, const SmokeFrame& frame, const SaveSlots& store,
                    const std::filesystem::path& fixture)
{
    InteractionProbe{view, frame}.territory(session, store, fixture);
}

void InteractionProbe::crests(Session& session)
{
    using namespace sim::runtime;
    using Part = CrestLayer::Part;
    const auto index = [&](std::string_view id) {
        const auto& rows = session.displayed()->regions;
        const auto row = std::ranges::find(rows, id, &Region::id);
        require(row != rows.end(), "Seed-42 crest fixture is missing a region");
        return static_cast<std::size_t>(row - rows.begin());
    };
    const auto at = [&](std::string_view id, Part part) {
        const auto i = index(id);
        const auto& targets = view.crests_.targets_;
        const auto target = std::ranges::find_if(targets, [&](const auto& hit) { return hit.region == i && hit.part == part; });
        if (target == targets.end()) throw std::runtime_error("Crest " + std::string(id) + " has no visible hit area for part " +
            std::to_string(static_cast<int>(part)));
        const auto box = target->box;
        const SDL_FPoint center{box.x + box.w / 2, box.y + box.h / 2};
        require(view.crests_.hit(center) == &*target, "Crest readout hit area overlaps another target");
        return center;
    };
    const auto restore = [&](Second second) {
        require(session.scrub(second), "Could not request the crest fixture second");
        waitFor(session, [&] { return session.previewReady(); }, present);
        require(session.displayed()->second == second && view.crests_.revision_ == session.viewRevision() &&
            view.crests_.second_ == second && !view.crests_.changedAt_ &&
            session.displayedDigest() == session.replayDigest(second), "Crest did not snap on the restored frame");
        return session.replayStateForTest(second);
    };
    const auto town = [&](const sim::RuntimeState& state, std::string_view id, CrestControl control) {
        const auto i = index(id);
        const auto& row = session.displayed()->crests.regions[i];
        const auto& region = state.tables.view(state.hot.world.regions)[i];
        const auto* site = sim::territory::site_at_region(state, region.id);
        require(row.town && site && row.control == control, "Town crest control disagrees with the fixture");
        const auto& people = site->detailedState.populationByClass;
        double adults = 0, residents = 0, workers = 0;
        const auto& settings = state.compiledContent->settings();
        for (const auto* cohort : {&people.villager, &people.stranger}) {
            adults = cohort->adults;
            for (const auto& elders : state.tables.view(cohort->eldersByAge)) adults += elders.count;
            residents += adults + cohort->children;
            workers += std::floor(adults / std::max(1., settings.populationPerToken));
        }
        double assigned = 0;
        for (const auto& slot : sim::practice::detail::workers(state, *site)) assigned += slot.tokens;
        const auto factions = sim::settlement::faction_totals(state, site->id);
        const auto count = [&](auto id) {
            const auto found = std::ranges::find_if(factions, [&](const auto& entry) { return entry.key == id; });
            return found == factions.end() ? 0. : found->value;
        };
        const auto free = count(state.practiceVocabulary.player), crown = count(state.practiceVocabulary.external);
        require(row.allegiance == std::array{free, crown, residents - free - crown} && row.assigned == assigned &&
            row.workers == std::max(assigned, workers) && row.prestige == std::floor(residents / 20.), "Crest counts differ from replay");
        require(row.income == (region.controller == state.practiceVocabulary.player), "Prestige activity differs from replay");
        if (row.held) {
            const auto military = sim::territory::military(state, region.id, region.controller);
            const auto resistance = sim::territory::resistance(state, *site, region.controller);
            const auto pressure = residents * resistance.units / (residents - resistance.loyal) / 10.;
            const auto limit = .7 / (1. + military.force / pressure);
            require(row.force == military.force && row.zeroForceShare == .7 &&
                std::abs(row.minimumShare - limit) < 1e-12 && row.minimumLoyal == std::ceil(residents * limit - 1e-9),
                "Force shield or sword differs from rebuilt state");
        } else require(row.minimumShare == 0 && row.zeroForceShare == 0, "An unheld crest has holding markers");
        if (control == CrestControl::unrest) {
            const auto& episode = *site->detailedState.control->unrest;
            require(row.unrestYears == (episode.untilSec - state.hot.tSec) / (4 * settings.seasonDurationSec) &&
                row.unrestChaos == settings.unrestChaosPerYear, "Unrest years or Chaos differs from replay");
        }
    };
    const auto monster = [&](const sim::RuntimeState& state, std::string_view id, std::string_view target) {
        const auto& row = session.displayed()->crests.regions[index(id)];
        const auto regions = state.tables.view(state.hot.world.regions);
        const auto expected = regions[index(id)].monster->defense;
        const auto& destination = regions[index(target)];
        const auto defense = sim::territory::military(state, destination.id, destination.controller).defense;
        require(row.monster && row.monster->strength == expected && row.monster->target == index(target) &&
            row.monster->defense == defense && row.monster->willBeRepelled == (defense > 0 && defense >= expected),
            "Monster attack readout differs from rebuilt state");
        return *row.monster;
    };

    waitFor(session, [&] { return !session.opening(); }, present);
    present("01-overview");
    const auto opening = session.replayStateForTest(0);
    town(opening, "R12", CrestControl::supported);
    town(opening, "R10", CrestControl::supported);
    town(opening, "R04", CrestControl::unheld);
    monster(opening, "R16", "R08");
    require(session.displayed()->crests.regions[index("R10")].crown, "Opening Crown crest has no capital finial");
    require(std::ranges::none_of(view.crests_.expanded_, std::identity{}), "Overview unexpectedly disclosed full crests");
    const auto playerRegion = index("R12");
    const auto area = view.bounds("map");
    const auto playerAnchor = view.map_.project(session.shapes()[playerRegion].label, area);
    view.map_.zoom(12, playerAnchor, area);
    view.map_.animate(SDL_GetTicks(), true);
    view.markersDirty_ = true;
    present("01b-unselected-zoom");
    require(view.crests_.expanded_[playerRegion], "An unselected crest did not disclose when its region fit");
    at("R12", Part::allegiance);
    view.map_.overview();
    view.map_.animate(SDL_GetTicks(), true);
    view.markersDirty_ = true;
    present(nullptr);

    const auto worker = at("R12", Part::workers);
    pointer(SDL_EVENT_MOUSE_MOTION, worker);
    SDL_Delay(460);
    present("02-workers-hover");
    if (view.hoveredRegion_ != "R12" || view.currentHelp_.find("1 assigned, 0 unused") == std::string::npos) {
        const auto* target = view.crests_.hit(view.pointer_);
        throw std::runtime_error("Worker help mismatch. Region " + view.hoveredRegion_ + ", part " +
            (target ? std::to_string(static_cast<int>(target->part)) : "none") + ", dwell " +
            std::to_string(view.now_ - view.hoveredAt_) + " ms, tooltip: " + view.currentHelp_);
    }
    pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, worker);
    present(nullptr);
    require(view.crests_.pressed_ && view.selection_.region.empty(), "Crest press feedback did not precede activation");
    pointer(SDL_EVENT_MOUSE_BUTTON_UP, worker);
    present(nullptr);
    require(view.selection_.region == "R12", "Releasing the crest did not select its region");
    view.map_.overview();
    view.map_.animate(SDL_GetTicks(), true);
    view.markersDirty_ = true;
    pointer(SDL_EVENT_MOUSE_MOTION, {1, 1});
    view.element("motion").Focus();
    view.element("map").Focus(true);
    present("03-held-selected");
    require(!view.crests_.placements_.empty() && view.crests_.placements_.front().full && view.map_.camera_.zoom == 1,
        "Selected crest lost full disclosure at overview scale");
    require(view.crests_.focused_, "Selected crest did not show keyboard focus");
    at("R12", Part::stock);
    pointer(SDL_EVENT_MOUSE_MOTION, {1, 1});
    view.element("motion").Focus();
    view.selectRegion("R10");
    present("04-crown-selected");
    at("R10", Part::crown);
    view.selectRegion("R04");
    present("05-unheld-selected");
    at("R04", Part::prestige);

    view.selectRegion("R20");
    town(restore(966), "R20", CrestControl::unrest);
    present("06-unrest-preview");
    const auto unrest = at("R20", Part::allegiance);
    finger(SDL_EVENT_FINGER_DOWN, 1, unrest);
    SDL_Delay(460);
    present("07-unrest-touch-help");
    require(view.longPress_ && view.currentHelp_.find("10 years remaining") != std::string::npos,
        "Touch did not expose the Unrest explanation");
    finger(SDL_EVENT_FINGER_UP, 1, unrest);

    view.selectRegion("R16");
    const auto repelledState = restore(1584);
    const auto repelled = monster(repelledState, "R16", "R08");
    const auto& event = *repelledState.hot.civilization.chaos.lastMonsterSpawn;
    require(repelled.repelGain == *event.strengthAfter - *event.strengthBefore && repelled.strength == 3,
        "Restored repel feedback differs from the retained attack outcome");
    present("08-monster-repel");
    const auto badge = at("R16", Part::monster);
    pointer(SDL_EVENT_MOUSE_MOTION, badge);
    SDL_Delay(460);
    present(nullptr);
    require(view.currentHelp_.find("Monster Strength 3") != std::string::npos, "Mouse did not expose Monster Strength help");
    finger(SDL_EVENT_FINGER_DOWN, 1, badge);
    SDL_Delay(460);
    present("09-monster-touch-help");
    require(view.longPress_ && view.currentHelp_.find("Last: Repelled") != std::string::npos,
        "Touch did not expose the Monster's attack and repel help");
    finger(SDL_EVENT_FINGER_UP, 1, badge);
    require(view.selection_.region == "R16", "Touch inspection changed selection");

    restore(1);
    require(!session.displayed()->crests.transfers.empty(), "A retained Stock transfer did not reach the atlas");
    present("10-transfer-preview");

    // Use view-only samples to check the motion endpoints independently of
    // how far a particular live action advances time.
    const auto first = *session.displayed();
    auto next = first;
    const auto player = index("R12");
    ++next.second;
    next.crests.regions[player].workers += 9;
    CrestLayer animation(view.crests_.artwork_);
    animation.update(first, {1000, 1, false, true});
    animation.update(next, {1010, 2, false, true});
    require(animation.changedAt_ == 1010 && animation.at(player, 0).workers == first.crests.regions[player].workers &&
        animation.at(player, .5f).workers == first.crests.regions[player].workers + 4.5,
        "Live crests did not ease from the previously displayed value");
    animation.update(next, {1020, 2, true, true});
    require(!animation.changedAt_ && animation.at(player, 1).workers == next.crests.regions[player].workers,
        "Disabling Motion did not snap a Live crest");
    std::printf("Crest smoke passed: seed 42, held/unheld/Monster at s 0, transfer at s 1, Unrest at s 966, repel at s 1584.\n");
}

void crestSmoke(Session& session, View& view, const SmokeFrame& frame)
{
    InteractionProbe{view, frame}.crests(session);
}

void InteractionProbe::shell(Session& session, const SaveSlots& store)
{
    auto& shell = view.shell_;
    const auto live = session.liveSnapshot()->second;
    click("#title-game");
    require(view.dialog_ && shell.screen() == Screen::game, "Title bypassed confirmation for unsaved progress");
    present("09-return-confirm");
    key(SDLK_ESCAPE);
    require(!view.dialog_ && session.liveSnapshot()->second == live, "Cancel did not preserve the run");
    click("#save-game");
    present("10-save");
    click("[data-op=slot][data-id='1']");
    require(shell.screen() == Screen::game && !shell.hasUnsavedProgress() && !view.noticeError_,
        "Manual save did not return to the game");
    present("11-save-feedback");
    click("#save-game");
    click("[data-op=slot][data-id='1']");
    require(view.dialog_ && shell.overwrite() == Slot::first, "Occupied slot bypassed confirmation");
    present("12-overwrite-confirm");
    click("#dialog-back");
    require(!view.dialog_ && !shell.overwrite() && shell.screen() == Screen::save,
        "Cancel did not return to the save list");
    click("[data-op=slot][data-id='1']");
    click("#dialog-confirm");
    require(shell.screen() == Screen::game, "Overwrite did not save");
    click("#title-game");
    require(shell.screen() == Screen::title, "Saved run did not return to title");
    present("13-title");
    std::ofstream(store.path(Slot::second), std::ios::binary) << "not a save";
    const auto path = store.path(Slot::first).u8string();
    auto incompatible = readAsset(reinterpret_cast<const char*>(path.c_str()));
    const auto stamp = incompatible.find("\"saveVersion\":1");
    require(stamp != std::string::npos, "Missing slot version");
    incompatible[stamp + std::string_view("\"saveVersion\":").size()] = '2';
    std::ofstream(store.path(Slot::third), std::ios::binary) << incompatible;
    click("[data-op=load]");
    present("14-load");
    for (const auto selector : {"[data-op=slot][data-id='2']", "[data-op=slot][data-id='3']"})
        require(control(selector).HasAttribute("disabled"), "Invalid slot can be loaded");
    click("[data-op=slot][data-id='1']");
    waitFor(session, [&] { return !session.opening(); }, present);
    shell.update();
    require(session.liveSnapshot()->second == live, "Load did not resume the saved frontier");
    click("#title-game");
    click("[data-op=continue]");
    waitFor(session, [&] { return !session.opening(); }, present);
    shell.update();
    require(session.liveSnapshot()->second == live, "Continue did not resume the latest save");
    click("#title-game");
    control("#seed").Focus(true);
    SDL_Event text{};
    text.type = SDL_EVENT_TEXT_INPUT;
    text.text.text = "42";
    view.input(text);
    key(SDLK_RETURN);
    require(session.opening(), "New Game did not start a fresh run");
    waitFor(session, [&] { return !session.opening(); }, present);
    require(shell.seedInput() == "42" && session.actionCount() == 0 && view.selection_.region.empty(),
        "New Game did not use the entered seed or clear the previous run");
    click("#title-game");
    click("#dialog-confirm");
    const auto autosaved = store.inspect(Slot::autosave).metadata;
    require(shell.screen() == Screen::title && autosaved && autosaved->second == 0,
        "Confirming title did not autosave the new run");
    std::puts("Connected shell passed: title, seed entry, save and overwrite, load, Continue and autosave confirmation");
}

void shellSmoke(Session& session, View& view, const SmokeFrame& frame, const SaveSlots& store)
{
    InteractionProbe{view, frame}.shell(session, store);
}

void InteractionProbe::lifeMap(Session& session, const SaveSlots& store, const std::filesystem::path& shop)
{
    const auto idle = [&] { waitFor(session, [&] { return !session.busy() && !session.opening(); }, present); };
    const auto apply = [&](const char* selector, bool confirm = false) {
        const auto old = session.generation();
        click(selector, true);
        if (confirm) click("#dialog-confirm");
        idle();
        require(session.generation() > old, "Life Map action did not replace the forecast");
    };
    const auto actionControl = [&](const auto& choice) {
        const auto found = std::ranges::find_if(view.life_.choices, choice);
        if (found == view.life_.choices.end()) {
            auto message = "Life Map choice is missing at " + view.life_.current + " · " + view.life_.decision;
            for (const auto& option : view.life_.choices) message += " | " + option.label + " " + option.reason;
            throw std::runtime_error(message);
        }
        const auto index = found - view.life_.choices.begin();
        return "[data-op=life-choice][data-id='" + std::to_string(index) + "']";
    };
    const auto actionKind = [&](std::string_view kind) {
        return actionControl([&](const LifeChoice& option) {
            return option.command.kind == kind && option.reason.empty();
        });
    };
    const auto pickOffer = [&](const ShopItem& offer) {
        click(("[data-op=life-offer][data-id='" + offer.id + "']").c_str());
    };
    const auto shopControl = [](std::string_view op, std::string_view id) {
        return "[data-op='" + std::string(op) + "'][data-id='" + std::string(id) + "']";
    };
    const auto tap = [&](const std::string& selector) {
        auto& button = control(selector.c_str());
        button.ScrollIntoView(Rml::ScrollAlignment::Nearest);
        present(nullptr);
        const auto at = center(button);
        finger(SDL_EVENT_FINGER_DOWN, 1, at);
        finger(SDL_EVENT_FINGER_UP, 1, at);
        present(nullptr);
    };
    const auto drag = [&](const std::string& source, const std::string& target, const char* capture = nullptr) {
        auto& from = control(source.c_str());
        from.ScrollIntoView(Rml::ScrollAlignment::Nearest);
        present(nullptr);
        const auto start = center(from);
        pointer(SDL_EVENT_MOUSE_BUTTON_DOWN, start);
        pointer(SDL_EVENT_MOUSE_MOTION, {start.x + 12.f, start.y});
        present(nullptr);
        auto& to = control(target.c_str());
        const auto end = center(to);
        pointer(SDL_EVENT_MOUSE_MOTION, end);
        require(to.IsClassSet("drop-hover"), "Mouse drag did not highlight its target");
        if (capture) present(capture);
        const auto at = center(control(target.c_str()));
        pointer(SDL_EVENT_MOUSE_BUTTON_UP, at);
        present(nullptr);
    };
    idle();
    present("01-atlas");
    selectCapital(session, view.selection_);
    present(nullptr);
    const auto atlas = view.bounds("map");
    for (const auto& shape : session.shapes()) {
        const auto point = view.map_.project(shape.label, atlas);
        const auto target = view.hit(point);
        if (!SDL_PointInRectFloat(&point, &atlas) || !target || *target == view.selection_.region) continue;
        pointer(SDL_EVENT_MOUSE_MOTION, point);
        break;
    }
    present("01a-selected-and-hovered");
    require(!view.hoveredRegion_.empty() && view.hoveredRegion_ != view.selection_.region,
        "Label smoke did not find a separate hovered region");
    std::vector<SDL_FRect> visibleLabels;
    auto& markers = control("#markers");
    for (int i = 0; i < markers.GetNumChildren(); ++i) {
        const auto& region = session.displayed()->regions.at(static_cast<std::size_t>(i));
        auto& label = *markers.GetChild(i);
        if (region.id == view.selection_.region || region.id == view.hoveredRegion_)
            require(!label.IsClassSet("occluded"), "Selected or hovered regional name was hidden");
        if (label.IsClassSet("occluded")) continue;
        const auto at = label.GetAbsoluteOffset(Rml::BoxArea::Border);
        const auto size = label.GetBox().GetSize(Rml::BoxArea::Border);
        const SDL_FRect box{at.x, at.y, size.x, size.y};
        require(std::ranges::none_of(visibleLabels, [&](const auto& other) {
            return SDL_HasRectIntersectionFloat(&box, &other);
        }), "Visible regional labels overlap");
        visibleLabels.push_back(box);
    }
    click("#life-toggle");
    require(view.life_.candidates.size() >= 2, "Opening candidates not displayed");
    present("02-vassal-candidates");
    apply("[data-op=life-reroll]", true);
    require(view.life_.rerolls == 1, "Reroll count did not update");
    apply("[data-op=life-candidate][data-id='0']", true);
    require(!view.life_.actor.empty(), "Vassal appointment did not show its graph");
    present("03-life-route");
    apply("[data-op=life-enter]", true);
    present("04-specialty");
    const auto beforeSpecialty = session.actionCount();
    const auto beforeShopDigest = session.displayedDigest();
    click(actionKind("vassalSelectLifeOption").c_str());
    require(view.life_.shop && session.actionCount() == beforeSpecialty && session.displayedDigest() == beforeShopDigest,
        "Specialty changed Live before checkout");
    const auto practice = std::ranges::find_if(view.life_.shop->offers, [](const ShopItem& item) {
        return item.kind == "practice" && item.mode == "learn" && item.reason.empty();
    });
    require(practice != view.life_.shop->offers.end(), "Seed 42 Shop has no Practice offer");
    const auto practiceId = practice->piece;
    const auto firstPractice = view.life_.shop->practices.front().id;
    control(shopControl("life-offer", practice->id).c_str()).Focus(true);
    key(SDLK_RETURN);
    present(nullptr);
    require(view.context_.GetFocusElement() == &control("[data-op=life-slot][data-id='0']"),
        "Keyboard selection did not focus a legal destination");
    key(SDLK_RETURN);
    present("04a-practice-replacement");
    require(view.life_.shop->practices.front().art == practiceId &&
        std::ranges::find(view.life_.shop->discarded, firstPractice, &ShopPiece::id) != view.life_.shop->discarded.end(),
        "Practice replacement did not show both cards");
    const auto receipt = view.life_.shop->staged.front().id;
    click(shopControl("life-receipt", receipt).c_str());
    tap(shopControl("life-slot", "1"));
    require(view.life_.shop->practices[1].art == practiceId, "The staged Practice did not reorder");
    click("[data-op=life-revert]");
    require(view.life_.shop->practices.front().art == practiceId, "Undo did not restore the staged order");
    const auto oldPractice = view.life_.shop->practices[1].id;
    drag(shopControl("life-slot", "1"), shopControl("life-slot", "4"));
    require(view.life_.shop->practices[1].id == oldPractice && view.shopError_ == actionReason("invalidPurchaseOrder"),
        "An invalid drop changed the board or hid its reason");
    drag(shopControl("life-slot", "1"), shopControl("life-slot", "2"), "04b-practice-drag");
    require(view.life_.shop->practices[2].id == oldPractice, "Installed Practice did not reorder");
    click(shopControl("life-slot", "2").c_str());
    tap("[data-op=life-scrap]");
    require(std::ranges::find(view.life_.shop->discarded, oldPractice, &ShopPiece::id) != view.life_.shop->discarded.end(),
        "Discard did not preserve the Practice for recovery");
    tap(shopControl("life-recover", oldPractice));
    tap(shopControl("life-slot", "2"));
    require(view.life_.shop->practices[2].id == oldPractice, "Discarded Practice did not recover");
    click(actionKind("vassalConfirmLifeNode").c_str());
    require(view.dialog_, "Checkout review is missing");
    key(SDLK_ESCAPE);
    present(nullptr);
    require(view.life_.shop->practices.front().art == practiceId && session.actionCount() == beforeSpecialty &&
        session.displayedDigest() == beforeShopDigest, "Cancel checkout changed Live or discarded the draft");
    click("[data-op=life-cancel-draft]");
    require(view.life_.shopSpecialty && session.actionCount() == beforeSpecialty &&
        session.displayedDigest() == beforeShopDigest, "Clear draft changed Live");
    click(actionKind("vassalSelectLifeOption").c_str());
    const auto practiceAgain = std::ranges::find(view.life_.shop->offers, practiceId, &ShopItem::piece);
    require(practiceAgain != view.life_.shop->offers.end(), "Clear draft consumed specialty RNG from Live");
    pickOffer(*practiceAgain);
    click("[data-op=life-slot][data-id='0']", true);
    apply(actionKind("vassalConfirmLifeNode").c_str(), true);
    require(session.actionCount() == beforeSpecialty + 3 &&
        session.displayedDigest() == session.replayDigest(session.displayed()->second),
        "Practice checkout did not journal specialty, purchase and confirmation atomically");
    require(view.life_.progress.has_value(), "Shop confirmation did not expose timed resolution");
    present("05-resolving");
    apply(actionControl([](const LifeChoice& option) { return option.command.advance; }).c_str());
    require(!view.life_.events.empty(), "Resolved node did not emit life events");
    present("06-outcome");
    const auto crossroads = std::ranges::find_if(view.life_.nodes, [](const LifeNode& node) {
        return node.status == NodeStatus::available && node.label == "Crossroads";
    });
    require(crossroads != view.life_.nodes.end(), "Seed 42 has no reachable Crossroads");
    click(("[data-op=life-node][data-id='" + crossroads->id + "']").c_str());
    apply("[data-op=life-enter]", true);
    present("06a-crossroads");
    apply(actionKind("vassalSelectLifeOption").c_str());
    click(actionKind("vassalConfirmLifeNode").c_str());
    require(view.dialog_, "Node choice did not present confirmation");
    present("06b-node-confirmation");
    const auto optionGeneration = session.generation();
    click("#dialog-confirm");
    idle();
    require(session.generation() > optionGeneration, "Crossroads did not commit");
    if (view.life_.progress)
        apply(actionControl([](const LifeChoice& option) { return option.command.advance; }).c_str());


    // Use the pinned parity exhibit for a structure with actual Currency and
    // a second offer whose payment cannot be met.
    view.shell_.open(Launch{.save = shop / "shop.json", .horizon = 512});
    idle();
    click("#life-toggle");
    require(view.life_.shop.has_value(), "Currency exhibit did not open its shop");
    present("07-shop");
    const auto offer = std::ranges::find_if(view.life_.shop->offers, [](const ShopItem& item) { return !item.spans.empty(); });
    require(offer != view.life_.shop->offers.end(), "No affordable structure placement is available");
    const auto placed = *offer;
    pickOffer(placed);
    const auto span = placed.spans.front();
    const auto destination = "[data-op=life-origin][data-id='" + std::to_string(span.origin) + "']";
    require(control(destination.c_str()).IsClassSet("valid-target"), "Construction destination is not marked");
    present("08-placement");
    const auto stagedGeneration = session.generation();
    const auto stagedDigest = session.displayedDigest();
    click(destination.c_str(), true);
    require(session.generation() == stagedGeneration && session.displayedDigest() == stagedDigest &&
        view.life_.shop->staged.size() == 1 &&
        view.life_.shop->staged.front().cost.find("Currency") != std::string::npos &&
        view.life_.shop->cells.at(span.origin) != "",
        "Staged purchase did not show its cost and placement");
    present("10-staged-purchase");

    const auto blocked = std::ranges::find_if(view.life_.shop->offers, [](const ShopItem& item) {
        return item.reason.find("insufficient available Currency") != std::string::npos;
    });
    require(blocked != view.life_.shop->offers.end(), "Missing Currency rejection on the offer");
    const auto rejected = *blocked;
    pickOffer(rejected);
    const auto liveBeforeRejection = session.displayedDigest();
    const auto beforeCount = session.actionCount();
    const auto beforeGeneration = session.generation();
    require(view.selectedOffer() && view.selectedOffer()->reason == rejected.reason &&
        !session.busy(), "Blocked offer did not explain its payment");
    present("11-insufficient-currency");
    view.stageShop(rejected.command);
    require(view.shopError_ == rejected.reason && view.life_.shop->staged.size() == 1,
        "Rejected edit changed the detached draft");
    auto invalidCheckout = view.life_.choices.front().command;
    invalidCheckout.payload.front().value = core::json::Value("stale-node");
    view.submitShop(invalidCheckout);
    for (int attempts = 0; session.busy() && attempts < 400; ++attempts) {
        session.update();
        present(nullptr);
        SDL_Delay(1);
    }
    require(session.error().ends_with("nodeUnavailable") && session.actionCount() == beforeCount &&
        session.generation() == beforeGeneration && session.displayedDigest() == liveBeforeRejection &&
        view.life_.shop->staged.size() == 1 && view.shopError_ == actionReason("nodeUnavailable"),
        "Rejected checkout changed the run or lost its draft and reason");

    const auto unlock = std::ranges::find_if(view.life_.shop->offers, [](const ShopItem& item) {
        return item.id.starts_with("practice-slot:");
    });
    require(unlock != view.life_.shop->offers.end(), "Missing Practice slot offer");
    pickOffer(*unlock);
    click("[data-op=life-purchase]");
    present("11a-slot-unlock");
    const auto route = std::ranges::find(view.life_.shop->offers, "legacy-route-add", &ShopItem::id);
    require(route != view.life_.shop->offers.end(), "Missing route offer");
    pickOffer(*route);
    click("[data-op=life-purchase]");
    present("11b-connection");
    const auto roads = session.displayed()->roads.size();
    click(actionKind("vassalConfirmLifeNode").c_str());
    require(view.dialog_ && control("#dialog-cost").GetInnerRML().find("Currency") != std::string::npos,
        "Paid checkout review did not disclose its full cost");
    present("09-purchase-confirmation");
    click("#dialog-confirm");
    idle();
    require(session.actionCount() == beforeCount + 4 && session.generation() > beforeGeneration,
        "Checkout did not append one complete batch");
    require(session.displayed()->roads.size() == roads + 1, "Checkout did not build the staged connection");
    const auto activeRegion = std::ranges::find(session.displayed()->regions,
        session.displayed()->vassalRegion, &Region::id);
    require(activeRegion != session.displayed()->regions.end() && !activeRegion->cards[3].locked,
        "Checkout did not unlock the staged Practice slot");
    require(view.life_.progress.has_value(), "Checkout did not show resolution");
    const auto start = view.life_.progress->first, end = view.life_.progress->second;
    const auto target = start + (end - start) / 2;
    waitFor(session, [&] { return session.chart().through.value_or(0) >= end; }, present);
    scrub(target, SDL_EVENT_FINGER_DOWN);
    scrub(target, SDL_EVENT_FINGER_UP);
    waitFor(session, [&] { return session.previewReady(); }, present);
    require(session.displayed()->second == target && session.displayedDigest() == session.replayDigest(target),
        "Displayed Life Map preview differs from rebuildStateAtSecond");
    require(!session.submit(rejected.command) && view.lifeReadOnly_, "Timegraph Preview accepted a purchase");
    present("12-read-only-preview");
    click("#live");
    require(!session.previewing() && session.displayed()->second == start, "Back to Live lost the checkout");
    apply(actionControl([](const LifeChoice& option) { return option.command.advance; }).c_str());
    const auto digest = session.displayedDigest(), second = session.displayed()->second;
    require(digest == session.replayDigest(second), "Paid checkout differs from authoritative replay");
    click("#save-game");
    click("[data-op=slot][data-id='1']");
    if (view.dialog_) click("#dialog-confirm");
    require(store.inspect(Slot::first).metadata.has_value(), "Life Map save slot is missing");
    present("13-saved");
    view.shell_.show(Screen::load);
    present(nullptr);
    click("[data-op=slot][data-id='1']");
    idle();
    require(session.displayed()->second == second && session.displayedDigest() == digest,
        "Loaded Life Map state differs from the saved frontier");
    click("#life-toggle");
    present("14-loaded");

    const auto openShop = [&](const std::string& id) {
        view.shell_.open(Launch{.save = shop / (id + ".json"), .horizon = 128});
        idle();
        click("#life-toggle");
        require(view.life_.shop || view.life_.shopSpecialty, "The browser reference Shop is not reachable");
    };
    const auto readFixture = [&](const std::string& id) {
        std::ifstream input(shop / (id + ".json"), std::ios::binary);
        return core::json::parse(std::string(std::istreambuf_iterator<char>(input), {}));
    };
    const auto exactCheckout = [&](const std::string& id) {
        apply(actionKind("vassalConfirmLifeNode").c_str(), true);
        const auto frontier = session.displayed()->second;
        require(session.displayedDigest() == session.replayDigest(frontier),
            "Reference Shop checkout diverged from authoritative replay");
        require(core::json::canonical_json(session.journalForTest()) ==
            core::json::canonical_json(readFixture(id + "-journal")), "Shop action payloads differ from the browser journal");
        const auto expected = readBrowserSave(readFixture(id + "-checked-out"));
        require(session.displayedDigest() == sim::state_digest(expected.live),
            "Shop checkout state differs from the browser reference");
    };
    const auto pick = [&](std::string_view id) {
        click(shopControl("life-offer", id).c_str());
    };
    const auto slot = [&](std::size_t index) { return shopControl("life-slot", std::to_string(index)); };
    const auto space = [&](std::size_t index) { return shopControl("life-origin", std::to_string(index)); };
    const auto building = [&](std::string_view id) {
        const auto found = std::ranges::find(view.life_.shop->structures, id, &ShopPiece::id);
        require(found != view.life_.shop->structures.end(), "Expected Structure is missing from the tableau");
        return *found;
    };

    const std::string practices = "seed-42-shops";
    openShop(practices);
    const auto random = actionControl([](const LifeChoice& choice) {
        return choice.command.kind == "vassalSelectLifeOption" && choice.command.payload.front().value.as_string() == "random";
    });
    tap(random);
    const std::string practiceOffer = "life-milestone-milestone-1:r0:practice:0";
    pick(practiceOffer);
    click(shopControl("life-insert-mode", "insert").c_str());
    drag(shopControl("life-offer", practiceOffer), slot(0));
    exactCheckout(practices);

    const std::string structures = "action-structure-shop";
    openShop(structures);
    pick("life-d02-r01:r0:structure:0");
    tap("[data-op=life-purchase]");
    const auto reserved = std::ranges::find_if(view.life_.shop->structures, [](const ShopPiece& piece) {
        return !piece.receipt.empty();
    });
    require(reserved != view.life_.shop->structures.end(), "Staged Structure is missing");
    const auto reservation = *reserved;
    drag(space(reservation.origin), space(5), "16-structure-drag");
    require(building(reservation.id).origin == 5, "Reserved Structure did not move");
    tap("[data-op=life-revert]");
    require(building(reservation.id).origin == reservation.origin, "Undo did not restore reservation");
    tap(space(reservation.origin));
    tap(space(5));
    const auto oldHousing = building("structure:R12:housing:2");
    drag(space(oldHousing.origin), space(3));
    const auto support = building("structure:R12:support");
    click(space(support.origin).c_str());
    tap("[data-op=life-scrap]");
    require(std::ranges::find(view.life_.shop->demolished, support.id, &ShopPiece::id) != view.life_.shop->demolished.end(),
        "Demolition is missing from the board preview");
    tap(shopControl("life-recover", support.id));
    tap(space(support.origin));
    require(building(support.id).origin == support.origin, "Demolished Structure did not recover");
    tap("[data-op=life-revert]");
    present("17-demolition");
    exactCheckout(structures);

    const std::string unlocks = "action-shop-unlocks";
    openShop(unlocks);
    pick("practice-slot:4");
    tap("[data-op=life-purchase]");
    pick("practice-slot:5");
    tap("[data-op=life-purchase]");
    tap(shopControl("life-undo-purchase", "practice-slot:4"));
    require(view.shopError_ == actionReason("practiceUnlockInUse") && view.life_.shop->capacity == 5,
        "A rejected slot undo changed the draft");
    tap(shopControl("life-undo-purchase", "practice-slot:5"));
    require(view.life_.shop->capacity == 4, "Undo did not relock the Practice slot");
    pick("practice-slot:5");
    tap("[data-op=life-purchase]");
    exactCheckout(unlocks);

    const std::string currency = "action-shop-currency";
    openShop(currency);
    pick("life-d03-r03:r0:structure:1");
    require(view.selectedOffer() && view.selectedOffer()->reason == actionReason("insufficientCurrency"),
        "Blocked Structure did not disclose its Currency cost");
    pick("life-d03-r03:r0:structure:0");
    tap("[data-op=life-purchase]");
    exactCheckout(currency);

    view.shell_.open(Launch{.save = shop / "retirement.json", .horizon = 128});
    idle();
    click("#life-toggle");
    require(view.life_.succession.find("retired") != std::string::npos && !view.life_.candidates.empty(),
        "Retirement did not display the successor candidates and end of tenure");
    present("15-succession");
    std::printf("Life Map smoke passed: detached draft, cancel and rejection, mouse, keyboard and touch, "
        "four browser reference checkouts, replay scrub t=%llu, live save/load t=%llu\n",
        static_cast<unsigned long long>(target), static_cast<unsigned long long>(second));
}

void lifeMapSmoke(Session& session, View& view, const SmokeFrame& frame, const SaveSlots& store,
                  const std::filesystem::path& shop)
{
    InteractionProbe{view, frame}.lifeMap(session, store, shop);
}

void InteractionProbe::run(Session& session, const SaveSlots& store)
{
    using sim::browser::RunEndReason;
    waitFor(session, [&] { return !session.opening(); }, present);
    const auto projected = session.projectedOutcome();
    require(projected.has_value() && !session.liveSnapshot()->terminal, "Run smoke needs a future outcome");
    const auto first = session.chart().start;
    const auto end = projected->second;
    const bool pending = std::ranges::any_of(session.liveSnapshot()->choices, [](const Choice& choice) {
        return choice.kind == Decision::advance;
    });
    const bool fullRun = projected->reason == RunEndReason::monsterOverrun && end > first + 64;
    const auto readyAt = [&](Second second) {
        waitFor(session, [&] { return session.previewReady() && session.displayed()->second == second; }, present);
    };
    const auto tap = [&](const char* selector) {
        const auto at = center(control(selector));
        finger(SDL_EVENT_FINGER_DOWN, 1, at);
        finger(SDL_EVENT_FINGER_UP, 1, at);
        present(nullptr);
    };
    const auto fileDigest = [&](Slot slot) {
        const auto path = store.path(slot).u8string();
        return core::sha256_text(readAsset(reinterpret_cast<const char*>(path.c_str())));
    };
    const auto checkpoint = [&](Slot slot) {
        view.shell_.show(Screen::save);
        view.shell_.selectSlot(slot);
        require(view.shell_.screen() == Screen::game, "Could not save the test frontier");
        present(nullptr);
        return fileDigest(slot);
    };
    const auto baseSave = checkpoint(Slot::first);
    const auto baseLive = session.liveDigest();
    const auto baseJournal = session.journalDigest();
    require(!view.shell_.hasUnsavedProgress(), "Saved frontier is still marked unsaved");
    view.notify("");
    waitFor(session, [&] { return view.terrainReady(); }, present);
    present("n04n-01-live");

    click("#run-follow");
    readyAt(end);
    require(session.followingForecast() && !view.shownOutcome_ &&
        control("#run-viewed").GetInnerRML().find("Forecast") != std::string::npos &&
        control("#run-live-time").GetInnerRML().find("Read-only") != std::string::npos,
        "Forecast follow did not enter a read-only preview");
    require(control("#run-loss-year").GetInnerRML() == "Foreseen · Year " + std::to_string(projected->year),
        "Forecast cause and year were not visible during scrub");
    require(!session.advanceLive(end) && !session.submit({"vassalRerollCandidates", {}, {}}),
        "A forecast preview accepted a Live action");
    pointer(SDL_EVENT_MOUSE_MOTION, {2, 2});
    present("n04n-02-forecast");

    if (fullRun) {
        scrub(end / 2, SDL_EVENT_FINGER_DOWN);
        scrub(end / 3, SDL_EVENT_FINGER_MOTION);
        scrub(end / 3, SDL_EVENT_FINGER_UP);
        require(session.requested() && *session.requested() < end && !session.followingForecast(),
            "Touch scrub did not detach from forecast follow");
        readyAt(*session.requested());
        const auto state = session.replayStateForTest(session.displayed()->second);
        require(control("#run-year").GetInnerRML() == "Year " + std::to_string(static_cast<int>(state.hot.year)) &&
            control("#run-season").GetInnerRML() == session.displayed()->season,
            "Calendar and its displayed snapshot were out of sync");
        click("#run-forward");
        require(session.playbackRate() == 1, "Normal forward notch was not selected");
        tap("#run-hold");
        const auto hold = session.requested();
        SDL_Delay(70);
        present(nullptr);
        require(!session.playbackRate() && session.requested() == hold, "Hold moved the viewed second");
        require(session.scrub(end - 8), "Could not prepare upper playback bound");
        readyAt(end - 8);
        tap("#run-forward-fast");
        waitFor(session, [&] { return !session.playbackRate() && session.previewReady(); }, present);
        require(session.displayed()->second == end, "Forward playback crossed or missed the bound");
        require(session.scrub(first + 8), "Could not prepare lower playback bound");
        readyAt(first + 8);
        control("#run-rewind-fast").Focus(true);
        key(SDLK_RETURN);
        waitFor(session, [&] { return !session.playbackRate() && session.previewReady(); }, present);
        require(session.displayed()->second == first, "Rewind crossed or missed the bound");
    } else {
        control("#plot").Focus(true);
        key(SDLK_LEFT);
        readyAt(end - 1);
        require(!session.followingForecast(), "Keyboard scrub did not detach from forecast follow");
    }

    click("#run-outcome");
    require(view.shownOutcome_ == projected && view.outcomeProjected_ &&
        control("#outcome-title").GetInnerRML() == "Foreseen extinction", "Projected outcome details were missing");
    key(SDLK_ESCAPE);
    readyAt(end);
    click("#live");
    require(!session.previewing() && !session.followingForecast() && session.liveDigest() == baseLive &&
        session.journalDigest() == baseJournal && fileDigest(Slot::first) == baseSave &&
        !view.shell_.hasUnsavedProgress(), "Browsing changed a saved frontier or journal");

    if (fullRun) {
        preparePracticeShop(session, view.selection_, present);
        const auto& selection = view.selection_;
        require(session.reorder(selection.region, *selection.card, *selection.destination),
            "Could not apply the forecast-changing Practice Reform");
        waitFor(session, [&] { return !session.busy() && session.projectedOutcome().has_value(); }, present);
        require(session.projectedOutcome() != projected && !view.shownOutcome_ &&
            session.liveDigest() == session.replayDigest(session.liveSnapshot()->second),
            "Forecast or replay did not change correctly after the action");
        present("n04n-03-revised");
        view.shell_.open(Launch{.save = store.path(Slot::first), .nativeSave = true});
        waitFor(session, [&] { return !session.opening(); }, present);
        view.shell_.update();
    }

    if (!fullRun) click("#motion");
    if (pending) {
        click("#life-toggle");
        click("[data-op=life-choice][data-id='0']");
    } else {
        click("#run-advance");
        require(view.dialog_ && view.confirmedAdvance_ == end, "Live advance did not quote the outcome boundary");
        tap("#dialog-confirm");
    }
    waitFor(session, [&] { return session.liveSnapshot()->terminal && view.shownOutcome_.has_value(); }, present);
    const auto endingDigest = session.liveDigest();
    require(session.liveSnapshot()->outcome == projected && !view.outcomeProjected_ &&
        session.replayDigest(end) == endingDigest && session.journalDigest() == baseJournal &&
        view.shell_.hasUnsavedProgress(), "Confirmed outcome differs from the forecast or authoritative replay");
    require(control("#outcome-title").GetInnerRML() ==
        (projected->reason == RunEndReason::tenuresExhausted ? "Dynasty complete" : "Game over"),
        "Confirmed outcome had the wrong title");
    require(control("#outcome-dialog").IsClassSet("emphasis") != reduced(),
        "Outcome emphasis did not respect Motion");
    if (projected->reason == RunEndReason::tenuresExhausted)
        require(control("#run-tenure-count").GetInnerRML() == "Tenures 0/10" &&
            control("#run-best").GetInnerRML().starts_with("10 used"), "Final tenure was not counted");
    present("n04n-04-run-end");
    tap("#outcome-browse");
    readyAt(end);
    key(SDLK_LEFT);
    readyAt(end - 1);
    require(session.displayed()->second < session.liveSnapshot()->second &&
        !session.submit({"vassalRerollCandidates", {}, {}}), "Ended history allowed an action");
    if (projected->reason == RunEndReason::tenuresExhausted)
        require(control("#run-tenure-count").GetInnerRML() == "Tenures 1/10" &&
            control("#run-best").GetInnerRML().starts_with("9 used"), "Past tenure count did not restore");
    view.document_->Focus(false);
    pointer(SDL_EVENT_MOUSE_MOTION, {2, 2});
    present("n04n-05-history");

    click("#run-outcome");
    click("#outcome-new");
    require(view.dialog_ && view.shownOutcome_, "New Game did not ask for confirmation");
    present("n04n-06-restart-confirmation");
    key(SDLK_ESCAPE);
    require(view.shownOutcome_ && !view.dialog_ && session.liveDigest() == endingDigest &&
        session.journalDigest() == baseJournal && fileDigest(Slot::first) == baseSave,
        "Outcome browsing or cancelling restart changed the save or journal");
    click("#outcome-new");
    control("#dialog-confirm").Focus(true);
    key(SDLK_RETURN);
    waitFor(session, [&] { return !session.opening() && session.liveSnapshot() && !session.liveSnapshot()->terminal; }, present);
    require(!view.shownOutcome_ && !session.previewing() && session.liveSnapshot()->second == 0 &&
        session.liveSnapshot()->tenuresRemaining == 10 && !session.actionCount() &&
        fileDigest(Slot::first) == baseSave, "Confirmed New Game did not create a fresh run");
    std::printf("Run smoke passed: %s, year %llu, second %llu, replay/save/journal checks, confirmed restart.\n",
        terminalText(projected->reason), static_cast<unsigned long long>(projected->year),
        static_cast<unsigned long long>(end));
}

void runSmoke(Session& session, View& view, const SmokeFrame& frame, const SaveSlots& store)
{
    InteractionProbe{view, frame}.run(session, store);
}

void saveSmoke(const Launch& launch, const std::filesystem::path& directory)
{
    SaveSlots store(directory);
    for (auto slot : slots) std::filesystem::remove(store.path(slot));
    Session session;
    Selection selection;
    Shell shell(session, selection, store);
    shell.open(launch);
    smoke(session, selection, {});
    const auto digest = session.displayedDigest();
    const auto live = session.liveSnapshot()->second;
    const auto count = session.actionCount();
    const auto generation = session.generation();
    require(session.scrub(live + 1), "Could not enter preview before saving");
    waitFor(session, [&] { return session.previewReady(); }, {});
    require(session.displayedDigest() != digest, "Save test requires a distinct preview");
    shell.show(Screen::save);
    shell.selectSlot(Slot::first);
    require(shell.screen() == Screen::game, "Manual save failed");
    shell.show(Screen::save);
    shell.selectSlot(Slot::first);
    require(shell.overwrite() == Slot::first && shell.screen() == Screen::save, "Overwrite confirmation missing");
    shell.confirmOverwrite();
    require(shell.screen() == Screen::game, "Atomic overwrite failed");
    const auto manual = store.inspect(Slot::first).metadata;
    require(manual && manual->regions == 20 && manual->second == live &&
        manual->year == session.liveSnapshot()->year && !manual->savedAt.empty() && !manual->version.empty(),
        "Manual metadata does not describe the live state");
    session.suspend();
    require(session.suspended() && !session.coverage() && !session.previewing(), "Suspend left forecast or preview active");
    require(shell.autosave(), "Background autosave failed");
    session.resume();
    waitFor(session, [&] { return session.chart().through.has_value(); }, {});
    require(session.generation() > generation && session.displayedDigest() == digest, "Resume changed the live state");

    const auto verifyReopened = [&] {
        waitFor(session, [&] { return session.liveSnapshot() && !session.opening(); }, {});
        require(session.liveSnapshot()->second == live && session.actionCount() == count &&
            session.displayedDigest() == digest && session.replayDigest(live) == digest, "Loaded state differs from live digest");
        require(session.chart().through && *session.chart().through > live, "Load did not restart the forecast");
    };
    require(shell.returnToTitle(), "Could not return to title");
    shell.show(Screen::load);
    shell.selectSlot(Slot::first);
    verifyReopened();
    require(shell.returnToTitle(), "Could not return to title after load");
    shell.continueGame();
    verifyReopened();

    const auto manualPath = store.path(Slot::first).u8string();
    auto bytes = readAsset(reinterpret_cast<const char*>(manualPath.c_str()));
    const auto version = bytes.find("\"saveVersion\":1");
    require(version != std::string::npos, "Save version stamp is missing");
    bytes[version + std::string_view("\"saveVersion\":").size()] = '2';
    std::ofstream(store.path(Slot::second), std::ios::binary) << bytes;
    bytes[version + std::string_view("\"saveVersion\":").size()] = '1';
    bytes.back() = '!';
    std::ofstream(store.path(Slot::third), std::ios::binary) << bytes;
    for (const auto& [slot, expected] : {std::pair{Slot::second, "Incompatible save version"},
                                       std::pair{Slot::third, "Corrupt save data"}}) {
        require(store.inspect(slot).error == expected, "Slot list did not report the expected error");
        session.close();
        shell.open(Launch{.save = store.path(slot), .nativeSave = true});
        const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
        while (session.busy() && std::chrono::steady_clock::now() < deadline) {
            shell.update();
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        require(shell.screen() == Screen::title && shell.message().find(expected) != std::string::npos &&
            !session.liveSnapshot(), "Invalid save was not reported to the title screen");
    }
    shell.open(launch);
    waitFor(session, [&] { return !session.opening(); }, {});
    Shell unableToSave(session, selection, SaveSlots(store.path(Slot::first)));
    unableToSave.show(Screen::save);
    unableToSave.selectSlot(Slot::first);
    if (unableToSave.overwrite()) unableToSave.confirmOverwrite();
    require(unableToSave.screen() == Screen::save && unableToSave.messageError() && session.liveSnapshot(),
        "Failed save lost the run or hid its error");
    std::puts("Native save slots passed: live digest, overwrite, load, autosave, continue, suspend/resume, invalid files and write failure");
}

}
