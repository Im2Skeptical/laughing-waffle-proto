#pragma once

#include "sim/browser/detail/json_path.hpp"
#include "sim/browser/types.hpp"

#include <array>
#include <initializer_list>
#include <stdexcept>

namespace waffle::sim::browser::detail {

using core::json::Value;

class ImportError : public std::invalid_argument {
public:
    ImportError(const std::string& path, const std::string& message)
        : std::invalid_argument(path + ": " + message) {}
};

[[noreturn]] inline void fail(const std::string& path, const std::string& message)
{
    throw ImportError(path, message);
}

bool read_boolean(const Value& value, const std::string& path);
double read_number(const Value& value, const std::string& path);
double read_integer(const Value& value, const std::string& path);
std::uint32_t read_uint32(const Value& value, const std::string& path);
std::string read_string(const Value& value, const std::string& path);
Value read_json(const Value& value, const std::string& path);
const Value::Object& read_object(const Value& value, const std::string& path, std::string_view expected);
const Value::Array& read_array(const Value& value, const std::string& path);
const Value::Array& read_tuple(const Value& value, const std::string& path, std::size_t size);
void check_integer_key(const std::string& key, const std::string& path);

template <class T>
using Reader = T (*)(const Value&, const std::string&);

template <class T>
using Writer = Value (*)(const T&);

inline Value write_boolean(const bool& value) { return Value(value); }
inline Value write_number(const double& value) { return Value(value); }
inline Value write_integer(const double& value) { return Value(value); }
inline Value write_uint32(const std::uint32_t& value) { return Value(double(value)); }
inline Value write_string(const std::string& value) { return Value(value); }
inline Value write_json(const Value& value) { return value; }

// Collect by schema position, checking every key in the incoming record once.
template <std::size_t N>
auto read_record(const Value& value, const std::string& path,
                 const std::array<std::string_view, N>& keys)
{
    std::array<const Value*, N> fields{};
    for (const auto& property : read_object(value, path, "record")) {
        std::size_t index = 0;
        while (index < N && keys[index] != property.key) ++index;
        if (index == N) fail(property_path(path, property.key), "unknown field");
        fields[index] = &property.value;
    }
    return fields;
}

inline const Value& required_field(const Value* field, const std::string& path)
{
    if (!field) fail(path, "missing required field");
    return *field;
}

template <class T>
T read_non_nullable(const Value& value, const std::string& path, Reader<T> read)
{
    if (value.kind() == Value::Kind::null) fail(path, "field is not nullable");
    return read(value, path);
}

template <class T>
std::optional<T> read_nullable(const Value& value, const std::string& path, Reader<T> read)
{
    if (value.kind() == Value::Kind::null) return std::nullopt;
    return read(value, path);
}

template <class T>
T read_required(const Value* field, const std::string& path, Reader<T> read)
{
    return read_non_nullable(required_field(field, path), path, read);
}

template <class T>
std::optional<T> read_required_nullable(const Value* field, const std::string& path, Reader<T> read)
{
    return read_nullable(required_field(field, path), path, read);
}

template <class T>
std::optional<T> read_optional(const Value* field, const std::string& path, Reader<T> read)
{
    if (!field) return std::nullopt;
    return read_non_nullable(*field, path, read);
}

template <class T>
OptionalNullable<T> read_optional_nullable(const Value* field, const std::string& path, Reader<T> read)
{
    if (!field) return {};
    if (field->kind() == Value::Kind::null) return OptionalNullable<T>(std::nullopt);
    return OptionalNullable<T>(read(*field, path));
}

template <class T>
Value write_nullable(const std::optional<T>& value, Writer<T> write)
{
    return value ? write(*value) : Value();
}

template <class T>
void write_required(Value::Object& out, const char* key, const T& field, Writer<T> write)
{
    out.push_back({key, write(field)});
}

template <class T>
void write_required_nullable(Value::Object& out, const char* key, const std::optional<T>& field, Writer<T> write)
{
    out.push_back({key, write_nullable(field, write)});
}

template <class T>
void write_optional(Value::Object& out, const char* key, const std::optional<T>& field, Writer<T> write)
{
    if (field) write_required(out, key, *field, write);
}

template <class T>
void write_optional_nullable(Value::Object& out, const char* key, const OptionalNullable<T>& field, Writer<T> write)
{
    if (field.has_key()) write_required_nullable(out, key, field.value(), write);
}

template <class T>
std::vector<T> read_items(const Value& value, const std::string& path, Reader<T> read)
{
    const auto& array = read_array(value, path);
    std::vector<T> out;
    out.reserve(array.size());
    for (std::size_t index = 0; index < array.size(); ++index)
        out.push_back(read(array[index], index_path(path, index)));
    return out;
}

template <class Range, class T>
Value write_items(const Range& items, Writer<T> write)
{
    Value::Array out;
    out.reserve(items.size());
    for (const auto& item : items) out.push_back(write(item));
    return Value(std::move(out));
}

template <class T>
OrderedDict<T> read_dictionary(const Value& value, const std::string& path, Reader<T> read, bool integer_keys)
{
    const auto& object = read_object(value, path, "dictionary");
    OrderedDict<T> out;
    out.reserve(object.size());
    for (const auto& property : object) {
        const auto child = property_path(path, property.key);
        if (integer_keys) check_integer_key(property.key, child);
        out.emplace_back(property.key, read(property.value, child));
    }
    return out;
}

template <class T>
Value write_dictionary(const OrderedDict<T>& dict, Writer<T> write)
{
    Value::Object out;
    out.reserve(dict.size());
    for (const auto& [key, value] : dict) out.push_back({key, write(value)});
    return Value(std::move(out));
}

}
