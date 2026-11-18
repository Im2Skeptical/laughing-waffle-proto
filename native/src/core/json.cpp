#include "core/json.hpp"

#include "core/js_number.hpp"
#include "core/sha256.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <utility>

namespace waffle::core::json {
namespace {

bool digit(char ch) { return ch >= '0' && ch <= '9'; }

constexpr auto non_index = std::numeric_limits<std::uint32_t>::max();
std::uint32_t array_index(std::string_view key)
{
    if (key.empty() || !digit(key.front()) || (key.size() > 1 && key.front() == '0'))
        return non_index;
    std::uint32_t index;
    const auto end = key.data() + key.size();
    const auto result = std::from_chars(key.data(), end, index);
    return result.ec == std::errc{} && result.ptr == end ? index : non_index;
}

bool high_surrogate(char32_t ch) { return ch >= 0xd800 && ch <= 0xdbff; }
bool low_surrogate(char32_t ch) { return ch >= 0xdc00 && ch <= 0xdfff; }

void append_utf8(std::string& out, char32_t ch)
{
    if (ch < 0x80) {
        out += static_cast<char>(ch);
    } else {
        // A lone surrogate is encoded in three bytes internally and is
        // always escaped on output, as in well-formed JSON.stringify.
        unsigned shift = ch < 0x800 ? 6 : ch < 0x10000 ? 12 : 18;
        const unsigned prefix = shift == 6 ? 0xc0 : shift == 12 ? 0xe0 : 0xf0;
        out += static_cast<char>(prefix | (ch >> shift));
        while (shift > 0) {
            shift -= 6;
            out += static_cast<char>(0x80 | ((ch >> shift) & 0x3f));
        }
    }
}

// Shared by the raw UTF-8 parser and the WTF-8-aware writer and comparator.
constexpr char32_t invalid_code_point = 0x110000;
char32_t read_utf8(std::string_view text, std::size_t& offset)
{
    const auto lead = static_cast<unsigned char>(text[offset++]);
    if (lead < 0x80) return lead;
    if (lead < 0xc2 || lead > 0xf4) return invalid_code_point;
    const unsigned tail = lead < 0xe0 ? 1 : lead < 0xf0 ? 2 : 3;
    if (text.size() - offset < tail) return invalid_code_point;
    char32_t ch = lead & (0x7f >> (tail + 1));
    for (unsigned i = 0; i < tail; ++i) {
        const auto byte = static_cast<unsigned char>(text[offset++]);
        if ((byte & 0xc0) != 0x80) return invalid_code_point;
        ch = (ch << 6) | (byte & 0x3f);
    }
    if ((tail == 2 && ch < 0x800) || (tail == 3 && ch < 0x10000) || ch > 0x10ffff)
        return invalid_code_point;
    return ch;
}

std::u16string utf16_key(std::string_view key)
{
    std::u16string result;
    for (std::size_t i = 0; i < key.size();) {
        auto ch = read_utf8(key, i);
        if (ch == invalid_code_point) throw std::invalid_argument("invalid UTF-8 in JSON key");
        if (ch > 0xffff) {
            ch -= 0x10000;
            result += static_cast<char16_t>(0xd800 + (ch >> 10));
            ch = 0xdc00 + (ch & 0x3ff);
        }
        result += static_cast<char16_t>(ch);
    }
    return result;
}

// from_chars reports the same error for overflow and underflow. On that
// path, determine the decimal order of the first significant digit.
double out_of_range_number(std::string_view token)
{
    const bool negative = token.front() == '-';
    if (negative) token.remove_prefix(1);
    const auto e = token.find_first_of("eE");
    const auto mantissa = token.substr(0, e);
    const auto first = mantissa.find_first_not_of("0.");
    if (first == std::string_view::npos) return negative ? -0.0 : 0.0;
    auto point = mantissa.find('.');
    if (point == std::string_view::npos) point = mantissa.size();
    const auto order = static_cast<std::ptrdiff_t>(point) - static_cast<std::ptrdiff_t>(first)
        - (first < point ? 1 : 0);
    std::ptrdiff_t exponent = 0;
    if (e != std::string_view::npos) {
        auto exp = token.substr(e + 1);
        if (exp.front() == '+') exp.remove_prefix(1);
        const auto result = std::from_chars(exp.data(), exp.data() + exp.size(), exponent);
        if (result.ec == std::errc::result_out_of_range) {
            exponent = exp.front() == '-' ? std::numeric_limits<std::ptrdiff_t>::min()
                                          : std::numeric_limits<std::ptrdiff_t>::max();
        }
    }
    const double magnitude = exponent < -order ? 0.0 : std::numeric_limits<double>::infinity();
    return negative ? -magnitude : magnitude;
}

class Parser {
public:
    explicit Parser(std::string_view text) : text_(text) {}

    Value document()
    {
        auto root = value();
        whitespace();
        if (offset_ != text_.size()) fail("trailing data");
        return root;
    }

private:
    std::string_view text_;
    std::size_t offset_{};

    [[noreturn]] void fail(const char* reason) const
    {
        throw std::invalid_argument("JSON at byte " + std::to_string(offset_) + ": " + reason);
    }

    char peek() const { return offset_ < text_.size() ? text_[offset_] : '\0'; }

    bool take(char expected)
    {
        if (peek() != expected) return false;
        ++offset_;
        return true;
    }

    void whitespace()
    {
        while (peek() == ' ' || peek() == '\t' || peek() == '\n' || peek() == '\r') ++offset_;
    }

    void literal(std::string_view word)
    {
        if (text_.substr(offset_, word.size()) != word) fail("invalid literal");
        offset_ += word.size();
    }

    Value value()
    {
        whitespace();
        switch (peek()) {
        case 'n': literal("null"); return {};
        case 't': literal("true"); return Value(true);
        case 'f': literal("false"); return Value(false);
        case '"': return Value(string());
        case '[': return array();
        case '{': return object();
        default:
            if (digit(peek()) || peek() == '-') return number();
            fail("expected a value");
        }
    }

    Value number()
    {
        const auto start = offset_;
        take('-');
        if (!take('0')) digits();
        if (take('.')) digits();
        if (take('e') || take('E')) {
            if (!take('+')) take('-');
            digits();
        }
        const auto token = text_.substr(start, offset_ - start);
        const auto end = token.data() + token.size();
        double result;
        const auto converted = std::from_chars(token.data(), end, result);
        if (converted.ptr != end) fail("invalid number");
        if (converted.ec == std::errc::result_out_of_range) return Value(out_of_range_number(token));
        if (converted.ec != std::errc{}) fail("invalid number");
        return Value(result);
    }

    void digits()
    {
        if (!digit(peek())) fail("expected a digit");
        do { ++offset_; } while (digit(peek()));
    }

    char32_t hex_quad()
    {
        char32_t out = 0;
        for (int i = 0; i < 4; ++i) {
            const char ch = peek();
            out <<= 4;
            if (digit(ch)) out |= ch - '0';
            else if (ch >= 'a' && ch <= 'f') out |= ch - 'a' + 10;
            else if (ch >= 'A' && ch <= 'F') out |= ch - 'A' + 10;
            else fail("invalid Unicode escape");
            ++offset_;
        }
        return out;
    }

    char32_t escaped_code_point()
    {
        if (offset_ == text_.size()) fail("incomplete escape");
        switch (text_[offset_++]) {
        case '"': return '"';
        case '\\': return '\\';
        case '/': return '/';
        case 'b': return '\b';
        case 'f': return '\f';
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        case 'u': {
            const auto first = hex_quad();
            if (high_surrogate(first) && text_.substr(offset_, 2) == "\\u") {
                const auto rewind = offset_;
                offset_ += 2;
                const auto second = hex_quad();
                if (low_surrogate(second))
                    return 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
                offset_ = rewind;
            }
            return first;
        }
        default: fail("invalid escape");
        }
    }

    std::string string()
    {
        ++offset_; // Opening quote.
        std::string out;
        while (offset_ < text_.size()) {
            if (take('"')) return out;
            if (take('\\')) {
                append_utf8(out, escaped_code_point());
                continue;
            }
            const auto start = offset_;
            const auto ch = read_utf8(text_, offset_);
            if (ch < 0x20 || ch == invalid_code_point || high_surrogate(ch) || low_surrogate(ch))
                fail("invalid character in string");
            out += text_.substr(start, offset_ - start);
        }
        fail("unterminated string");
    }

    Value array()
    {
        ++offset_;
        Value::Array out;
        whitespace();
        if (take(']')) return Value(std::move(out));
        do {
            out.push_back(value());
            whitespace();
        } while (take(','));
        if (!take(']')) fail("expected ',' or ']'");
        return Value(std::move(out));
    }

    Value object()
    {
        ++offset_;
        Value out(Value::Object{});
        whitespace();
        if (take('}')) return out;
        do {
            whitespace();
            if (peek() != '"') fail("expected a property name");
            auto key = string();
            whitespace();
            if (!take(':')) fail("expected ':'");
            out.set(std::move(key), value());
            whitespace();
        } while (take(','));
        if (!take('}')) fail("expected ',' or '}'");
        return out;
    }
};

void append_escape(std::string& out, char32_t ch)
{
    constexpr char hex[] = "0123456789abcdef";
    out += "\\u";
    for (int shift = 12; shift >= 0; shift -= 4) out += hex[(ch >> shift) & 0xf];
}

void write_string(std::string& out, std::string_view text)
{
    out += '"';
    for (std::size_t i = 0; i < text.size();) {
        const auto start = i;
        const auto ch = read_utf8(text, i);
        switch (ch) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (ch == invalid_code_point) throw std::invalid_argument("invalid UTF-8 in JSON string");
            if (ch < 0x20 || high_surrogate(ch) || low_surrogate(ch)) append_escape(out, ch);
            else out += text.substr(start, i - start);
        }
    }
    out += '"';
}

void write_value(std::string& out, const Value& value, bool canonical);

void write_object(std::string& out, const Value::Object& object, bool canonical)
{
    out += '{';
    bool first = true;
    const auto write_property = [&](const Value::Property& property) {
        if (!std::exchange(first, false)) out += ',';
        write_string(out, property.key);
        out += ':';
        write_value(out, property.value, canonical);
    };

    if (!canonical) {
        for (const auto& property : object) write_property(property);
    } else {
        // The reference sorts keys into a new JS object. Its array indices
        // still enumerate numerically, and assignment invokes __proto__.
        struct SortKey {
            std::u16string key;
            const Value::Property* property;
        };
        std::vector<SortKey> sorted;
        for (const auto& property : object) {
            if (array_index(property.key) != non_index) write_property(property);
            else if (property.key != "__proto__") sorted.push_back({utf16_key(property.key), &property});
        }
        std::sort(sorted.begin(), sorted.end(), [](const SortKey& a, const SortKey& b) {
            return a.key < b.key;
        });
        for (const auto& entry : sorted) write_property(*entry.property);
    }
    out += '}';
}

void write_value(std::string& out, const Value& value, bool canonical)
{
    switch (value.kind()) {
    case Value::Kind::null: out += "null"; break;
    case Value::Kind::boolean: out += value.as_bool() ? "true" : "false"; break;
    case Value::Kind::number:
        out += std::isfinite(value.as_number()) ? js::number_to_string(value.as_number()) : "null";
        break;
    case Value::Kind::string: write_string(out, value.as_string()); break;
    case Value::Kind::array: {
        bool first = true;
        out += '[';
        for (const auto& entry : value.as_array()) {
            if (!std::exchange(first, false)) out += ',';
            write_value(out, entry, canonical);
        }
        out += ']';
        break;
    }
    case Value::Kind::object: write_object(out, value.as_object(), canonical); break;
    }
}

}

Value::Value() = default;
Value::Value(std::nullptr_t) : Value() {}
Value::Value(bool value) : data_(value) {}
Value::Value(double value) : data_(value) {}
Value::Value(std::string value) : data_(std::move(value)) {}
Value::Value(const char* value) : Value(std::string(value)) {}
Value::Value(Array value) : data_(std::move(value)) {}
Value::Value(Object value) : data_(Object{})
{
    for (auto& property : value) set(std::move(property.key), std::move(property.value));
}

Value::Kind Value::kind() const noexcept { return static_cast<Kind>(data_.index()); }
bool Value::as_bool() const { return std::get<bool>(data_); }
double Value::as_number() const { return std::get<double>(data_); }
const std::string& Value::as_string() const { return std::get<std::string>(data_); }
const Value::Array& Value::as_array() const { return std::get<Array>(data_); }
const Value::Object& Value::as_object() const { return std::get<Object>(data_); }

void Value::set(std::string key, Value value)
{
    auto& properties = std::get<Object>(data_);
    auto position = std::find_if(properties.begin(), properties.end(), [&](const Property& property) {
        return property.key == key;
    });
    if (position != properties.end()) {
        position->value = std::move(value);
        return;
    }
    const auto index = array_index(key);
    if (index != non_index) {
        position = std::lower_bound(properties.begin(), properties.end(), index,
            [](const Property& property, std::uint32_t i) { return array_index(property.key) < i; });
    }
    properties.insert(position, {std::move(key), std::move(value)});
}

const Value* Value::find(std::string_view key) const
{
    for (const auto& property : as_object()) {
        if (property.key == key) return &property.value;
    }
    return nullptr;
}

Value parse(std::string_view text) { return Parser(text).document(); }

std::string stringify(const Value& value)
{
    std::string out;
    write_value(out, value, false);
    return out;
}

std::string canonical_json(const Value& value)
{
    std::string out;
    write_value(out, value, true);
    return out;
}

std::string sha256_value(const Value& value) { return sha256_text(canonical_json(value)); }

std::u16string utf16_sort_key(std::string_view key) { return utf16_key(key); }

}
