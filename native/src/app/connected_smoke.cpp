#include "connected_smoke.hpp"
#include "connected_view.hpp"
#include "sdl_asset_file.hpp"

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

    void key(SDL_Keycode keycode)
    {
        SDL_Event event{};
        event.type = SDL_EVENT_KEY_DOWN;
        event.key.key = keycode;
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
    if (frame) frame("01-regional-map");
    if (frame) {
        if (view) {
            InteractionProbe probe{*view, frame};
            probe.touchCamera();
            probe.selectCapital(session, selection);
        }
        else selection.select(session.displayed()->capital);
        frame("02-settlement");
        if (view) {
            InteractionProbe probe{*view, frame};
            probe.click("[data-op=card][data-id='0']");
            require(selection.card == 0, "Card click did not open Practice inspection");
            probe.touchHelp();
            require(selection.card == 0, "Releasing touch help activated the Practice");
            probe.pointer(SDL_EVENT_MOUSE_MOTION, {5, 5});
        } else require(selection.inspect(session.displayed(), 0), "Opening inspection failed");
        frame("03-practice-inspection");
    }
    preparePracticeShop(session, selection, frame);
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
