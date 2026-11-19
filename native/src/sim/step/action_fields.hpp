#pragma once

#include "sim/step/replay.hpp"

namespace waffle::sim::action_fields {

using Value = core::json::Value;
using Kind = Value::Kind;

inline std::string_view string(const Value& payload, std::string_view key)
{
    const auto* value = payload.find(key);
    return value && value->kind() == Kind::string ? value->as_string() : std::string_view{};
}

inline std::optional<double> number(const Value& payload, std::string_view key)
{
    const auto* value = payload.find(key);
    return value && value->kind() == Kind::number ? std::optional(value->as_number()) : std::nullopt;
}

}
