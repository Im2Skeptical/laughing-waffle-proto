#include "sim/browser/detail/json_path.hpp"
#include "sim/browser/generated/game_state.hpp"
#include "sim/state/runtime_state.hpp"
#include "tools/json_file.hpp"

#include <algorithm>
#include <chrono>
#include <functional>
#include <iostream>
#include <map>
#include <tuple>

namespace {

namespace json = waffle::core::json;
namespace browser = waffle::sim::browser;
namespace sim = waffle::sim;
namespace runtime = waffle::sim::runtime;
using browser::detail::index_path;
using browser::detail::property_path;
using waffle::tools::read_file;
using waffle::tools::write_file;
using json::Value;

std::size_t leaf_count(const Value* value)
{
    if (!value) return 0;
    std::size_t count = 0;
    if (value->kind() == Value::Kind::array) {
        for (const auto& child : value->as_array()) count += leaf_count(&child);
    } else if (value->kind() == Value::Kind::object) {
        for (const auto& property : value->as_object()) count += leaf_count(&property.value);
    }
    return std::max<std::size_t>(1, count);
}

struct Diff {
    std::size_t differing_leaves = 0;
    std::string first_path;
};

void compare(Diff& diff, const std::string& path, const Value* left, const Value* right)
{
    if (left && right && left->kind() == right->kind()) {
        switch (left->kind()) {
        case Value::Kind::null: return;
        case Value::Kind::boolean:
            if (left->as_bool() == right->as_bool()) return;
            break;
        case Value::Kind::number:
            if (left->as_number() == right->as_number()) return;
            break;
        case Value::Kind::string:
            if (left->as_string() == right->as_string()) return;
            break;
        case Value::Kind::array: {
            const auto& a = left->as_array();
            const auto& b = right->as_array();
            for (std::size_t i = 0; i < std::max(a.size(), b.size()); ++i)
                compare(diff, index_path(path, i), i < a.size() ? &a[i] : nullptr, i < b.size() ? &b[i] : nullptr);
            return;
        }
        case Value::Kind::object: {
            struct Children {
                std::string_view key;
                const Value* left = nullptr;
                const Value* right = nullptr;
            };
            std::map<std::u16string, Children> children;
            for (const auto& prop : left->as_object()) {
                auto& child = children[json::utf16_sort_key(prop.key)];
                child.key = prop.key;
                child.left = &prop.value;
            }
            for (const auto& prop : right->as_object()) {
                auto& child = children[json::utf16_sort_key(prop.key)];
                child.key = prop.key;
                child.right = &prop.value;
            }
            for (const auto& entry : children) {
                const auto& child = entry.second;
                compare(diff, property_path(path, child.key), child.left, child.right);
            }
            return;
        }
        }
    }
    if (diff.differing_leaves == 0) diff.first_path = path;
    diff.differing_leaves += std::max(leaf_count(left), leaf_count(right));
}

int diff_files(const Value& left, const Value& right)
{
    Diff diff;
    compare(diff, "$", &left, &right);
    if (diff.differing_leaves == 0) {
        std::cout << "State values match.\n";
        return 0;
    }
    std::cout << diff.differing_leaves << " differing leaves.\n"
              << "First divergent path: " << diff.first_path << '\n';
    return 1;
}

#include "sim/state/mirror_fields.generated.inc"

// Bytes outside the enclosing object, counting live elements rather than
// vector capacity and excluding allocator/control-block overhead.
template<class T>
std::size_t mirror_dynamic_bytes(const T& value)
{
    if constexpr (std::is_same_v<T, std::string>) {
        const auto* begin = reinterpret_cast<const char*>(&value);
        const std::less<const void*> less;
        return less(value.data(), begin) || !less(value.data(), begin + sizeof(value))
            ? value.size() + 1 : 0;
    } else if constexpr (std::is_same_v<T, Value>) {
        switch (value.kind()) {
        case Value::Kind::string: return mirror_dynamic_bytes(value.as_string());
        case Value::Kind::array: return mirror_dynamic_bytes(value.as_array());
        case Value::Kind::object: return mirror_dynamic_bytes(value.as_object());
        default: return 0;
        }
    } else if constexpr (std::is_same_v<T, Value::Property>) {
        return mirror_dynamic_bytes(value.key) + mirror_dynamic_bytes(value.value);
    } else if constexpr (requires { value.has_key(); }) {
        return value.has_key() ? mirror_dynamic_bytes(value.value()) : 0;
    } else if constexpr (requires { value.has_value(); }) {
        return value ? mirror_dynamic_bytes(*value) : 0;
    } else if constexpr (requires { value.first; value.second; }) {
        return mirror_dynamic_bytes(value.first) + mirror_dynamic_bytes(value.second);
    } else if constexpr (std::ranges::range<T>) {
        std::size_t bytes = 0;
        if constexpr (requires { value.capacity(); }) bytes = value.size() * sizeof(typename T::value_type);
        for (const auto& element : value) bytes += mirror_dynamic_bytes(element);
        return bytes;
    } else if constexpr (requires { value.valueless_by_exception(); }) {
        return std::visit([](const auto& member) { return mirror_dynamic_bytes(member); }, value);
    } else if constexpr (requires { typename std::tuple_size<T>::type; }) {
        return std::apply([](const auto&... members) {
            return (std::size_t{0} + ... + mirror_dynamic_bytes(members));
        }, value);
    } else if constexpr (requires { mirror_fields(value, [](const auto&) {}); }) {
        std::size_t bytes = 0;
        mirror_fields(value, [&](const auto& field) { bytes += mirror_dynamic_bytes(field); });
        return bytes;
    } else {
        return 0;
    }
}

template<class T, class Verify>
double median_copy_us(const T& source, std::size_t samples, Verify verify)
{
    using Clock = std::chrono::steady_clock;
    std::vector<double> timings;
    timings.reserve(samples);
    constexpr std::size_t warmup = 5;
    for (std::size_t i = 0; i < samples + warmup; ++i) {
        const auto begin = Clock::now();
        const auto copy = source;
        const auto elapsed = Clock::now() - begin;
        verify(copy);
        if (i >= warmup) timings.push_back(std::chrono::duration<double, std::micro>(elapsed).count());
    }
    std::ranges::sort(timings);
    return timings[timings.size() / 2];
}

Value cold_stats(const sim::RuntimeState& state, std::size_t samples)
{
    Value::Object breakdown;
    const auto measure = [&]<class T>(const std::vector<T>& values, auto size) {
        auto bytes = values.size() * sizeof(T);
        std::size_t records = 0;
        for (const auto& value : values) {
            const auto [entryBytes, entryRecords] = size(value);
            bytes += entryBytes;
            records += entryRecords;
        }
        const auto elapsed = median_copy_us(values, samples, [&](const auto& copy) {
            if (copy.size() != values.size()) throw std::logic_error("cold copy changed table size");
        });
        breakdown.push_back({std::string(T::Name::name), Value(Value::Object{
            {"cursors", Value(static_cast<double>(values.size()))},
            {"records", Value(static_cast<double>(records))},
            {"liveBytes", Value(static_cast<double>(bytes))},
            {"medianCopyUs", Value(elapsed)},
        })});
    };
    state.cold.for_each_table([&](const auto& values) {
        measure(values, [](const auto& value) {
            return std::pair{sizeof(value.get()) + mirror_dynamic_bytes(value.get()), std::size_t{1}};
        });
    });
    state.histories.for_each_table([&](const auto& values) {
        measure(values, [](const auto& history) {
            return std::pair{history.live_bytes(), history.size()};
        });
    });
    return Value(std::move(breakdown));
}

void runtime_stats(const sim::RuntimeState& state)
{
    const auto& hot = state.hot;
    const auto& tables = state.tables;
    std::size_t markets = 0;
    std::uint64_t population = 0;
    std::size_t populationBins = 0;
    std::size_t elderBins = 0;
    std::size_t practiceRows = 0;
    std::size_t structureOrigins = 0;
    std::size_t marketRows = 0;
    const auto elder = state.find_id<runtime::LifeStageId>("elder");
    for (const auto& site : tables.view(hot.world.sites)) {
        const auto& settlement = site.detailedState;
        practiceRows += settlement.practiceSlots.rows.size();
        structureOrigins += settlement.structureSlots.origins.size();
        for (const auto* residency : {&settlement.populationByClass.villager, &settlement.populationByClass.stranger}) {
            if (residency->joint) {
                populationBins += residency->joint->size();
                elderBins += std::ranges::count(tables.view(*residency->joint), elder, &runtime::JointCohort::kind);
            }
        }
        if (site.neutral) {
            ++markets;
            marketRows += tables.at(*site.neutral).stocks.size();
        }
        for (const auto& totals : state.indexes.sites.at(site.id.value).byResidency) population += totals.total();
    }
    constexpr std::size_t samples = 101;
    const auto fullCopy = median_copy_us(state, samples, [&](const auto& copy) {
        if (copy.content != state.content) throw std::logic_error("runtime copy changed captured content");
    });
    const Value result(Value::Object{
        {"tSec", Value(hot.tSec)},
        {"year", Value(hot.year)},
        {"regions", Value(static_cast<double>(hot.world.regions.size()))},
        {"sites", Value(static_cast<double>(hot.world.sites.size()))},
        {"activeSites", Value(static_cast<double>(state.indexes.activeSites.size()))},
        {"roads", Value(static_cast<double>(hot.world.connections.size()))},
        {"practices", Value(static_cast<double>(practiceRows))},
        {"structureOrigins", Value(static_cast<double>(structureOrigins))},
        {"markets", Value(static_cast<double>(markets))},
        {"marketRows", Value(static_cast<double>(marketRows))},
        {"marketTableRows", Value(static_cast<double>(tables.rows<runtime::NeutralStock>().size()))},
        {"populationBins", Value(static_cast<double>(populationBins))},
        {"elderBins", Value(static_cast<double>(elderBins))},
        {"population", Value(static_cast<double>(population))},
        {"pendingEvents", Value(static_cast<double>(hot.civilization.practiceEvents.pending.size()))},
        {"hotBytes", Value(static_cast<double>(state.hot_bytes()))},
        {"copySamples", Value(static_cast<double>(samples))},
        {"medianCopyUs", Value(fullCopy)},
        {"coldSubtrees", cold_stats(state, samples)}
    });
    std::cout << json::stringify(result) << '\n';
}

}

int main(int argc, char** argv)
{
    try {
        const std::string_view command = argc > 1 ? argv[1] : "";
        if ((command == "roundtrip" || command == "runtime-roundtrip") &&
            (argc == 3 || (argc == 5 && std::string_view(argv[3]) == "--out"))) {
            const auto input = json::parse(read_file(argv[2]));
            auto state = browser::import_game_state(input);
            if (command == "runtime-roundtrip") state = sim::export_runtime(sim::import_runtime(state));
            const auto output = json::stringify(browser::export_game_state(state));
            if (argc == 5) write_file(argv[4], output);
            else std::cout << output;
            return 0;
        }
        if (command == "runtime-stats" && argc == 3) {
            runtime_stats(sim::import_runtime(browser::import_game_state(json::parse(read_file(argv[2])))));
            return 0;
        }
        if (command == "hash" && argc == 3) {
            std::cout << json::sha256_value(json::parse(read_file(argv[2]))) << '\n';
            return 0;
        }
        if (command == "diff" && argc == 4)
            return diff_files(json::parse(read_file(argv[2])), json::parse(read_file(argv[3])));

        throw std::invalid_argument("Usage: waffle_parity (roundtrip | runtime-roundtrip) <state.json> [--out <path>] | "
                                    "runtime-stats <state.json> | "
                                    "hash <state.json> | diff <a.json> <b.json>");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }
}
