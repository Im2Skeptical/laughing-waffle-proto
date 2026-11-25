#pragma once

#include "connected_map.hpp"

#include <span>

namespace waffle::connected {

struct CrestArtwork {
    struct Glyph { MapRect bitmap; int left{}, top{}, advance{}; };
    MapAtlas atlas;
    std::array<Glyph, 128> glyphs;
};

std::shared_ptr<const CrestArtwork> prepareCrestArtwork();

class CrestLayer {
public:
    enum class Part { workers, prestige, allegiance, crown, monster, stock };
    struct Target {
        SDL_FRect box;
        std::size_t region{};
        Part part{};
        std::size_t stockIndex{};
    };
    explicit CrestLayer(std::shared_ptr<const CrestArtwork> artwork) : artwork_(std::move(artwork)) {}
    void reset();
    void release() { texture_.reset(); }
    bool needsLayout(const Snapshot& snapshot, std::string_view selected);
    void position(const RegionalMap& map, SDL_FRect area, const Snapshot& snapshot,
        std::span<const RegionShape> shapes, std::string_view selected, std::string_view hovered,
        float density, std::vector<SDL_FRect>& occupied);
    void draw(SDL_Renderer* renderer, const RegionalMap& map, const Snapshot& snapshot,
        std::span<const RegionShape> shapes, std::string_view hovered, bool pressed, bool focused,
        RegionalMap::Display display);
    const Target* hit(SDL_FPoint point) const;
    const Target* focus() const;
    std::string help(const Snapshot& snapshot, const Target& target) const;

private:
    friend struct InteractionProbe;
    struct Placement {
        SDL_FRect box;
        std::size_t region{};
        bool full{}, selected{};
    };
    struct Values {
        std::array<double, 3> allegiance{};
        double workers{}, prestige{}, force{}, threshold{}, strength{};
    };
    static Values values(const CrestReading& row);
    Values at(std::size_t index, float progress) const;
    void update(const Snapshot& snapshot, RegionalMap::Display display);
    void addTargets(const Placement& placement, const CrestReading& row);
    void crest(const Placement& placement, const CrestReading& row, const Values& values,
        const Region& region, bool hovered, bool pressed, bool focused, float repelAlpha);
    void packets(const RegionalMap& map, const Snapshot& snapshot, std::span<const RegionShape> shapes,
        double second);
    void quad(SDL_FRect box, SDL_FColor color, MapRect frame = {1, 1, 0, 0});
    void polygon(std::span<const SDL_FPoint> points, SDL_FColor color);
    void text(std::string_view value, SDL_FPoint center, float size, float maxWidth, SDL_FColor color);
    void icon(std::string_view key, SDL_FRect box, SDL_FColor color);

    std::shared_ptr<const CrestArtwork> artwork_;
    std::unique_ptr<SDL_Texture, decltype(&SDL_DestroyTexture)> texture_{nullptr, SDL_DestroyTexture};
    std::vector<Placement> placements_;
    std::vector<Target> targets_;
    std::vector<SDL_Vertex> vertices_;
    std::vector<Values> from_, to_;
    std::vector<unsigned> layout_;
    std::vector<bool> expanded_;
    std::size_t selectedStockCount_{};
    std::optional<std::uint64_t> revision_;
    Uint64 changedAt_{}, secondAt_{};
    Second second_{};
    SDL_FRect area_{};
    float scale_{};
    bool live_{}, dirty_{true}, pressed_{}, focused_{}, lastMoving_{};
    std::string hovered_;
};

}
