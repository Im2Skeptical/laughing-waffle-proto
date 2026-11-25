#include "connected_atmosphere.hpp"
#include "connected_water.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>

namespace waffle::connected {
namespace {

using Colour = std::array<float, 4>;
constexpr float turn = 6.283185307179586f;

float unit(float x) { return std::clamp(x, 0.f, 1.f); }
float mix(float a, float b, float t) { return a + (b - a) * t; }
float smooth(float lo, float hi, float x)
{
    const auto t = unit((x - lo) / (hi - lo));
    return t * t * (3 - 2 * t);
}

// The browser's drift hash and quintic interpolation. A table avoids the
// polynomial and modulus at each corner of every noise sample.
float noise(float x, float y, float z)
{
    static constexpr auto permutation = [] {
        std::array<int, 578> table{};
        for (int i = 0; i < 578; ++i) table[i] = ((i * 34 + 1) * i) % 289;
        return table;
    }();
    const auto fade = [](float t) { return t * t * t * (t * (t * 6 - 15) + 10); };
    const auto wrap = [](int i) { const int r = i % 289; return r < 0 ? r + 289 : r; };
    const int ix = static_cast<int>(std::floor(x)), iy = static_cast<int>(std::floor(y)), iz = static_cast<int>(std::floor(z));
    const auto fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
    const int a = permutation[wrap(ix)], b = permutation[wrap(ix + 1)];
    const int c = wrap(iy), d = wrap(iy + 1), e = wrap(iz), f = wrap(iz + 1);
    const int ac = permutation[a + c], ad = permutation[a + d], bc = permutation[b + c], bd = permutation[b + d];
    const auto layer = [&](int k) {
        return mix(mix(float(permutation[ac + k]), float(permutation[bc + k]), fx),
            mix(float(permutation[ad + k]), float(permutation[bd + k]), fx), fy);
    };
    return mix(layer(e), layer(f), fz) / 144.f - 1;
}

void over(Colour& under, Colour above, float amount)
{
    const auto alpha = above[3] * amount;
    for (int i = 0; i < 3; ++i) under[i] = mix(under[i], above[i], alpha);
    under[3] = mix(under[3], 1.f, alpha);
}

void store(std::uint8_t* pixel, Colour value)
{
    for (int i = 0; i < 4; ++i) pixel[i] = static_cast<std::uint8_t>(unit(value[i]) * 255 + .5f);
}

struct WeatherTime {
    explicit WeatherTime(Second seconds, std::uint32_t seed)
        : time(static_cast<float>(seconds)), weather(time * .18f), salt((seed % 997) * .713f),
          driftX(time / 110 + .18f * std::sin(time / 317)), driftY(time / 197 + .25f * std::sin(time / 941)),
          windX(time * .48f + 18 * std::sin(time / 173)), windY(time * .13f + 24 * std::sin(time / 269)),
          evolve(time / 237), fogTime(time / 181),
          threshold(.55f + .035f * std::sin(time / 311 + salt) + .025f * std::sin(time / 947 + salt * .3f)),
          cloudX(weather * .36f + 22 * std::sin(weather / 173)),
          cloudY(weather * .09f + 19 * std::sin(weather / 269)) {}

    float time, weather, salt, driftX, driftY, windX, windY, evolve, fogTime, threshold, cloudX, cloudY;

    Colour density(float x, float y, bool fog, bool wisps) const
    {
        const auto u = (x - windX) / 93 + salt, v = (y - windY) / 71;
        const auto wx = noise(u * .73f + 19, v * .73f - 37, evolve * .31f);
        const auto wy = noise(u * .61f - 53, v * .61f + 17, evolve * .29f + 31);
        Colour field{};
        if (wisps) {
            const auto qx = u + wx * 1.25f, qy = v + wy * 1.25f;
            const auto a = noise(qx * .8f - qy * .6f, qx * .6f + qy * .8f, evolve);
            const auto b = noise(qx * 1.72f + qy * 1.31f - 41, -qx * 1.31f + qy * 1.72f + 29, evolve * .73f + 11);
            const auto c = noise(qx * 4.7f + 73, qy * 4.7f - 13, evolve * .61f + 47);
            field[0] = smooth(threshold, threshold + .24f, .5f + .5f * (a * .52f + b * .32f + c * .16f));
            field[2] = unit(.64f + a * .20f + c * .12f);
        }
        if (fog) {
            const auto fx = (x * .8f - y * .6f) / 110 + wx * .7f, fy = (x * .6f + y * .8f) / 97 + wy * .7f;
            field[1] = .5f + .5f * (.73f * noise(fx + salt + time * .0007f, fy, fogTime) +
                .27f * noise(fx * 2.1f + 73, fy * 2.1f - salt, fogTime * .61f));
        }
        return field;
    }

    float dissolve(float alpha, float distance, float x, float y) const
    {
        if (alpha <= 0 || distance <= -65) return 0;
        if (distance >= 160) return 1;
        const auto broad = noise(x / 220 + salt * .1f, y / 220 - 29, weather / 1200);
        const auto local = noise((x * .8f - y * .6f) / 100 - 51, (x * .6f + y * .8f) / 100 + salt * .1f, weather / 2700 + 17);
        const auto centre = 32 + 30 * broad + 12 * local, half = 56 + 6 * local;
        const auto clearance = smooth(centre - half, centre + half, distance) * smooth(-65, -30, distance);
        if (clearance == 0 || clearance == 1) return clearance;
        const auto u = (x - cloudX) / 26, v = (y - cloudY) / 26, z = weather / 347 + salt * .1f;
        const auto warp = noise(u * .31f + 17, v * .31f - 39, z * .37f);
        const auto structure = .5f + .5f * (.78f * noise(u + warp * .8f, v - warp * .6f, z) +
            .22f * noise(u * 2.7f - 31, v * 2.7f + 73, z * .71f + 19));
        const auto threshold = 1.12f * (1 - clearance) - .06f;
        return smooth(threshold - .045f, threshold + .045f, .40f * unit(alpha / .78f) + .60f * structure);
    }
};

struct CloudFamily {
    int columns, frames, sx, sy;
    float chance, cadence, minWidth, maxWidth, aspect, minSpeed, maxSpeed, heading, alpha, warp, shear, develop, evolution;
};

// Authored cloud families, cell coordinates, lifetimes and shuffle bags from
// cloud-weather.js. Cloud art and time are independent of the simulation RNG.
constexpr std::array<CloudFamily, 3> families{{
    {2, 4, 600, 440, .85f, 4050, 360, 520, 1, .10f, .22f, .16f, .78f, .012f, .018f, .10f, 1300},
    {4, 8, 520, 390, .90f, 3300, 400, 580, 1, .13f, .29f, .03f, .78f, .017f, .035f, .14f, 950},
    {4, 8, 390, 300, .65f, 3750, 160, 270, .95f, .08f, .19f, .24f, .70f, .014f, .020f, .12f, 1250}
}};

int cloudFrame(std::uint32_t seed, int generation, int count)
{
    const int index = (generation % count + count) % count, bag = (generation - index) / count;
    const auto shuffled = [&](int n) {
        std::array<int, 8> frames{};
        std::iota(frames.begin(), frames.end(), 0);
        const auto salt = seed ^ (static_cast<std::uint32_t>(n) * 1013904223u);
        for (int i = count - 1; i > 0; --i)
            std::swap(frames[i], frames[static_cast<int>(decorationRandom(salt, i + 91) * (i + 1))]);
        return frames;
    };
    auto frames = shuffled(bag);
    if (frames[0] == shuffled(bag - 1)[count - 1]) std::swap(frames[0], frames[1]);
    return frames[index];
}

float opening(float x, float y, const WeatherTime& time)
{
    const auto u = (x - time.weather * .025f) / 720 + time.salt * .1f, v = (y - time.weather * .008f) / 470 - 19;
    const auto warp = noise(u * .63f + 31, v * .63f - 11, time.weather / 5000);
    const auto open = smooth(-.06f, .30f, noise(u + warp * .3f, v - warp * .25f, time.weather / 4000 + 7));
    return unit(open + 1.2f * noise(x / 85 + time.salt * .1f, y / 85 + 37, time.weather / 1800) * open * (1 - open));
}

struct Bank {
    int family, frame;
    float x, y, w, h, rotation, phase, age, threshold, radius, shear;
};

std::vector<Bank> cloudBanks(const MapTerrain& terrain, std::uint32_t seed, const WeatherTime& time)
{
    std::vector<Bank> banks;
    const auto x0 = static_cast<float>(terrain.origin[0]), y0 = static_cast<float>(terrain.origin[1]);
    const auto x1 = x0 + terrain.full.width, y1 = y0 + terrain.full.height / 2;
    for (int family = 0; family < static_cast<int>(families.size()); ++family) {
        const auto& p = families[family];
        const auto reach = p.cadence * 1.8f * p.maxSpeed + p.maxWidth + std::max(p.sx, p.sy) * .4f + 100;
        const int left = static_cast<int>(std::floor((x0 - reach) / p.sx)), right = static_cast<int>(std::ceil((x1 + reach) / p.sx));
        const int top = static_cast<int>(std::floor((y0 - reach) / p.sy)), bottom = static_cast<int>(std::ceil((y1 + reach) / p.sy));
        for (int row = top; row <= bottom; ++row) for (int col = left; col <= right; ++col) {
            const auto cell = seed ^ (static_cast<std::uint32_t>(col) * 73856093u) ^
                (static_cast<std::uint32_t>(row) * 19349663u) ^ ((family + 1) * 83492791u);
            const auto cadence = p.cadence * (.8f + .4f * static_cast<float>(decorationRandom(cell, 0)));
            const auto offset = cadence * static_cast<float>(decorationRandom(cell, 1));
            const int epoch = static_cast<int>(std::floor((time.weather + offset) / cadence));
            for (int generation = epoch - 1; generation <= epoch; ++generation) {
                const auto episode = cell ^ (static_cast<std::uint32_t>(generation) * 1640531513u);
                unsigned sample = 10;
                const auto rng = [&] { return static_cast<float>(decorationRandom(episode, sample++)); };
                if (rng() > p.chance) continue;
                const auto birth = generation * cadence - offset;
                const auto lifetime = cadence * (1.05f + .45f * rng());
                const auto age = time.weather - birth, fraction = age / lifetime;
                if (fraction <= 0 || fraction >= 1) continue;
                const auto life = smooth(0, .24f, fraction) * (1 - smooth(.72f, 1, fraction));
                const auto phase = rng() * 79, variation = rng();
                const auto anchorX = col * p.sx + (rng() - .5f) * p.sx * .72f;
                const auto anchorY = row * p.sy + (rng() - .5f) * p.sy * .72f;
                const auto speed = std::lerp(p.minSpeed, p.maxSpeed, rng());
                const auto angle = p.heading + (rng() - .5f) * .42f + .16f * noise(col * .2f, row * .2f, birth / 3600);
                const auto meander = family == 0 ? 28 : 38;
                const auto x = anchorX + age * speed * std::cos(angle) + meander * noise(phase, 19, age / (lifetime * .7f));
                const auto y = anchorY + age * speed * std::sin(angle) + meander * noise(73, phase, age / (lifetime * .9f));
                const auto w = std::lerp(p.minWidth, p.maxWidth, rng()) * (1 - p.develop + p.develop * smooth(0, .55f, fraction));
                const auto h = w * p.aspect * (.86f + rng() * .28f), radius = std::sqrt(w * w + h * h) / 2;
                if (x + radius < x0 || x - radius > x1 || y + radius < y0 || y - radius > y1) continue;
                const auto open = opening(x, y, time);
                const auto available = family == 2 ? smooth(.22f, .72f, open) : 1 - open;
                if (available <= 0) continue;
                banks.push_back({family, cloudFrame(cell, generation, p.frames), x, y, w, h, (variation - .5f) * .4f,
                    phase, age / p.evolution, (1 - std::min(life, available)) * 1.12f - .06f, radius, p.shear * (fraction - .35f)});
            }
        }
    }
    return banks;
}

void paintBanks(std::vector<Colour>& pixels, const MapArtwork& art, const MapTerrain& terrain,
    const WeatherTime& time, std::uint32_t seed)
{
    const int width = terrain.weatherWidth, height = terrain.weatherHeight;
    pixels.assign(terrain.weather.size(), {});
    const auto dx = static_cast<float>(terrain.full.width) / width;
    const auto dy = static_cast<float>(terrain.full.height / 2) / height;
    const auto x0 = static_cast<float>(terrain.origin[0]) + dx * .5f;
    const auto y0 = static_cast<float>(terrain.origin[1]) + dy * .5f;
    for (const auto& bank : cloudBanks(terrain, seed, time)) {
        if (bank.threshold >= 1.065f) continue;
        const auto& p = families[bank.family];
        const auto& sheet = art.clouds[bank.family];
        const auto cw = sheet.width / p.columns, ch = sheet.height / 2;
        const auto cx = bank.frame % p.columns * cw, cy = bank.frame / p.columns * ch;
        const auto sine = std::sin(bank.rotation), cosine = std::cos(bank.rotation);
        const int left = std::max(0, static_cast<int>(std::floor((bank.x - bank.radius - x0) / dx)));
        const int right = std::min(width, static_cast<int>(std::ceil((bank.x + bank.radius - x0) / dx)));
        const int top = std::max(0, static_cast<int>(std::floor((bank.y - bank.radius - y0) / dy)));
        const int bottom = std::min(height, static_cast<int>(std::ceil((bank.y + bank.radius - y0) / dy)));
        for (int y = top; y < bottom; ++y) for (int x = left; x < right; ++x) {
            const auto i = y * width + x;
            if (terrain.weather[i].distance <= -65) continue;
            const auto wx = x0 + x * dx, wy = y0 + y * dy, px = wx - bank.x, py = wy - bank.y;
            auto u = (px * cosine + py * sine) / bank.w + .5f;
            auto v = (-px * sine + py * cosine) / bank.h + .5f;
            if (u < -.03f || u > 1.03f || v < -.03f || v > 1.03f) continue;
            const auto a = noise(u * 2.2f + bank.phase, v * 2.2f + 13, bank.age);
            const auto b = noise(u * 3 + 31, v * 3 + bank.phase, bank.age * .73f);
            v += b * p.warp;
            u += a * p.warp + (v - .5f) * bank.shear;
            if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
            const auto* texel = sheet.at(cx + static_cast<int>(u * cw), cy + static_cast<int>(v * ch));
            if (texel[3] == 0) continue;
            const Colour source{texel[0] / 255.f, texel[1] / 255.f, texel[2] / 255.f, texel[3] / 255.f};
            const auto fine = noise(u * 9 + 53, v * 9 + bank.phase, bank.age * .5f);
            const auto luminance = source[0] * .299f + source[1] * .587f + source[2] * .114f;
            const auto resistance = .25f * source[3] + .25f * luminance + .25f + .125f * (a + fine);
            const auto erosion = smooth(bank.threshold - .065f, bank.threshold + .065f, resistance);
            over(pixels[i], source, erosion * p.alpha);
        }
    }
    for (int y = 0; y < height; ++y) for (int x = 0; x < width; ++x) {
        const auto i = y * width + x;
        const auto alpha = pixels[i][3];
        if (!alpha) continue;
        const auto dissolve = time.dissolve(alpha, terrain.weather[i].distance, x0 + x * dx, y0 + y * dy);
        for (int ch = 0; ch < 3; ++ch) pixels[i][ch] /= alpha;
        pixels[i][3] *= dissolve;
    }
}

void paintSky(MapPixels& image, std::vector<Colour>& banks, std::vector<Colour>& density,
    const MapArtwork& art, const MapTerrain& terrain,
    std::uint32_t seed, const WeatherTime& time, MapGraphics options)
{
    if (options.clouds || options.shadows) paintBanks(banks, art, terrain, time, seed);
    const auto dx = static_cast<float>(terrain.full.width) / image.width;
    const auto dy = static_cast<float>(terrain.full.height / 2) / image.height;
    density.resize(terrain.weather.size());
    for (int y = 0; y < image.height; ++y) for (int x = 0; x < image.width; ++x) {
        const auto i = y * image.width + x;
        const auto& mask = terrain.weather[i];
        const auto wx = static_cast<float>(terrain.origin[0]) + (x + .5f) * dx;
        const auto wy = static_cast<float>(terrain.origin[1]) + (y + .5f) * dy;
        const auto fog = options.fog && mask.fog > 0;
        const auto wisps = (options.wisps || options.shadows) && mask.edge > 0;
        density[i] = fog || wisps ? time.density(wx, wy, fog, wisps) : Colour{};
    }
    for (int y = 0; y < image.height; ++y) for (int x = 0; x < image.width; ++x) {
        const auto i = y * image.width + x;
        const auto& mask = terrain.weather[i];
        Colour result{};
        if (options.shadows && mask.edge > 0) {
            const auto sx = std::max(0.f, x - 18 / dx), sy = std::max(0.f, y - 12 / dy);
            const auto ix = static_cast<int>(sx), iy = static_cast<int>(sy);
            const auto source = iy * image.width + ix;
            const auto shadow = [&](const auto& layer, int ch) {
                const auto fx = sx - ix, fy = sy - iy;
                return mix(mix(layer[source][ch], layer[source + 1][ch], fx),
                    mix(layer[source + image.width][ch], layer[source + image.width + 1][ch], fx), fy);
            };
            const auto wisp = shadow(density, 0);
            const auto bank = shadow(banks, 3);
            over(result, {.11f, .16f, .19f, 1}, (1 - (1 - .16f * bank) * (1 - .105f * wisp)) * mask.edge);
        }
        const auto& field = density[i];
        if (options.fog) over(result, {.59f, .64f, .66f, 1}, mask.fog * (.18f + field[1] * .57f));
        if (options.wisps) over(result, {.60f + .24f * field[2], .66f + .20f * field[2], .67f + .12f * field[2], 1},
            field[0] * .07f * mask.edge);
        if (options.clouds) over(result, banks[i], mask.edge);
        store(image.at(x, y), result);
    }
}

std::array<float, 3> waterDrift(float x, float y, const WeatherTime& time, bool peat)
{
    auto p = time.driftX, q = time.driftY;
    if (peat) { x = x * 3.1f - 223; y = y * 3.1f + 151; p *= .4f; q *= .4f; }
    const auto u = x / 145 + noise(x / 260, y / 260, p * .37f) * 1.15f;
    const auto v = y / 145 + noise(x / 260 + 31, y / 260 - 17, q * .41f) * 1.15f;
    const auto a = .72f * noise(u, v, p) + .28f * noise((u * .8f - v * .6f) * 2.1f + 19, (u * .6f + v * .8f) * 2.1f - 43, q + 11);
    const auto b = noise(u * .57f + v * .49f + 73, -u * .49f + v * .57f - 29, q + 47);
    return {3 * a - 2 * b, (6 * a + 2 * b) * (peat ? .65f : 1.f), (-3 * a + 4 * b) * (peat ? .32f : 1.f)};
}

void paintWater(MapPixels& image, const MapTerrain& terrain, std::uint32_t seed, const WeatherTime& time)
{
    const auto dx = static_cast<float>(terrain.full.width) / image.width;
    const auto dy = static_cast<float>(terrain.full.height / 2) / image.height;
    const WeatherTime zero(0, seed);
    const auto palette = animateOcean(time.time);
    for (int y = 0; y < image.height; ++y) for (int x = 0; x < image.width; ++x) {
        const auto& cell = terrain.weather[y * image.width + x];
        auto* pixel = image.at(x, y);
        if (!cell.water) { std::fill_n(pixel, 4, 0); continue; }
        const auto wx = static_cast<float>(terrain.origin[0]) + (x + .5f) * dx;
        const auto wy = static_cast<float>(terrain.origin[1]) + (y + .5f) * dy;
        const auto peat = cell.surface == MapTerrain::Surface::pool;
        const auto drift = waterDrift(wx, wy, time, peat), still = waterDrift(wx, wy, zero, peat);
        // Preserve the static substrate while changing the analytic palette
        // at its original strengths. Later overlays attenuate earlier ramps.
        std::array<float, 3> difference{};
        for (std::size_t n = 0; n < cell.waterIndex.size(); ++n) {
            const auto index = cell.waterIndex[n];
            const auto ramp = oceanRampFor(index);
            const auto before = oceanRamps[ramp][index % 32], after = palette[cell.waterVariant][ramp][index % 32];
            const auto weight = cell.waterStrength[n] / 255.f;
            for (int ch = 0; ch < 3; ++ch) {
                const auto shift = 16 - ch * 8;
                difference[ch] = mix(difference[ch], static_cast<float>(static_cast<int>(after >> shift & 255) -
                    static_cast<int>(before >> shift & 255)), weight);
            }
        }
        if (peat) {
            const auto phase = (wy + wx * .22f + std::sin(wx / 83) * 6) / 17 * turn;
            difference.fill((std::sin(phase - time.time * .11f) - std::sin(phase)) * 4);
        }
        for (int ch = 0; ch < 3; ++ch)
            pixel[ch] = static_cast<std::uint8_t>(std::clamp(cell.colour[ch] + drift[ch] - still[ch] + difference[ch], 0.f, 255.f) *
                cell.water + .5f);
        pixel[3] = static_cast<std::uint8_t>(cell.water * 255 + .5f);
    }
}

}

void MapAtmosphere::release()
{
    water_.reset();
    sky_.reset();
    sampled_.reset();
    bytes_ = 0;
    obsolete_ = true;
}

MapAtmosphere::Frame MapAtmosphere::paint(const MapArtwork& art, const MapTerrain& terrain,
    std::uint32_t seed, Second phase, MapGraphics graphics)
{
    Frame frame{{}, {}, phase};
    const auto layer = [&] {
        return MapPixels{terrain.weatherWidth, terrain.weatherHeight, std::vector<std::uint8_t>(terrain.weather.size() * 4)};
    };
    const WeatherTime time(phase, seed);
    if (graphics.water && phase) {
        frame.water = layer();
        paintWater(frame.water, terrain, seed, time);
    }
    if (graphics.sky()) {
        frame.sky = layer();
        std::vector<Colour> banks, density;
        paintSky(frame.sky, banks, density, art, terrain, seed, time, graphics);
    }
    return frame;
}

void MapAtmosphere::upload(SDL_Renderer* renderer, const Frame& frame, Uint64 now)
{
    const auto updateTexture = [&](Texture& texture, const MapPixels& data) {
        if (data.rgba.empty()) { texture.reset(); return; }
        if (!texture) {
            texture.reset(SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STREAMING, data.width, data.height));
            if (!texture) throw std::runtime_error(SDL_GetError());
            SDL_SetTextureScaleMode(texture.get(), SDL_SCALEMODE_LINEAR);
            SDL_SetTextureBlendMode(texture.get(), SDL_BLENDMODE_BLEND_PREMULTIPLIED);
        }
        if (!SDL_UpdateTexture(texture.get(), nullptr, data.rgba.data(), data.width * 4))
            throw std::runtime_error(SDL_GetError());
    };
    updateTexture(water_, frame.water);
    updateTexture(sky_, frame.sky);
    bytes_ = frame.water.rgba.size() + frame.sky.rgba.size();
    sampled_ = frame.phase;
    lastPaint_ = now;
    ++samples_;
}

void MapAtmosphere::update(SDL_Renderer* renderer, const std::shared_ptr<const MapArtwork>& art,
    const std::shared_ptr<const MapTerrain>& terrain, std::uint32_t seed, Second second, Uint64 now,
    MapGraphics graphics, bool reduced)
{
    const auto phase = reduced || (!graphics.water && !graphics.sky()) ? Second{} : second;
    const auto immediate = !sampled_ || graphics != graphics_ || reduced != reduced_;
    if (pending_.valid() && pending_.wait_for(std::chrono::seconds(0)) == std::future_status::ready) {
        auto frame = pending_.get();
        if (!immediate && !obsolete_) upload(renderer, frame, now);
    }
    if (immediate) {
        // Settings and foreground restoration take effect on this very draw.
        // A pending sample belongs to the old settings or device lifetime.
        obsolete_ = true;
        graphics_ = graphics;
        reduced_ = reduced;
        upload(renderer, paint(*art, *terrain, seed, phase, graphics), now);
    } else if (*sampled_ != phase && now - lastPaint_ >= 34 && !pending_.valid()) {
        // Build the disposable atmosphere texture away from the late restore
        // and present path. Only the immutable atlas and viewed time cross.
        obsolete_ = false;
        pending_ = std::async(std::launch::async, [art, terrain, seed, phase, graphics] {
            return paint(*art, *terrain, seed, phase, graphics);
        });
    }
}

void MapAtmosphere::drawWater(SDL_Renderer* renderer, const SDL_FRect& destination) const
{
    if (water_) SDL_RenderTexture(renderer, water_.get(), nullptr, &destination);
}

void MapAtmosphere::drawSky(SDL_Renderer* renderer, const SDL_FRect& destination) const
{
    if (sky_) SDL_RenderTexture(renderer, sky_.get(), nullptr, &destination);
}

std::size_t MapAtmosphere::textureBytes() const
{
    return bytes_;
}

}
