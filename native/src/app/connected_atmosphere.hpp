#pragma once

#include "connected_map_art.hpp"

#include <SDL3/SDL.h>
#include <future>

namespace waffle::connected {

struct MapGraphics {
    bool fog{true}, clouds{true}, shadows{true}, wisps{true}, water{true};
    bool sky() const { return fog || clouds || shadows || wisps; }
    bool operator==(const MapGraphics&) const = default;
};

inline constexpr MapGraphics stillMap{false, false, false, false, false};

class MapAtmosphere {
public:
    void release();
    void update(SDL_Renderer* renderer, const std::shared_ptr<const MapArtwork>& art,
        const std::shared_ptr<const MapTerrain>& terrain,
        std::uint32_t seed, Second second, Uint64 now, MapGraphics graphics, bool reduced);
    void drawWater(SDL_Renderer* renderer, const SDL_FRect& destination) const;
    void drawSky(SDL_Renderer* renderer, const SDL_FRect& destination) const;
    std::size_t textureBytes() const;

private:
    friend struct InteractionProbe;
    using Texture = std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)>;
    Texture water_{nullptr, SDL_DestroyTexture}, sky_{nullptr, SDL_DestroyTexture};
    struct Frame { MapPixels water, sky; Second phase; };
    static Frame paint(const MapArtwork& art, const MapTerrain& terrain, std::uint32_t seed,
        Second phase, MapGraphics graphics);
    void upload(SDL_Renderer* renderer, const Frame& frame, Uint64 now);
    std::future<Frame> pending_;
    std::size_t bytes_{};
    MapGraphics graphics_{stillMap};
    std::optional<Second> sampled_;
    Uint64 lastPaint_{};
    std::uint64_t samples_{};
    bool reduced_{}, obsolete_{};
};

}
