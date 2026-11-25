#include "connected_art.hpp"
#include "connected_crests.hpp"
#include "connected_map_art.hpp"
#include "core/json.hpp"
#include "sdl_asset_file.hpp"

#include <algorithm>
#include <filesystem>
#include <memory>
#include <stb_image.h>

namespace waffle::connected {
Artwork prepareArtwork()
{
    constexpr int columns = 16, tileWidth = 96, tileHeight = 128;
    const std::string directory = WAFFLE_ART_ROOT "images/sprite-sheets/";
    Artwork art;
    art.width = columns * tileWidth;
    art.css = "<style>@spritesheet connectedCards { src: /connected-cards;";
    std::vector<unsigned char> titlePixels;
    int titleWidth{}, titleHeight{};
    for (const std::string name : {"full-map-content-prototype", "settlement-pieces-0",
                                    "settlement-pieces-1", "settlement-pieces-2"}) {
        const auto manifest = core::json::parse(readAsset((directory + name + ".json").c_str()));
        const auto encoded = readAsset((directory + name + ".png").c_str());
        int width{}, height{};
        const std::unique_ptr<stbi_uc, decltype(&stbi_image_free)> image(stbi_load_from_memory(
            reinterpret_cast<const stbi_uc*>(encoded.data()), static_cast<int>(encoded.size()),
            &width, &height, nullptr, 4), stbi_image_free);
        if (!image) throw std::runtime_error("Could not decode " + name);
        for (const auto& row : manifest.find("frames")->as_object()) {
            const int index = static_cast<int>(art.sprites.size());
            const auto sprite = "card" + std::to_string(index);
            const auto key = std::filesystem::path(row.key).stem().string();
            if (!art.sprites.emplace(key, sprite).second) continue;
            const int x = index % columns * tileWidth, y = index / columns * tileHeight;
            if (y == art.height) {
                art.height += tileHeight;
                art.rgba.resize(static_cast<std::size_t>(art.width) * art.height * 4);
            }
            const auto& frame = *row.value.find("frame");
            const auto coord = [&](std::string_view name) { return static_cast<int>(frame.find(name)->as_number()); };
            const auto sx = coord("x"), sy = coord("y"), sw = coord("w"), sh = coord("h");
            if (sx < 0 || sy < 0 || sw < 1 || sh < 1 || sx + sw > width || sy + sh > height ||
                row.value.find("rotated")->as_bool() || row.value.find("trimmed")->as_bool())
                throw std::runtime_error("Unsupported atlas frame " + row.key);
            if (key == "fm_frontierWatch") {
                titleWidth = sw;
                titleHeight = sh;
                titlePixels.resize(static_cast<std::size_t>(sw) * sh * 4);
                for (int dy = 0; dy < sh; ++dy)
                    std::copy_n(image.get() + (static_cast<std::size_t>(sy + dy) * width + sx) * 4,
                        sw * 4, titlePixels.data() + static_cast<std::size_t>(dy) * sw * 4);
            }
            for (int dy = 0; dy < tileHeight; ++dy) {
                const auto fromY = sy + dy * sh / tileHeight;
                for (int dx = 0; dx < tileWidth; ++dx) {
                    const auto fromX = sx + dx * sw / tileWidth;
                    const auto* src = image.get() + (static_cast<std::size_t>(fromY) * width + fromX) * 4;
                    auto* dst = art.rgba.data() + (static_cast<std::size_t>(y + dy) * art.width + x + dx) * 4;
                    for (int channel = 0; channel < 3; ++channel)
                        dst[channel] = static_cast<unsigned char>((src[channel] * src[3] + 127) / 255);
                    dst[3] = src[3];
                }
            }
            art.css += sprite + ": " + std::to_string(x) + "px " + std::to_string(y) + "px " +
                std::to_string(tileWidth) + "px " + std::to_string(tileHeight) + "px;";
        }
    }
    if (titleWidth > 0 && titleWidth <= art.width) {
        const auto top = art.height;
        art.height += titleHeight;
        art.rgba.resize(static_cast<std::size_t>(art.width) * art.height * 4);
        for (int y = 0; y < titleHeight; ++y) {
            const auto* src = titlePixels.data() + static_cast<std::size_t>(y) * titleWidth * 4;
            auto* dst = art.rgba.data() + static_cast<std::size_t>(top + y) * art.width * 4;
            for (int x = 0; x < titleWidth; ++x) {
                for (int channel = 0; channel < 3; ++channel)
                    dst[x * 4 + channel] = static_cast<unsigned char>((src[x * 4 + channel] * src[x * 4 + 3] + 127) / 255);
                dst[x * 4 + 3] = src[x * 4 + 3];
            }
        }
        art.sprites.emplace("titleArtwork", "titleArtwork");
        art.css += "titleArtwork: 0px " + std::to_string(top) + "px " +
            std::to_string(titleWidth) + "px " + std::to_string(titleHeight) + "px;";
    }
    art.css += "}</style>";
    art.map = prepareMapArtwork();
    art.crests = prepareCrestArtwork();
    return art;
}

}
