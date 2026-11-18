#include "sim/browser/detail/json_path.hpp"
#include "sim/browser/generated/game_state.hpp"
#include "tools/json_file.hpp"

#include <algorithm>
#include <iostream>
#include <map>

namespace {

namespace json = waffle::core::json;
namespace browser = waffle::sim::browser;
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

}

int main(int argc, char** argv)
{
    try {
        const std::string_view command = argc > 1 ? argv[1] : "";
        if (command == "roundtrip" && (argc == 3 || (argc == 5 && std::string_view(argv[3]) == "--out"))) {
            const auto input = json::parse(read_file(argv[2]));
            const auto output = json::stringify(browser::export_game_state(browser::import_game_state(input)));
            if (argc == 5) write_file(argv[4], output);
            else std::cout << output;
            return 0;
        }
        if (command == "hash" && argc == 3) {
            std::cout << json::sha256_value(json::parse(read_file(argv[2]))) << '\n';
            return 0;
        }
        if (command == "diff" && argc == 4)
            return diff_files(json::parse(read_file(argv[2])), json::parse(read_file(argv[3])));

        throw std::invalid_argument("Usage: waffle_parity roundtrip <state.json> [--out <path>] | "
                                    "hash <state.json> | diff <a.json> <b.json>");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 2;
    }
}
