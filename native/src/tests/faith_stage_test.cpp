#include "core/json.hpp"
#include "core/js_number.hpp"
#include "sim/browser/generated/game_state.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"
#include "sim/step/advance_second.hpp"
#include "sim/step/stages.hpp"
#include "tools/json_file.hpp"

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <new>
#include <optional>
#include <stdexcept>
#include <vector>

namespace {
bool countAllocations = false;
std::size_t allocations = 0;
}

void* operator new(std::size_t size)
{
    if (countAllocations) ++allocations;
    if (auto* memory = std::malloc(std::max(size, std::size_t{1}))) return memory;
    throw std::bad_alloc{};
}

void* operator new[](std::size_t size) { return ::operator new(size); }
void operator delete(void* memory) noexcept { std::free(memory); }
void operator delete[](void* memory) noexcept { std::free(memory); }
void operator delete(void* memory, std::size_t) noexcept { std::free(memory); }
void operator delete[](void* memory, std::size_t) noexcept { std::free(memory); }

namespace {

namespace sim = waffle::sim;
namespace settlement = sim::settlement;
namespace runtime = sim::runtime;
namespace browser = sim::browser;
namespace json = waffle::core::json;

auto state_hash(const sim::RuntimeState& state)
{
    return json::sha256_value(browser::export_game_state(sim::export_runtime(state)));
}

void require(bool condition, const char* message)
{
    if (!condition) throw std::runtime_error(message);
}

void run(sim::RuntimeState& state, sim::StageContext& context)
{
    require(sim::run_stage(sim::Stage::faith, state, context), "Faith stage did not run");
}

void check_collapse(const sim::RuntimeState& initial, sim::StageContext context)
{
    auto prepared = initial;
    prepared.hot.tSec = 4;
    prepared.hot.simStepIndex = 4 * sim::ticksPerSecond;
    context.lunar = sim::lunar_schedule_at_second(4, 1);
    settlement::begin_moon_turn(prepared, context.lunar);
    for (const auto id : settlement::detailed_sites(prepared)) {
        auto& site = settlement::site_at(prepared, id);
        auto& villager = site.detailedState.populationByClass.villager;
        villager.faith = {prepared.faithStage.faith.front()};
        villager.happiness.status = prepared.faithStage.happiness.front();
    }
    prepared.hot.civilization.chaos.pendingLosses.prematureDeathMitigation = 0.125;
    prepared.hot.civilization.phaseModifiers.faithResistance = 0.3;
    auto original = prepared;
    const auto saved = json::stringify(browser::export_game_state(sim::export_runtime(prepared)));
    auto restored = sim::import_runtime(browser::import_game_state(json::parse(saved)));
    for (auto* state : {&original, &restored}) {
        countAllocations = true;
        run(*state, context);
        countAllocations = false;
        require(allocations == 0, "Faith collapse allocated after copy or restoration");
        require(state->hot.civilization.currentMoonTurn->migrationIntents.size() > 0, "expected a collapse reservation");
        const auto& income = state->hot.civilization.chaos.lastMoonIncome;
        require(income && income->prematureDeathMitigation == 0.125, "fractional mitigation was lost");
    }
    require(state_hash(original) == state_hash(restored), "restored collapse differed from direct execution");
}

void measure(const sim::RuntimeState& initial, sim::StageContext context)
{
    using Clock = std::chrono::steady_clock;
    auto state = initial;
    auto& turn = *state.hot.civilization.currentMoonTurn;
    const auto intents = turn.migrationIntents;
    const auto chaos = state.hot.civilization.chaos;
    struct Local {
        runtime::PopulationByClass population;
        std::optional<runtime::HappinessFloor> floor;
    };
    std::vector<Local> before;
    for (const auto id : settlement::detailed_sites(state)) {
        const auto& local = settlement::site_at(state, id).detailedState;
        before.push_back({local.populationByClass, local.happinessFloor});
    }

    constexpr std::size_t repetitions = 50000;
    std::array<double, 5> samples{};
    std::uint32_t newIntents = 0;
    for (auto& sample : samples) {
        Clock::duration elapsed{};
        for (std::size_t i = 0; i < repetitions; ++i) {
            std::size_t row = 0;
            for (const auto id : settlement::detailed_sites(state)) {
                auto& local = settlement::site_at(state, id).detailedState;
                local.populationByClass = before[row].population;
                local.happinessFloor = before[row++].floor;
            }
            turn.migrationIntents = intents;
            state.hot.civilization.chaos = chaos;
            countAllocations = true;
            const auto begin = Clock::now();
            run(state, context);
            elapsed += Clock::now() - begin;
            countAllocations = false;
            newIntents = turn.migrationIntents.size() - intents.size();
        }
        sample = std::chrono::duration<double, std::micro>(elapsed).count() / repetitions;
    }
    require(allocations == 0, "Faith stage allocated during measurement");
    std::ranges::sort(samples);
    const auto cadence = 6 * std::max(1.0, waffle::core::js::floor(
        initial.content->config.settings.values.phaseDurationSec));
    std::cout << "Faith second " << initial.hot.tSec << ", " << newIntents
              << " new reservations, " << samples[2] << " us/Faith boundary, "
              << samples[2] / cadence << " us/sim-s at one Faith boundary per "
              << cadence << " seconds, 0 allocations across " << repetitions * samples.size() << " calls.\n";
}

}

int main(int argc, char** argv)
{
    try {
        require(argc == 2, "Usage: waffle_faith_stage_test <opening state or Faith before boundary>");
        const auto input = json::parse(waffle::tools::read_file(argv[1]));
        const auto* body = input.find("state");
        const auto state = sim::import_runtime(browser::import_game_state(body ? *body : input));
        sim::StageContext context{};
        if (!body) {
            check_collapse(state, context);
            return 0;
        }
        context.lunar = sim::lunar_schedule_at_second(state.hot.tSec, state.content->config.settings.values.phaseDurationSec);
        require(context.lunar.boundary && context.lunar.phase == sim::LunarPhase::faith &&
                state.hot.civilization.currentMoonTurn &&
                state.hot.civilization.currentMoonTurn->moonIndex == context.lunar.moonIndex,
                "expected a Faith boundary with a current moon");
        measure(state, context);
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
