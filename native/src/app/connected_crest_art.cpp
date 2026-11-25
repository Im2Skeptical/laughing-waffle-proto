#include "connected_crests.hpp"

#include "core/json.hpp"
#include "sdl_asset_file.hpp"

#include <algorithm>
#include <filesystem>
#include <ft2build.h>
#include FT_FREETYPE_H
#include <stb_image.h>

namespace waffle::connected {
namespace {

constexpr int cell = 32, columns = 16;

MapRect tile(int index)
{
    return {index % columns * cell, index / columns * cell, cell, cell};
}

void prepareSymbols(CrestArtwork& art, int& index)
{
    constexpr auto directory = WAFFLE_ART_ROOT "images/sprite-sheets/resource-language";
    const auto manifest = core::json::parse(readAsset((std::string(directory) + ".json").c_str()));
    const auto encoded = readAsset((std::string(directory) + ".png").c_str());
    int width{}, height{};
    const std::unique_ptr<stbi_uc, decltype(&stbi_image_free)> image(stbi_load_from_memory(
        reinterpret_cast<const stbi_uc*>(encoded.data()), static_cast<int>(encoded.size()),
        &width, &height, nullptr, 4), stbi_image_free);
    if (!image) throw std::runtime_error("Could not decode the resource icon sheet");
    for (const auto& row : manifest.find("frames")->as_object()) {
        const auto key = std::filesystem::path(row.key).stem().string();
        if (key != "prestige" && key != "stock" && !key.starts_with("stock-")) continue;
        const auto& frame = *row.value.find("frame");
        const auto read = [&](std::string_view fields) { return static_cast<int>(frame.find(fields)->as_number()); };
        const MapRect source{read("x"), read("y"), read("w"), read("h")};
        if (source.x < 0 || source.y < 0 || source.w < 1 || source.h < 1 || source.x + source.w > width ||
            source.y + source.h > height || row.value.find("rotated")->as_bool() || row.value.find("trimmed")->as_bool())
            throw std::runtime_error("Unsupported resource icon frame " + row.key);
        auto dst = tile(index++);
        // Keep a transparent margin between adjacent filtered sprites.
        ++dst.x; ++dst.y; dst.w -= 2; dst.h -= 2;
        for (int y = 0; y < dst.h; ++y) for (int x = 0; x < dst.w; ++x) {
            const auto sx = source.x + (2 * x + 1) * source.w / (2 * dst.w);
            const auto sy = source.y + (2 * y + 1) * source.h / (2 * dst.h);
            std::copy_n(image.get() + (static_cast<std::size_t>(sy) * width + sx) * 4,
                4, art.atlas.pixels.at(dst.x + x, dst.y + y));
        }
        art.atlas.frames.emplace(key, dst);
    }
}

void prepareGlyphs(CrestArtwork& art, int& index)
{
    const auto font = readAsset(WAFFLE_CONNECTED_FONT);
    FT_Library library{};
    if (FT_Init_FreeType(&library)) throw std::runtime_error("Could not prepare atlas lettering");
    const std::unique_ptr<std::remove_pointer_t<FT_Library>, decltype(&FT_Done_FreeType)> libraryGuard(library, FT_Done_FreeType);
    FT_Face face{};
    if (FT_New_Memory_Face(library, reinterpret_cast<const FT_Byte*>(font.data()),
        static_cast<FT_Long>(font.size()), 0, &face)) throw std::runtime_error("Could not open the atlas typeface");
    const std::unique_ptr<std::remove_pointer_t<FT_Face>, decltype(&FT_Done_Face)> faceGuard(face, FT_Done_Face);
    if (FT_Set_Pixel_Sizes(face, 0, 26)) throw std::runtime_error("Could not size atlas lettering");
    for (unsigned char ch : std::string_view("0123456789+- UnrestyRpld")) {
        if (art.glyphs[ch].advance) continue;
        if (FT_Load_Char(face, ch, FT_LOAD_RENDER)) throw std::runtime_error("Could not rasterize atlas lettering");
        const auto& glyph = *face->glyph;
        const auto& bitmap = glyph.bitmap;
        auto dst = tile(index++);
        ++dst.x; ++dst.y;
        dst.w = static_cast<int>(bitmap.width);
        dst.h = static_cast<int>(bitmap.rows);
        art.glyphs[ch] = {dst, glyph.bitmap_left, glyph.bitmap_top, static_cast<int>(glyph.advance.x / 64)};
        for (int y = 0; y < dst.h; ++y) for (int x = 0; x < dst.w; ++x) {
            auto* pixel = art.atlas.pixels.at(dst.x + x, dst.y + y);
            std::fill_n(pixel, 3, 255);
            pixel[3] = bitmap.buffer[y * bitmap.pitch + x];
        }
    }
}

}

std::shared_ptr<const CrestArtwork> prepareCrestArtwork()
{
    auto art = std::make_shared<CrestArtwork>();
    auto& pixels = art->atlas.pixels;
    pixels.width = cell * columns;
    pixels.height = cell * 5;
    pixels.rgba.resize(static_cast<std::size_t>(pixels.width) * pixels.height * 4);
    std::fill_n(pixels.at(1, 1), 4, 255);
    int index = 1;
    prepareGlyphs(*art, index);
    prepareSymbols(*art, index);
    return art;
}

}
