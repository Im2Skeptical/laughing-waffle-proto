#include "connected_map.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::connected {
namespace {

constexpr SDL_FColor ground{.09f, .145f, .15f, 1};
constexpr SDL_FColor seam{.14f, .14f, .11f, 1};
constexpr SDL_FColor gold{1, .82f, .48f, 1};
constexpr int terrainWidth = 880, terrainHeight = 550;
constexpr std::array<SDL_FColor, 4> factions{{
    {.69f, .78f, .46f, 1}, {.81f, .56f, .34f, 1}, {.53f, .60f, .55f, 1}, {.82f, .40f, .35f, 1}}};
constexpr std::array<SDL_FColor, 7> biomes{{
    {.47f, .49f, .28f, 1}, {.43f, .41f, .38f, 1}, {.25f, .37f, .26f, 1}, {.22f, .40f, .43f, 1},
    {.54f, .48f, .31f, 1}, {.32f, .39f, .32f, 1}, {.36f, .37f, .31f, 1}}};

SDL_FColor mix(SDL_FColor a, SDL_FColor b, float t)
{
    return {std::lerp(a.r, b.r, t), std::lerp(a.g, b.g, t), std::lerp(a.b, b.b, t), 1};
}

float grain(std::size_t region, std::size_t ordinal)
{
    // Stable ink placement from topology indices. Presentation never draws game RNG.
    auto bits = static_cast<std::uint32_t>(region * 16987u + ordinal * 11147u);
    bits = (bits ^ (bits >> 16)) * 0x45d9f3bu;
    bits = (bits ^ (bits >> 16)) * 0x45d9f3bu;
    return static_cast<float>((bits ^ (bits >> 16)) & 255u) / 255.f;
}

Point lerp(Point a, Point b, double fraction)
{
    return {std::lerp(a[0], b[0], fraction), std::lerp(a[1], b[1], fraction)};
}

}

void RegionalMap::reset()
{
    camera_ = target_ = {};
    facets_.clear();
    engravings_.clear();
    borders_.clear();
    invalidateTerrain();
    revealedAt_ = 0;
}

void RegionalMap::invalidateTerrain()
{
    terrain_.reset();
    triedTexture_ = false;
}

void RegionalMap::overview() { target_ = {}; }

void RegionalMap::reveal(Uint64 now) { revealedAt_ = now; }

bool RegionalMap::animate(Uint64 now, bool reduced)
{
    const auto old = camera_;
    const auto elapsed = std::min(now - lastFrame_, Uint64{40});
    const auto ease = reduced ? 1.f : 1.f - std::exp(-static_cast<float>(elapsed) / 42.f);
    const auto toward = [ease](float at, float to) {
        return std::abs(at - to) < .001f ? to : std::lerp(at, to, ease);
    };
    camera_ = {toward(old.zoom, target_.zoom), toward(old.x, target_.x), toward(old.y, target_.y)};
    lastFrame_ = now;
    return old.zoom != camera_.zoom || old.x != camera_.x || old.y != camera_.y;
}

void RegionalMap::limitCamera()
{
    const auto stretch = (target_.zoom - 1) / 2;
    target_.x = std::clamp(target_.x, -.15f - stretch, .15f + stretch);
    target_.y = std::clamp(target_.y, -.12f - stretch, .12f + stretch);
}

void RegionalMap::zoom(float steps, SDL_FPoint anchor, SDL_FRect area)
{
    const auto old = target_.zoom;
    target_.zoom = std::clamp(old * std::pow(1.19f, steps), 1.f, 3.5f);
    if (target_.zoom == 1) {
        target_ = {};
        return;
    }
    const auto ratio = target_.zoom / old;
    target_.x = target_.x * ratio + ((anchor.x - area.x) / area.w - .5f) * (1 - ratio);
    target_.y = target_.y * ratio + ((anchor.y - area.y) / area.h - .46f) * (1 - ratio);
    limitCamera();
}

void RegionalMap::beginPan() { target_ = camera_; }

void RegionalMap::pan(SDL_FPoint delta, SDL_FRect area)
{
    target_.x += delta.x / area.w;
    target_.y += delta.y / area.h;
    limitCamera();
    camera_ = target_;
}

void RegionalMap::focus(Point point)
{
    target_.zoom = std::max(1.03f, target_.zoom);
    const auto reach = std::min(1.f, .15f + (target_.zoom - 1.f));
    target_.x = -static_cast<float>(point[0] - .5) * target_.zoom * .94f * reach;
    target_.y = -static_cast<float>(point[1] - .5) * target_.zoom * .84f * reach;
    limitCamera();
}

SDL_FPoint RegionalMap::project(Point point, SDL_FRect area) const
{
    return {area.x + area.w * (.5f + static_cast<float>(point[0] - .5) * camera_.zoom * .94f + camera_.x),
        area.y + area.h * (.46f + static_cast<float>(point[1] - .5) * camera_.zoom * .84f + camera_.y)};
}

void RegionalMap::cache(const Snapshot& snapshot, const std::vector<RegionShape>& shapes)
{
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto& shape = shapes[i];
        const auto biome = snapshot.regions[i].biome;
        const auto outline = shape.outline.size();
        // Preserve the full coast in the terrain texture. Province overlays
        // use a screen-sized outline so zooming and scrubbing stay cheap.
        auto& border = borders_.emplace_back();
        for (const auto& point : shape.outline) {
            if (border.empty() || std::hypot(point[0] - border.back()[0], point[1] - border.back()[1]) > .009)
                border.push_back(point);
        }
        if (border.size() < 3) border = shape.outline;
        for (std::size_t j = 0; j < outline; ++j) {
            const auto a = shape.outline[j], b = shape.outline[(j + 1) % outline];
            const auto ridge = lerp(shape.label, lerp(a, b, .5), .47);
            const auto shade = static_cast<float>((ridge[0] - shape.label[0]) - (ridge[1] - shape.label[1])) * .45f;
            facets_.push_back({{shape.label, a, ridge}, .08f + shade, i});
            facets_.push_back({{shape.label, ridge, b}, .06f + shade, i});
            facets_.push_back({{ridge, a, b}, shade, i});
            if (j % 7 != 0) continue;
            for (std::size_t mark = 0; mark < 2; ++mark) {
                const auto n = j * 11 + mark * 3;
                const auto p = lerp(shape.label, lerp(a, b, .2 + .6 * grain(i, n)), .30 + .48 * grain(i, n + 1));
                const auto ink = mix(biomes.at(biome), seam, .32f);
                const double s = .003 + .004 * grain(i, n + 2);
                if (biome == 1 || biome == 2) {
                    const auto rise = biome == 1 ? 1.55 : 1.15;
                    engravings_.push_back({{p[0] - s, p[1] + s * .5}, {p[0], p[1] - s * rise}, ink});
                    engravings_.push_back({{p[0], p[1] - s * rise}, {p[0] + s, p[1] + s * .5}, ink});
                    if (biome == 2) engravings_.push_back({p, {p[0], p[1] + s}, ink});
                } else {
                    const auto slope = biome == 0 ? s * .5 : biome == 5 ? s * .18 : 0.;
                    engravings_.push_back({{p[0] - s, p[1] + slope}, {p[0] + s, p[1] - slope}, ink});
                }
            }
        }
    }
}

void RegionalMap::triangle(SDL_FPoint a, SDL_FPoint b, SDL_FPoint c, SDL_FColor ink)
{
    mesh_.push_back({a, ink, {}});
    mesh_.push_back({b, ink, {}});
    mesh_.push_back({c, ink, {}});
}

void RegionalMap::stroke(SDL_FPoint a, SDL_FPoint b, float width, SDL_FColor ink)
{
    const auto magnitude = std::hypot(b.x - a.x, b.y - a.y);
    if (magnitude < .01f) return;
    const auto nx = (b.y - a.y) * width * .5f / magnitude;
    const auto ny = (a.x - b.x) * width * .5f / magnitude;
    const SDL_FPoint al{a.x + nx, a.y + ny}, ar{a.x - nx, a.y - ny};
    const SDL_FPoint bl{b.x + nx, b.y + ny}, br{b.x - nx, b.y - ny};
    triangle(al, ar, bl, ink);
    triangle(ar, br, bl, ink);
}

void RegionalMap::terrainMesh(const Snapshot& snapshot, SDL_FRect area, bool camera)
{
    const auto at = [&](Point p) {
        return camera ? project(p, area) :
            SDL_FPoint{area.w * (.5f + static_cast<float>(p[0] - .5) * .94f),
                       area.h * (.46f + static_cast<float>(p[1] - .5) * .84f)};
    };
    mesh_.clear();
    for (const auto& facet : facets_) {
        const auto biome = biomes.at(snapshot.regions[facet.region].biome);
        const auto colour = mix(biome, facet.shade > 0 ? gold : seam, std::abs(facet.shade));
        triangle(at(facet.points[0]), at(facet.points[1]), at(facet.points[2]), colour);
    }
    for (const auto& mark : engravings_) stroke(at(mark.a), at(mark.b), 1.25f, mark.ink);
}

void RegionalMap::bakeTerrain(SDL_Renderer* renderer, const Snapshot& snapshot)
{
    triedTexture_ = true;
    terrain_.reset(SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA8888, SDL_TEXTUREACCESS_TARGET,
        terrainWidth, terrainHeight));
    if (!terrain_) return;
    auto* previous = SDL_GetRenderTarget(renderer);
    if (!SDL_SetRenderTarget(renderer, terrain_.get())) {
        terrain_.reset();
        return;
    }
    SDL_SetRenderDrawColorFloat(renderer, ground.r, ground.g, ground.b, 1);
    SDL_RenderClear(renderer);
    terrainMesh(snapshot, {0, 0, terrainWidth, terrainHeight}, false);
    SDL_RenderGeometry(renderer, nullptr, mesh_.data(), static_cast<int>(mesh_.size()), nullptr, 0);
    SDL_SetRenderTarget(renderer, previous);
    SDL_SetTextureBlendMode(terrain_.get(), SDL_BLENDMODE_BLEND);
    SDL_SetTextureScaleMode(terrain_.get(), SDL_SCALEMODE_LINEAR);
}

void RegionalMap::draw(SDL_Renderer* renderer, SDL_FRect area, const Snapshot& snapshot,
                       const std::vector<RegionShape>& shapes, std::string_view selected,
                       std::string_view hovered, bool pressed, Uint64 now, bool reduced)
{
    if (facets_.empty()) cache(snapshot, shapes);
    if (!triedTexture_) bakeTerrain(renderer, snapshot);
    const SDL_Rect clip{static_cast<int>(area.x), static_cast<int>(area.y), static_cast<int>(area.w), static_cast<int>(area.h)};
    SDL_SetRenderClipRect(renderer, &clip);
    SDL_SetRenderDrawColorFloat(renderer, ground.r, ground.g, ground.b, 1);
    SDL_RenderFillRect(renderer, &area);
    const auto elapsed = std::min(1.f, static_cast<float>(now - revealedAt_) / 300.f);
    const auto reveal = reduced || !revealedAt_ ? 1.f : 1 - (1 - elapsed) * (1 - elapsed);
    if (terrain_) {
        const SDL_FRect destination{area.x + area.w * (.5f + camera_.x - .5f * camera_.zoom),
            area.y + area.h * (.46f + camera_.y - .46f * camera_.zoom), area.w * camera_.zoom, area.h * camera_.zoom};
        SDL_SetTextureAlphaModFloat(terrain_.get(), reveal);
        SDL_RenderTexture(renderer, terrain_.get(), nullptr, &destination);
    } else {
        terrainMesh(snapshot, area, true);
        SDL_RenderGeometry(renderer, nullptr, mesh_.data(), static_cast<int>(mesh_.size()), nullptr, 0);
    }
    const auto ink = [reveal](SDL_FColor colour) { colour.a *= reveal; return colour; };
    const auto at = [&](Point p) { return project(p, area); };
    mesh_.clear();
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto& shape = shapes[i];
        const auto& region = snapshot.regions[i];
        const auto faction = factions[static_cast<std::size_t>(region.holder)];
        const auto& border = borders_[i];
        SDL_FColor tint = region.id == hovered || region.id == selected ? gold : faction;
        tint.a = region.id == hovered && pressed ? .25f : region.id == selected ? .16f :
            region.id == hovered ? .13f : region.holder == Holder::neutral ? 0.f : .10f;
        if (tint.a > 0) {
            const auto centre = at(shape.label);
            for (std::size_t j = 0; j < border.size(); ++j)
                triangle(centre, at(border[j]), at(border[(j + 1) % border.size()]), ink(tint));
        }
        for (std::size_t j = 0; j < border.size(); ++j)
            stroke(at(border[j]), at(border[(j + 1) % border.size()]), 1.4f, ink(mix(faction, seam, .26f)));
    }
    for (const auto& [i, j] : snapshot.roads) {
        const auto a = at(shapes[i].label), b = at(shapes[j].label);
        stroke(a, b, 3.f, ink(seam));
        stroke(a, b, 1.f, ink({.80f, .68f, .44f, 1}));
    }
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto& region = snapshot.regions[i];
        const auto& shape = shapes[i];
        if (region.id == selected || region.id == hovered) {
            const auto& border = borders_[i];
            for (std::size_t j = 0; j < border.size(); ++j) {
                const auto a = at(border[j]), b = at(border[(j + 1) % border.size()]);
                stroke(a, b, 3.5f, ink(seam));
                stroke(a, b, region.id == selected ? 2.f : 1.25f, ink(gold));
            }
        }
        if (!region.hasSite) continue;
        const auto p = at(shape.label);
        const auto size = region.id == snapshot.capital ? 7.f : 5.f;
        const auto faction = factions[static_cast<std::size_t>(region.holder)];
        stroke({p.x - size, p.y + 1}, {p.x + size, p.y + 1}, size, ink(seam));
        triangle({p.x - size, p.y}, {p.x, p.y - size}, {p.x + size, p.y}, ink(faction));
        stroke({p.x - size, p.y + 2}, {p.x + size, p.y + 2}, 3.f, ink(faction));
        if (region.id == snapshot.capital)
            stroke({p.x, p.y - size}, {p.x, p.y - size - 5}, 2.f, ink(gold));
    }
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
    SDL_RenderGeometry(renderer, nullptr, mesh_.data(), static_cast<int>(mesh_.size()), nullptr, 0);
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_NONE);
    SDL_SetRenderClipRect(renderer, nullptr);
}

}
