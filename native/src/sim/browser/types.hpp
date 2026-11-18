#pragma once

#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace waffle::sim::browser {

// In JS enumeration order: array indices first, then other keys in insertion
// order. The codec uses core::json's ordered objects at the JSON boundary.
template <class T>
using OrderedDict = std::vector<std::pair<std::string, T>>;

// Outer optional is key presence. Inner optional is value presence.
template <class T>
class OptionalNullable {
public:
    OptionalNullable() = default;
    explicit OptionalNullable(std::nullopt_t) : value_(std::in_place) {}
    explicit OptionalNullable(T value) : value_(std::in_place, std::move(value)) {}

    bool has_key() const noexcept { return value_.has_value(); }
    const std::optional<T>& value() const { return value_.value(); }
    std::optional<T>& value() { return value_.value(); }

private:
    std::optional<std::optional<T>> value_;
};

}
