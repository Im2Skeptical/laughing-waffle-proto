#pragma once

#include "core/json.hpp"

#include <vector>

namespace waffle::tools {

class ParityMasks {
public:
    explicit ParityMasks(const core::json::Value& document);
    core::json::Value apply(const core::json::Value& state) const;
    std::size_t size() const noexcept { return patterns_.size(); }

private:
    std::vector<std::vector<std::string>> patterns_;
};

}
