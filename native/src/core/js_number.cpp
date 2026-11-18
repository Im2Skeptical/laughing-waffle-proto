#include "core/js_number.hpp"

#include <bit>
#include <charconv>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <string_view>

#if defined(_M_FP_CONTRACT) || defined(_M_FP_FAST) || defined(__FAST_MATH__)
#error The JS numerics require separate binary64 operations and IEEE special values.
#endif

namespace waffle::core::js {

static_assert(std::numeric_limits<double>::is_iec559 &&
    std::numeric_limits<double>::digits == 53 && sizeof(double) == 8);

std::string number_to_string(double value)
{
    if (std::isnan(value)) return "NaN";
    if (std::isinf(value)) return value < 0 ? "-Infinity" : "Infinity";
    if (value == 0) return "0";

    // Scientific to_chars finds the shortest significand, even for values
    // where fixed notation could print an exact but longer integer.
    char buffer[32];
    const auto result = std::to_chars(buffer, buffer + sizeof buffer,
        std::abs(value), std::chars_format::scientific);
    if (result.ec != std::errc{}) throw std::logic_error("binary64 formatting failed");
    const std::string_view scientific(buffer, result.ptr);
    const auto e = scientific.find('e');
    int exponent = 0;
    const auto exponent_start = e + (scientific[e + 1] == '+' ? 2 : 1);
    std::from_chars(buffer + exponent_start, result.ptr, exponent);

    std::string digits(1, scientific.front());
    if (e > 1) digits.append(scientific.substr(2, e - 2));
    std::string out = value < 0 ? "-" : "";
    if (exponent < -6 || exponent >= 21) {
        out += scientific.substr(0, e);
        out += exponent < 0 ? "e-" : "e+";
        out += std::to_string(std::abs(exponent));
    } else if (exponent < 0) {
        out += "0.";
        out.append(-exponent - 1, '0');
        out += digits;
    } else {
        const auto decimal = static_cast<std::size_t>(exponent + 1);
        out.append(digits, 0, decimal);
        if (decimal < digits.size()) {
            out += '.';
            out.append(digits, decimal);
        } else {
            out.append(decimal - digits.size(), '0');
        }
    }
    return out;
}

std::uint32_t to_uint32(double value) noexcept
{
    if (!std::isfinite(value) || value == 0) return 0;
    const double wrapped = std::fmod(std::trunc(value), 4294967296.0);
    return static_cast<std::uint32_t>(wrapped < 0 ? wrapped + 4294967296.0 : wrapped);
}

std::int32_t to_int32(double value) noexcept
{
    return std::bit_cast<std::int32_t>(to_uint32(value));
}

std::int32_t imul(double lhs, double rhs) noexcept
{
    return std::bit_cast<std::int32_t>(to_uint32(lhs) * to_uint32(rhs));
}

std::uint32_t unsigned_shift_right(double value, double count) noexcept
{
    return to_uint32(value) >> (to_uint32(count) & 31u);
}

double round(double value) noexcept
{
    // Fractional inputs outside (-2^52, 2^52) do not exist in binary64.
    if (!std::isfinite(value) || value == 0 || std::abs(value) >= 0x1p52) return value;
    const double integer = std::trunc(value);
    const double fraction = value - integer;
    if (fraction >= 0.5) return integer + 1.0;
    if (fraction < -0.5) return integer - 1.0;
    return integer;
}

double floor(double value) noexcept { return std::floor(value); }
double ceil(double value) noexcept { return std::ceil(value); }
double trunc(double value) noexcept { return std::trunc(value); }
double sign(double value) noexcept
{
    if (value == 0 || std::isnan(value)) return value;
    return value < 0 ? -1.0 : 1.0;
}

double remainder(double dividend, double divisor) noexcept
{
    if (!std::isfinite(dividend) || std::isnan(divisor) || divisor == 0)
        return std::numeric_limits<double>::quiet_NaN();
    if (dividend == 0 || std::isinf(divisor)) return dividend;
    return std::fmod(dividend, divisor);
}

}
