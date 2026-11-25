#pragma once

#include "connected_map_art.hpp"
#include "connected_atmosphere.hpp"

#include <SDL3/SDL.h>
#include <future>
#include <memory>
#include <string_view>

namespace waffle::connected {

class RegionalMap {
public:
    struct Display {
        Uint64 now{}, revision{};
        bool reduced{}, live{};
        MapGraphics graphics{};
    };
    struct Hit {
        std::size_t region;
        bool settlement{};
    };
    explicit RegionalMap(std::shared_ptr<const MapArtwork> art) : art_(std::move(art)) {}
    void prepare(std::shared_ptr<const MapGeography> geography, const Snapshot& opening);
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
    std::optional<Hit> hit(SDL_FPoint point, SDL_FRect area, const Snapshot& snapshot,
        const std::vector<RegionShape>& shapes) const;
    void draw(SDL_Renderer* renderer, SDL_FRect area, const Snapshot& snapshot,
              const std::vector<RegionShape>& shapes, std::string_view selected, std::string_view hovered,
              bool pressed, Display display);
    double bakeMs() const { return baked_ ? baked_->bakeMs : 0.; }
    double uploadMs() const { return uploadMs_; }
    std::size_t textureBytes() const { return textureBytes_ + atmosphere_.textureBytes(); }
    bool terrainReady() const { return (terrain_ || terrainComposite_) && towns_; }
    bool transitioning() const { return changedAt_.has_value(); }

private:
    friend struct InteractionProbe;
    friend class CrestLayer;
    static constexpr SDL_FColor sea_{.16f, .25f, .31f, 1};
    struct Camera {
        float zoom = 1, x{}, y{};
        bool operator==(const Camera&) const = default;
    };
    struct Territory {
        std::array<float, 3> colour{};
        float control{}, scale{}, presence{}, creep{}, market{};
        bool operator==(const Territory&) const = default;
    };
    using Road = std::pair<std::size_t, std::size_t>;
    struct RoadInk { Road edge; float from, to; };

    void updateInk(const Snapshot& snapshot, Display display);
    void buildOverlay(SDL_FRect area, const Snapshot& snapshot, const std::vector<RegionShape>& shapes,
        std::string_view selected, std::string_view hovered, bool pressed, float progress);
    void prepareTextures(SDL_Renderer* renderer, SDL_FRect area);
    void prepareTerrainComposite(SDL_Renderer* renderer);
    void limitCamera();
    void triangle(SDL_FPoint a, SDL_FPoint b, SDL_FPoint c, SDL_FColor ink);
    void triangle(SDL_FPoint a, SDL_FPoint b, SDL_FPoint c, SDL_FColor ca, SDL_FColor cb, SDL_FColor cc);
    void stroke(SDL_FPoint a, SDL_FPoint b, float width, SDL_FColor ink);
    void settlement(SDL_FPoint point, float size, const Territory& territory, bool capital, bool selected,
        bool hovered, bool pressed);
    void buildings(SDL_FRect area, std::size_t index, Point anchor, const Territory& territory);
    void sprite(const MapRect& frame, SDL_FPoint lo, SDL_FPoint hi, float alpha, bool mirror = false);
    static Territory blend(const Territory& from, const Territory& to, float progress);
    float progress(Uint64 now) const;

    Camera camera_, target_;
    Uint64 lastFrame_{}, revealedAt_{};
    std::vector<std::vector<Point>> borders_;
    std::vector<SDL_Vertex> mesh_;
    std::vector<SDL_Vertex> faded_, occupation_, occupationCoarse_, buildings_;
    std::vector<Territory> from_, ink_, incoming_;
    std::vector<Road> roads_, incomingRoads_;
    std::vector<RoadInk> roadInk_;
    std::optional<Uint64> changedAt_, revision_;
    Second second_{};
    bool wasLive_{}, dirty_{true}, pressed_{};
    std::string selected_, hovered_, capital_;
    Camera drawnCamera_;
    SDL_FRect drawnArea_{};
    std::shared_ptr<const MapArtwork> art_;
    std::shared_ptr<const MapGeography> geography_;
    std::future<MapTerrain> pendingTerrain_;
    std::shared_ptr<const MapTerrain> baked_;
    MapAtmosphere atmosphere_;
    std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)> terrain_{nullptr, SDL_DestroyTexture};
    std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)> terrainCoarse_{nullptr, SDL_DestroyTexture};
    std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)> terrainComposite_{nullptr, SDL_DestroyTexture};
    std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)> towns_{nullptr, SDL_DestroyTexture};
    int terrainLod_{-1};
    bool compositeAttempted_{};
    float lodBlend_{}, lodZoom_{}, lodWidth_{}, lodHeight_{};
    double uploadMs_{};
    std::size_t textureBytes_{};
};

}
