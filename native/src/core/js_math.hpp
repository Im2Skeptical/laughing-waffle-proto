#pragma once

namespace waffle::core::js {

// Binary64 math for deterministic replay. Requires round-to-nearest, gradual
// underflow, and the waffle_core floating-point compile options.
double pow(double base, double exponent) noexcept;
double exp(double value) noexcept;
double log(double value) noexcept;
double log10(double value) noexcept;
double sin(double radians) noexcept;
double cos(double radians) noexcept;
double atan2(double y, double x) noexcept;
double hypot(double x, double y) noexcept;
double sqrt(double value) noexcept;

}
