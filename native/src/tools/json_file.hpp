#pragma once

#include <filesystem>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <string_view>

namespace waffle::tools {

inline std::string read_file(const std::filesystem::path& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("could not open " + path.string());
    return {std::istreambuf_iterator<char>(file), {}};
}

inline void write_file(const std::filesystem::path& path, std::string_view text)
{
    std::ofstream file(path, std::ios::binary);
    file << text;
    file.close();
    if (!file) throw std::runtime_error("could not write " + path.string());
}

}
