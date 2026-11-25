#include "connected_map_art.hpp"

#include "core/json.hpp"
#include "sdl_asset_file.hpp"

#include <webp/decode.h>

#include <algorithm>
#include <stdexcept>

namespace waffle::connected {
namespace {

using core::json::Value;
constexpr std::string_view directory = WAFFLE_ART_ROOT "images/dark-fantasy/map-generation-prototype/assets/runtime/";

std::string mapAsset(std::string_view name, std::string_view extension)
{
    return readAsset((std::string(directory) + std::string(name) + std::string(extension)).c_str());
}

MapPixels decode(std::string_view name)
{
    const auto source = mapAsset(name, ".webp");
    const auto* encoded = reinterpret_cast<const std::uint8_t*>(source.data());
    MapPixels result;
    if (!WebPGetInfo(encoded, source.size(), &result.width, &result.height) ||
        result.width <= 0 || result.height <= 0 || result.width > 4096 || result.height > 4096)
        throw std::runtime_error("Invalid map atlas dimensions: " + std::string(name));
    result.rgba.resize(static_cast<std::size_t>(result.width) * result.height * 4);
    if (!WebPDecodeRGBAInto(encoded, source.size(), result.rgba.data(), result.rgba.size(), result.width * 4))
        throw std::runtime_error("Could not decode map atlas: " + std::string(name));
    return result;
}

MapRect rect(const Value& record, const MapPixels& pixels)
{
    const auto& values = record.find("rect")->as_array();
    const auto at = [&](int i) { return static_cast<int>(values.at(i).as_number()); };
    const MapRect box{at(0), at(1), at(2), at(3)};
    if (box.x < 0 || box.y < 0 || box.w < 1 || box.h < 1 ||
        box.x + box.w > pixels.width || box.y + box.h > pixels.height)
        throw std::runtime_error("Map atlas frame is outside its sheet");
    return box;
}

std::string key(const Value& record, std::string_view field)
{
    return record.find(field)->as_string();
}

template<class Key>
MapAtlas atlas(std::string_view image, const Value* records, Key name)
{
    MapAtlas result{decode(image), {}};
    for (const auto& row : records->as_array()) {
        // Cut illustrations never enter the browser's placement candidates.
        const auto* cuts = row.find("cutRuns");
        if (cuts && !cuts->as_object().empty()) continue;
        if (!result.frames.emplace(name(row), rect(row, result.pixels)).second)
            throw std::runtime_error("Duplicate map atlas frame");
    }
    return result;
}

MapAtlas combine(std::vector<MapAtlas> sheets)
{
    struct Tile { const MapPixels* sheet; std::string name; MapRect src, dst; };
    std::vector<Tile> tiles;
    for (const auto& sheet : sheets)
        for (const auto& [name, frame] : sheet.frames)
            tiles.push_back({&sheet.pixels, name, frame, {}});
    std::ranges::stable_sort(tiles, std::greater{}, [](const auto& tile) { return tile.src.h; });

    MapAtlas result;
    auto& packed = result.pixels;
    packed.width = 512;
    int x = 0, y = 0, rowHeight = 0;
    for (auto& tile : tiles) {
        const auto w = tile.src.w + 2, h = tile.src.h + 2;
        if (x + w > packed.width) { x = 0; y += rowHeight; rowHeight = 0; }
        tile.dst = {x + 1, y + 1, tile.src.w, tile.src.h};
        rowHeight = std::max(rowHeight, h);
        x += w;
    }
    packed.height = y + rowHeight;
    packed.rgba.resize(static_cast<std::size_t>(packed.width) * packed.height * 4);
    for (const auto& tile : tiles) {
        // Duplicate the edge into a one-texel gutter before linear filtering.
        for (int dy = -1; dy <= tile.src.h; ++dy) for (int dx = -1; dx <= tile.src.w; ++dx) {
            const auto sx = tile.src.x + std::clamp(dx, 0, tile.src.w - 1);
            const auto sy = tile.src.y + std::clamp(dy, 0, tile.src.h - 1);
            std::copy_n(tile.sheet->at(sx, sy), 4, packed.at(tile.dst.x + dx, tile.dst.y + dy));
        }
        result.frames.emplace(tile.name, tile.dst);
    }
    return result;
}

}

const MapRect& MapAtlas::frame(std::string_view key) const
{
    const auto it = frames.find(key);
    if (it == frames.end()) throw std::runtime_error("Missing map atlas frame: " + std::string(key));
    return it->second;
}

std::shared_ptr<const MapArtwork> prepareMapArtwork()
{
    const auto load = [](std::string_view name) { return core::json::parse(mapAsset(name, ".json")); };
    const auto kind = [](const Value& row) { return key(row, "kind"); };
    const auto kit = load("terrain-kit-v1");
    const auto monster = load("monster-ground-v1");
    const auto relief = load("relief-v1");
    const auto settlements = load("settlement-buildings-v1");
    const auto cities = load("crown-modular-v1");
    const auto landmarks = load("landmarks-v1");

    auto art = std::make_shared<MapArtwork>();
    art->ground = atlas("terrain-kit-v1", kit.find("tiles"), kind);
    art->banks = atlas("bank-profiles-v1", kit.find("profiles"), kind);
    art->monster = atlas("monster-ground-v1", monster.find("tiles"), kind);
    art->relief = atlas("relief-v1", relief.find("frames"), kind);
    art->towns = combine({
        atlas("settlement-buildings-v1", settlements.find("frames"),
            [](const Value& row) { return key(row, "biome") + "/" + key(row, "role"); }),
        atlas("crown-modular-v1", cities.find("frames"), [](const Value& row) { return key(row, "role"); }),
        atlas("landmarks-v1", landmarks.find("frames"), [](const Value& row) {
            return key(row, "kind") + "/" + std::to_string(static_cast<int>(row.find("lod")->as_number()));
        }),
    });
    return art;
}

double decorationRandom(std::uint32_t seed, std::uint32_t index)
{
    // Identical to the browser map generator. These bits never enter GameState.
    auto value = (seed ^ index) * 1597334677u;
    value = (value ^ (value >> 16)) * 2246822519u;
    return (value ^ (value >> 13)) / 0x1p32;
}

}
