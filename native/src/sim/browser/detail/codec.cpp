#include "sim/browser/detail/codec.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::sim::browser::detail {

bool read_boolean(const Value& value, const std::string& path)
{
    if (value.kind() != Value::Kind::boolean) fail(path, "expected boolean");
    return value.as_bool();
}

double read_number(const Value& value, const std::string& path)
{
    if (value.kind() != Value::Kind::number || !std::isfinite(value.as_number()))
        fail(path, "expected finite number");
    return value.as_number();
}

double read_integer(const Value& value, const std::string& path)
{
    const auto number = read_number(value, path);
    if (std::trunc(number) != number) fail(path, "expected integer");
    return number;
}

std::uint32_t read_uint32(const Value& value, const std::string& path)
{
    const auto number = read_integer(value, path);
    if (number < 0 || number >= 0x1p32) fail(path, "expected uint32");
    return static_cast<std::uint32_t>(number);
}

std::string read_string(const Value& value, const std::string& path)
{
    if (value.kind() != Value::Kind::string) fail(path, "expected string");
    return value.as_string();
}

namespace {

void check_json(const Value& value, const std::string& path)
{
    switch (value.kind()) {
    case Value::Kind::number:
        read_number(value, path);
        break;
    case Value::Kind::array: {
        const auto& array = value.as_array();
        for (std::size_t index = 0; index < array.size(); ++index)
            check_json(array[index], index_path(path, index));
        break;
    }
    case Value::Kind::object:
        for (const auto& property : value.as_object())
            check_json(property.value, property_path(path, property.key));
        break;
    default:
        break;
    }
}

}

Value read_json(const Value& value, const std::string& path)
{
    check_json(value, path);
    return value;
}

const Value::Object& read_object(const Value& value, const std::string& path, std::string_view expected)
{
    if (value.kind() != Value::Kind::object) fail(path, "expected " + std::string(expected));
    return value.as_object();
}

const Value::Array& read_array(const Value& value, const std::string& path)
{
    if (value.kind() != Value::Kind::array) fail(path, "expected array");
    return value.as_array();
}

const Value::Array& read_tuple(const Value& value, const std::string& path, std::size_t size)
{
    const auto& array = read_array(value, path);
    if (array.size() != size) fail(path, "expected tuple length " + std::to_string(size));
    return array;
}

void check_integer_key(const std::string& key, const std::string& path)
{
    if (key == "0") return;
    std::string_view digits(key);
    if (digits.starts_with('-')) digits.remove_prefix(1);
    if (digits.empty() || digits.front() == '0' ||
        !std::all_of(digits.begin(), digits.end(), [](char ch) { return ch >= '0' && ch <= '9'; }))
        fail(path, "invalid integer dictionary key");
}

}
