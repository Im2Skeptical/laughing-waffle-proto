#include "connected_view.hpp"

#include <RmlUi/Core/StringUtilities.h>
#include <RmlUi/Core/Elements/ElementFormControl.h>
#include <algorithm>
#include <cmath>
#include <numeric>
#include <utility>

namespace waffle::connected {
namespace {

bool contains(SDL_FRect rect, SDL_FPoint point)
{
    return SDL_PointInRectFloat(&point, &rect);
}

void show(Rml::Element& element, bool visible)
{
    element.SetProperty("display", visible ? "block" : "none");
}

bool isControl(Rml::Element* element)
{
    return element && element->HasAttribute("data-op") && !element->HasAttribute("disabled") &&
        !element->IsClassSet("disabled");
}

constexpr Uint64 helpDelay = 450;

}

void View::notify(std::string text, bool error)
{
    if (text == notice_ && error == noticeError_) return;
    notice_ = std::move(text);
    noticeError_ = error;
    noticeUntil_ = SDL_GetTicks() + 3000;
    auto& node = element("notice");
    node.SetClass("error", error);
    node.SetClass("success", !error);
    node.SetInnerRML(Rml::StringUtilities::EncodeRml(notice_));
    show(node, !notice_.empty());
}

void View::refreshReadout()
{
    auto& node = element("readout");
    const auto second = drag_ == Drag::graph ? session_.requested() : hoverSecond_;
    const auto& chart = session_.chart();
    const auto* displayed = session_.displayed();
    const bool available = !loadingVisible_ && chart.through && second && displayed;
    if (!available) {
        if (!currentReadout_.empty()) {
            show(node, false);
            currentReadout_.clear();
        }
        return;
    }
    std::string text = std::to_string(*second) + " s";
    if (displayed->second == *second) {
        const auto pop = std::accumulate(displayed->regions.begin(), displayed->regions.end(), 0.,
            [](double total, const Region& region) { return total + region.population; });
        text += " · " + std::to_string(std::llround(pop)) + " residents";
    } else {
        const auto fraction = static_cast<double>(*second - chart.start) / std::max<Second>(1, chart.end - chart.start);
        const auto band = static_cast<std::size_t>(std::clamp(std::llround(fraction * (Chart::width - 1)),
            0LL, static_cast<long long>(Chart::width - 1)));
        if (chart.population[band].count) {
            const auto& sample = chart.population[band];
            text += " · " + std::to_string(std::llround(sample.low));
            if (sample.low != sample.high) text += "–" + std::to_string(std::llround(sample.high));
            text += " residents in band";
        }
    }
    if (currentReadout_ != text) {
        node.SetInnerRML(currentReadout_ = std::move(text));
        show(node, true);
    }
    const auto maxX = bounds("timegraph").w - 210;
    const auto x = std::clamp(xAt(*second) - bounds("timegraph").x - 40, 4.f, std::max(4.f, maxX));
    node.SetProperty("left", std::to_string(static_cast<int>(x)) + "px");
}

void View::refreshHelp()
{
    bool focusHelp = false;
    auto* target = context_.GetHoverElement();
    auto* focus = context_.GetFocusElement();
    if (!pointerDown_ && focus && focus->IsPseudoClassSet("focus-visible")) {
        target = focus;
        focusHelp = true;
    }
    std::string text;
    if (touch_ && pointerDown_ && !moved_ && drag_ != Drag::graph && now_ - pressedAt_ >= helpDelay)
        longPress_ = true;
    const bool showHelp = (drag_ == Drag::none || !moved_) &&
        (focusHelp || longPress_ || (!touch_ && !pointerDown_ && now_ - hoveredAt_ >= helpDelay));
    if (showHelp && drag_ != Drag::graph && !hoverSecond_) {
        while (target && !target->HasAttribute("data-help")) target = target->GetParentNode();
        if (target) text = target->GetAttribute<Rml::String>("data-help", "");
        if (target == &element("map") && !focusHelp && !hoveredRegion_.empty() && session_.displayed()) {
            const auto& regions = session_.displayed()->regions;
            const auto region = std::ranges::find(regions, hoveredRegion_, &Region::id);
            if (region != regions.end()) text = region->name + " · " + region->settlement;
        }
    }
    auto& node = element("help");
    if (currentHelp_ != text) {
        node.SetInnerRML(Rml::StringUtilities::EncodeRml(currentHelp_ = text));
        show(node, !text.empty());
    }
    if (!text.empty()) {
        const auto safe = bounds("safe-content");
        const auto at = focusHelp ? target->GetAbsoluteOffset(Rml::BoxArea::Border) : Rml::Vector2f(pointer_.x, pointer_.y);
        const auto x = std::clamp(at.x - safe.x + 8, 3.f, std::max(3.f, safe.w - 254.f * density_));
        auto y = at.y - safe.y + (focusHelp ? -40.f : 16.f);
        if (y > safe.h - 55.f * density_) y = at.y - safe.y - 45.f;
        node.SetProperty("left", std::to_string(static_cast<int>(x)) + "px");
        node.SetProperty("top", std::to_string(static_cast<int>(std::max(3.f, y))) + "px");
    }
}

void View::selectRegion(std::string region)
{
    if (region == selection_.region) return;
    if (pendingAction_ == "reform" && session_.busy()) return;
    selection_.select(std::move(region));
}

void View::navigateMap(SDL_Keycode key)
{
    const auto* snapshot = session_.displayed();
    if (!snapshot || session_.opening()) return;
    const auto selected = std::ranges::find(snapshot->regions, selection_.region, &Region::id);
    if (selected == snapshot->regions.end()) {
        selectRegion(snapshot->capital);
        return;
    }
    const auto& shapes = session_.shapes();
    const auto& origin = shapes[static_cast<std::size_t>(selected - snapshot->regions.begin())].label;
    double best = 2;
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto dx = shapes[i].label[0] - origin[0];
        const auto dy = shapes[i].label[1] - origin[1];
        const bool horizontal = key == SDLK_LEFT || key == SDLK_RIGHT;
        const auto forward = (horizontal ? dx : dy) * (key == SDLK_LEFT || key == SDLK_UP ? -1 : 1);
        const auto distance = std::hypot(dx, dy) + 1.6 * std::abs(horizontal ? dy : dx);
        if (forward > .01 && distance < best) {
            best = distance;
            selectRegion(snapshot->regions[i].id);
        }
    }
}

void View::reviewReform()
{
    const auto* snapshot = session_.displayed();
    const auto* site = selection_.selected(snapshot);
    if (!snapshot || !canStage(*snapshot, site) || !selection_.card || !selection_.destination || !snapshot->shopSeconds) {
        notify("Practice Reform is unavailable in this view.", true);
        return;
    }
    const auto& card = site->cards[*selection_.card];
    notify("");
    confirm(Confirmation::reform, "Confirm Practice Reform",
        "Move " + card.name + " to slot " + std::to_string(*selection_.destination + 1) + ".",
        "Time cost · " + std::to_string(*snapshot->shopSeconds) + " seconds", "Spend time and reform");
}

void View::confirm(Confirmation action, std::string_view title, std::string_view copy,
                   std::string_view detail, std::string_view label)
{
    confirmation_ = action;
    element("dialog-title").SetInnerRML(Rml::StringUtilities::EncodeRml(std::string(title)));
    element("dialog-copy").SetInnerRML(Rml::StringUtilities::EncodeRml(std::string(copy)));
    auto& cost = element("dialog-cost");
    cost.SetInnerRML(Rml::StringUtilities::EncodeRml(std::string(detail)));
    show(cost, !detail.empty());
    element("dialog-confirm").SetInnerRML(Rml::StringUtilities::EncodeRml(std::string(label)));
    auto* focus = context_.GetFocusElement();
    dialogOpener_ = focus ? focus->GetObserverPtr() : Rml::ObserverPtr<Rml::Element>{};
    const bool keyboard = focus && focus->IsPseudoClassSet("focus-visible");
    auto& dialog = element("reform-dialog");
    dialog.SetClass("leave", false);
    dialog.SetClass("enter", true);
    show(element("modal-dimmer"), true);
    show(dialog, true);
    dialog_ = true;
    dialogClosedAt_ = 0;
    element("dialog-back").Focus(keyboard);
}

void View::closeConfirmation()
{
    if (!dialog_) return;
    const auto* focus = context_.GetFocusElement();
    const bool keyboard = focus && focus->IsPseudoClassSet("focus-visible");
    dialog_ = false;
    show(element("modal-dimmer"), false);
    auto& dialog = element("reform-dialog");
    dialog.SetClass("enter", false);
    dialog.SetClass("leave", true);
    if (reduced_) show(dialog, false);
    else dialogClosedAt_ = SDL_GetTicks();
    if (auto* opener = dialogOpener_.get()) opener->Focus(keyboard);
    dialogOpener_.reset();
}

void View::returnToTitle()
{
    if (session_.busy()) return;
    if (shell_.hasUnsavedProgress() || selection_.destination) {
        confirm(Confirmation::title, "Return to title?",
            "Your current run will be written to Autosave.",
            selection_.destination ? "The staged Reform will be cleared." : "", "Autosave and return");
    } else shell_.returnToTitle();
}

void View::returnLive()
{
    if (!session_.previewing()) return;
    hoverSecond_.reset();
    selection_.destination.reset();
    session_.live();
    notify("Returned to Live.");
}

bool View::back()
{
    if (pointerDown_) {
        if (drag_ == Drag::graph) returnLive();
        cancelInput();
    } else if (dialog_) {
        shell_.cancelOverwrite();
        closeConfirmation();
    } else if (shell_.screen() == Screen::load) shell_.show(Screen::title);
    else if (shell_.screen() == Screen::save) shell_.show(Screen::game);
    else if (shell_.screen() == Screen::title) return false;
    else if (noticeError_) notify("");
    else if (session_.previewing()) returnLive();
    else if (lifeOpen_) setLifeOpen(false);
    else if (selection_.destination && pendingAction_ != "reform") selection_.destination.reset();
    else if (pendingAction_ == "reform") return true;
    else if (selection_.card) selection_.card.reset();
    else if (!selection_.region.empty()) {
        selection_.select({});
        map_.overview();
        markersDirty_ = true;
    } else returnToTitle();
    return true;
}

bool View::key(SDL_Event event)
{
    const auto key = event.key.key;
    const bool down = event.type == SDL_EVENT_KEY_DOWN;
    auto* focus = context_.GetFocusElement();
    if ((key == SDLK_ESCAPE || key == SDLK_AC_BACK) && down) return event.key.repeat || back();
    if (key == SDLK_TAB && down) {
        if (dialog_) {
            auto& other = element(focus == &element("dialog-back") ? "dialog-confirm" : "dialog-back");
            other.Focus(true);
        } else if (shell_.screen() == Screen::save) {
            Rml::ElementList controls;
            element("shell-panel").QuerySelectorAll(controls, "button");
            if (!controls.empty()) {
                const auto found = std::ranges::find(controls, focus);
                const auto index = found == controls.end() ? 0 : found - controls.begin();
                const auto step = event.key.mod & SDL_KMOD_SHIFT ? controls.size() - 1 : 1;
                controls[(index + step) % controls.size()]->Focus(true);
            }
        } else {
            context_.ProcessKeyDown(Rml::Input::KI_TAB, event.key.mod & SDL_KMOD_SHIFT ? Rml::Input::KM_SHIFT : 0);
        }
        return true;
    }
    if (focus && focus->GetId() == "seed") {
        if (down && key == SDLK_RETURN) startFromSeed();
        if (!down) return true;
        const auto flags = (event.key.mod & SDL_KMOD_SHIFT ? Rml::Input::KM_SHIFT : 0) |
            (event.key.mod & SDL_KMOD_CTRL ? Rml::Input::KM_CTRL : 0);
        constexpr std::pair<SDL_Keycode, Rml::Input::KeyIdentifier> editing[] = {
            {SDLK_BACKSPACE, Rml::Input::KI_BACK}, {SDLK_DELETE, Rml::Input::KI_DELETE},
            {SDLK_LEFT, Rml::Input::KI_LEFT}, {SDLK_RIGHT, Rml::Input::KI_RIGHT},
            {SDLK_HOME, Rml::Input::KI_HOME}, {SDLK_END, Rml::Input::KI_END},
            {SDLK_A, Rml::Input::KI_A}, {SDLK_C, Rml::Input::KI_C},
            {SDLK_V, Rml::Input::KI_V}, {SDLK_X, Rml::Input::KI_X}
        };
        const auto match = std::ranges::find(editing, key, &std::pair<SDL_Keycode, Rml::Input::KeyIdentifier>::first);
        if (match != std::end(editing)) context_.ProcessKeyDown(match->second, flags);
        return true;
    }
    if (key == SDLK_RETURN || key == SDLK_KP_ENTER || key == SDLK_SPACE) {
        if (down && !event.key.repeat && isControl(focus)) {
            keyDown_ = key;
            keyControl_ = focus->GetObserverPtr();
            focus->SetClass("key-down", true);
        } else if (!down && keyDown_ == key) {
            if (auto* control = keyControl_.get()) {
                control->SetClass("key-down", false);
                if (control == focus && isControl(control)) activate(*control);
            }
            keyControl_.reset();
            keyDown_ = 0;
        }
    }
    if (!down || dialog_) return true;
    if (focus == &element("map")) {
        if (key == SDLK_LEFT || key == SDLK_RIGHT || key == SDLK_UP || key == SDLK_DOWN) navigateMap(key);
        if (key == SDLK_PLUS || key == SDLK_EQUALS || key == SDLK_MINUS) {
            const auto area = bounds("map");
            map_.zoom(key == SDLK_MINUS ? -1.f : 1.f, {area.x + area.w / 2, area.y + area.h / 2}, area);
        }
    } else if (focus == &element("plot") && (key == SDLK_LEFT || key == SDLK_RIGHT)) {
        const auto& chart = session_.chart();
        if (chart.through && session_.liveSnapshot()) {
            const auto at = session_.requested().value_or(session_.liveSnapshot()->second);
            const Second step = event.key.mod & SDL_KMOD_SHIFT ? 32 : 1;
            const auto to = key == SDLK_LEFT ? at - std::min(step, at) : at + step;
            if (session_.scrub(to)) selection_.destination.reset();
        }
    }
    return true;
}

bool View::input(SDL_Event event)
{
    if (event.type == SDL_EVENT_QUIT || event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED) return false;
    if (event.type == SDL_EVENT_KEY_DOWN || event.type == SDL_EVENT_KEY_UP) return key(event);
    if (event.type == SDL_EVENT_TEXT_INPUT) context_.ProcessTextInput(event.text.text);
    if (event.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED || event.type == SDL_EVENT_WINDOW_SAFE_AREA_CHANGED ||
        event.type == SDL_EVENT_WINDOW_DISPLAY_SCALE_CHANGED) syncWindow();
    if (event.type == SDL_EVENT_RENDER_DEVICE_RESET || event.type == SDL_EVENT_RENDER_TARGETS_RESET) map_.invalidateTerrain();
    if (event.type == SDL_EVENT_WINDOW_FOCUS_LOST || event.type == SDL_EVENT_WINDOW_MOUSE_LEAVE) {
        if (!pointerDown_ || event.type == SDL_EVENT_WINDOW_FOCUS_LOST) {
            cancelInput();
        }
    }
    SDL_ConvertEventToRenderCoordinates(renderer_, &event);
    switch (event.type) {
        case SDL_EVENT_FINGER_DOWN:
        case SDL_EVENT_FINGER_MOTION:
        case SDL_EVENT_FINGER_UP:
        case SDL_EVENT_FINGER_CANCELED: touch(event.tfinger); break;
        case SDL_EVENT_MOUSE_MOTION:
        case SDL_EVENT_MOUSE_BUTTON_DOWN:
        case SDL_EVENT_MOUSE_BUTTON_UP:
        case SDL_EVENT_MOUSE_WHEEL:
            if (!primary_) pointer(event);
            break;
    }
    return true;
}

void View::pointer(const SDL_Event& event)
{
    const bool game = shell_.screen() == Screen::game;
    if (event.type == SDL_EVENT_MOUSE_MOTION) {
        pointer_ = {event.motion.x, event.motion.y};
        hoveredAt_ = SDL_GetTicks();
        const auto map = bounds("map");
        auto hovered = game && !lifeOpen_ && !dialog_ && contains(map, pointer_) && !contains(bounds("map-tools"), pointer_)
            ? hit(pointer_).value_or("") : "";
        if (hovered != hoveredRegion_) {
            hoveredRegion_ = std::move(hovered);
            markersDirty_ = true;
        }
        hoverSecond_ = game && !touch_ && session_.chart().through && contains(plot(), pointer_)
            ? std::optional(secondAt(pointer_.x)) : std::nullopt;
        if (drag_ == Drag::graph) scrubAt(pointer_.x);
        else if (drag_ == Drag::map) {
            moved_ |= std::hypot(pointer_.x - pressed_.x, pointer_.y - pressed_.y) > 4;
            if (moved_) {
                map_.pan({pointer_.x - last_.x, pointer_.y - last_.y}, map);
                markersDirty_ = true;
            }
            last_ = pointer_;
        } else {
            if (pointerDown_) moved_ |= std::hypot(pointer_.x - pressed_.x, pointer_.y - pressed_.y) > 5;
            if (drag_ == Drag::card && touch_ && moved_ &&
                !dropTarget_ && std::abs(pointer_.y - pressed_.y) > 1.4f * std::abs(pointer_.x - pressed_.x))
                drag_ = Drag::panel;
            if ((drag_ == Drag::panel || drag_ == Drag::shell || drag_ == Drag::lifePanel || drag_ == Drag::lifeOffers) && moved_) {
                auto& panel = element(drag_ == Drag::panel ? "panel" : drag_ == Drag::lifePanel ? "life-inspector" : drag_ == Drag::lifeOffers ? "life-chart" : "shell-panel");
                panel.SetScrollTop(panel.GetScrollTop() + last_.y - pointer_.y);
            }
            last_ = pointer_;
            context_.ProcessMouseMove(static_cast<int>(pointer_.x), static_cast<int>(pointer_.y), 0);
        }
    }
    if ((event.type == SDL_EVENT_MOUSE_BUTTON_DOWN || event.type == SDL_EVENT_MOUSE_BUTTON_UP) &&
        event.button.button == SDL_BUTTON_LEFT) {
        pointer_ = {event.button.x, event.button.y};
        if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN) {
            touch_ = event.button.which == SDL_TOUCH_MOUSEID;
            if (touch_ || !contains(plot(), pointer_)) hoverSecond_.reset();
            pointerDown_ = true;
            moved_ = longPress_ = false;
            pressedAt_ = SDL_GetTicks();
            pressed_ = last_ = pointer_;
            context_.ProcessMouseMove(static_cast<int>(pointer_.x), static_cast<int>(pointer_.y), 0);
            if (game && (!dialog_ || confirmation_ == Confirmation::reform) &&
                contains(plot(), pointer_) && !session_.opening() && !session_.busy() && session_.chart().through) {
                if (dialog_) closeConfirmation();
                element("plot").Focus();
                drag_ = Drag::graph;
                scrubAt(pointer_.x);
            } else if (game && !lifeOpen_ && !dialog_ && contains(bounds("map"), pointer_) &&
                       !contains(bounds("map-tools"), pointer_) && !session_.opening()) {
                element("map").Focus();
                drag_ = Drag::map;
                map_.beginPan();
                hoveredRegion_ = hit(pointer_).value_or("");
                markersDirty_ = true;
            } else {
                const auto* snapshot = session_.displayed();
                const auto* site = selection_.selected(snapshot);
                if (!dialog_ && touch_) {
                    if (game && !lifeOpen_ && contains(bounds("panel"), pointer_)) drag_ = Drag::panel;
                    if (game && lifeOpen_ && contains(bounds("life-inspector"), pointer_)) drag_ = Drag::lifePanel;
                    if (game && lifeOpen_ && life_.shop && !lifeRoute_ && contains(bounds("life-chart"), pointer_))
                        drag_ = Drag::lifeOffers;
                    if (!game && contains(bounds("shell-panel"), pointer_)) drag_ = Drag::shell;
                }
                if (const auto slot = game && !lifeOpen_ ? cardAt(pointer_) : std::nullopt;
                    !dialog_ && slot && snapshot && !selection_.destination && canStage(*snapshot, site)) {
                    auto* card = element("board").GetChild(static_cast<int>(*slot));
                    draggedCard_ = card->GetAttribute<int>("data-id", static_cast<int>(*slot));
                    if (!site->cards[draggedCard_].id.empty()) drag_ = Drag::card;
                }
                context_.ProcessMouseButtonDown(0, 0);
            }
        } else if (pointerDown_) {
            pointerDown_ = false;
            if (drag_ == Drag::map) {
                if (!moved_ && !longPress_)
                    if (auto selected = hit(pointer_)) selectRegion(std::move(*selected));
            } else if (drag_ == Drag::graph) {
                scrubAt(pointer_.x);
            } else {
                if (longPress_ || (moved_ && drag_ != Drag::none)) context_.ProcessMouseLeave();
                context_.ProcessMouseButtonUp(0, 0);
                if (drag_ == Drag::card && moved_) {
                    const auto* snapshot = session_.displayed();
                    if (const auto target = cardAt(pointer_); target && snapshot && canStage(*snapshot, selection_.selected(snapshot))) {
                        auto staged = selection_;
                        if (staged.inspect(snapshot, draggedCard_) && staged.stage(snapshot, *target)) {
                            selection_ = std::move(staged);
                            notify("");
                        } else if (*target != draggedCard_) {
                            notify("This Practice cannot move to that slot. The slot is locked.", true);
                        }
                    }
                }
            }
            drag_ = Drag::none;
        }
    }
    if (event.type == SDL_EVENT_MOUSE_WHEEL && drag_ == Drag::none && !dialog_) {
        const SDL_FPoint at{event.wheel.mouse_x, event.wheel.mouse_y};
        const auto area = bounds("map");
        if (game && !lifeOpen_ && contains(area, at) && !session_.opening()) map_.zoom(event.wheel.y, at, area);
        else context_.ProcessMouseWheel({-event.wheel.x, -event.wheel.y}, 0);
    }
    if (!pointerDown_ && event.type == SDL_EVENT_MOUSE_MOTION) {
        touch_ = event.motion.which == SDL_TOUCH_MOUSEID;
        longPress_ = false;
    }
    const auto target = drag_ == Drag::card && moved_ ? cardAt(pointer_) : std::nullopt;
    if (target != dropTarget_ || event.type == SDL_EVENT_MOUSE_BUTTON_UP) {
        dropTarget_ = target;
        if (auto* board = document_->GetElementById("board")) {
            for (int i = 0; i < board->GetNumChildren(); ++i) {
                auto& card = *board->GetChild(i);
                card.SetClass("dragging", drag_ == Drag::card && moved_ && static_cast<std::size_t>(i) == draggedCard_);
                card.SetClass("drop", dropTarget_ == static_cast<std::size_t>(i) &&
                    draggedCard_ != static_cast<std::size_t>(i) && !card.GetAttribute<bool>("data-locked", false));
            }
        }
    }
}

void View::cancelInput()
{
    primary_.reset();
    secondary_.reset();
    context_.ProcessMouseLeave();
    if (pointerDown_) context_.ProcessMouseButtonUp(0, 0);
    pointerDown_ = longPress_ = moved_ = false;
    drag_ = Drag::none;
    markersDirty_ |= !hoveredRegion_.empty();
    hoveredRegion_.clear();
    hoverSecond_.reset();
    dropTarget_.reset();
    if (auto* board = document_->GetElementById("board")) {
        for (int i = 0; i < board->GetNumChildren(); ++i) {
            board->GetChild(i)->SetClass("dragging", false);
            board->GetChild(i)->SetClass("drop", false);
        }
    }
    if (auto* control = keyControl_.get()) control->SetClass("key-down", false);
    keyControl_.reset();
    keyDown_ = 0;
}

void View::touch(const SDL_TouchFingerEvent& event)
{
    const SDL_FPoint point{event.x, event.y};
    // Route a single finger through the same press, drag and help states as the mouse.
    const auto send = [&](Uint32 type) {
        SDL_Event mouse{};
        mouse.type = type;
        if (type == SDL_EVENT_MOUSE_MOTION) {
            mouse.motion.x = point.x;
            mouse.motion.y = point.y;
            mouse.motion.which = SDL_TOUCH_MOUSEID;
        } else {
            mouse.button.button = SDL_BUTTON_LEFT;
            mouse.button.x = point.x;
            mouse.button.y = point.y;
            mouse.button.which = SDL_TOUCH_MOUSEID;
        }
        pointer(mouse);
    };
    const auto map = bounds("map");
    if (event.type == SDL_EVENT_FINGER_DOWN) {
        if (!primary_) {
            primary_ = Finger{event.fingerID, point};
            send(SDL_EVENT_MOUSE_BUTTON_DOWN);
        } else if (!secondary_ && drag_ == Drag::map && contains(map, point)) {
            secondary_ = Finger{event.fingerID, point};
            drag_ = Drag::pinch;
            moved_ = true;
            longPress_ = false;
        }
        return;
    }
    auto* finger = primary_ && primary_->id == event.fingerID ? &primary_ :
        secondary_ && secondary_->id == event.fingerID ? &secondary_ : nullptr;
    if (!finger) return;
    if (event.type == SDL_EVENT_FINGER_CANCELED) {
        cancelInput();
    } else if (event.type == SDL_EVENT_FINGER_UP) {
        if (drag_ == Drag::pinch) {
            finger->reset();
            if (secondary_) primary_ = std::exchange(secondary_, {});
            last_ = pointer_ = primary_->point;
            drag_ = Drag::map;
        } else {
            primary_.reset();
            send(SDL_EVENT_MOUSE_BUTTON_UP);
        }
    } else if (drag_ == Drag::pinch) {
        const auto midpoint = [&] {
            return SDL_FPoint{(primary_->point.x + secondary_->point.x) / 2,
                (primary_->point.y + secondary_->point.y) / 2};
        };
        const auto distance = [&] {
            return std::hypot(primary_->point.x - secondary_->point.x, primary_->point.y - secondary_->point.y);
        };
        const auto from = midpoint();
        const auto before = distance();
        (*finger)->point = point;
        if (before > 1) {
            map_.pinch(distance() / before, from, midpoint(), map);
            markersDirty_ = true;
        }
    } else {
        primary_->point = point;
        send(SDL_EVENT_MOUSE_MOTION);
    }
}

void View::startFromSeed()
{
    auto& seed = static_cast<Rml::ElementFormControl&>(element("seed"));
    shell_.start(seed.GetValue());
}

void View::ProcessEvent(Rml::Event& event)
{
    auto* target = event.GetTargetElement();
    while (target && !target->HasAttribute("data-op")) target = target->GetParentNode();
    if (isControl(target)) activate(*target);
}

void View::activate(Rml::Element& control)
{
    const auto op = control.GetAttribute<Rml::String>("data-op", "");
    const auto id = control.GetAttribute<Rml::String>("data-id", "");
    if (dialog_ && op != "back" && op != "confirm") return;
    if (op.starts_with("life-")) activateLife(op, id);
    else if (op == "start" && shell_.screen() == Screen::title) startFromSeed();
    else if (op == "continue" && shell_.screen() == Screen::title) shell_.continueGame();
    else if (op == "load" && shell_.screen() == Screen::title) shell_.show(Screen::load);
    else if (op == "save" && !session_.busy() && session_.liveSnapshot()) shell_.show(Screen::save);
    else if (op == "title") returnToTitle();
    else if (op == "back-title") shell_.show(Screen::title);
    else if (op == "back-game") shell_.show(Screen::game);
    else if (op == "slot") {
        shell_.selectSlot(static_cast<Slot>(std::stoi(id)));
        if (const auto slot = shell_.overwrite()) {
            const auto& row = shell_.list().at(static_cast<std::size_t>(*slot));
            confirm(Confirmation::overwrite, "Overwrite slot " + std::to_string(static_cast<int>(*slot)) + "?",
                "The current run will replace this save.",
                row.metadata ? "Saved " + row.metadata->savedAt : row.error, "Overwrite save");
        }
    } else if (op == "motion") {
        reduced_ = !reduced_;
        document_->SetClass("reduce-motion", reduced_);
        control.SetClass("on", reduced_);
        control.SetAttribute("aria-pressed", reduced_ ? "true" : "false");
        control.SetAttribute("data-help", reduced_ ? "Restore camera and interface motion." : "Reduce camera and interface motion.");
        control.SetInnerRML(reduced_ ? "Motion Reduced" : "Motion On");
    } else if (op == "zoom-in" || op == "zoom-out") {
        const auto area = bounds("map");
        map_.zoom(op == "zoom-in" ? 1.f : -1.f, {area.x + area.w / 2, area.y + area.h / 2}, area);
    } else if (op == "live") {
        returnLive();
    } else if (op == "card") {
        if (pendingAction_ != "reform" && !selection_.inspect(session_.displayed(), std::stoul(id)))
            notify("There is no Practice in that slot.", true);
    } else if (op == "stage") {
        const auto* snapshot = session_.displayed();
        if (snapshot && canStage(*snapshot, selection_.selected(snapshot)) && selection_.stage(snapshot, std::stoul(id)))
            notify("");
        else notify(session_.previewing() ? "Return to Live to stage a Practice Reform." : "This Practice cannot move to that slot.", true);
    } else if (op == "undo") {
        if (pendingAction_ != "reform") selection_.destination.reset();
    } else if (op == "review") {
        reviewReform();
    } else if (op == "back") {
        shell_.cancelOverwrite();
        closeConfirmation();
    } else if (op == "confirm" && dialog_) {
        closeConfirmation();
        if (confirmation_ == Confirmation::overwrite) shell_.confirmOverwrite();
        else if (confirmation_ == Confirmation::title) shell_.returnToTitle();
        else if (confirmation_ == Confirmation::life) {
            if (lifeConfirm_) submitLife(*lifeConfirm_);
            lifeConfirm_.reset();
        }
        else if (selection_.card && selection_.destination &&
            session_.reorder(selection_.region, *selection_.card, *selection_.destination)) {
            pendingAction_ = "reform";
            pendingGeneration_ = session_.generation();
        } else {
            const auto reason = session_.previewing() ? "Return to Live to commit the staged order." :
                session_.busy() ? "A decision is already being applied." : "The staged order is no longer available.";
            notify(reason, true);
        }
    }
}

}
