#include "core/json.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"
#include "tools/json_file.hpp"

#include <iostream>
#include <stdexcept>

namespace {

using namespace waffle::sim;
using namespace waffle::sim::runtime;
using namespace waffle::sim::settlement;
namespace json = waffle::core::json;
using json::Value;

void expect(bool condition, const char* message)
{
    if (!condition) throw std::runtime_error(message);
}

void compare(const Value& actual, const Value& expected, const char* message)
{
    expect(json::canonical_json(actual) == json::canonical_json(expected), message);
}

const Value& field(const Value& value, const char* key)
{
    const auto* result = value.find(key);
    expect(result != nullptr, key);
    return *result;
}

PopulationBin read_bin(const RuntimeState& state, const Value& value)
{
    const auto& age = field(value, "age");
    return {
        field(value, "classId").as_string() == "villager" ? Residency::villager : Residency::stranger,
        {state.find_id<FactionId>(field(value, "allegiance").as_string()),
         state.find_id<SpecialtyId>(field(value, "specialty").as_string()),
         state.find_id<LifeStageId>(field(value, "kind").as_string()),
         age.kind() == Value::Kind::null ? std::nullopt : std::optional(static_cast<std::uint64_t>(age.as_number()))},
        static_cast<std::uint64_t>(field(value, "count").as_number()),
    };
}

Value write_bins(const RuntimeState& state, std::span<const PopulationBin> bins)
{
    Value::Array result;
    for (const auto& bin : bins) {
        result.emplace_back(Value::Object{
            {"classId", Value(bin.residency == Residency::villager ? "villager" : "stranger")},
            {"allegiance", Value(std::string(state.name(bin.key.allegiance)))},
            {"specialty", Value(std::string(state.name(bin.key.specialty)))},
            {"kind", Value(std::string(state.name(bin.key.kind)))},
            {"age", bin.key.age ? Value(double(*bin.key.age)) : Value(nullptr)},
            {"count", Value(double(bin.count))},
        });
    }
    return Value(std::move(result));
}

Value write_cohort(const Cohort& cohort)
{
    Value::Array elders;
    for (const auto& elder : cohort.elders) {
        elders.emplace_back(Value::Object{{"age", Value(double(elder.age))}, {"count", Value(double(elder.count))}});
    }
    return Value(Value::Object{
        {"children", Value(cohort.children)}, {"adults", Value(cohort.adults)}, {"eldersByAge", Value(std::move(elders))},
    });
}

Value export_population(const RuntimeState& state)
{
    const auto snapshot = browser::export_game_state(export_runtime(state));
    const auto& site = field(field(snapshot, "world"), "sites").as_array().front();
    return field(field(site, "detailedState"), "populationByClass");
}

void compare_cohorts(const RuntimeState& state, const PopulationClass& cohort, const Value& expected)
{
    CohortScratch scratch;
    scratch.reserve(128);
    std::array<Cohort, 3> parts;
    for (auto& part : parts) part.elders.reserve(128);
    split_specialist_cohorts(state, cohort, parts, scratch);
    constexpr std::array partNames{"ordinary", "scholar", "warrior"};
    for (std::size_t i = 0; i < parts.size(); ++i)
        compare(write_cohort(parts[i]), field(field(expected, "parts"), partNames[i]), "cohort split");
    Cohort combined;
    combined.elders.reserve(128);
    combine_specialist_cohorts(parts, combined, scratch);
    auto combinedJson = write_cohort(combined);
    combinedJson.set("specialists", Value(Value::Object{{"scholar", write_cohort(parts[1])}, {"warrior", write_cohort(parts[2])}}));
    compare(combinedJson, field(expected, "combined"), "cohort combine");
}

void check_case(RuntimeState& state, const Value& test)
{
    LedgerScratch scratch;
    scratch.reserve(128);
    std::vector<PopulationBin> input, working, output, removed;
    for (auto* buffer : {&input, &working, &output, &removed}) buffer->reserve(128);
    for (const auto& bin : field(test, "bins").as_array()) input.push_back(read_bin(state, bin));
    for (const auto& allocation : field(test, "allocations").as_array()) {
        allocate_population(state, input, field(allocation, "requested").as_number(), output, scratch);
        compare(write_bins(state, output), field(allocation, "bins"), "allocate population");
    }

    const auto id = detailed_sites(state).front();
    const auto& population = site_at(state, id).detailedState.populationByClass;
    write_population_bins(state, id, input, scratch);
    compare(export_population(state), field(test, "written"), "ledger write and serialized caches");
    collect_population(state, population, working);
    compare(write_bins(state, working), field(test, "ordered"), "ordered bin access");
    Value::Array factionTotals;
    for (const auto& [faction, count] : faction_totals(state, id)) {
        factionTotals.emplace_back(Value::Array{Value(std::string(state.name(faction))), Value(double(count))});
    }
    compare(Value(std::move(factionTotals)), field(test, "byFaction"), "ordered faction totals");
    const auto& expectedCohorts = field(test, "cohorts");
    compare_cohorts(state, population.villager, field(expectedCohorts, "villager"));
    compare_cohorts(state, population.stranger, field(expectedCohorts, "stranger"));
    expect(population_totals(state, id).byResidency[0].children == population.villager.children,
           "villager totals were not refreshed");
    expect(population_totals(state, id).byResidency[1].adults == population.stranger.adults,
           "stranger totals were not refreshed");

    const auto bytes = state.tables.live_bytes();
    rebuild_runtime_indexes(state);
    write_population_bins(state, id, input, scratch);
    expect(state.tables.live_bytes() == bytes, "same-sized commit grew an arena");

    PopulationFilter filter;
    filter.kind = state.find_id<LifeStageId>("adults");
    filter.opposing = true;
    collect_population(state, population, input, filter, state.find_id<FactionId>("player"));
    allocate_population(state, input, 12, output, scratch);
    compare(write_bins(state, output), field(test, "selected"), "filter and select population");
    remove_population(working, output, removed);
    compare(write_bins(state, removed), field(test, "removed"), "remove population");
    write_population_bins(state, id, working, scratch);
    compare(export_population(state), field(test, "remaining"), "remaining ledger after removal");
}

void check_moon_buffers(RuntimeState state)
{
    const auto before = state.tables.live_bytes();
    for (int second = 1; second <= 60; ++second) {
        expect(advance_one_second(state), "clock did not advance");
        if (second == 6) {
            auto& turn = *state.hot.civilization.currentMoonTurn;
            state.tables.view(turn.regions).front().value.currencySpent = 17;
            auto fork = state;
            expect(advance_one_second(fork), "fork did not roll over");
            expect(fork.hot.civilization.lastMoonTurn->startedSec == 1 && turn.phaseIndex == 5,
                   "rollover changed the source copy");
            const auto& site = site_at(fork, detailed_sites(fork).front());
            expect(fork.tables.at(*site.detailedState.lastMoonResult).currencySpent == 17,
                   "rollover lost the previous region result");
        }
    }
    expect(state.tables.live_bytes() == before, "steady-state moon rollover grew the arenas");
}

}

int main(int argc, char** argv)
{
    try {
        expect(argc == 3, "expected an opening fixture and Node-generated vectors");
        const auto opening = json::parse(waffle::tools::read_file(argv[1]));
        auto state = import_runtime(browser::import_game_state(opening));
        check_moon_buffers(state);
        const auto vectors = json::parse(waffle::tools::read_file(argv[2]));
        std::size_t index = 0;
        for (const auto& test : vectors.as_array()) {
            try {
                check_case(state, test);
            } catch (const std::exception& error) {
                throw std::runtime_error("ledger vector " + std::to_string(index) + " failed: " + error.what());
            }
            ++index;
        }
        std::cout << index << " browser ledger vectors passed\n";
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
