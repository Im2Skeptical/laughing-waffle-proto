#include "connected_smoke.hpp"

#include <algorithm>
#include <cstdio>
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

void smoke(Session& session, Selection& selection, const SmokeFrame& frame)
{
    waitFor(session, [&] { return !session.opening(); }, frame);
    const auto openingSecond = session.displayed()->second;
    const auto openingActions = session.actionCount();
    require(session.displayedDigest() == session.replayDigest(openingSecond), "Opening differs from authoritative replay");
    if (frame) frame("01-regional-map");
    preparePracticeShop(session, selection, frame);
    const auto* original = selection.selected(session.displayed());
    require(original && !original->cards[1].id.empty(), "Smoke requires two real Practices");
    const auto first = original->cards[0].id;
    const auto second = original->cards[1].id;
    if (frame) frame("02-practice-inspection");
    const auto generation = session.generation();
    const auto count = session.actionCount();
    const auto before = session.displayed()->second;
    const auto duration = session.displayed()->shopSeconds;
    require(duration.has_value(), "Practice decision did not quote its time cost");
    require(session.reorder(selection.region, *selection.card, *selection.destination), "Board change rejected");
    selection.destination.reset();
    selection.card.reset();
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
    require(session.scrub(liveSecond + 1) && session.scrub(target), "Scrub initiation failed");
    waitFor(session, [&] { return session.previewReady(); }, frame);
    require(session.displayed()->second == target, "Obsolete scrub won");
    require(session.displayedDigest() == session.replayDigest(target), "Displayed restore differs from authoritative replay");
    require(!session.reorder(selection.region, 1, 0), "Forecast preview accepted a live edit");
    require(selection.inspect(session.displayed(), 1), "Preview Practice inspection failed");
    if (frame) frame("03-forecast-preview");
    require(session.scrub(liveSecond + 1), "Return-to-live cancellation setup failed");
    session.live();
    session.update();
    require(!session.previewing() && session.displayed()->second == liveSecond && session.displayedDigest() == liveDigest,
            "Return to live failed");
    if (frame) frame("04-return-to-live");
    std::printf("Connected smoke passed: opening t=%llu with %zu actions, generation %llu, %zu actions, scrub t=%llu, live t=%llu\n",
        static_cast<unsigned long long>(openingSecond), openingActions,
        static_cast<unsigned long long>(session.generation()), session.actionCount(),
        static_cast<unsigned long long>(target), static_cast<unsigned long long>(liveSecond));
}

}
