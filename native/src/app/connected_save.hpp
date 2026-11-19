#pragma once

#include "timegraph/forecast.hpp"

#include <filesystem>

namespace waffle::connected {

struct SavedRun {
    sim::RuntimeState base;
    sim::ActionJournal journal;
    sim::RuntimeState live;
};

enum class Slot { autosave, first, second, third };
inline constexpr std::array slots{Slot::autosave, Slot::first, Slot::second, Slot::third};

struct SaveMetadata {
    double year{};
    timegraph::Second second{};
    std::size_t regions{};
    std::string savedAt;
    double savedAtMs{};
    std::string version;
};

struct SlotInfo {
    Slot slot;
    std::optional<SaveMetadata> metadata;
    std::string error;
};

class SaveSlots {
public:
    explicit SaveSlots(std::filesystem::path directory) : directory_(std::move(directory)) {}
    static SaveSlots forUser();
    std::filesystem::path path(Slot slot) const;
    SlotInfo inspect(Slot slot) const;
    void write(Slot slot, const sim::RuntimeState& base, const sim::ActionJournal& journal,
        const sim::RuntimeState& live) const;

private:
    std::filesystem::path directory_;
};

SavedRun readNativeSave(const std::filesystem::path& path);
SavedRun readBrowserSave(const core::json::Value& data);

}
