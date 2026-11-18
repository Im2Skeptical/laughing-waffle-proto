#pragma once

#include <cstddef>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

namespace waffle::core::json {

class Value {
public:
    struct Property;
    using Array = std::vector<Value>;
    using Object = std::vector<Property>;
    enum class Kind { null, boolean, number, string, array, object };

    Value();
    explicit Value(std::nullptr_t);
    explicit Value(bool value);
    explicit Value(double value);
    // UTF-8 with WTF-8 encodings for lone JS UTF-16 surrogates.
    explicit Value(std::string value);
    explicit Value(const char* value);
    explicit Value(Array value);
    explicit Value(Object value);

    Kind kind() const noexcept;
    bool as_bool() const;
    double as_number() const;
    const std::string& as_string() const;
    const Array& as_array() const;
    const Object& as_object() const;

    // Replacing a property retains its enumeration position.
    void set(std::string key, Value value);
    const Value* find(std::string_view key) const;

private:
    std::variant<std::monostate, bool, double, std::string, Array, Object> data_;
};

struct Value::Property {
    std::string key;
    Value value;
};

// Parses a complete JSON document. Syntax errors throw std::invalid_argument.
Value parse(std::string_view text);
std::string stringify(const Value& value);
std::string canonical_json(const Value& value);
std::string sha256_value(const Value& value);

}
