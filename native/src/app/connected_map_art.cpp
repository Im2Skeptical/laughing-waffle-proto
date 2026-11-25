#include "connected_map_art.hpp"

#include "core/json.hpp"
#include "sdl_asset_file.hpp"

#include <webp/decode.h>
#include <stb_image.h>

#include <algorithm>
#include <cmath>
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

MapPixels decodeCloud(std::string_view name, int columns)
{
    const auto source = readAsset((WAFFLE_ART_ROOT "images/dark-fantasy/map-generation-prototype/" +
        std::string(name) + ".png").c_str());
    int sourceWidth{}, sourceHeight{};
    const std::unique_ptr<stbi_uc, decltype(&stbi_image_free)> pixels(
        stbi_load_from_memory(reinterpret_cast<const stbi_uc*>(source.data()), static_cast<int>(source.size()),
            &sourceWidth, &sourceHeight, nullptr, 4), stbi_image_free);
    // Keep independent filtered silhouettes. Weather samples the world on a
    // coarser lattice, so retaining the original full-size PNG pixels is wasteful.
    constexpr int size = 128;
    if (!pixels || sourceWidth < columns * size || sourceHeight < 2 * size)
        throw std::runtime_error("Could not decode cloud atlas: " + std::string(name));
    MapPixels result{columns * size, 2 * size, std::vector<std::uint8_t>(columns * size * size * 8)};
    for (int row = 0; row < 2; ++row) for (int col = 0; col < columns; ++col) {
        for (int y = 0; y < size; ++y) for (int x = 0; x < size; ++x) {
            const auto sx = (col * size + x) * sourceWidth / (columns * size);
            const auto sy = (row * size + y) * sourceHeight / (2 * size);
            const auto right = (col * size + x + 1) * sourceWidth / (columns * size);
            const auto bottom = (row * size + y + 1) * sourceHeight / (2 * size);
            std::array<unsigned, 4> sum{};
            for (int yy = sy; yy < bottom; ++yy) for (int xx = sx; xx < right; ++xx) {
                const auto* p = pixels.get() + (static_cast<std::size_t>(yy) * sourceWidth + xx) * 4;
                for (int ch = 0; ch < 3; ++ch) sum[ch] += p[ch] * p[3];
                sum[3] += p[3];
            }
            auto* out = result.at(col * size + x, row * size + y);
            if (sum[3]) for (int ch = 0; ch < 3; ++ch) out[ch] = (sum[ch] + sum[3] / 2) / sum[3];
            const auto count = (right - sx) * (bottom - sy);
            out[3] = (sum[3] + count / 2) / count;
        }
    }
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

MapAtlas combine(const std::vector<MapAtlas>& sheets, const MapAtlas& relief, decltype(MapArtwork::townLevels)& levels)
{
    struct Tile { const MapPixels* sheet; std::string name; MapRect src, dst; int level; bool bone; };
    std::vector<Tile> tiles;
    const auto add = [&](const MapAtlas& sheet, const std::string& name, MapRect frame, bool bone) {
        for (int level = 0; level < 5; ++level) {
            const auto scale = 1 << level;
            if (scale > 1 && std::min(frame.w, frame.h) / scale < 2) break;
            tiles.push_back({&sheet.pixels, name, frame,
                {0, 0, (frame.w + scale - 1) / scale, (frame.h + scale - 1) / scale}, level, bone});
        }
    };
    for (const auto& sheet : sheets)
        for (const auto& [name, frame] : sheet.frames) add(sheet, name, frame, false);
    for (const auto& [name, frame] : relief.frames)
        if (name.starts_with("terrain-bone-border-")) add(relief, name, frame, true);
    std::ranges::stable_sort(tiles, std::greater{}, [](const auto& tile) { return tile.dst.h; });

    MapAtlas result;
    auto& packed = result.pixels;
    packed.width = 512;
    int x = 0, y = 0, rowHeight = 0;
    for (auto& tile : tiles) {
        const auto w = tile.dst.w + 2, h = tile.dst.h + 2;
        if (x + w > packed.width) { x = 0; y += rowHeight; rowHeight = 0; }
        tile.dst.x = x + 1;
        tile.dst.y = y + 1;
        rowHeight = std::max(rowHeight, h);
        x += w;
    }
    packed.height = y + rowHeight;
    packed.rgba.resize(static_cast<std::size_t>(packed.width) * packed.height * 4);
    for (const auto& tile : tiles) {
        const auto scale = 1 << tile.level;
        const auto colour = [&](int x, int y) {
            const auto* p = tile.sheet->at(tile.src.x + x, tile.src.y + y);
            std::array<unsigned, 4> texel{p[0], p[1], p[2], p[3]};
            if (tile.bone) {
                if (p[3] < 65 || (p[2] > p[0] + 8 && p[1] > p[0] + 3)) return std::array<unsigned, 4>{};
                for (int ch = 0; ch < 3; ++ch) texel[ch] = static_cast<unsigned>(std::round(85 + ((p[ch] & 248) + 4 - 85) * .86));
            }
            return texel;
        };
        for (int dy = 0; dy < tile.dst.h; ++dy) for (int dx = 0; dx < tile.dst.w; ++dx) {
            auto* pixel = packed.at(tile.dst.x + dx, tile.dst.y + dy);
            const auto sx = dx * scale, sy = dy * scale;
            if (scale == 1) {
                const auto texel = colour(sx, sy);
                std::copy(texel.begin(), texel.end(), pixel);
                continue;
            }
            const auto right = std::min(sx + scale, tile.src.w), bottom = std::min(sy + scale, tile.src.h);
            const auto samples = (right - sx) * (bottom - sy);
            std::array<unsigned, 4> sum{};
            for (int y = sy; y < bottom; ++y) for (int x = sx; x < right; ++x) {
                const auto texel = colour(x, y);
                for (int ch = 0; ch < 3; ++ch) sum[ch] += texel[ch] * texel[3];
                sum[3] += texel[3];
            }
            if (sum[3]) for (int ch = 0; ch < 3; ++ch) pixel[ch] = (sum[ch] + sum[3] / 2) / sum[3];
            pixel[3] = (sum[3] + samples / 2) / samples;
        }
        // Transparent margins between independent artwork prevent atlas bleed.
        for (int dy = -1; dy <= tile.dst.h; ++dy) for (int dx = -1; dx <= tile.dst.w; ++dx) {
            if (dx >= 0 && dx < tile.dst.w && dy >= 0 && dy < tile.dst.h) continue;
            const auto sx = tile.dst.x + std::clamp(dx, 0, tile.dst.w - 1);
            const auto sy = tile.dst.y + std::clamp(dy, 0, tile.dst.h - 1);
            std::copy_n(packed.at(sx, sy), 4, packed.at(tile.dst.x + dx, tile.dst.y + dy));
        }
        if (!tile.level) result.frames.emplace(tile.name, tile.dst);
    }
    for (const auto& [name, frame] : result.frames) levels[{frame.x, frame.y}].fill(frame);
    for (const auto& tile : tiles) {
        const auto& frame = result.frames.at(tile.name);
        auto& chain = levels[{frame.x, frame.y}];
        for (int n = tile.level; n < 5; ++n)
            if (chain[n].w * chain[n].h >= tile.dst.w * tile.dst.h) chain[n] = tile.dst;
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
    art->clouds = {decodeCloud("cloud-banks-v2", 2), decodeCloud("cloud-banks-v3", 4), decodeCloud("cloud-cumulus-v1", 4)};
    auto landmarkArt = atlas("landmarks-v1", landmarks.find("frames"), [](const Value& row) {
        return key(row, "kind") + "/" + std::to_string(static_cast<int>(row.find("lod")->as_number()));
    });
    for (std::size_t i = 0; i < landmarkArt.pixels.rgba.size(); i += 4) {
        auto* pixel = landmarkArt.pixels.rgba.data() + i;
        pixel[3] = pixel[3] < 95 ? 0 : 255;
        for (int ch = 0; ch < 3; ++ch) pixel[ch] = std::min(255, ((pixel[ch] + 6) / 12) * 12);
    }
    art->towns = combine({
        atlas("settlement-buildings-v1", settlements.find("frames"),
            [](const Value& row) { return key(row, "biome") + "/" + key(row, "role"); }),
        atlas("crown-modular-v1", cities.find("frames"), [](const Value& row) { return key(row, "role"); }),
        std::move(landmarkArt),
    }, art->relief, art->townLevels);
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
