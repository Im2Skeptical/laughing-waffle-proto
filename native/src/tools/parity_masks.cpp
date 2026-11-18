#include "tools/parity_masks.hpp"

#include <algorithm>
#include <set>
#include <span>
#include <stdexcept>

namespace waffle::tools {
namespace {

using core::json::Value;
using Pattern = std::span<const std::string>;

const Value& required(const Value& object, std::string_view key, Value::Kind kind)
{
    const auto* value = object.find(key);
    if (!value || value->kind() != kind)
        throw std::invalid_argument("parity masks: invalid or missing " + std::string(key));
    return *value;
}

std::vector<std::string> split_path(std::string_view path)
{
    const auto invalid = std::invalid_argument("parity masks: invalid path " + std::string(path));
    if (!path.starts_with("$.")) throw invalid;
    path.remove_prefix(2);
    std::vector<std::string> tokens;
    for (;;) {
        const auto end = path.find('.');
        const auto token = path.substr(0, end);
        if (token.empty() || (token != "*" && token != "**" &&
            token.find_first_of("*[]$") != std::string_view::npos) ||
            (token == "**" && !tokens.empty() && tokens.back() == "**")) throw invalid;
        tokens.emplace_back(token);
        if (end == std::string_view::npos) break;
        path.remove_prefix(end + 1);
    }
    return tokens;
}

void match_child(std::vector<Pattern>& matches, Pattern pattern, std::string_view name)
{
    while (!pattern.empty() && pattern.front() == "**") {
        matches.push_back(pattern); // Consume the child, with more descendants still allowed.
        pattern = pattern.subspan(1); // Or match zero segments before the next token.
    }
    if (!pattern.empty() && (pattern.front() == "*" || pattern.front() == name))
        matches.push_back(pattern.subspan(1));
}

bool masks_node(Pattern pattern)
{
    return std::ranges::all_of(pattern, [](const auto& token) { return token == "**"; });
}

Value filtered(const Value& value, const std::vector<Pattern>& patterns)
{
    if (patterns.empty()) return value;

    std::vector<Pattern> matches;
    const auto keep = [&](std::string_view child) {
        matches.clear();
        for (auto pattern : patterns) match_child(matches, pattern, child);
        return std::ranges::none_of(matches, masks_node);
    };
    if (value.kind() == Value::Kind::object) {
        Value::Object result;
        result.reserve(value.as_object().size());
        for (const auto& property : value.as_object()) {
            if (keep(property.key)) result.push_back({property.key, filtered(property.value, matches)});
        }
        return Value(std::move(result));
    }
    if (value.kind() == Value::Kind::array) {
        Value::Array result;
        result.reserve(value.as_array().size());
        for (std::size_t index = 0; index < value.as_array().size(); ++index) {
            if (keep(std::to_string(index))) result.push_back(filtered(value.as_array()[index], matches));
            else result.emplace_back(nullptr);
        }
        return Value(std::move(result));
    }
    return value;
}

}

ParityMasks::ParityMasks(const Value& document)
{
    if (required(document, "formatVersion", Value::Kind::number).as_number() != 1)
        throw std::invalid_argument("parity masks: unsupported formatVersion");
    std::set<std::string_view> paths;
    for (const auto& entry : required(document, "masks", Value::Kind::array).as_array()) {
        const auto& path = required(entry, "path", Value::Kind::string).as_string();
        const auto& owner = required(entry, "owner", Value::Kind::string).as_string();
        const auto& reason = required(entry, "reason", Value::Kind::string).as_string();
        // N03e-1 through N03e-9, the cut table in spec/tick-pipeline.md.
        if (owner.size() != 6 || !owner.starts_with("N03e-") || owner.back() < '1' || owner.back() > '9')
            throw std::invalid_argument("parity masks: unknown cut " + owner + " at " + path);
        if (reason.empty() || !paths.insert(path).second)
            throw std::invalid_argument("parity masks: empty reason or repeated path " + path);
        patterns_.push_back(split_path(path));
    }
}

Value ParityMasks::apply(const Value& state) const
{
    std::vector<Pattern> patterns;
    patterns.reserve(patterns_.size());
    for (const auto& pattern : patterns_) patterns.push_back(pattern);
    return filtered(state, patterns);
}

}
