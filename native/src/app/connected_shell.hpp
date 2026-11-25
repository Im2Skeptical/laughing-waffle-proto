#pragma once

#include "connected_session.hpp"

namespace waffle::connected {

enum class Screen { title, load, game, save };

class Shell {
public:
    Shell(Session& session, Selection& selection, SaveSlots slots);

    void open(const Launch& launch);
    void update();
    void show(Screen screen);
    void start(std::string_view seed);
    void selectSlot(Slot slot);
    void confirmOverwrite();
    void cancelOverwrite() { overwrite_.reset(); }
    void continueGame();
    bool returnToTitle();
    bool autosave();

    Screen screen() const { return screen_; }
    const auto& list() const { return list_; }
    const auto& message() const { return message_; }
    auto latest() const { return latest_; }
    auto overwrite() const { return overwrite_; }
    auto revision() const { return revision_; }
    auto runRevision() const { return runRevision_; }
    bool messageError() const { return messageError_; }
    bool hasUnsavedProgress() const;
    const auto& seedInput() const { return seedInput_; }

private:
    void refreshSlots();
    bool save(Slot slot);
    void saveManual(Slot slot);
    void message(std::string text, bool error = false);

    Session& session_;
    Selection& selection_;
    SaveSlots slots_;
    std::array<SlotInfo, slots.size()> list_{};
    std::optional<Slot> latest_, overwrite_;
    std::string message_, seedInput_;
    Screen screen_ = Screen::title;
    std::uint64_t revision_{}, runRevision_{};
    std::optional<std::pair<Second, std::size_t>> savedFrontier_;
    bool loadingNativeSave_{}, messageError_{};
};

}
