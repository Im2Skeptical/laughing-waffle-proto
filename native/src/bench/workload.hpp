#pragma once

#include "core/rng.hpp"

#include <array>
#include <cstdint>
#include <span>
#include <vector>

namespace waffle::bench {

// N03p access-pattern skeleton. All numbers produced by this harness are synthetic.
using Id = std::uint32_t;
using Mask = std::uint64_t;
struct Range {
    Id begin{}, end{};
    Id size() const { return end - begin; }
};

enum Phase { birth, food, housing, faith, migration, death, season, phase_count };
enum EventKind { resolved, generated, defense, event_kind_count };

struct Cost {
    Mask traits{};
    Id amount{};
    bool consume{};
};

struct Recipe {
    Range costs;
    Mask traits{};
    Id workers{}, capacity{}, output{}, charge_gain{}, charge_threshold{};
    bool influence{};
};

struct Slot {
    Id site{}, recipe{}, faction{};
};

struct Bin {
    Id residency{}, faction{}, specialty{}, kind{}, age{};
};

struct Site {
    Range slots, stock, structures, bins, roads;
    Id controller{};
    bool active{}, market{};
};

struct SiteState {
    Id people{}, workers{}, sample{}, meal{}, charge_result{}, housing{}, movement{};
    double faith{};
};

struct SlotState {
    Id stock{}, charge{}, workers{};
};

struct ClockState {
    core::RngState rng;
    double season_clock{}, sim_time{};
    Id second{}, season_index{}, year{};
};

struct State {
    ClockState clock;
    std::vector<SiteState> sites;
    std::vector<SlotState> slots;
    std::vector<Id> populations;
};

struct Listener {
    Id slot{};
    EventKind kind{};
    Mask traits{};
};

struct World {
    std::vector<Site> sites;
    std::vector<Slot> slots;
    std::vector<Bin> bins;
    std::vector<Id> roads, structures;
    std::vector<Recipe> recipes;
    std::vector<Cost> costs;
    std::array<std::vector<Id>, phase_count> scheduled;
    std::vector<Listener> listeners;
    std::vector<std::array<Range, event_kind_count>> triggers;
    Mask edible{}, currency{};
    Id season_count{}, phase_duration{}, people_per_worker{}, trait_count{};
    double season_duration{};
    std::size_t buffers_bytes() const;
};

struct Scenario {
    World world;
    State initial;
};

Scenario load(const core::json::Value& source, Id scale);

using HeaderRow = std::array<double, 18>;
using SiteRow = std::array<double, 16>;

struct Event {
    Id site{}, origin{};
    EventKind kind{};
};

struct Debit {
    Id slot{}, amount{};
};

struct Scratch {
    explicit Scratch(const World& world);
    std::vector<Id> retry, discharged;
    std::vector<Debit> debits;
    std::vector<Event> events;
    std::uint64_t shared_visits{}, discharges{}, draws{};
    std::size_t buffers_bytes() const;
};

bool advance(State& state, const World& world);
void assign_workers(State& state, const World& world);
Phase due_phase(const State& state, const World& world);
void run_phase(State& state, const World& world, Scratch& scratch, Phase phase);
void drain(State& state, const World& world, Scratch& scratch);
void summarize(const State& state, const World& world, HeaderRow& header, std::span<SiteRow> rows);
std::uint64_t digest(const HeaderRow& header, std::span<const SiteRow> rows);

}
