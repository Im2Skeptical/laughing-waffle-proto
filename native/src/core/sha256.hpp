#pragma once

#include <string>
#include <string_view>

namespace waffle::core {

// Lowercase hexadecimal SHA-256 of the supplied bytes.
std::string sha256_text(std::string_view text);

}
