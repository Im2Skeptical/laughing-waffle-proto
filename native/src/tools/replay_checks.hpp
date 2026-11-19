#pragma once

#include "sim/step/replay.hpp"
#include "tools/json_file.hpp"

namespace waffle::tools {

inline sim::ActionJournal load_action_journal(const std::filesystem::path& path)
{
    return path.empty() ? sim::ActionJournal{}
        : sim::ActionJournal::from_json(core::json::parse(read_file(path)));
}

inline void require_replay(const sim::ReplayResult& result)
{
    if (result) return;
    std::string message(result.reason);
    message += " at second " + std::to_string(static_cast<std::uint64_t>(result.tSec));
    if (result.action) message += ": " + result.action->kind + " (" + std::string(result.actionReason) + ")";
    throw std::runtime_error(message);
}

}
