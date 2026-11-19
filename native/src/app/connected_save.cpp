#include "connected_save.hpp"

#include "core/sha256.hpp"

#include <SDL3/SDL.h>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#else
#include <unistd.h>
#endif

#include <atomic>
#include <chrono>
#include <cmath>
#include <ctime>
#include <fstream>
#include <memory>

namespace waffle::connected {
namespace {

using core::json::Value;
using timegraph::Second;
using sim::RuntimeState;
constexpr double saveVersion = 1, gameStateVersion = 53;
constexpr auto maxSaveBytes = 64 * 1024 * 1024;

const Value& field(const Value& value, std::string_view key)
{
    if (const auto* item = value.find(key)) return *item;
    throw std::invalid_argument("Missing field " + std::string(key));
}

Second second(const Value& value)
{
    const auto number = value.as_number();
    if (!(number >= 0 && number <= 0x1p53 - 1) || number != std::floor(number))
        throw std::invalid_argument("Expected a nonnegative integer");
    return static_cast<Second>(number);
}

RuntimeState admit(const Value& wire)
{
    return sim::admit_runtime(sim::browser::import_game_state(wire), nullptr, &field(wire, "gameConfig"));
}

SavedRun rebuild(RuntimeState base, sim::ActionJournal journal, Second frontier)
{
    const auto events = journal.entries();
    if (frontier < base.hot.tSec || (!events.empty() &&
        (events.front().tSec < base.hot.tSec || events.back().tSec > frontier)))
        throw std::invalid_argument("Invalid replay boundaries");
    auto result = sim::rebuildStateAtSecond(base, journal, static_cast<double>(frontier));
    if (!result.result || result.state->hot.tSec != frontier)
        throw std::invalid_argument("Could not replay to the saved live second");
    return {std::move(base), std::move(journal), std::move(*result.state)};
}

std::string utcLabel(const std::chrono::system_clock::time_point time)
{
    const auto now = std::chrono::system_clock::to_time_t(time);
    std::tm utc{};
#if defined(_WIN32)
    gmtime_s(&utc, &now);
#else
    gmtime_r(&now, &utc);
#endif
    char text[24]{};
    std::strftime(text, sizeof(text), "%Y-%m-%d %H:%M UTC", &utc);
    return text;
}

struct Envelope {
    SaveMetadata metadata;
    std::string payload;
};

Envelope readEnvelope(const std::filesystem::path& path)
{
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    const auto size = file.tellg();
    if (size < 0) throw std::invalid_argument("Could not open save file");
    if (size > maxSaveBytes) throw std::invalid_argument("Save exceeds the size limit");
    file.seekg(0);
    char header[512]{};
    if (!file.getline(header, sizeof(header))) throw std::invalid_argument("Unreadable save header");
    const auto wire = [&] {
        try {
            return core::json::parse(header);
        } catch (const std::exception&) {
            throw std::invalid_argument("Corrupt save header");
        }
    }();
    if (field(wire, "format").as_string() != "waffle-native" ||
        field(wire, "saveVersion").as_number() != saveVersion ||
        field(wire, "gameStateVersion").as_number() != gameStateVersion)
        throw std::invalid_argument("Incompatible save version");
    const auto offset = file.tellg();
    if (offset < 0 || offset >= size)
        throw std::invalid_argument("Missing save data");
    std::string payload(static_cast<std::size_t>(size - offset), '\0');
    if (!file.read(payload.data(), static_cast<std::streamsize>(payload.size())) || file.peek() != EOF ||
        core::sha256_text(payload) != field(wire, "sha256").as_string())
        throw std::invalid_argument("Corrupt save data");
    return {{field(wire, "year").as_number(), second(field(wire, "liveSecond")),
        static_cast<std::size_t>(second(field(wire, "regions"))), field(wire, "savedAt").as_string(),
        field(wire, "savedAtMs").as_number(),
        "Save " + std::to_string(static_cast<int>(saveVersion)) + " / State " +
            std::to_string(static_cast<int>(gameStateVersion))}, std::move(payload)};
}

void atomicWrite(const std::filesystem::path& path, std::string_view header, std::string_view payload)
{
    std::filesystem::create_directories(path.parent_path());
    static std::atomic<unsigned> sequence{};
#if defined(_WIN32)
    const auto process = GetCurrentProcessId();
#else
    const auto process = getpid();
#endif
    auto temp = path;
    temp += "." + std::to_string(process) + "." + std::to_string(sequence++) + ".tmp";
    try {
        std::ofstream file(temp, std::ios::binary | std::ios::trunc);
        file.exceptions(std::ios::badbit | std::ios::failbit);
        file.write(header.data(), static_cast<std::streamsize>(header.size()));
        file.put('\n');
        file.write(payload.data(), static_cast<std::streamsize>(payload.size()));
        file.close();
#if defined(_WIN32)
        if (!MoveFileExW(temp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
            throw std::system_error(static_cast<int>(GetLastError()), std::system_category(), "Replacing save");
#else
        std::filesystem::rename(temp, path);
#endif
    } catch (...) {
        std::error_code ignored;
        std::filesystem::remove(temp, ignored);
        throw;
    }
}

}

SaveSlots SaveSlots::forUser()
{
#if defined(__ANDROID__)
    const char* directory = SDL_GetAndroidInternalStoragePath();
    if (!directory) throw std::runtime_error(SDL_GetError());
    return SaveSlots(std::filesystem::u8path(directory) / "saves");
#else
    const std::unique_ptr<char, decltype(&SDL_free)> directory(SDL_GetPrefPath("Laughing Waffle", "Native Game"), SDL_free);
    if (!directory) throw std::runtime_error(SDL_GetError());
    return SaveSlots(std::filesystem::u8path(directory.get()) / "saves");
#endif
}

std::filesystem::path SaveSlots::path(Slot slot) const
{
    constexpr std::array names{"autosave.save", "slot-1.save", "slot-2.save", "slot-3.save"};
    return directory_ / names.at(static_cast<std::size_t>(slot));
}

SlotInfo SaveSlots::inspect(Slot slot) const
{
    SlotInfo result{slot, {}, {}};
    try {
        const auto file = path(slot);
        if (std::filesystem::exists(file)) result.metadata = readEnvelope(file).metadata;
    } catch (const std::exception& error) {
        result.error = error.what();
    }
    return result;
}

void SaveSlots::write(Slot slot, const RuntimeState& base, const sim::ActionJournal& journal, const RuntimeState& live) const
{
    auto wire = sim::browser::export_game_state(sim::export_runtime(base));
    const auto stateVersion = field(wire, "gameStateSchemaVersion").as_number();
    const auto payload = core::json::stringify(Value(Value::Object{
        {"base", std::move(wire)}, {"actions", journal.to_json()}, {"liveSecond", Value(live.hot.tSec)},
        {"digest", Value(std::to_string(sim::state_digest(live)))}
    }));
    const auto now = std::chrono::system_clock::now();
    const auto milliseconds = std::chrono::duration<double, std::milli>(now.time_since_epoch()).count();
    const auto header = core::json::stringify(Value(Value::Object{
        {"format", Value("waffle-native")}, {"saveVersion", Value(saveVersion)},
        {"gameStateVersion", Value(stateVersion)}, {"liveSecond", Value(live.hot.tSec)},
        {"year", Value(live.hot.year)}, {"regions", Value(static_cast<double>(live.hot.world.regions.size()))},
        {"savedAt", Value(utcLabel(now))}, {"savedAtMs", Value(milliseconds)}, {"sha256", Value(core::sha256_text(payload))}
    }));
    if (header.size() + 1 + payload.size() > maxSaveBytes) throw std::invalid_argument("Save exceeds the size limit");
    atomicWrite(path(slot), header, payload);
}

SavedRun readNativeSave(const std::filesystem::path& path)
{
    const auto save = readEnvelope(path);
    const auto wire = core::json::parse(save.payload);
    if (second(field(wire, "liveSecond")) != save.metadata.second)
        throw std::invalid_argument("Saved live second does not match its header");
    auto result = rebuild(admit(field(wire, "base")), sim::ActionJournal::from_json(field(wire, "actions")),
        save.metadata.second);
    if (result.live.hot.year != save.metadata.year || result.live.hot.world.regions.size() != save.metadata.regions ||
        std::to_string(sim::state_digest(result.live)) != field(wire, "digest").as_string())
        throw std::invalid_argument("Saved state does not match replay");
    return result;
}

SavedRun readBrowserSave(const Value& data)
{
    if (const auto* timeline = data.find("timeline")) {
        if (field(field(data, "meta"), "schemaVersion").as_number() != 33)
            throw std::invalid_argument("Browser runner save must use schema 33");
        const auto* base = timeline->find("baseStateData");
        if (!base || base->kind() == Value::Kind::null) base = &field(data, "state");
        const auto frontier = second(field(*timeline, "historyEndSec"));
        if (second(field(*timeline, "cursorSec")) > frontier)
            throw std::invalid_argument("Browser cursor extends past its live frontier");
        return rebuild(admit(*base), sim::ActionJournal::from_json(field(*timeline, "actions")), frontier);
    }
    auto initial = admit(data);
    auto live = initial;
    sim::initialize_replay_clock(live);
    return {std::move(initial), {}, std::move(live)};
}

}
