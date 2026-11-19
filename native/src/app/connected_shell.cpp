#include "connected_shell.hpp"

#include <SDL3/SDL.h>

#include <charconv>
#include <random>

namespace waffle::connected {

Shell::Shell(Session& session, Selection& selection, SaveSlots slots)
    : session_(session), selection_(selection), slots_(std::move(slots))
{
    refreshSlots();
}

void Shell::refreshSlots()
{
    latest_.reset();
    double newest = 0;
    for (std::size_t i = 0; i < slots.size(); ++i) {
        list_[i] = slots_.inspect(slots[i]);
        if (const auto& meta = list_[i].metadata; meta && (!latest_ || meta->savedAtMs > newest)) {
            newest = meta->savedAtMs;
            latest_ = slots[i];
        }
    }
}

void Shell::message(std::string text)
{
    message_ = std::move(text);
    ++revision_;
}

void Shell::show(Screen screen)
{
    screen_ = screen;
    overwrite_.reset();
    if (screen != Screen::game) refreshSlots();
    message({});
}

void Shell::open(const Launch& launch)
{
    selection_.select({});
    session_.open(launch);
    show(Screen::game);
}

void Shell::update()
{
    session_.update();
    if (screen_ == Screen::game && !session_.liveSnapshot() && !session_.error().empty()) {
        show(Screen::title);
        message("Could not open the run. " + session_.error());
    }
}

void Shell::start(std::string_view text)
{
    seedInput_ = text;
    Launch launch;
    if (text.empty()) {
        // Entropy only chooses the initial run ID. Simulation uses its seeded RNG.
        launch.seed = std::random_device{}();
    } else {
        const auto result = std::from_chars(text.data(), text.data() + text.size(), launch.seed);
        if (result.ec != std::errc{} || result.ptr != text.data() + text.size()) {
            message("Enter a seed from 0 to 4294967295, or leave it empty.");
            return;
        }
    }
    open(launch);
}

void Shell::selectSlot(Slot slot)
{
    const auto& row = list_.at(static_cast<std::size_t>(slot));
    if (screen_ == Screen::load && row.metadata) {
        Launch launch;
        launch.save = slots_.path(slot);
        launch.nativeSave = true;
        open(launch);
    } else if (screen_ == Screen::save && slot != Slot::autosave) {
        if ((row.metadata || !row.error.empty()) && overwrite_ != slot) {
            overwrite_ = slot;
            message("Select Overwrite to replace this slot.");
        } else if (save(slot)) {
            show(Screen::game);
            message("Saved to slot " + std::to_string(static_cast<int>(slot)) + ".");
        }
    }
}

void Shell::continueGame()
{
    show(Screen::load);
    if (latest_) selectSlot(*latest_);
}

bool Shell::save(Slot slot)
{
    try {
        const bool written = session_.save(slots_, slot);
        if (!written) message("Wait for the current decision to finish before saving.");
        return written;
    } catch (const std::exception& error) {
        message("Could not save. " + std::string(error.what()));
        SDL_LogError(SDL_LOG_CATEGORY_APPLICATION, "%s", message_.c_str());
        return false;
    }
}

bool Shell::autosave()
{
    if (!session_.liveSnapshot()) return false;
    return save(Slot::autosave);
}

bool Shell::returnToTitle()
{
    if (session_.busy()) return false;
    if (session_.liveSnapshot() && !autosave()) return false;
    session_.close();
    show(Screen::title);
    return true;
}

}
