#include "connected_art.hpp"

#include "core/json.hpp"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <memory>
#include <stb_image.h>

namespace waffle::connected {
namespace {

std::string read(const std::filesystem::path& path)
{
    std::ifstream stream(path, std::ios::binary);
    if (!stream) throw std::runtime_error("Could not open " + path.string());
    return {std::istreambuf_iterator<char>(stream), {}};
}

}

Artwork prepareArtwork()
{
    constexpr int columns = 16, tileWidth = 96, tileHeight = 128;
    const auto directory = std::filesystem::path(WAFFLE_ART_ROOT) / "images/sprite-sheets";
    Artwork art;
    art.width = columns * tileWidth;
    art.css = "<style>@spritesheet connectedCards { src: /connected-cards;";
    for (const std::string name : {"full-map-content-prototype", "settlement-pieces-0",
                                    "settlement-pieces-1", "settlement-pieces-2"}) {
        const auto manifest = core::json::parse(read(directory / (name + ".json")));
        const auto encoded = read(directory / (name + ".png"));
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
    art.css += "}</style>";
    return art;
}

}
