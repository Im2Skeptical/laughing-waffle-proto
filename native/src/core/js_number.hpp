#pragma once

#include <cstdint>
#include <string>

namespace waffle::core::js {

std::string number_to_string(double value);
std::uint32_t to_uint32(double value) noexcept;
std::int32_t to_int32(double value) noexcept;
std::int32_t imul(double lhs, double rhs) noexcept;
std::uint32_t unsigned_shift_right(double value, double count) noexcept;
double round(double value) noexcept;
double floor(double value) noexcept;
double ceil(double value) noexcept;
double trunc(double value) noexcept;
double sign(double value) noexcept;
double remainder(double dividend, double divisor) noexcept;

}
