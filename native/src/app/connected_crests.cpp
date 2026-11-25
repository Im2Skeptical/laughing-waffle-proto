#include "connected_crests.hpp"

#include <algorithm>
#include <charconv>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <limits>
#include <numeric>
#include <ranges>

namespace waffle::connected {
namespace {

constexpr SDL_FColor ink{.08f, .105f, .087f, 1}, paper{.99f, .91f, .74f, 1};
constexpr SDL_FColor gold{.94f, .80f, .50f, 1}, copper{.80f, .53f, .37f, 1}, slate{.56f, .66f, .60f, 1};
constexpr SDL_FColor brick{.91f, .55f, .47f, 1}, smoke{.66f, .71f, .66f, 1};
constexpr std::array allegianceInk{gold, copper, slate};
constexpr std::array stockInk{SDL_FColor{.52f, .75f, .50f, 1}, gold, brick};
constexpr float crestWidth = 150, crestHeight = 76, stockStep = 34;
constexpr std::size_t minimumStockSlots = 3;

SDL_FColor tint(SDL_FColor a, SDL_FColor b, float t)
{
    return {std::lerp(a.r, b.r, t), std::lerp(a.g, b.g, t), std::lerp(a.b, b.b, t), std::lerp(a.a, b.a, t)};
}

SDL_FColor alpha(SDL_FColor colour, float amount)
{
    colour.a *= amount;
    return colour;
}

bool conflicts(SDL_FRect box, std::span<const SDL_FRect> occupied)
{
    return std::ranges::any_of(occupied, [&](const auto& other) { return SDL_HasRectIntersectionFloat(&box, &other); });
}

bool inside(SDL_FRect box, SDL_FRect area)
{
    return box.x >= area.x && box.y >= area.y && box.x + box.w <= area.x + area.w && box.y + box.h <= area.y + area.h;
}

SDL_FRect enlarged(SDL_FRect box, float padding)
{
    return {box.x - padding, box.y - padding, box.w + 2 * padding, box.h + 2 * padding};
}

bool fitsRegion(const RegionalMap& map, const RegionShape& shape, SDL_FRect area, SDL_FRect box)
{
    if (shape.outline.size() < 3) return false;
    const auto& outline = shape.outline;
    const std::array corners{SDL_FPoint{box.x, box.y}, SDL_FPoint{box.x + box.w, box.y},
        SDL_FPoint{box.x, box.y + box.h}, SDL_FPoint{box.x + box.w, box.y + box.h}};
    std::array<bool, 4> inside{};
    auto previous = map.project(outline.back(), area);
    for (const auto point : outline) {
        const auto next = map.project(point, area);
        auto a = previous, b = next;
        if (SDL_GetRectAndLineIntersectionFloat(&box, &a.x, &a.y, &b.x, &b.y)) return false;
        for (std::size_t i = 0; i < corners.size(); ++i) {
            const auto [x, y] = corners[i];
            if ((previous.y > y) != (next.y > y) && x <
                (next.x - previous.x) * (y - previous.y) / (next.y - previous.y) + previous.x) inside[i] = !inside[i];
        }
        previous = next;
    }
    return std::ranges::all_of(inside, [](bool value) { return value; });
}

SDL_FRect subrect(SDL_FRect box, float scale, float x, float y, float width, float height)
{
    return {box.x + x * scale, box.y + y * scale, width * scale, height * scale};
}

std::string amount(double value, int decimals = 1)
{
    char result[64];
    if (decimals == 0 && value >= 0 && value < static_cast<double>(std::numeric_limits<std::uint64_t>::max())) {
        const auto digits = std::to_chars(result, result + sizeof(result), static_cast<std::uint64_t>(std::round(value)));
        if (digits.ec == std::errc{}) return {result, digits.ptr};
    }
    std::snprintf(result, sizeof(result), "%.*f", decimals, value);
    std::string text(result);
    if (decimals > 0) {
        while (text.ends_with('0')) text.pop_back();
        if (text.ends_with('.')) text.pop_back();
    }
    return text;
}

std::string stockIcon(std::string_view trait)
{
    if (trait == "Stock") return "stock";
    std::string result = "stock-";
    for (unsigned char ch : trait) result += static_cast<char>(std::tolower(ch));
    return result;
}

float eased(Uint64 now, Uint64 start)
{
    const auto left = 1 - std::min(1.f, static_cast<float>(now - start) / 265.f);
    return 1 - left * left * left;
}

unsigned layoutFlags(const CrestReading& row, bool selected)
{
    return static_cast<unsigned>(row.town) | (row.monster.has_value() << 1) | (row.held << 2) | (row.income << 3) |
        (row.crown << 4) | (selected && row.town ? static_cast<unsigned>(std::max(minimumStockSlots, row.stock.size())) << 5 : 0);
}

}

void CrestLayer::reset()
{
    targets_.clear();
    placements_.clear();
    layout_.clear();
    expanded_.clear();
    revision_.reset();
    changedAt_ = secondAt_ = 0;
    live_ = false;
    dirty_ = true;
}

bool CrestLayer::needsLayout(const Snapshot& snapshot, std::string_view selected)
{
    const auto& rows = snapshot.crests.regions;
    selectedStockCount_ = 0;
    const bool sameSize = rows.size() == layout_.size();
    bool dirty = !sameSize;
    for (std::size_t i = 0; i < rows.size(); ++i) {
        const bool chosen = snapshot.regions[i].id == selected;
        if (chosen) selectedStockCount_ = rows[i].stock.size();
        if (sameSize) dirty |= layout_[i] != layoutFlags(rows[i], chosen);
    }
    return dirty;
}

void CrestLayer::position(const RegionalMap& map, SDL_FRect area, const Snapshot& snapshot,
    std::span<const RegionShape> shapes, std::string_view selected, std::string_view hovered,
    float density, std::vector<SDL_FRect>& occupied)
{
    placements_.clear();
    targets_.clear();
    dirty_ = true;
    area_ = area;
    scale_ = .57f * density;
    const auto& rows = snapshot.crests.regions;
    const auto selectedAt = std::ranges::find(snapshot.regions, selected, &Region::id);
    const auto chosen = static_cast<std::size_t>(selectedAt - snapshot.regions.begin());
    layout_.resize(rows.size());
    for (std::size_t i = 0; i < rows.size(); ++i) layout_[i] = layoutFlags(rows[i], i == chosen);
    const auto below = [&](std::size_t index, float width, float height, float padding = 0) {
        const auto point = map.project(shapes[index].label, area);
        const auto y = point.y + std::max(9.f, area.h * .028f);
        return SDL_FRect{point.x - (width / 2 + padding) * scale_, y,
            (width + 2 * padding) * scale_, (height + padding) * scale_};
    };
    // Keep disclosure local to the painted footprint. On the compact atlas,
    // narrow regions can stay compact at the maximum zoom of the camera.
    expanded_.resize(rows.size());
    for (std::size_t i = 0; i < rows.size(); ++i) {
        expanded_[i] = map.camera_.zoom >= 1.25f && rows[i].town && i != chosen &&
            fitsRegion(map, shapes[i], area, below(i, crestWidth, crestHeight, expanded_[i] ? 0.f : 3.f));
    }
    const auto space = enlarged(area, -2.f);
    const auto put = [&](std::size_t i, bool full, bool pinned) {
        const auto& row = rows[i];
        auto box = row.monster ? below(i, 84, 39) : full ? below(i, crestWidth, crestHeight) :
            below(i, row.income ? 118.f : 56.f, row.crown ? 57.f : 39.f);
        if (pinned && box.w <= space.w && box.h <= space.h) {
            box.x = std::clamp(box.x, space.x, space.x + space.w - box.w);
            box.y = std::clamp(box.y, space.y, space.y + space.h - box.h);
            if (conflicts(box, occupied)) box.y = space.y + space.h - box.h;
        }
        if (!inside(box, space) || (!pinned && conflicts(enlarged(box, 1), occupied))) return;
        placements_.push_back({box, i, full, pinned});
        addTargets(placements_.back(), row);
        occupied.push_back(enlarged(box, 2));
    };
    if (chosen < rows.size() && (rows[chosen].town || rows[chosen].monster)) put(chosen, true, true);
    if (chosen < rows.size() && rows[chosen].town) {
        const auto anchor = map.project(shapes[chosen].label, area);
        const auto size = stockStep * scale_;
        // Keep the first few badge slots in the obstacle layout so routine
        // coverage changes do not reflow region names during a fast scrub.
        const auto slots = std::max(minimumStockSlots, rows[chosen].stock.size());
        const auto cols = std::min(static_cast<int>(slots), std::max(1, static_cast<int>(space.w / size)));
        const auto left = std::clamp(anchor.x - size * cols / 2, space.x, space.x + space.w - size * cols);
        for (std::size_t i = 0; i < slots; ++i) {
            SDL_FRect box{left + size * (i % cols), anchor.y - size * (1 + i / cols) - 22 * scale_, size - 2, size - 2};
            box.y = std::max(box.y, space.y);
            if (inside(box, space) && !conflicts(box, occupied)) {
                targets_.push_back({box, chosen, Part::stock, i});
                occupied.push_back(box);
            }
        }
    }
    const auto hot = std::ranges::find(snapshot.regions, hovered, &Region::id);
    const auto hotIndex = static_cast<std::size_t>(hot - snapshot.regions.begin());
    if (hotIndex != chosen && hotIndex < rows.size() && (rows[hotIndex].town || rows[hotIndex].monster))
        put(hotIndex, expanded_[hotIndex], false);
    for (int tier = 0; tier < 2; ++tier) for (std::size_t i = 0; i < rows.size(); ++i) {
        if (i == chosen || i == hotIndex) continue;
        const auto& row = rows[i];
        if ((row.town || row.monster) && (row.held || row.monster ? 0 : 1) == tier) put(i, expanded_[i], false);
    }
}

void CrestLayer::addTargets(const Placement& placement, const CrestReading& row)
{
    const auto [box, region, full, selected] = placement;
    if (row.monster) { targets_.push_back({box, region, Part::monster}); return; }
    const auto add = [&](float x, float y, float w, float h, Part part) {
        targets_.push_back({subrect(box, scale_, x, y, w, h), region, part});
    };
    if (full) {
        add(0, 0, crestWidth, 39, Part::allegiance);
        add(0, 38, 69, 38, Part::workers);
        add(69, 38, 81, 38, Part::prestige);
        if (row.crown) add(std::clamp(13.f + 124.f * static_cast<float>(row.minimumShare) - 17, 0.f, 116.f), 0, 34, 17, Part::crown);
    } else {
        add(0, row.crown ? 16.f : 0.f, row.income ? 56.f : box.w / scale_, 39, Part::workers);
        if (row.income) add(54, 0, 64, 39, Part::prestige);
        if (row.crown) add(0, 0, box.w / scale_, 18, Part::crown);
    }
}

const CrestLayer::Target* CrestLayer::hit(SDL_FPoint point) const
{
    const auto target = std::ranges::find_if(targets_ | std::views::reverse, [&](const auto& item) {
        if (item.part == Part::stock && item.stockIndex >= selectedStockCount_) return false;
        return SDL_PointInRectFloat(&point, &item.box);
    });
    return target == targets_.rend() ? nullptr : &*target;
}

const CrestLayer::Target* CrestLayer::focus() const
{
    if (placements_.empty() || !placements_.front().selected || targets_.empty()) return nullptr;
    return &targets_.front();
}

std::string CrestLayer::help(const Snapshot& snapshot, const Target& target) const
{
    if (target.region >= snapshot.crests.regions.size()) return {};
    const auto& row = snapshot.crests.regions[target.region];
    const auto& region = snapshot.regions[target.region];
    const auto residents = std::accumulate(row.allegiance.begin(), row.allegiance.end(), 0.);
    switch (target.part) {
    case Part::workers:
        return region.name + " · Workers. " + amount(residents) + " residents, " + amount(row.workers) +
            " workers. " + amount(row.assigned) + " assigned, " + amount(row.workers - row.assigned) + " unused.";
    case Part::prestige:
        return (row.income ? std::string("Territorial Prestige. ") + amount(row.prestige) +
            " Prestige per completed node into the shared civilization treasury." : "Potential territorial Prestige. " +
            amount(row.prestige) + " per completed node if held under settled control. Income is inactive here.") +
            " One Prestige per full 20 residents.";
    case Part::allegiance: {
        std::string text = "Allegiance. Free " + amount(row.allegiance[0]) + " / Crown " + amount(row.allegiance[1]) +
            " / Unaffiliated " + amount(row.allegiance[2]) + ". ";
        if (row.unrestYears) return text + "Unrest: " + amount(*row.unrestYears) + " years remaining. " +
            amount(row.unrestChaos) + " Chaos per year. Local production continues. Faction supply, Prestige and peaceful claims are suspended.";
        if (!row.held) return text + "No faction currently holds this town. Peaceful claims need 75% allegiance for two checks.";
        constexpr std::array status{"Unheld", "Population-supported", "Military occupation", "Control contested", "Unrest"};
        text += std::string(status[static_cast<std::size_t>(row.control)]) + ". Holding Force " + amount(row.force) +
            (row.requiredForce && *row.requiredForce > 0 ? " / " + amount(*row.requiredForce) + " required" : "") +
            ". " + amount(row.warriors) + " loyal Warriors" +
            (row.received > 0 ? ", " + amount(row.received) + " Force from neighbouring garrisons" : "") + ". ";
        return text + "Sword " + amount(100 * row.zeroForceShare) + "% without Force. Shield " +
            amount(100 * row.minimumShare) + "% at current Force, a reduction of " +
            amount(100 * (row.zeroForceShare - row.minimumShare)) + " percentage points. Falling below it at a control check starts Unrest.";
    }
    case Part::crown:
        return "Crown capital. The Unbending Crown rules from this stronghold. Its provinces share the Crown border.";
    case Part::monster: {
        if (!row.monster) return {};
        const auto& monster = *row.monster;
        std::string text = "Monster Strength " + amount(monster.strength) + ". Attack and defense rating. "
            "Matching or higher Defense holds. Repelled Monsters gain +1 Strength for the next attack. ";
        if (monster.target) {
            text += "Attack target: " + snapshot.regions[*monster.target].name + ". ";
            if (monster.defense) text += "Defense " + amount(*monster.defense, 2) +
                (monster.willBeRepelled ? " would hold this attack. " : " would be overrun. ");
        } else text += "No adjacent region remains to spread into. ";
        if (monster.repelGain) text += "Last: Repelled · +" + amount(*monster.repelGain) + " Strength.";
        return text;
    }
    case Part::stock: {
        if (target.stockIndex >= row.stock.size()) return {};
        const auto& badge = row.stock[target.stockIndex];
        constexpr std::array roles{"Produced Stock has no installed consumer in reach.",
            "Output has no local Stock holder.", "Input has no eligible supply source."};
        return badge.trait + " Stock. " + roles[static_cast<std::size_t>(badge.issue)] +
            " Sources include eligible adjacent road-connected holdings. Influence uses its own allegiance network. Empty holders still count.";
    }
    }
    return {};
}

CrestLayer::Values CrestLayer::values(const CrestReading& row)
{
    return {row.allegiance, row.workers, row.prestige, row.force, row.minimumShare,
        row.monster ? row.monster->strength : 0.};
}

CrestLayer::Values CrestLayer::at(std::size_t index, float progress) const
{
    const auto& next = to_[index];
    if (progress >= 1) return next;
    const auto& prior = from_[index];
    Values result;
    for (std::size_t i = 0; i < result.allegiance.size(); ++i)
        result.allegiance[i] = std::lerp(prior.allegiance[i], next.allegiance[i], progress);
    result.workers = std::lerp(prior.workers, next.workers, progress);
    result.prestige = std::lerp(prior.prestige, next.prestige, progress);
    result.force = std::lerp(prior.force, next.force, progress);
    result.threshold = std::lerp(prior.threshold, next.threshold, progress);
    result.strength = std::lerp(prior.strength, next.strength, progress);
    return result;
}

void CrestLayer::update(const Snapshot& snapshot, RegionalMap::Display display)
{
    const bool animate = live_ && display.live && !display.reduced;
    live_ = display.live;
    if (changedAt_ && (!animate || eased(display.now, changedAt_) >= 1)) {
        changedAt_ = 0;
        dirty_ = true;
    }
    if (revision_ == display.revision) return;
    const auto& rows = snapshot.crests.regions;
    if (animate && snapshot.second > second_ && rows.size() == to_.size()) {
        const auto progress = changedAt_ ? eased(display.now, changedAt_) : 1.f;
        from_.resize(rows.size());
        for (std::size_t i = 0; i < rows.size(); ++i) from_[i] = at(i, progress);
        changedAt_ = display.now;
    } else changedAt_ = 0;
    secondAt_ = display.now;
    second_ = snapshot.second;
    to_.resize(rows.size());
    std::ranges::transform(rows, to_.begin(), values);
    revision_ = display.revision;
    dirty_ = true;
}

void CrestLayer::quad(SDL_FRect box, SDL_FColor color, MapRect frame)
{
    const auto& pixels = artwork_->atlas.pixels;
    const auto u = (frame.x + .5f) / pixels.width, v = (frame.y + .5f) / pixels.height;
    const auto r = (frame.x + std::max(.5f, frame.w - .5f)) / pixels.width;
    const auto b = (frame.y + std::max(.5f, frame.h - .5f)) / pixels.height;
    const SDL_Vertex nw{{box.x, box.y}, color, {u, v}}, ne{{box.x + box.w, box.y}, color, {r, v}};
    const SDL_Vertex sw{{box.x, box.y + box.h}, color, {u, b}}, se{{box.x + box.w, box.y + box.h}, color, {r, b}};
    vertices_.insert(vertices_.end(), {nw, ne, se, nw, se, sw});
}

void CrestLayer::polygon(std::span<const SDL_FPoint> points, SDL_FColor color)
{
    const SDL_FPoint uv{1.5f / artwork_->atlas.pixels.width, 1.5f / artwork_->atlas.pixels.height};
    for (std::size_t i = 1; i + 1 < points.size(); ++i)
        vertices_.insert(vertices_.end(), {{points[0], color, uv}, {points[i], color, uv}, {points[i + 1], color, uv}});
}

void CrestLayer::text(std::string_view value, SDL_FPoint center, float size, float maxWidth, SDL_FColor color)
{
    const auto& letters = artwork_->glyphs;
    int width = 0;
    for (unsigned char ch : value) width += letters[ch].advance;
    if (!width) return;
    const auto scale = std::min(size / 26.f, maxWidth / width);
    auto x = center.x - width * scale / 2;
    const auto baseline = center.y + 9.f * scale;
    for (unsigned char ch : value) {
        const auto& glyph = letters[ch];
        const auto& b = glyph.bitmap;
        if (b.w && b.h) quad({x + glyph.left * scale, baseline - glyph.top * scale,
            b.w * scale, b.h * scale}, color, b);
        x += glyph.advance * scale;
    }
}

void CrestLayer::icon(std::string_view key, SDL_FRect box, SDL_FColor color)
{
    const auto& frames = artwork_->atlas.frames;
    const auto frame = frames.find(key);
    quad(box, color, frame == frames.end() ? frames.at("stock") : frame->second);
}

void CrestLayer::crest(const Placement& placement, const CrestReading& row, const Values& value,
    const Region& region, bool hovered, bool pressed, bool focused, float repelAlpha)
{
    const auto [box, index, full, selected] = placement;
    const auto scale = scale_;
    const auto point = [&](float x, float y) { return SDL_FPoint{box.x + x * scale, box.y + y * scale}; };
    const auto rect = [&](float x, float y, float w, float h) { return subrect(box, scale, x, y, w, h); };
    const auto number = [&](std::string_view textValue, float x, float y, float size, float width, SDL_FColor color) {
        text(textValue, point(x, y), size * scale, width * scale, color);
    };
    const auto sigil = [&](float x, float y) {
        constexpr SDL_FColor CrownInk{.78f, .53f, .34f, 1};
        polygon(std::array{point(x - 15, y + 3), point(x - 7, y + 8), point(x, y - 4),
            point(x + 7, y + 8), point(x + 15, y + 3), point(x + 11, y + 17), point(x - 11, y + 17)}, paper);
        polygon(std::array{point(x - 12, y + 5), point(x - 7, y + 11), point(x, y - 1),
            point(x + 7, y + 11), point(x + 12, y + 5), point(x + 9, y + 15), point(x - 9, y + 15)}, CrownInk);
        quad(rect(x - 11, y + 18, 22, 3), gold);
    };
    auto edge = row.monster ? brick : row.income ? gold : region.holder == Holder::crown ? copper : slate;
    if (row.unrestYears || row.control == CrestControl::contested) edge = brick;
    if (focused && selected) edge = paper;
    else if (hovered || selected) edge = tint(edge, paper, .56f);
    auto board = row.monster ? SDL_FColor{.21f, .102f, .13f, 1} : SDL_FColor{.115f, .155f, .13f, 1};
    if (pressed) board = tint(board, edge, .32f);
    const auto frame = [&](float w, float y, float bottom, float bevel) {
        polygon(std::array{point(0, y), point(w, y), point(w - 3, bottom - bevel),
            point(w / 2, bottom), point(3, bottom - bevel)}, edge);
        polygon(std::array{point(2, y + 2), point(w - 2, y + 2), point(w - 5, bottom - bevel - 1),
            point(w / 2, bottom - 2), point(5, bottom - bevel - 1)}, board);
    };
    if (row.monster) {
        frame(84, 0, 39, 4);
        polygon(std::array{point(8, 7), point(16, 11), point(25, 11), point(33, 7), point(30, 24),
            point(21, 32), point(11, 24)}, brick);
        quad(rect(15, 16, 4, 4), paper);
        quad(rect(24, 16, 4, 4), paper);
        number(amount(value.strength, 0), 56, 19, 25, 40, paper);
        if (repelAlpha > 0 && row.monster->repelGain) {
            const auto label = "Repelled +" + amount(*row.monster->repelGain, 0);
            const auto top = box.y - 18 * scale >= area_.y ? -18.f : 39.f;
            quad(rect(0, top, 84, 18), alpha(board, repelAlpha));
            number(label, 42, top + 8, 14, 81, alpha(paper, repelAlpha));
        }
        return;
    }
    const float width = box.w / scale;
    const float workerY = full ? 52.f : row.crown ? 33.f : 17.f;
    const float frameTop = full ? 14.f : row.crown ? 16.f : 0.f;
    frame(width, frameTop, box.h / scale, full ? 16.f : 6.f);
    const auto owner = tint(board, row.income ? gold : region.holder == Holder::crown ? copper : slate, .21f);
    const auto lower = [&](float x, float w, SDL_FColor color) { quad(rect(x, workerY - 12, w, 23), color); };
    lower(6, full ? 61.f : 45.f, owner);
    quad(rect(10, workerY - 8, 7, 7), paper);
    polygon(std::array{point(10, workerY + 1), point(17, workerY + 1), point(20, workerY + 10), point(7, workerY + 10)}, paper);
    number(amount(std::round(value.workers), 0), full ? 41.f : 35.f, workerY, 26, full ? 43.f : 30.f, paper);
    if (full || row.income) {
        const float x = full ? 70.f : 53.f;
        lower(x, width - x - 6, row.income ? tint(gold, paper, .1f) : tint(board, smoke, .14f));
        icon("prestige", rect(x + 2, workerY - 13, 26, 26), row.income ? ink : smoke);
        number((row.income ? "+" : "") + amount(std::round(value.prestige), 0), (x + width) / 2 + 8,
            workerY, 23, width - x - 27, row.income ? ink : smoke);
    }
    if (!full) {
        if (row.crown) sigil(width / 2, 4);
        return;
    }
    constexpr float track = 124, start = 13, y = 29;
    quad(rect(start - 2, y - 6, track + 4, 13), ink);
    const auto total = std::max(1., std::accumulate(value.allegiance.begin(), value.allegiance.end(), 0.));
    const std::array<std::size_t, 3> order = region.holder == Holder::crown ? std::array<std::size_t, 3>{1, 0, 2} :
        std::array<std::size_t, 3>{0, 1, 2};
    float x = start;
    for (const auto i : order) {
        const auto fill = track * static_cast<float>(value.allegiance[i] / total);
        if (fill > 0) quad(rect(x, y - 4, fill, 8), allegianceInk[i]);
        x += fill;
    }
    if (row.unrestYears) {
        quad(rect(26, 1, 98, 22), board);
        number("Unrest " + amount(std::ceil(*row.unrestYears), 0) + "y", 75, 12, 21, 95, brick);
    } else if (row.held) {
        const auto shield = start + track * static_cast<float>(value.threshold);
        const auto sword = start + track * static_cast<float>(row.zeroForceShare);
        const float dim = 15;
        polygon(std::array{point(shield - dim, y - 13), point(shield + dim, y - 13), point(shield + dim - 2, y + 9),
            point(shield, y + 14), point(shield - dim + 2, y + 9)}, edge);
        polygon(std::array{point(shield - dim + 2, y - 11), point(shield + dim - 2, y - 11),
            point(shield + dim - 4, y + 8), point(shield, y + 12), point(shield - dim + 4, y + 8)}, board);
        polygon(std::array{point(sword - 2, y - 13), point(sword + 2, y - 13),
            point(sword + 2, y + 10), point(sword, y + 16), point(sword - 2, y + 10)}, smoke);
        quad(rect(sword - 7, y - 12, 14, 2), gold);
        quad(rect(sword - 1, y - 21, 2, 9), gold);
        if (std::abs(sword - shield) < 12) quad(rect(shield - 10, y - 8, 20, 17), board);
        number(amount(std::floor(value.force), 0), shield, y, 22, 24, paper);
        if (row.crown) sigil(shield, 4);
    } else number("-", 75, 12, 18, 25, smoke);
}

void CrestLayer::packets(const RegionalMap& map, const Snapshot& snapshot,
    std::span<const RegionShape> shapes, double second)
{
    for (std::size_t i = 0; i < snapshot.crests.transfers.size(); ++i) {
        const auto& transfer = snapshot.crests.transfers[i];
        if (transfer.source >= shapes.size() || transfer.destination >= shapes.size() || transfer.source == transfer.destination) continue;
        const auto elapsed = second - transfer.second;
        if (elapsed < 0 || elapsed >= 1.8) continue;
        const auto progress = static_cast<float>(elapsed / 1.8);
        const auto source = map.project(shapes[transfer.source].label, area_);
        const auto destination = map.project(shapes[transfer.destination].label, area_);
        SDL_FPoint point{std::lerp(source.x, destination.x, progress), std::lerp(source.y, destination.y, progress)};
        if (map.baked_) {
            const auto edge = std::minmax(transfer.source, transfer.destination);
            const auto road = map.baked_->roads.find({edge.first, edge.second});
            if (road != map.baked_->roads.end() && road->second.size() > 1) {
                const auto route = transfer.source < transfer.destination ? progress : 1.f - progress;
                const auto n = route * (road->second.size() - 1);
                const auto a = std::min(static_cast<std::size_t>(n), road->second.size() - 2);
                const auto left = map.project(road->second[a].at, area_), right = map.project(road->second[a + 1].at, area_);
                point = {std::lerp(left.x, right.x, n - a), std::lerp(left.y, right.y, n - a)};
            }
        }
        const auto fade = 1.f - std::max(0.f, (progress - .65f) / .35f);
        const auto lane = static_cast<float>(static_cast<int>(i % 3) - 1) * 9 * scale_;
        point.y += lane;
        const auto size = (20.f + std::min(8.f, static_cast<float>(transfer.amount) / 2)) * scale_;
        if (transfer.resource == TransferReading::Resource::population) {
            const auto colour = alpha(SDL_FColor{.63f, .84f, .86f, 1}, fade);
            for (const float dx : {-1.f, 0.f, 1.f}) {
                const auto x = point.x + dx * size / 3;
                polygon(std::array{SDL_FPoint{x, point.y - size / 3}, SDL_FPoint{x + size / 5, point.y + size / 3},
                    SDL_FPoint{x - size / 5, point.y + size / 3}}, colour);
            }
        } else {
            const SDL_FRect box{point.x - size / 2, point.y - size / 2, size, size};
            quad(enlarged(box, 1), alpha(transfer.require ? slate : gold, fade));
            quad(box, alpha(ink, fade));
            icon(stockIcon(transfer.trait), box, alpha(paper, fade));
        }
    }
}

void CrestLayer::draw(SDL_Renderer* renderer, const RegionalMap& map, const Snapshot& snapshot,
    std::span<const RegionShape> shapes, std::string_view hovered, bool pressed, bool focused,
    RegionalMap::Display display)
{
    update(snapshot, display);
    if (area_.w <= 0 || area_.h <= 0 || (placements_.empty() && snapshot.crests.transfers.empty())) return;
    if (!texture_) {
        const auto& pixels = artwork_->atlas.pixels;
        texture_.reset(SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC,
            pixels.width, pixels.height));
        if (!texture_) return;
        SDL_UpdateTexture(texture_.get(), nullptr, pixels.rgba.data(), 4 * pixels.width);
        SDL_SetTextureScaleMode(texture_.get(), SDL_SCALEMODE_LINEAR);
        SDL_SetTextureBlendMode(texture_.get(), SDL_BLENDMODE_BLEND);
    }
    const bool motion = display.live && !display.reduced;
    const auto elapsed = motion ? (display.now - secondAt_) / 1000. : 0.;
    const auto visualSecond = snapshot.second + elapsed;
    const bool moving = motion && elapsed < 2 && (!snapshot.crests.transfers.empty() ||
        std::ranges::any_of(placements_, [&](const auto& placement) {
            const auto& monster = snapshot.crests.regions[placement.region].monster;
            return monster && monster->repelGain && snapshot.second - monster->repelSecond < 2;
        }));
    if (dirty_ || changedAt_ || moving || lastMoving_ != moving ||
        hovered_ != hovered || pressed_ != pressed || focused_ != focused) {
        vertices_.clear();
        packets(map, snapshot, shapes, visualSecond);
        const auto progress = changedAt_ ? eased(display.now, changedAt_) : 1.f;
        for (const auto& placement : placements_ | std::views::reverse) {
            const auto& row = snapshot.crests.regions[placement.region];
            const auto& region = snapshot.regions[placement.region];
            const auto age = row.monster ? visualSecond - row.monster->repelSecond : -1.;
            const auto recentRepel = row.monster && row.monster->repelGain && age >= 0 && age < 2;
            crest(placement, row, at(placement.region, progress), region, region.id == hovered,
                region.id == hovered && pressed, focused, recentRepel ? 1.f : 0.f);
        }
        for (auto& target : targets_) {
            if (target.part == Part::stock) {
                const auto& stock = snapshot.crests.regions[target.region].stock;
                if (target.stockIndex >= stock.size()) continue;
                const auto& tag = stock[target.stockIndex];
                quad(target.box, stockInk[static_cast<std::size_t>(tag.issue)]);
                const auto box = enlarged(target.box, -1.4f);
                quad(box, ink);
                icon(stockIcon(tag.trait), box, paper);
            } else if (target.part == Part::crown) {
                const auto placement = std::ranges::find(placements_, target.region, &Placement::region);
                if (placement != placements_.end() && placement->full) {
                    const auto x = 13.f + 124.f * static_cast<float>(at(target.region, progress).threshold);
                    target.box.x = placement->box.x + std::clamp(x - 17, 0.f, 116.f) * scale_;
                }
            }
        }
        dirty_ = false;
        hovered_ = hovered;
        pressed_ = pressed;
        focused_ = focused;
        lastMoving_ = moving;
    }
    if (vertices_.empty()) return;
    // Badge placement is already bounded. Only packets follow routes offscreen.
    const bool clipPackets = !snapshot.crests.transfers.empty();
    if (clipPackets) {
        const SDL_Rect clip{static_cast<int>(area_.x), static_cast<int>(area_.y),
            static_cast<int>(area_.w), static_cast<int>(area_.h)};
        SDL_SetRenderClipRect(renderer, &clip);
    }
    SDL_RenderGeometry(renderer, texture_.get(), vertices_.data(), static_cast<int>(vertices_.size()), nullptr, 0);
    if (clipPackets) SDL_SetRenderClipRect(renderer, nullptr);
}

}
