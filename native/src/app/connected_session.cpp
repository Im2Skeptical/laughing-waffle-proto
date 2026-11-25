#include "connected_session.hpp"

#include "sdl_asset_file.hpp"
#include "sim/content/compiled_content.hpp"
#include "sim/world/generate.hpp"
#include "sim/world/new_game.hpp"
#include "sim/world/topology.hpp"
#include "timegraph/anchor.hpp"

#include <algorithm>
#include <atomic>
#include <cmath>

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

auto geometry(const RuntimeState& state)
{
    auto geography = std::make_shared<MapGeography>();
    const auto seed = sim::generated_regional_seed(state.topology->definition_id());
    if (!seed) throw std::invalid_argument("The connected game requires a generated regional world");
    sim::RegionalOutlines outlines;
    sim::RegionalEdgeInks edgeInk;
    geography->seed = *seed;
    const auto world = sim::generate_regional_world(*seed, &outlines, &edgeInk, &geography->oceanSides);
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
    geography->min = min;
    geography->max = max;
    for (const auto& row : state.tables.view(state.hot.world.regions)) {
        const auto it = std::ranges::find(world.regions, state.name(row.id), &sim::RegionalWorld::Region::id);
        if (it == world.regions.end()) throw std::invalid_argument("Unknown map region");
        const auto ordinal = static_cast<std::size_t>(it - world.regions.begin());
        auto& outline = outlines[ordinal];
        for (auto& point : outline) point = normalize(point);
        auto& shape = geography->shapes.emplace_back(RegionShape{normalize(it->labelPoint), std::move(outline), {}});
        for (auto& edge : edgeInk[ordinal]) {
            using Kind = sim::RegionalEdgeInk::Kind;
            const auto feature = edge.kind == Kind::river ? RegionShape::Feature::river :
                edge.kind == Kind::ridge ? RegionShape::Feature::ridge : edge.kind == Kind::exterior ?
                RegionShape::Feature::exterior : RegionShape::Feature::frontier;
            for (auto& point : edge.points) point = normalize(point);
            shape.ink.push_back({feature, std::move(edge.points), edge.neighbor, edge.worldSide});
        }
    }
    return geography;
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
        region.occupied = source.monster && !source.monster->cleared.value_or(false);
        if (source.controller == state.practiceVocabulary.player) region.holder = Holder::player;
        else if (region.occupied) region.holder = Holder::monster;
        else if (state.hot.civilization.remnant && source.controller == state.hot.civilization.remnant->faction)
            region.holder = Holder::crown;
        const auto& data = summaries[result.regions.size()];
        region.population = data.population;
        region.food = data.food;
        region.currency = data.currency;
        region.housing = data.housing;
        region.loyalSharePercent = data.loyalSharePercent;
        region.holdingForce = data.holdingForce;
        region.requiredForce = data.requiredForce;
        result.regions.push_back(std::move(region));
    }
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        auto& region = result.regions.at(site.regionId.value);
        region.hasSite = true;
        region.settlement = cold(state, site.name);
        if (state.hot.civilization.remnant) {
            if (region.id == state.name(state.hot.civilization.remnant->capitalRegionId))
                region.crown = CrownRank::capital;
            else if (region.settlement == "Remnant Province") region.crown = CrownRank::province;
        }
        region.ruin = site.simulationMode == state.territory.ruin;
        region.detailed = site.simulationMode == state.territory.detailed && !site.neutral;
        if (!region.detailed) continue;
        const auto& board = site.detailedState.practiceSlots.slots;
        for (std::size_t i = 0; i < board.size(); ++i) {
            if (board[i]) region.cards[i] = card(state, board[i]);
            region.cards[i].locked = i >= site.detailedState.unlockedPracticeSlots;
        }
    }
    for (const auto& road : state.tables.view(state.hot.world.connections))
        result.roads.emplace_back(road.regionAId.value, road.regionBId.value);
    const auto crestStart = Clock::now();
    result.crests = readCrests(state);
    result.crestModelMs = std::chrono::duration<double, std::milli>(Clock::now() - crestStart).count();
    if (live) decisions(result, state);
    return result;
}

}

void Session::open(const Launch& launch)
{
    if (busy() || suspended_) return;
    auto previous = std::move(run_);
    live();
    chart_ = {};
    previousChart_ = {};
    error_.clear();
    opening_ = true;
    job_ = std::async(std::launch::async, [this, launch, previous = std::move(previous)] {
        if (previous) forecast_.cancel(previous->generation);
        auto run = std::make_shared<Run>();
        auto data = [&]() -> SavedRun {
            if (launch.nativeSave) return readNativeSave(launch.save);
            if (!launch.save.empty()) return readBrowserSave(core::json::parse(
                readAsset(reinterpret_cast<const char*>(launch.save.u8string().c_str()))));
            auto wire = core::json::parse(readAsset(WAFFLE_OPENING_CONFIG));
            if (launch.longBenchmark) {
                auto config = field(wire, "gameConfig");
                auto settings = field(config, "settings");
                auto values = field(settings, "values");
                values.set("phaseDurationSec", Value(64.));
                values.set("monsterExpansionThreshold", Value(1e9));
                settings.set("values", std::move(values));
                config.set("settings", std::move(settings));
                wire.set("gameConfig", std::move(config));
                return readBrowserSave(wire);
            }
            const auto& config = field(wire, "gameConfig");
            auto base = sim::build_new_game(launch.seed, sim::browser::import_game_config(config), &config);
            auto live = base;
            sim::initialize_replay_clock(live);
            return {std::move(base), {}, std::move(live)};
        }();
        run->base = std::make_shared<RuntimeState>(std::move(data.base));
        run->live = std::make_shared<RuntimeState>(std::move(data.live));
        run->journal = std::move(data.journal);
        run->geography = geometry(*run->live);
        run->snapshot = snapshot(*run->live, true);
        run->horizon = launch.horizon;
        run->generation = forecast_.start(*run->base, run->journal, run->snapshot.second + run->horizon);
        return std::shared_ptr<const Run>(std::move(run));
    });
}

void Session::suspend()
{
    if (suspended_) return;
    // Finish any accepted action before saving its committed frontier.
    if (job_.valid()) {
        job_.wait();
        update();
    }
    if (run_) forecast_.cancel(run_->generation);
    live();
    suspended_ = true;
}

void Session::resume()
{
    if (!suspended_) return;
    suspended_ = false;
    if (!run_) return;
    auto run = std::make_shared<Run>(*run_);
    run->divergence.reset();
    run->generation = forecast_.start(*run->base, run->journal, run->snapshot.second + run->horizon);
    run_ = std::move(run);
    chart_ = {};
    previousChart_ = {};
}

void Session::close()
{
    suspend();
    run_.reset();
    chart_ = {};
    previousChart_ = {};
    suspended_ = false;
    opening_ = true;
    error_.clear();
}

bool Session::save(const SaveSlots& slots, Slot slot) const
{
    if (!run_ || busy()) return false;
    slots.write(slot, *run_->base, run_->journal, *run_->live);
    return true;
}

void Session::transact(std::vector<sim::Action> actions, bool resolve)
{
    error_.clear();
    job_ = std::async(std::launch::async, [this, previous = run_, retain = chart_.through,
                                           actions = std::move(actions), resolve] {
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
        run->geography = previous->geography;
        run->horizon = previous->horizon;
        run->snapshot = snapshot(*run->live, true);
        run->divergence = previous->snapshot.second;
        run->generation = forecast_.start(*run->base, run->journal, run->snapshot.second + run->horizon,
            timegraph::BoundaryActions::pending, retain && *retain > *run->divergence ? retain : std::nullopt);
        return std::shared_ptr<const Run>(std::move(run));
    });
}

bool Session::submit(const LifeCommand& command)
{
    if (!run_ || busy() || opening_ || previewing() || suspended_) return false;
    if (command.advance) {
        if (!currentVassal(*run_->live) || !currentVassal(*run_->live)->lifeMap.pendingResolution) return false;
        transact({}, true);
    } else {
        transact({action(run_->snapshot.second, command.kind.c_str(), command.payload)});
    }
    return true;
}

LifeReading Session::lifeMap(bool detail) const
{
    if (!run_) return {};
    const auto& state = previewState_ ? *previewState_ : *run_->live;
    return readLifeMap(state, !previewing(), detail);
}

bool Session::choose(const Choice& choice)
{
    if (!run_ || busy() || opening_ || previewing() || suspended_) return false;
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
    if (!run_ || busy() || opening_ || previewing() || suspended_ || from == to) return false;
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
    if (suspended_) return;
    if (ready(job_)) {
        try {
            auto next = job_.get();
            previousChart_ = next->divergence && chart_.through && *chart_.through > *next->divergence
                ? std::move(chart_) : Chart{};
            chart_ = {};
            run_ = std::move(next);
            live();
        } catch (const std::exception& failure) {
            error_ = failure.what();
            opening_ = false;
        }
    }
    summaryMs_ = 0;
    if (busy()) return;
    updatePreview();
    if (const auto info = coverage()) {
        const auto start = Clock::now();
        readChart(*info);
        summaryMs_ = std::chrono::duration<double, std::milli>(Clock::now() - start).count();
        if (info->completion != timegraph::Completion::running) {
            if (info->completion == timegraph::Completion::failed) error_ = info->error;
            if (chart_.through == info->publishedThrough) opening_ = false;
        }
    }
}

void Session::updatePreview()
{
    if (!ready(restore_)) return;
    auto result = restore_.get();
    if (result.generation != requestedGeneration_ || result.second != requested_) return;
    if (result.status == timegraph::RestoreStatus::ready) {
        previewState_ = std::move(*result.state);
        preview_ = snapshot(*previewState_, false);
        previewGeneration_ = result.generation;
        ++viewRevision_;
    } else {
        live();
        error_ = result.error.empty() ? "That second is unavailable" : result.error;
    }
}

std::optional<Second> Session::divergence() const
{
    return run_ ? run_->divergence : std::nullopt;
}

std::optional<Second> Session::browseThrough() const
{
    return std::max(chart_.through, previousChart_.through);
}

void Session::clearComparison()
{
    if (!previousChart_.generation || busy()) return;
    // The next forecast transaction retires the worker's retained anchors.
    // Dropping the presentation cache here keeps their teardown off the UI thread.
    previousChart_ = {};
}

void Session::readChart(const timegraph::Coverage& info)
{
    if (chart_.generation != info.generation) chart_.begin(info);
    if (!info.publishedThrough || chart_.through == info.publishedThrough) return;
    sites_.resize(headers_.size() * info.regions);
    auto next = chart_.through ? *chart_.through + 1 : info.start;
    // Leave layout, drawing and input a predictable share of every frame.
    for (int page = 0; page < 8 && next <= *info.publishedThrough; ++page) {
        const auto count = forecast_.readSummaries(info.generation, next, headers_, sites_);
        if (!count) break;
        for (std::size_t i = 0; i < count; ++i)
            chart_.append(headers_[i], std::span(sites_).subspan(i * info.regions, info.regions));
        next += count;
    }
}

std::size_t Session::readPlot(timegraph::GenerationId id, std::size_t scope, Second first,
                              std::span<SeriesValues> values)
{
    const auto& source = id == chart_.generation ? chart_ : previousChart_;
    if (!run_ || id != source.generation || !source.through || first > *source.through) return 0;
    const auto regions = run_->snapshot.regions.size();
    if (scope > regions) return 0;
    const auto limit = std::min<std::size_t>(values.size(), *source.through - first + 1);
    sites_.resize(headers_.size() * regions);
    std::size_t read = 0;
    while (read < limit) {
        const auto count = forecast_.readSummaries(id, first + read,
            std::span(headers_).first(std::min(headers_.size(), limit - read)), sites_);
        if (!count) break;
        for (std::size_t i = 0; i < count; ++i)
            values[read + i] = plotValues(headers_[i], scope ? &sites_[i * regions + scope - 1] : nullptr);
        read += count;
    }
    return read;
}

std::array<Second, 4> Session::calendarSteps() const
{
    if (!run_) return {1, 6, 8, 32};
    const auto& settings = run_->base->compiledContent->settings();
    const auto phase = static_cast<Second>(std::max(1., std::floor(settings.phaseDurationSec)));
    const auto duration = run_->base->hot.seasonDurationSec;
    const auto season = std::isfinite(duration) && duration >= 1 && duration == std::floor(duration)
        ? static_cast<Second>(duration) : 8;
    return {1, 6 * phase, season, season * std::max<Second>(1, run_->base->hot.seasons.size())};
}

bool Session::scrub(Second second)
{
    if (!run_ || opening_ || busy() || suspended_ || !browseThrough()) return false;
    auto id = generation();
    if (previousChart_.through > chart_.through && divergence() && second >= *divergence() &&
        (!chart_.through || second > *chart_.through)) {
        second = std::min(second, *previousChart_.through);
        id = previousChart_.generation;
    } else {
        if (!chart_.through) return false;
        second = std::clamp(second, chart_.start, *chart_.through);
    }
    if (requested_ == second && requestedGeneration_ == id) return false;
    requested_ = second;
    requestedGeneration_ = id;
    restore_ = forecast_.stateAtSecond(id, second);
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
    return sim::state_digest(replayStateForTest(second));
}

sim::RuntimeState Session::replayStateForTest(Second second) const
{
    auto result = sim::rebuildStateAtSecond(*run_->base, run_->journal, static_cast<double>(second));
    if (!result.result) throw std::runtime_error("Replay oracle failed: " + std::string(result.result.reason));
    return std::move(*result.state);
}

SettlementReading Session::settlement(const Region& region, SettlementTab tab,
    std::optional<std::size_t> slot, std::string_view stockDetail) const
{
    return readSettlement(previewState_ ? *previewState_ : *run_->live, region, tab, slot, stockDetail);
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
