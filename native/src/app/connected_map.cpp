#include "connected_map.hpp"

#include <algorithm>
#include <cmath>
#include <chrono>
#include <iterator>

namespace waffle::connected {
namespace {

constexpr SDL_FColor seam{.13f, .12f, .085f, 1};
constexpr SDL_FColor gold{1, .82f, .48f, 1};
constexpr SDL_FColor ivory{1, .94f, .77f, 1};
constexpr std::array<std::array<float, 3>, 4> factions{{
    {.69f, .78f, .46f}, {.81f, .56f, .34f}, {.60f, .63f, .55f}, {.87f, .40f, .35f}}};
constexpr float transitionMs = 265.f;

SDL_FColor withAlpha(SDL_FColor colour, float alpha)
{
    colour.a = alpha;
    return colour;
}

SDL_FPoint between(SDL_FPoint a, SDL_FPoint b, float t)
{
    return {std::lerp(a.x, b.x, t), std::lerp(a.y, b.y, t)};
}

bool sameArea(SDL_FRect a, SDL_FRect b)
{
    return a.x == b.x && a.y == b.y && a.w == b.w && a.h == b.h;
}

}

void RegionalMap::prepare(std::shared_ptr<const MapGeography> geography, const Snapshot& opening)
{
    if (!geography || geography == geography_) return;
    if (pendingTerrain_.valid()) {
        if (pendingTerrain_.wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
        pendingTerrain_.get(); // This world was replaced before its bake finished.
    }
    geography_ = std::move(geography);
    baked_.reset();
    invalidateTerrain();
    pendingTerrain_ = std::async(std::launch::async, [art = art_, geography = geography_, opening] {
        return bakeMapTerrain(*art, *geography, opening);
    });
}

void RegionalMap::prepareTextures(SDL_Renderer* renderer, SDL_FRect area)
{
    if (!baked_ && pendingTerrain_.valid() &&
        pendingTerrain_.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
        baked_ = std::make_shared<const MapTerrain>(pendingTerrain_.get());
        dirty_ = true;
    }
    if (!baked_) return;
    if (terrainReady() && area.w == lodWidth_ && area.h == lodHeight_ && camera_.zoom == lodZoom_) {
        prepareTerrainComposite(renderer);
        return;
    }
    terrainComposite_.reset();
    compositeAttempted_ = false;
    const auto x = area.w * camera_.zoom * .94 * (baked_->max[0] - baked_->min[0]) / baked_->full.width;
    const auto y = area.h * camera_.zoom * .84 * (baked_->max[1] - baked_->min[1]) / (baked_->full.height / 2);
    const auto lod = std::clamp(-std::log2(std::min(x, y)), 0., 4.);
    const auto level = static_cast<int>(lod);
    lodWidth_ = area.w;
    lodHeight_ = area.h;
    lodZoom_ = camera_.zoom;
    lodBlend_ = static_cast<float>(lod - level);
    if (terrain_ && terrainLod_ == level && (lodBlend_ == 0 || terrainCoarse_)) {
        prepareTerrainComposite(renderer);
        return;
    }
    const auto start = SDL_GetTicksNS();
    const auto upload = [&](const MapPixels& image) {
        auto* texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC,
            image.width, image.height);
        if (!texture) throw std::runtime_error(SDL_GetError());
        if (!SDL_UpdateTexture(texture, nullptr, image.rgba.data(), image.width * 4)) {
            SDL_DestroyTexture(texture);
            throw std::runtime_error(SDL_GetError());
        }
        SDL_SetTextureScaleMode(texture, SDL_SCALEMODE_LINEAR);
        SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
        return texture;
    };
    if (level != terrainLod_) {
        if (level == terrainLod_ + 1 && terrainCoarse_) terrain_ = std::move(terrainCoarse_);
        else if (level + 1 == terrainLod_) terrainCoarse_ = std::move(terrain_);
        else { terrain_.reset(); terrainCoarse_.reset(); }
    }
    if (!terrain_) terrain_.reset(upload(baked_->level(level)));
    if (lodBlend_ > 0 && !terrainCoarse_) terrainCoarse_.reset(upload(baked_->level(level + 1)));
    if (!towns_) towns_.reset(upload(art_->towns.pixels));
    terrainLod_ = level;
    textureBytes_ = baked_->level(level).rgba.size() + art_->towns.pixels.rgba.size();
    if (terrainCoarse_) textureBytes_ += baked_->level(level + 1).rgba.size();
    prepareTerrainComposite(renderer);
    uploadMs_ = static_cast<double>(SDL_GetTicksNS() - start) / 1e6;
    dirty_ = true;
}

void RegionalMap::prepareTerrainComposite(SDL_Renderer* renderer)
{
    if (compositeAttempted_ || !terrainCoarse_ || lodBlend_ == 0 || camera_.zoom != target_.zoom) return;
    compositeAttempted_ = true;
    const auto& fine = baked_->level(terrainLod_);
    const auto& coarse = baked_->level(terrainLod_ + 1);
    auto* previous = SDL_GetRenderTarget(renderer);
    decltype(terrainComposite_) composed(SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
        SDL_TEXTUREACCESS_TARGET, fine.width, fine.height), SDL_DestroyTexture);
    if (!composed || !SDL_SetRenderTarget(renderer, composed.get())) return;
    SDL_SetTextureAlphaModFloat(terrain_.get(), 1);
    SDL_SetTextureAlphaModFloat(terrainCoarse_.get(), lodBlend_);
    for (const int layer : {0, 1}) {
        const SDL_FRect fineRect{0, layer * fine.height * .5f, static_cast<float>(fine.width), fine.height * .5f};
        const SDL_FRect coarseRect{0, layer * coarse.height * .5f, static_cast<float>(coarse.width), coarse.height * .5f};
        SDL_RenderTexture(renderer, terrain_.get(), &fineRect, &fineRect);
        SDL_RenderTexture(renderer, terrainCoarse_.get(), &coarseRect, &fineRect);
    }
    SDL_SetRenderTarget(renderer, previous);
    SDL_SetTextureScaleMode(composed.get(), SDL_SCALEMODE_LINEAR);
    SDL_SetTextureBlendMode(composed.get(), SDL_BLENDMODE_BLEND);
    terrainComposite_ = std::move(composed);
    terrain_.reset();
    terrainCoarse_.reset();
    textureBytes_ = fine.rgba.size() + art_->towns.pixels.rgba.size();
    dirty_ = true;
}

void RegionalMap::reset()
{
    camera_ = target_ = {};
    borders_.clear();
    ink_.clear();
    roads_.clear();
    changedAt_.reset();
    revision_.reset();
    wasLive_ = false;
    dirty_ = true;
    revealedAt_ = 0;
    invalidateTerrain();
}

void RegionalMap::invalidateTerrain()
{
    terrain_.reset();
    terrainCoarse_.reset();
    terrainComposite_.reset();
    compositeAttempted_ = false;
    terrainLod_ = -1;
    towns_.reset();
    atmosphere_.release();
    textureBytes_ = 0;
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

void RegionalMap::pinch(float factor, SDL_FPoint from, SDL_FPoint to, SDL_FRect area)
{
    const auto old = target_.zoom;
    target_.zoom = std::clamp(old * factor, 1.f, 3.5f);
    const auto ratio = target_.zoom / old;
    target_.x = target_.x * ratio + (to.x - from.x) / area.w +
        ((from.x - area.x) / area.w - .5f) * (1 - ratio);
    target_.y = target_.y * ratio + (to.y - from.y) / area.h +
        ((from.y - area.y) / area.h - .46f) * (1 - ratio);
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

std::optional<RegionalMap::Hit> RegionalMap::hit(SDL_FPoint point, SDL_FRect area, const Snapshot& snapshot,
    const std::vector<RegionShape>& shapes) const
{
    const auto targetRadius = std::clamp(area.h * .064f, 12.f, 20.f);
    float closest = targetRadius * targetRadius;
    std::optional<Hit> settlement;
    if (!SDL_PointInRectFloat(&point, &area)) return {};
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        if (!snapshot.regions[i].hasSite && !snapshot.regions[i].occupied) continue;
        const auto anchor = project(shapes[i].label, area);
        const auto dx = point.x - anchor.x, dy = point.y - anchor.y;
        const auto distance = dx * dx + dy * dy;
        if (distance <= closest) {
            closest = distance;
            settlement = Hit{i, true};
        }
    }
    if (settlement) return settlement;

    const Point local{
        .5 + ((point.x - area.x) / area.w - .5f - camera_.x) / (camera_.zoom * .94f),
        .5 + ((point.y - area.y) / area.h - .46f - camera_.y) / (camera_.zoom * .84f)};
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto& polygon = shapes[i].outline;
        if (polygon.size() < 3) continue;
        bool inside = false;
        auto a = polygon.back();
        for (const auto& b : polygon) {
            if ((a[1] > local[1]) != (b[1] > local[1]) &&
                local[0] < (b[0] - a[0]) * (local[1] - a[1]) / (b[1] - a[1]) + a[0])
                inside = !inside;
            a = b;
        }
        if (inside) return Hit{i, false};
    }
    return {};
}

RegionalMap::Territory RegionalMap::blend(const Territory& from, const Territory& to, float t)
{
    return {{std::lerp(from.colour[0], to.colour[0], t), std::lerp(from.colour[1], to.colour[1], t),
                std::lerp(from.colour[2], to.colour[2], t)},
        std::lerp(from.control, to.control, t), std::lerp(from.scale, to.scale, t),
        std::lerp(from.presence, to.presence, t), std::lerp(from.creep, to.creep, t), std::lerp(from.market, to.market, t)};
}

float RegionalMap::progress(Uint64 now) const
{
    if (!changedAt_) return 1.f;
    const auto remaining = 1.f - std::clamp(static_cast<float>(now - *changedAt_) / transitionMs, 0.f, 1.f);
    return 1.f - remaining * remaining * remaining;
}

void RegionalMap::updateInk(const Snapshot& snapshot, Display display)
{
    // Preview requests cancel motion immediately, including the frames while a
    // new restore is being prepared. Returning to Live also snaps to its state.
    if (changedAt_ && (display.reduced || !display.live || progress(display.now) >= 1.f)) {
        changedAt_.reset();
        dirty_ = true;
    }
    const bool adjacentLiveViews = wasLive_ && display.live;
    wasLive_ = display.live;
    if (revision_ == display.revision) return;
    revision_ = display.revision;
    dirty_ |= capital_ != snapshot.capital;
    capital_ = snapshot.capital;

    incoming_.clear();
    for (const auto& region : snapshot.regions) {
        const bool creep = region.occupied;
        const auto footprint = 4.3f + .24f * static_cast<float>(std::sqrt(std::clamp(region.population, 0., 300.)));
        incoming_.push_back({factions[static_cast<std::size_t>(region.holder)],
            region.holder == Holder::neutral ? 0.f : creep ? .19f : .135f, footprint,
            region.hasSite || creep ? 1.f : 0.f, creep ? 1.f : 0.f, region.holder == Holder::neutral ? 1.f : 0.f});
    }
    incomingRoads_.clear();
    for (auto [a, b] : snapshot.roads) incomingRoads_.emplace_back(std::min(a, b), std::max(a, b));
    std::ranges::sort(incomingRoads_);
    incomingRoads_.erase(std::unique(incomingRoads_.begin(), incomingRoads_.end()), incomingRoads_.end());

    const bool advanced = snapshot.second > second_;
    second_ = snapshot.second;
    if (incoming_ == ink_ && incomingRoads_ == roads_) return;
    if (advanced && adjacentLiveViews && !display.reduced && ink_.size() == incoming_.size()) {
        const auto at = progress(display.now);
        if (changedAt_) {
            for (std::size_t i = 0; i < ink_.size(); ++i) from_[i] = blend(from_[i], ink_[i], at);
        } else from_ = ink_;

        std::vector<RoadInk> next;
        next.reserve(roads_.size() + incomingRoads_.size() + roadInk_.size());
        if (changedAt_) {
            for (const auto& road : roadInk_)
                next.push_back({road.edge, std::lerp(road.from, road.to, at), 0.f});
        } else {
            for (const auto& road : roads_) next.push_back({road, 1.f, 0.f});
        }
        for (const auto& road : incomingRoads_) {
            const auto it = std::ranges::lower_bound(next, road, {}, &RoadInk::edge);
            if (it != next.end() && it->edge == road) it->to = 1.f;
            else next.insert(it, {road, 0.f, 1.f});
        }
        std::erase_if(next, [](const auto& road) { return road.from == 0.f && road.to == 0.f; });
        roadInk_ = std::move(next);
        changedAt_ = display.now;
    } else changedAt_.reset();
    ink_.swap(incoming_);
    roads_.swap(incomingRoads_);
    dirty_ = true;
}

void RegionalMap::triangle(SDL_FPoint a, SDL_FPoint b, SDL_FPoint c, SDL_FColor ink)
{
    triangle(a, b, c, ink, ink, ink);
}

void RegionalMap::triangle(SDL_FPoint a, SDL_FPoint b, SDL_FPoint c, SDL_FColor ca, SDL_FColor cb, SDL_FColor cc)
{
    mesh_.push_back({a, ca, {}});
    mesh_.push_back({b, cb, {}});
    mesh_.push_back({c, cc, {}});
}

void RegionalMap::stroke(SDL_FPoint a, SDL_FPoint b, float width, SDL_FColor ink)
{
    const float dx = b.x - a.x, dy = b.y - a.y;
    const auto square = dx * dx + dy * dy;
    if (square < .0001f) return;
    const auto radius = width * .5f / std::sqrt(square);
    const auto nx = dy * radius, ny = -dx * radius;
    const SDL_FPoint al{a.x + nx, a.y + ny}, ar{a.x - nx, a.y - ny};
    const SDL_FPoint bl{b.x + nx, b.y + ny}, br{b.x - nx, b.y - ny};
    triangle(al, ar, bl, ink);
    triangle(ar, br, bl, ink);
}

void RegionalMap::settlement(SDL_FPoint p, float size, const Territory& territory, bool capital,
    bool selected, bool hovered, bool pressed)
{
    const auto alpha = territory.presence;
    const auto halo = selected || hovered || pressed;
    const float scale = .7f + .3f * alpha;
    size *= scale;
    if (halo) {
        const float r = size + (pressed ? 5.f : 4.f);
        const SDL_FPoint ring[]{{p.x, p.y - r}, {p.x + r, p.y}, {p.x, p.y + r}, {p.x - r, p.y}};
        for (int i = 0; i < 4; ++i) {
            stroke(ring[i], ring[(i + 1) % 4], 3.8f, withAlpha(seam, alpha));
            stroke(ring[i], ring[(i + 1) % 4], selected || pressed ? 1.9f : 1.15f,
                withAlpha(pressed || hovered ? ivory : gold, alpha));
        }
    }
    const auto at = [&](float x, float y) { return SDL_FPoint{p.x + x * size, p.y + y * size}; };
    if (capital) {
        const auto bannerInk = withAlpha(gold, alpha * (1.f - territory.creep));
        stroke(at(-.1f, -.7f), at(-.1f, -1.51f), 1.5f, bannerInk);
        triangle(at(-.1f, -1.50f), at(.66f, -1.31f), at(-.1f, -1.12f), bannerInk);
    }
    if (baked_) return;
    const SDL_FColor banner{territory.colour[0], territory.colour[1], territory.colour[2], alpha};
    const auto dark = withAlpha(seam, alpha);
    if (territory.creep < 1.f) {
        const auto town = 1.f - territory.creep;
        stroke(at(-.88f, .12f), at(.88f, .12f), size * .88f, withAlpha(dark, alpha * town));
        triangle(at(-.94f, .12f), at(-.1f, -.87f), at(.78f, .12f), withAlpha(banner, alpha * town));
        stroke(at(-.89f, .38f), at(.89f, .38f), size * .34f, withAlpha(banner, alpha * town));
        stroke(at(-.12f, .2f), at(-.12f, .52f), size * .27f, withAlpha(dark, alpha * town));
        const auto wing = std::clamp(size - 5.15f, 0.f, 1.f);
        if (wing > 0.f) {
            triangle(at(.36f, .11f), at(.73f, -.5f), at(1.05f, .11f), withAlpha(banner, alpha * town * wing));
        }
    }
    if (territory.creep > 0.f) {
        const auto threat = alpha * territory.creep;
        triangle(at(-.9f, -.25f), at(-.5f, -.9f), at(0, .75f), withAlpha(banner, threat));
        triangle(at(.9f, -.25f), at(.5f, -.9f), at(0, .75f), withAlpha(banner, threat));
        stroke(at(-.46f, -.12f), at(.46f, -.12f), size * .44f, withAlpha(banner, threat));
        stroke(at(-.40f, -.07f), at(-.16f, -.07f), 1.6f, withAlpha(dark, threat));
        stroke(at(.16f, -.07f), at(.40f, -.07f), 1.6f, withAlpha(dark, threat));
    }
}

void RegionalMap::sprite(const MapRect& source, SDL_FPoint lo, SDL_FPoint hi, float alpha, bool mirror)
{
    const auto& atlas = art_->towns.pixels;
    const auto footprint = std::max(.001f, std::min((hi.x - lo.x) / source.w, (hi.y - lo.y) / source.h));
    const auto level = std::clamp(static_cast<int>(std::lround(-std::log2(footprint))), 0, 4);
    const auto& frame = art_->townLevels.at({source.x, source.y})[level];
    auto u = static_cast<float>(frame.x) / atlas.width, ur = static_cast<float>(frame.x + frame.w) / atlas.width;
    const auto v = static_cast<float>(frame.y) / atlas.height, vb = static_cast<float>(frame.y + frame.h) / atlas.height;
    if (mirror) std::swap(u, ur);
    const SDL_FColor ink{1, 1, 1, alpha};
    const SDL_Vertex a{lo, ink, {u, v}}, b{{hi.x, lo.y}, ink, {ur, v}},
        c{{lo.x, hi.y}, ink, {u, vb}}, d{hi, ink, {ur, vb}};
    buildings_.insert(buildings_.end(), {a, b, c, c, b, d});
}

void RegionalMap::buildings(SDL_FRect area, std::size_t index, Point anchor,
    const Territory& territory)
{
    if (!baked_) return;
    const auto& plan = baked_->sites[index];
    if (territory.creep < 1.f && !plan.buildings.empty()) {
        const auto alpha = territory.presence * (1.f - territory.creep);
        for (const auto& piece : plan.buildings) {
            const auto size = .86 + territory.scale * .020; // Live growth preserves the seeded town plan.
            const auto lo = project({piece.at[0] - piece.width * size * .5, piece.at[1] - piece.height * size}, area);
            const auto hi = project({piece.at[0] + piece.width * size * .5, piece.at[1]}, area);
            if (piece.frame == piece.market) sprite(piece.frame, lo, hi, alpha);
            else {
                if (territory.market < 1.f) sprite(piece.frame, lo, hi, alpha * (1.f - territory.market));
                if (territory.market > 0.f) sprite(piece.market, lo, hi, alpha * territory.market);
            }
        }
    }
    if (territory.creep > 0.f || (plan.buildings.empty() && territory.presence > 0.f)) {
        const auto radius = std::max(plan.radiusX, .017);
        const auto height = std::max(plan.radiusY, .031);
        const auto lod = camera_.zoom < 1.55f ? "/2" : camera_.zoom < 2.6f ? "/1" : "/0";
        const auto kind = territory.creep > 0.f ? "monster" : territory.market > .5f ? "neutral" : "player";
        const auto& frame = art_->towns.frame(std::string(kind) + lod);
        sprite(frame, project({anchor[0] - radius, anchor[1] - height}, area),
            project({anchor[0] + radius, anchor[1] + height * .35}, area),
            (territory.creep > 0.f ? territory.creep : 1.f) * territory.presence);
    }
}

void RegionalMap::buildOverlay(SDL_FRect area, const Snapshot& snapshot, const std::vector<RegionShape>& shapes,
    std::string_view selected, std::string_view hovered, bool pressed, float t)
{
    mesh_.clear();
    occupation_.clear();
    occupationCoarse_.clear();
    buildings_.clear();
    const auto at = [&](Point p) { return project(p, area); };
    const auto paint = [&](std::size_t i) { return changedAt_ ? blend(from_[i], ink_[i], t) : ink_[i]; };
    if (baked_) for (const auto& strip : baked_->bones) {
        const auto alpha = paint(strip.region).creep - (strip.neighbor < 0 ? 0.f : paint(strip.neighbor).creep);
        if (alpha <= 0) continue;
        for (const auto& rib : strip.pieces) {
            const auto lo = at({rib.at[0] - rib.width * .5, rib.at[1] - rib.height});
            const auto hi = at({rib.at[0] + rib.width * .5, rib.at[1]});
            sprite(rib.frame, lo, hi, alpha, rib.mirror);
        }
    }
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto region = paint(i);
        const auto& id = snapshot.regions[i].id;
        const auto& border = borders_[i];
        const auto centre = at(shapes[i].label);
        const bool hot = id == hovered, chosen = id == selected;
        const SDL_FColor faction{region.colour[0], region.colour[1], region.colour[2], 1};
        const auto tint = chosen || hot ? withAlpha(gold, hot && pressed ? .30f : chosen ? .18f : .11f)
                                        : withAlpha(faction, region.control * .45f);
        if (baked_ && region.creep > 0.f) {
            const auto coarse = terrainComposite_ ? 0.f : region.creep * lodBlend_;
            const auto fine = coarse < 1 ? (region.creep - coarse) / (1 - coarse) : 0.f;
            const auto vertex = [&](Point p) {
                return SDL_Vertex{at(p), {1, 1, 1, fine},
                    {static_cast<float>((p[0] - baked_->min[0]) / (baked_->max[0] - baked_->min[0])),
                    .5f + .5f * static_cast<float>((p[1] - baked_->min[1]) / (baked_->max[1] - baked_->min[1]))}};
            };
            const auto hub = vertex(shapes[i].label);
            auto previous = vertex(shapes[i].outline.back());
            for (const auto& point : shapes[i].outline) {
                const auto next = vertex(point);
                occupation_.insert(occupation_.end(), {hub, previous, next});
                if (coarse > 0) {
                    for (auto v : {hub, previous, next}) {
                        v.color.a = coarse;
                        occupationCoarse_.push_back(v);
                    }
                }
                previous = next;
            }
        }
        auto a = at(border.back());
        for (const auto& point : border) {
            const auto b = at(point);
            if (tint.a > 0.f) triangle(centre, a, b, tint);
            a = b;
        }
        if (baked_ && region.presence > 0.f && region.creep < 1.f) {
            constexpr std::array<SDL_FColor, 7> works{{{.55f, .47f, .33f, 1}, {.47f, .40f, .36f, 1},
                {.53f, .50f, .41f, 1}, {.55f, .47f, .33f, 1}, {.48f, .49f, .41f, 1},
                {.38f, .34f, .37f, 1}, {.55f, .47f, .33f, 1}}};
            const auto& site = baked_->sites[i];
            const auto footing = works[snapshot.regions[i].biome];
            const auto inner = withAlpha(footing, region.presence * (1.f - region.creep) * .27f);
            const auto outer = withAlpha(footing, 0);
            const auto hub = shapes[i].label;
            constexpr Point ring[]{{1, 0}, {.71, .71}, {0, 1}, {-.71, .71}, {-1, 0}, {-.71, -.71}, {0, -1}, {.71, -.71}};
            const auto edge = [&](Point p) { return at({hub[0] + p[0] * site.radiusX, hub[1] + p[1] * site.radiusY}); };
            auto prev = edge(ring[7]);
            for (const auto p : ring) {
                const auto next = edge(p);
                triangle(centre, prev, next, inner, outer, outer);
                prev = next;
            }
        }
    }
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto region = paint(i);
        const auto& border = borders_[i];
        const SDL_FColor faction{region.colour[0], region.colour[1], region.colour[2], .67f};
        auto a = at(border.back());
        for (const auto& point : border) {
            const auto b = at(point);
            stroke(a, b, 1.1f, faction);
            a = b;
        }
    }
    const auto drawRoad = [&](Road road, float amount) {
        if (amount <= 0) return;
        const auto segment = [&](SDL_FPoint a, SDL_FPoint b, MapTerrain::Surface surface, MapTerrain::Surface previous) {
            if (surface == MapTerrain::Surface::sea || surface == MapTerrain::Surface::pool) {
                stroke(a, between(a, b, .60f), 1.20f, {.68f, .77f, .66f, amount * .76f});
            } else {
                const bool bridge = surface == MapTerrain::Surface::river;
                stroke(a, b, bridge ? 4.5f : 2.7f, withAlpha(seam, amount * .85f));
                stroke(a, b, bridge ? 2.35f : 1.30f, {.76f, .65f, .48f, amount});
            }
            if (previous != surface && (previous == MapTerrain::Surface::sea || surface == MapTerrain::Surface::sea))
                stroke({a.x, a.y - 2}, {a.x, a.y + 2}, 2.8f, {.80f, .68f, .48f, amount});
        };
        if (baked_) {
            const auto it = baked_->roads.find(road);
            if (it != baked_->roads.end()) {
                const auto& path = it->second;
                const auto through = amount * static_cast<float>(path.size() - 1);
                auto a = at(path.front().at);
                for (std::size_t j = 1; j < path.size() && j - 1 < through; ++j) {
                    const auto b = at(path[j].at);
                    segment(a, between(a, b, std::min(1.f, through - static_cast<float>(j - 1))),
                        path[j].surface, path[j - 1].surface);
                    a = b;
                }
                return;
            }
        }
        const auto from = baked_ ? baked_->sites[road.first].entrance : shapes[road.first].label;
        const auto to = baked_ ? baked_->sites[road.second].entrance : shapes[road.second].label;
        auto a = at(from);
        auto previous = MapTerrain::Surface::ground;
        for (int step = 1; step <= 16; ++step) {
            const auto t = std::min(amount, step / 16.f);
            const Point p{std::lerp(from[0], to[0], t), std::lerp(from[1], to[1], t)};
            const auto b = at(p);
            const auto surface = baked_ ? baked_->surfaceAt(baked_->pixel(p)) : MapTerrain::Surface::ground;
            segment(a, b, surface, previous);
            if (t == amount) break;
            previous = surface;
            a = b;
        }
    };
    if (changedAt_) {
        for (const auto& road : roadInk_) drawRoad(road.edge, std::lerp(road.from, road.to, t));
    } else {
        for (const auto& road : roads_) drawRoad(road, 1.f);
    }
    const auto drawHighlight = [&](std::size_t i, bool chosen) {
        const auto& border = borders_[i];
        const auto hot = snapshot.regions[i].id == hovered;
        auto a = at(border.back());
        for (const auto& point : border) {
            const auto b = at(point);
            stroke(a, b, 4.5f, seam);
            stroke(a, b, hot && pressed ? 3.f : chosen ? 2.35f : 1.45f, chosen && !(hot && pressed) ? gold : ivory);
            a = b;
        }
    };
    for (std::size_t i = 0; i < shapes.size(); ++i)
        if (snapshot.regions[i].id == hovered && hovered != selected) drawHighlight(i, false);
    for (std::size_t i = 0; i < shapes.size(); ++i)
        if (snapshot.regions[i].id == selected) drawHighlight(i, true);
    for (std::size_t i = 0; i < shapes.size(); ++i) {
        const auto region = paint(i);
        if (region.presence <= 0.f) continue;
        const auto& id = snapshot.regions[i].id;
        const bool capital = id == snapshot.capital, hot = id == hovered;
        const auto anchor = shapes[i].label;
        const auto p = at(anchor);
        if (baked_) {
            const auto& site = baked_->sites[i];
            const float alpha = region.presence * (1.f - region.creep);
            if (alpha > 0 && !site.buildings.empty()) {
                const auto court = at(site.court);
                stroke(p, court, 3.5f, {.48f, .39f, .26f, .48f * alpha});
                stroke(court, at(site.entrance), 2.5f, {.59f, .50f, .34f, .62f * alpha});
            }
            buildings(area, i, anchor, region);
        }
        if (!baked_ || hot || id == selected || capital)
            settlement(p, region.scale + (capital ? 1.1f : 0.f), region, capital,
                id == selected, hot, hot && pressed);
    }
}

void RegionalMap::draw(SDL_Renderer* renderer, SDL_FRect area, const Snapshot& snapshot,
    const std::vector<RegionShape>& shapes, std::string_view selected, std::string_view hovered, bool pressed, Display display)
{
    if (shapes.empty() || area.w <= 0 || area.h <= 0) return;
    if (borders_.empty()) {
        for (const auto& shape : shapes) {
            auto& border = borders_.emplace_back();
            for (const auto& point : shape.outline) {
                if (border.empty()) {
                    border.push_back(point);
                    continue;
                }
                const auto dx = point[0] - border.back()[0], dy = point[1] - border.back()[1];
                if (dx * dx + dy * dy > .009 * .009) border.push_back(point);
            }
            if (border.size() < 3) border = shape.outline;
        }
    }
    prepareTextures(renderer, area);
    updateInk(snapshot, display);
    if (!display.live || display.reduced) revealedAt_ = 0;
    const auto elapsed = std::clamp(static_cast<float>(display.now - revealedAt_) / 300.f, 0.f, 1.f);
    const auto reveal = !revealedAt_ ? 1.f : 1 - (1 - elapsed) * (1 - elapsed);
    const SDL_Rect clip{static_cast<int>(area.x), static_cast<int>(area.y), static_cast<int>(area.w), static_cast<int>(area.h)};
    SDL_SetRenderClipRect(renderer, &clip);
    SDL_SetRenderDrawColorFloat(renderer, sea_.r, sea_.g, sea_.b, 1);
    SDL_RenderFillRect(renderer, &area);
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_BLEND);
    SDL_FRect destination{};
    auto* terrain = terrainComposite_ ? terrainComposite_.get() : terrain_.get();
    if (terrain) {
        const auto origin = project(baked_->min, area), end = project(baked_->max, area);
        destination = {origin.x, origin.y, end.x - origin.x, end.y - origin.y};
        const auto& pixels = baked_->level(terrainLod_);
        const SDL_FRect source{0, 0, static_cast<float>(pixels.width), pixels.height * .5f};
        SDL_SetTextureAlphaModFloat(terrain, reveal);
        SDL_RenderTexture(renderer, terrain, &source, &destination);
        if (!terrainComposite_ && terrainCoarse_ && lodBlend_ > 0) {
            const auto& coarse = baked_->level(terrainLod_ + 1);
            const SDL_FRect crop{0, 0, static_cast<float>(coarse.width), coarse.height * .5f};
            SDL_SetTextureAlphaModFloat(terrainCoarse_.get(), lodBlend_ * reveal);
            SDL_RenderTexture(renderer, terrainCoarse_.get(), &crop, &destination);
        }
        atmosphere_.update(renderer, art_, baked_, geography_->seed, snapshot.second, display.now,
            display.graphics, display.reduced);
        atmosphere_.drawWater(renderer, destination);
    }
    if (dirty_ || changedAt_ || !sameArea(area, drawnArea_) || camera_ != drawnCamera_ ||
        selected_ != selected || hovered_ != hovered || pressed_ != pressed) {
        buildOverlay(area, snapshot, shapes, selected, hovered, pressed, progress(display.now));
        selected_ = selected;
        hovered_ = hovered;
        pressed_ = pressed;
        drawnArea_ = area;
        drawnCamera_ = camera_;
        dirty_ = false;
    }
    if (terrain && !occupation_.empty())
        SDL_RenderGeometry(renderer, terrain, occupation_.data(), static_cast<int>(occupation_.size()), nullptr, 0);
    if (terrainCoarse_ && !occupationCoarse_.empty())
        SDL_RenderGeometry(renderer, terrainCoarse_.get(), occupationCoarse_.data(), static_cast<int>(occupationCoarse_.size()), nullptr, 0);
    const auto* vertices = &mesh_;
    if (reveal < 1.f) {
        faded_ = mesh_;
        for (auto& vertex : faded_) vertex.color.a *= reveal;
        vertices = &faded_;
    }
    SDL_RenderGeometry(renderer, nullptr, vertices->data(), static_cast<int>(vertices->size()), nullptr, 0);
    if (towns_ && !buildings_.empty())
        SDL_RenderGeometry(renderer, towns_.get(), buildings_.data(), static_cast<int>(buildings_.size()), nullptr, 0);
    if (terrain) atmosphere_.drawSky(renderer, destination);
    SDL_SetRenderDrawBlendMode(renderer, SDL_BLENDMODE_NONE);
    SDL_SetRenderClipRect(renderer, nullptr);
}

}
