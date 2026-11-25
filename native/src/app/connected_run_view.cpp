#include "connected_view.hpp"
#include "connected_markup.hpp"

#include <RmlUi/Core/ElementText.h>

#include <algorithm>

namespace waffle::connected {
namespace {

using sim::browser::RunEndReason;

struct Ending {
    const char* cause;
    const char* explanation;
};

Ending ending(RunEndReason reason)
{
    switch (reason) {
    case RunEndReason::monsterOverrun:
        return {"Monster overrun",
            "Monster Spawns have taken every player settlement. Supplied defenses can repel them while their Stock lasts. "
            "Reducing Chaos pressure can delay new Monsters."};
    case RunEndReason::territorialLoss:
        return {"All territory lost", "Your civilization no longer controls any settlements."};
    case RunEndReason::tenuresExhausted:
        return {"Tenures exhausted", "Each death or retirement spent one tenure. Your dynasty has no tenures remaining."};
    }
    return {"Civilization lost", "Your civilization reached a loss condition."};
}

constexpr std::array speeds{
    std::pair{"run-rewind-fast", -256}, std::pair{"run-rewind", -1}, std::pair{"run-hold", 0},
    std::pair{"run-forward", 1}, std::pair{"run-forward-fast", 256}
};

void visible(Rml::Element& element, bool show)
{
    element.SetProperty("display", show ? "block" : "none");
}

void disabled(Rml::Element& element, bool value)
{
    if (value == element.HasAttribute("disabled")) return;
    if (value) element.SetAttribute("disabled", "");
    else element.RemoveAttribute("disabled");
}

void pressed(Rml::Element& element, bool value)
{
    if (element.IsClassSet("on") == value && element.HasAttribute("aria-pressed")) return;
    element.SetClass("on", value);
    element.SetAttribute("aria-pressed", value ? "true" : "false");
}

}

void View::resetRun()
{
    hideRunOutcome();
    seenOutcome_.reset();
    confirmedAdvance_.reset();
    runHudKey_.reset();
    runFrameAt_ = 0;
    visible(element("run-advance"), false);
}

void View::refreshRun()
{
    const auto* viewed = session_.displayed();
    const auto* live = session_.liveSnapshot();
    const bool ready = viewed && live && !session_.opening();
    if (ready != runStripVisible_) {
        runStripVisible_ = ready;
        element("run-strip").SetProperty("display", ready ? "flex" : "none");
    }
    if (!ready) {
        if (runHudKey_) {
            visible(element("run-advance"), false);
            runHudKey_.reset();
        }
        return;
    }

    const auto end = live->outcome ? live->outcome : session_.projectedOutcome();
    const auto through = session_.browseThrough();
    const auto advance = session_.advanceTarget();
    const bool active = shell_.screen() == Screen::game && !session_.busy() && through.has_value();
    const RunHudKey key{session_.viewRevision(), session_.generation(), through, advance, end,
        session_.playbackRate(), session_.previewing(), session_.previousPreview(), session_.followingForecast(),
        graphWorking_, active, live->terminal};
    if (runHudKey_ == key) return;
    const bool returnChanged = !runHudKey_ || runHudKey_->preview != key.preview || runHudKey_->terminal != key.terminal;
    runHudKey_ = key;

    if (live->outcome && seenOutcome_ != live->outcome && active) {
        seenOutcome_ = live->outcome;
        showRunOutcome(*live->outcome, false, true);
    }
    if (shownOutcome_ && outcomeProjected_ && shownOutcome_ != end) hideRunOutcome();
    const auto first = session_.chart().start;
    const auto best = std::max(session_.bestSurvivalYear(), viewed->bestSurvivalYear);
    const int left = std::clamp(viewed->tenuresRemaining, 0, 10);
    const char* mode = key.preview ? (key.previous ? "Old forecast" :
        viewed->second <= live->second ? "History" : "Forecast") : live->terminal ? "Run ended" : "Live";
    const std::string boundary = live->terminal ? "End " : "Live ";
    std::array<std::pair<const char*, std::string>, 10> labels{{
        {"run-year", "Year " + markup::number(viewed->year)},
        {"run-season", viewed->season},
        {"run-tenure-count", "Tenures " + std::to_string(left) + "/10"},
        {"run-best", std::to_string(10 - left) + " used" + (best ? " · Best " + std::to_string(best) : "")},
        {"run-cause", end ? ending(end->reason).cause : "Survival"},
        {"run-loss-year", end ? std::string(live->terminal ? "Ended · Year " : "Foreseen · Year ") +
            std::to_string(end->year) : key.working ? "Forecasting…" : "No end in forecast"},
        {"run-viewed", std::string(mode) + " · " + std::to_string(viewed->second) + " s"},
        {"run-live-time", key.preview ? "Read-only · " + boundary + std::to_string(live->second) + " s" :
            live->terminal ? "Read-only timeline" : "Decision boundary"},
        {"run-bounds", through ? std::to_string(first) + "–" + std::to_string(*through) + " s" : "—"},
        {"run-transport-state", key.follow ? "Following" : key.rate > 0 ? "Playing" :
            key.rate < 0 ? "Rewinding" : "Bounds"}
    }};
    for (std::size_t i = 0; i < labels.size(); ++i) {
        auto& [id, value] = labels[i];
        if (runLabels_[i] == value) continue;
        auto& node = element(id);
        if (auto* child = node.GetChild(0)) static_cast<Rml::ElementText*>(child)->SetText(value);
        else node.SetInnerRML(markup::escape(value));
        runLabels_[i] = std::move(value);
    }

    auto& outcome = element("run-outcome");
    outcome.SetClass("foreseen", end.has_value() && !live->terminal);
    outcome.SetClass("ended", live->terminal);
    disabled(outcome, !end || !active);
    if (returnChanged) {
        auto& returnButton = element("live");
        returnButton.SetInnerRML(live->terminal ? (key.preview ? "Back to end" : "End") :
            key.preview ? "Back to Live" : "Live");
        returnButton.SetAttribute("data-help", live->terminal ?
            "Return to the confirmed end (Home)." : "Return to committed time (Home).");
    }
    element("run-mode").SetClass("read-only", key.preview || live->terminal);
    for (const auto& [id, rate] : speeds) {
        auto& button = element(id);
        pressed(button, !key.follow && key.rate == rate);
        disabled(button, !active);
    }
    auto& follow = element("run-follow");
    pressed(follow, key.follow);
    disabled(follow, !active || live->terminal || session_.chart().through <= live->second);
    visible(element("run-advance"), active && advance.has_value());
}

void View::showRunOutcome(const RunOutcome& outcome, bool projected, bool emphasis)
{
    cancelInput();
    session_.setPlayback(0);
    shownOutcome_ = outcome;
    outcomeProjected_ = projected;
    const auto copy = ending(outcome.reason);
    auto& overlay = element("outcome-overlay");
    overlay.SetClass("projected", projected);
    element("outcome-dialog").SetClass("emphasis", emphasis && !reduced_);
    element("outcome-title").SetInnerRML(projected ? "Foreseen extinction" :
        outcome.reason == RunEndReason::tenuresExhausted ? "Dynasty complete" : "Game over");
    element("outcome-year").SetInnerRML("Year " + std::to_string(outcome.year));
    element("outcome-cause").SetInnerRML(copy.cause);
    element("outcome-copy").SetInnerRML(copy.explanation);
    element("outcome-guidance").SetInnerRML(projected ?
        "Return to Live to make decisions that can change this forecast." :
        "This run has ended. You can still browse the timeline to inspect what happened.");
    visible(element("outcome-new"), !projected);
    visible(overlay, true);
    element("outcome-browse").Focus(true);
}

void View::hideRunOutcome(bool browse)
{
    if (!shownOutcome_) return;
    const auto outcome = std::exchange(shownOutcome_, {});
    const bool projected = std::exchange(outcomeProjected_, false);
    visible(element("outcome-overlay"), false);
    element("outcome-dialog").SetClass("emphasis", false);
    if (browse) {
        session_.scrub(outcome->second);
        focusSecond(outcome->second);
        element("plot").Focus(true);
    } else if (projected) element("run-outcome").Focus(true);
}

bool View::activateRun(std::string_view op, std::string_view id)
{
    if (shell_.screen() != Screen::game || session_.opening() || session_.busy()) return false;
    if (op == "run-speed") {
        if (!session_.setPlayback(std::stoi(std::string(id)))) return false;
        selection_.destination.reset();
    } else if (op == "run-follow") {
        if (!session_.followForecast()) return false;
        selection_.destination.reset();
        if (const auto second = session_.requested()) focusSecond(*second);
    } else if (op == "run-advance") {
        confirmedAdvance_ = session_.advanceTarget();
        if (!confirmedAdvance_) return false;
        const auto projected = session_.projectedOutcome();
        const bool untilEnd = projected && projected->second == *confirmedAdvance_;
        const auto target = untilEnd ? "Year " + std::to_string(projected->year) + " · " : "";
        confirm(Confirmation::advanceRun, untilEnd ? "Advance to the foreseen end?" : "Advance Live?",
            "Time will pass without appointing a Vassal. This commits the new decision boundary.",
            "Advance to " + target + std::to_string(*confirmedAdvance_) + " s", "Advance Live");
    } else if (op == "run-outcome") {
        const auto* live = session_.liveSnapshot();
        const auto end = live->outcome ? live->outcome : session_.projectedOutcome();
        if (!end) return false;
        showRunOutcome(*end, !live->terminal, false);
    } else if (op == "run-browse") {
        hideRunOutcome(true);
    } else if (op == "run-new" && shownOutcome_ && !outcomeProjected_) {
        confirm(Confirmation::newRun, "Begin a new game?",
            "Leave this timeline and start a new civilization.", "", "Begin New Game");
    } else return false;
    return true;
}

}
