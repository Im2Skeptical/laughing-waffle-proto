#pragma once

#include "core/json.hpp"

#include <string>
#include <string_view>

namespace waffle::sim::browser::detail {

inline std::string property_path(const std::string& parent, std::string_view key)
{
    const auto starts_identifier = [](char ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_' || ch == '$';
    };
    if (!key.empty() && starts_identifier(key.front()) &&
        key.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$0123456789") == std::string_view::npos)
        return parent + "." + std::string(key);
    return parent + "[" + core::json::stringify(core::json::Value(std::string(key))) + "]";
}

inline std::string index_path(const std::string& parent, std::size_t index)
{
    return parent + "[" + std::to_string(index) + "]";
}

}
