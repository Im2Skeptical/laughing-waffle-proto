#pragma once

#include "ui/connected_model.hpp"

#include <SDL3/SDL.h>
#include <memory>
#include <string_view>

namespace waffle::connected {

class RegionalMap {
public:
    void reset();
    void overview();
    void invalidateTerrain();
    void reveal(Uint64 now);
    bool animate(Uint64 now, bool reduced);
    void zoom(float steps, SDL_FPoint anchor, SDL_FRect area);
    void beginPan();
    void pan(SDL_FPoint delta, SDL_FRect area);
    void pinch(float factor, SDL_FPoint from, SDL_FPoint to, SDL_FRect area);
    void focus(Point point);
    SDL_FPoint project(Point point, SDL_FRect area) const;
    void draw(SDL_Renderer* renderer, SDL_FRect area, const Snapshot& snapshot,
              const std::vector<RegionShape>& shapes, std::string_view selected, std::string_view hovered,
              bool pressed, Uint64 now, bool reduced);

private:
    struct Camera { float zoom = 1, x{}, y{}; };
    struct Facet { std::array<Point, 3> points; float shade; std::size_t region; };
    struct Engraving { Point a, b; SDL_FColor ink; };

    void cache(const Snapshot& snapshot, const std::vector<RegionShape>& shapes);
    void terrainMesh(const Snapshot& snapshot, SDL_FRect area, bool camera);
    void bakeTerrain(SDL_Renderer* renderer, const Snapshot& snapshot);
    void limitCamera();
    void triangle(SDL_FPoint a, SDL_FPoint b, SDL_FPoint c, SDL_FColor ink);
    void stroke(SDL_FPoint a, SDL_FPoint b, float width, SDL_FColor ink);

    Camera camera_, target_;
    Uint64 lastFrame_{}, revealedAt_{};
    std::vector<Facet> facets_;
    std::vector<Engraving> engravings_;
    std::vector<std::vector<Point>> borders_;
    std::vector<SDL_Vertex> mesh_;
    std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)> terrain_{nullptr, SDL_DestroyTexture};
    bool triedTexture_{};
};

}
