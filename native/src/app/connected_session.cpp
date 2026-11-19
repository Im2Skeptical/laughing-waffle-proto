#include "connected_session.hpp"

#include "sim/world/generate.hpp"
#include "sim/world/new_game.hpp"
#include "sim/world/topology.hpp"
#include "timegraph/anchor.hpp"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <fstream>
#include <iterator>

namespace waffle::connected {
namespace {

using core::json::Value;
using sim::RuntimeState;
using namespace sim::runtime;
using Clock = std::chrono::steady_clock;

template<class T>
bool ready(const std::future<T>& future)
{
    return future.valid() && future.wait_for(std::chrono::seconds(0)) == std::future_status::ready;
}

template<class T, class Field>
const T& cold(const RuntimeState& state, ColdRef<T, Field> ref)
{
    return state.cold.at(ref.row).get();
}

const Value& field(const Value& value, std::string_view key)
{
    if (const auto* item = value.find(key)) return *item;
    throw std::invalid_argument("Missing browser field " + std::string(key));
}

Value readJson(const std::filesystem::path& path)
{
    std::ifstream stream(path, std::ios::binary);
    if (!stream) throw std::invalid_argument("Could not open " + path.string());
    return core::json::parse(std::string(std::istreambuf_iterator<char>(stream), {}));
}

Second readSecond(const Value& value)
{
    const auto number = value.as_number();
    if (number < 0 || number > 0x1p53 - 1 || number != std::floor(number))
        throw std::invalid_argument("Expected a nonnegative integer second");
    return static_cast<Second>(number);
}

RuntimeState admit(const Value& wire)
{
    return sim::admit_runtime(sim::browser::import_game_state(wire), nullptr, &field(wire, "gameConfig"));
}

auto geometry(const RuntimeState& state)
{
    auto shapes = std::make_shared<std::vector<RegionShape>>();
    const auto seed = sim::generated_regional_seed(state.topology->definition_id());
    if (!seed) throw std::invalid_argument("The Windows slice requires a generated regional world");
    sim::RegionalOutlines outlines;
    const auto world = sim::generate_regional_world(*seed, &outlines);
    Point min{1e9, 1e9}, max{-1e9, -1e9};
    for (const auto& outline : outlines) {
        for (const auto& point : outline) {
            for (int axis = 0; axis < 2; ++axis) {
                min[axis] = std::min(min[axis], point[axis]);
                max[axis] = std::max(max[axis], point[axis]);
            }
        }
    }
    const auto normalize = [&](Point point) -> Point {
        return {(point[0] - min[0]) / (max[0] - min[0]), (point[1] - min[1]) / (max[1] - min[1])};
    };
    for (const auto& row : state.tables.view(state.hot.world.regions)) {
        const auto it = std::ranges::find(world.regions, state.name(row.id), &sim::RegionalWorld::Region::id);
        if (it == world.regions.end()) throw std::invalid_argument("Unknown map region");
        auto& outline = outlines[static_cast<std::size_t>(it - world.regions.begin())];
        for (auto& point : outline) point = normalize(point);
        shapes->push_back({normalize(it->labelPoint), std::move(outline)});
    }
    return shapes;
}

Card card(const RuntimeState& state, Index<PracticeSlot> index)
{
    const auto& slot = state.tables.at(index);
    Card result;
    result.id = state.name(slot.practiceId);
    const auto def = std::ranges::find(state.content->config.gamepieces.practices, result.id,
        &sim::browser::GamepiecesPractices::value_type::first);
    if (def == state.content->config.gamepieces.practices.end()) {
        result.name = result.id;
        return result;
    }
    constexpr std::array quality{"Bronze", "Silver", "Gold", "Diamond"};
    result.quality = quality[static_cast<std::size_t>(slot.tier)];
    result.name = def->second.label;
    result.rule = def->second.ui.rule;
    result.mode = def->second.mode == "charge" ? "Charge" : "Scheduled";
    result.charge = state.practiceCharge[index.value];
    result.stock = state.practiceStock[index.value];
    result.workerCapacity = def->second.workerCapacity;
    for (const auto& tag : def->second.tags) {
        if (!result.tags.empty()) result.tags += " / ";
        result.tags += tag;
    }
    return result;
}

bool practiceShop(std::string_view family)
{
    constexpr std::array names{"practiceReform", "foodShop", "housingShop", "stockShop", "classMarket"};
    return std::ranges::find(names, family) != names.end();
}

sim::Action action(Second second, const char* kind, Value::Object payload)
{
    return {static_cast<double>(second), kind, Value(std::move(payload)), {}};
}

const Vassal* currentVassal(const RuntimeState& state)
{
    return state.indexes.currentVassal ? &state.tables.at(state.indexes.currentVassal).value : nullptr;
}

void decisions(Snapshot& view, const RuntimeState& state)
{
    if (view.terminal) return;
    const auto& lineage = state.hot.civilization.vassalLineage;
    const auto* active = currentVassal(state);
    if (!active) {
        const auto& candidates = cold(state, lineage.pendingCandidates);
        for (std::size_t i = 0; i < candidates.size(); ++i)
            view.choices.push_back({Decision::chooseVassal, std::to_string(i), candidates[i].archetype});
        return;
    }
    const auto& vassal = *active;
    view.vassalRegion = state.name(vassal.locationRegionId);
    const auto& map = vassal.lifeMap;
    if (map.pendingResolution) {
        const auto second = static_cast<Second>(map.pendingResolution->resolveSec);
        view.choices.push_back({Decision::advance, {}, "Advance to " + std::to_string(second) + " s"});
        return;
    }
    if (lineage.pendingHeirloomLoadout || !cold(state, vassal.developmentChoiceQueue).empty()) return;
    if (vassal.commissionOffers && vassal.commissionOffers->size()) {
        for (const auto& offer : state.tables.view(*vassal.commissionOffers))
            view.choices.push_back({Decision::commission, std::string(state.name(offer.offerId)), cold(state, offer.label)});
        return;
    }
    if (!map.currentNodeId) {
        const auto& graph = cold(state, map.graph);
        for (const auto& id : cold(state, map.availableNodeIds)) {
            const auto node = std::ranges::find(graph.nodes, id, &sim::browser::LifeMapGraphNode::id);
            if (node != graph.nodes.end() && practiceShop(node->family))
                view.choices.push_back({Decision::enterShop, id, node->family == "practiceReform" ? "Practice Reform" : "Practice shop"});
        }
        return;
    }
    const auto& nodes = cold(state, map.nodeStates);
    const auto node = std::ranges::find(nodes, state.name(*map.currentNodeId), &sim::browser::LifeMapNodeStates::value_type::first);
    if (node == nodes.end() || node->second.resolving || node->second.contentMode != "shop") return;
    view.shop = node->first;
    if (const auto& select = node->second.shopSelection; select.has_key() && select.value() && !select.value()->selectedTag) {
        for (const auto& choice : select.value()->choices)
            if (choice.enabled) view.choices.push_back({Decision::specialty, choice.id, choice.label});
        return;
    }
    // This slice stages one reorder against the confirmed board.
    if (node->second.purchasedOffers.empty() && !node->second.practiceDraftOrder) {
        view.choices.push_back({Decision::reorder, {}, {}});
        // A reorder preserves the shop's empty-confirm time. Ask the action
        // engine to price that confirmation on an independent working copy.
        auto quote = state;
        if (sim::apply_action(quote, action(view.second, "vassalConfirmLifeNode", {{"nodeId", Value(view.shop)}}))) {
            const auto* actor = currentVassal(quote);
            if (actor && actor->lifeMap.pendingResolution)
                view.shopSeconds = static_cast<Second>(actor->lifeMap.pendingResolution->resolveSec) - view.second;
            else view.shopSeconds = 0;
        }
    }
}

Snapshot snapshot(const RuntimeState& state, bool live)
{
    Snapshot result;
    result.second = static_cast<Second>(state.hot.tSec);
    result.year = state.hot.year;
    result.prestige = state.hot.civilization.prestige.value_or(0);
    result.capital = state.name(state.hot.civilization.capitalRegionId);
    result.terminal = state.hot.runStatus && state.hot.runStatus->complete;
    const auto regions = state.tables.view(state.hot.world.regions);
    std::vector<timegraph::SiteSummary> summaries(regions.size());
    timegraph::summarize(state, summaries);
    for (const auto& source : regions) {
        Region region;
        region.id = state.name(source.id);
        region.name = state.topology->region_name(source.id);
        region.biome = static_cast<std::uint8_t>(state.topology->biome(source.id));
        if (source.controller == state.practiceVocabulary.player) region.holder = Holder::player;
        else if (source.monster && !source.monster->cleared.value_or(false)) region.holder = Holder::monster;
        else if (state.hot.civilization.remnant && source.controller == state.hot.civilization.remnant->faction)
            region.holder = Holder::crown;
        const auto& data = summaries[result.regions.size()];
        region.population = data.population;
        region.food = data.food;
        region.currency = data.currency;
        result.regions.push_back(std::move(region));
    }
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        auto& region = result.regions.at(site.regionId.value);
        region.hasSite = true;
        region.settlement = cold(state, site.name);
        region.detailed = !site.neutral;
        if (!region.detailed) continue;
        const auto& board = site.detailedState.practiceSlots.slots;
        for (std::size_t i = 0; i < board.size(); ++i) {
            if (board[i]) region.cards[i] = card(state, board[i]);
            region.cards[i].locked = i >= site.detailedState.unlockedPracticeSlots;
        }
    }
    for (const auto& road : state.tables.view(state.hot.world.connections))
        result.roads.emplace_back(road.regionAId.value, road.regionBId.value);
    if (live) decisions(result, state);
    return result;
}

void addPoint(Chart& chart, Second second, float value)
{
    const auto span = std::max<Second>(1, chart.end - chart.start);
    const auto bin = std::min(Chart::width - 1, static_cast<std::size_t>((second - chart.start) * (Chart::width - 1) / span));
    auto& band = chart.population[bin];
    if (!band.count) band.first = band.low = band.high = value;
    band.last = value;
    band.low = std::min(band.low, value);
    band.high = std::max(band.high, value);
    ++band.count;
    chart.peak = std::max(chart.peak, value);
}

}

void Session::open(const Launch& launch)
{
    if (busy()) return;
    auto previous = std::move(run_);
    live();
    chart_ = {};
    samples_.clear();
    error_.clear();
    opening_ = true;
    job_ = std::async(std::launch::async, [this, launch, previous = std::move(previous)] {
        if (previous) forecast_.cancel(previous->generation);
        auto run = std::make_shared<Run>();
        if (launch.save.empty()) {
            const auto data = readJson(WAFFLE_OPENING_CONFIG);
            const auto& config = field(data, "gameConfig");
            run->base = std::make_shared<RuntimeState>(sim::build_new_game(launch.seed,
                sim::browser::import_game_config(config), &config));
        } else {
            const auto data = readJson(launch.save);
            if (const auto* timeline = data.find("timeline")) {
                if (field(field(data, "meta"), "schemaVersion").as_number() != 33)
                    throw std::invalid_argument("Browser runner save must use schema 33");
                const auto* base = timeline->find("baseStateData");
                if (!base || base->kind() == Value::Kind::null) base = &field(data, "state");
                run->base = std::make_shared<RuntimeState>(admit(*base));
                run->journal = sim::ActionJournal::from_json(field(*timeline, "actions"));
                const auto frontier = readSecond(field(*timeline, "historyEndSec"));
                if (readSecond(field(*timeline, "cursorSec")) > frontier)
                    throw std::invalid_argument("Browser cursor extends past its live frontier");
                if (!run->journal.entries().empty() && run->journal.entries().front().tSec < run->base->hot.tSec)
                    throw std::invalid_argument("Browser journal precedes its base");
                if (!run->journal.entries().empty() && run->journal.entries().back().tSec > frontier)
                    throw std::invalid_argument("Browser journal extends past its live frontier");
                auto result = sim::rebuildStateAtSecond(*run->base, run->journal, static_cast<double>(frontier));
                if (!result.result) throw std::invalid_argument("Browser journal failed replay: " + std::string(result.result.reason));
                run->live = std::make_shared<RuntimeState>(std::move(*result.state));
            } else {
                run->base = std::make_shared<RuntimeState>(admit(data));
            }
        }
        if (!run->live) {
            auto live = std::make_shared<RuntimeState>(*run->base);
            sim::initialize_replay_clock(*live);
            run->live = std::move(live);
        }
        run->shapes = geometry(*run->live);
        run->snapshot = snapshot(*run->live, true);
        run->horizon = launch.horizon;
        run->generation = forecast_.start(*run->base, run->journal, run->snapshot.second + run->horizon);
        return std::shared_ptr<const Run>(std::move(run));
    });
}

void Session::transact(std::vector<sim::Action> actions, bool resolve)
{
    error_.clear();
    job_ = std::async(std::launch::async, [this, previous = run_, actions = std::move(actions), resolve] {
        auto live = std::make_shared<RuntimeState>(*previous->live);
        auto journal = previous->journal.to_json().as_array();
        for (const auto& command : actions) {
            const auto result = sim::apply_action(*live, command);
            if (!result) throw std::runtime_error(command.kind + ": " + std::string(result.reason));
            journal.emplace_back(Value::Object{{"tSec", Value(command.tSec)}, {"kind", Value(command.kind)},
                                                {"payload", command.payload}});
        }
        auto run = std::make_shared<Run>();
        run->journal = sim::ActionJournal::from_json(Value(std::move(journal)));
        std::optional<Second> advance;
        if (resolve) {
            const auto* actor = currentVassal(*live);
            if (actor && actor->lifeMap.pendingResolution)
                advance = static_cast<Second>(actor->lifeMap.pendingResolution->resolveSec);
        }
        if (advance) {
            sim::ReplayCursor replay(run->journal, live->hot.tSec, true);
            while (live->hot.tSec < *advance && !(live->hot.runStatus && live->hot.runStatus->complete)) {
                if (auto result = replay.advance(*live); !result)
                    throw std::runtime_error("Advance failed: " + std::string(result.reason));
            }
        }
        run->live = std::move(live);
        run->base = previous->base;
        run->shapes = previous->shapes;
        run->horizon = previous->horizon;
        run->snapshot = snapshot(*run->live, true);
        run->generation = forecast_.start(*run->base, run->journal, run->snapshot.second + run->horizon);
        return std::shared_ptr<const Run>(std::move(run));
    });
}

bool Session::choose(const Choice& choice)
{
    if (!run_ || busy() || opening_ || previewing()) return false;
    const auto& view = run_->snapshot;
    const auto valid = std::ranges::any_of(view.choices, [&](const Choice& option) {
        return choice.kind == option.kind && choice.id == option.id;
    });
    if (!valid) return false;
    switch (choice.kind) {
        case Decision::chooseVassal:
            transact({action(view.second, "settlementSelectVassal", {{"candidateIndex", Value(std::stod(choice.id))}})});
            return true;
        case Decision::commission:
            transact({action(view.second, "vassalChooseCommission", {{"offerId", Value(choice.id)}})});
            return true;
        case Decision::enterShop:
            transact({action(view.second, "vassalEnterLifeNode", {{"nodeId", Value(choice.id)}})});
            return true;
        case Decision::specialty:
            transact({action(view.second, "vassalSelectLifeOption",
                {{"nodeId", Value(view.shop)}, {"optionId", Value(choice.id)}})});
            return true;
        case Decision::advance:
            transact({}, true);
            return true;
        default:
            return false;
    }
}

bool Session::reorder(std::string_view regionId, std::size_t from, std::size_t to)
{
    if (!run_ || busy() || opening_ || previewing() || from == to) return false;
    const auto& view = run_->snapshot;
    if (regionId != view.vassalRegion || !std::ranges::any_of(view.choices, [](const Choice& choice) {
        return choice.kind == Decision::reorder;
    })) return false;
    const auto region = std::ranges::find(view.regions, regionId, &Region::id);
    if (region == view.regions.end() || region->holder != Holder::player || from >= region->cards.size() ||
        to >= region->cards.size() || region->cards[from].id.empty() || region->cards[to].locked) return false;
    transact({action(view.second, "vassalReorderShopPurchase", {
                  {"nodeId", Value(view.shop)}, {"offerId", Value("practice:" + region->cards[from].id)},
                  {"toIndex", Value(static_cast<double>(to))}}),
              action(view.second, "vassalConfirmLifeNode", {{"nodeId", Value(view.shop)}})}, true);
    return true;
}

void Session::update()
{
    if (ready(job_)) {
        try {
            run_ = job_.get();
            live();
            const auto priorEnd = chart_.end;
            chart_ = {};
            chart_.start = static_cast<Second>(run_->base->hot.tSec);
            chart_.end = priorEnd > chart_.start ? priorEnd : run_->snapshot.second + run_->horizon;
            samples_.clear();
        } catch (const std::exception& failure) {
            error_ = failure.what();
            opening_ = false;
        }
    }
    summaryMs_ = 0;
    if (const auto info = coverage()) {
        const auto start = Clock::now();
        readChart(*info);
        summaryMs_ = std::chrono::duration<double, std::milli>(Clock::now() - start).count();
        if (info->completion != timegraph::Completion::running) {
            if (info->completion == timegraph::Completion::failed) error_ = info->error;
            if (chart_.through == info->publishedThrough) opening_ = false;
        }
    }
    if (ready(restore_)) {
        auto result = restore_.get();
        if (result.generation != generation() || result.second != requested_) return;
        if (result.status == timegraph::RestoreStatus::ready) {
            previewState_ = std::move(*result.state);
            preview_ = snapshot(*previewState_, false);
            ++viewRevision_;
        } else {
            live();
            error_ = result.error.empty() ? "That second is unavailable" : result.error;
        }
    }
}

void Session::readChart(const timegraph::Coverage& info)
{
    if (!info.publishedThrough || chart_.through == info.publishedThrough) return;
    sites_.resize(headers_.size() * info.regions);
    auto next = info.start + samples_.size();
    // Leave layout, drawing and input a predictable share of every frame.
    for (int page = 0; page < 8 && next <= *info.publishedThrough; ++page) {
        const auto count = forecast_.readSummaries(info.generation, next, headers_, sites_);
        if (!count) break;
        for (std::size_t i = 0; i < count; ++i) {
            const auto pop = static_cast<float>(headers_[i].population);
            samples_.push_back(pop);
            addPoint(chart_, next++, pop);
        }
        chart_.through = next - 1;
    }
    if (chart_.through && (*chart_.through > chart_.end ||
        (chart_.through == info.publishedThrough && info.completion != timegraph::Completion::running))) {
        const auto end = info.completion == timegraph::Completion::running
            ? std::min(info.target, chart_.start + 2 * (chart_.end - chart_.start))
            : std::max(chart_.start + 1, *chart_.through);
        if (end == chart_.end) return;
        chart_.end = end;
        chart_.population = {};
        chart_.peak = 1;
        for (std::size_t i = 0; i < samples_.size(); ++i) addPoint(chart_, chart_.start + i, samples_[i]);
    }
}

bool Session::scrub(Second second)
{
    if (!run_ || opening_ || busy() || !chart_.through) return false;
    second = std::clamp(second, chart_.start, *chart_.through);
    if (requested_ == second) return false;
    requested_ = second;
    restore_ = forecast_.stateAtSecond(generation(), second);
    return true;
}

void Session::live()
{
    requested_.reset();
    restore_ = {};
    preview_.reset();
    previewState_.reset();
    ++viewRevision_;
}

std::uint64_t Session::displayedDigest() const
{
    return sim::state_digest(previewState_ ? *previewState_ : *run_->live);
}

std::uint64_t Session::replayDigest(Second second) const
{
    auto result = sim::rebuildStateAtSecond(*run_->base, run_->journal, static_cast<double>(second));
    if (!result.result) throw std::runtime_error("Replay oracle failed: " + std::string(result.result.reason));
    return sim::state_digest(*result.state);
}

std::vector<double> Session::benchmarkReconstruction(std::span<const Second> targets)
{
    // Repack actual published boundaries through the same anchor implementation.
    // Only materializing and replaying to the sampled second are timed here.
    const auto first = chart_.start;
    std::atomic_size_t account{};
    std::vector<double> samples;
    for (const auto target : targets) {
        const auto second = target - (target - first) % sim::replay_anchor_stride;
        auto restored = forecast_.stateAtSecond(generation(), second).get();
        if (restored.status != timegraph::RestoreStatus::ready)
            throw std::runtime_error("Benchmark anchor is unavailable");
        timegraph::detail::Anchor anchor(account, *restored.state, nullptr);
        const auto start = Clock::now();
        auto state = anchor.copy();
        sim::ReplayCursor replay(run_->journal, state.hot.tSec, true);
        if (!replay.advance_to(state, static_cast<double>(target)))
            throw std::runtime_error("Benchmark reconstruction failed");
        samples.push_back(std::chrono::duration<double, std::milli>(Clock::now() - start).count());
    }
    return samples;
}

}
