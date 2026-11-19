#define SDL_MAIN_HANDLED
#include "connected_smoke.hpp"
#include "connected_view.hpp"
#include "demo_benchmark.hpp"
#include "frame_stats.hpp"
#include "sdl_rml_renderer.hpp"

#include <charconv>
#include <cstdio>
#include <memory>
#include <stdexcept>

namespace {

using namespace waffle::connected;
using waffle::core::json::Value;

struct Options {
    Launch launch;
    bool smoke{};
    unsigned frames{};
    std::string capture, report;
    std::filesystem::path saveSmokeDirectory;
};

template<class T>
bool parseNumber(std::string_view text, T& value)
{
    const auto result = std::from_chars(text.data(), text.data() + text.size(), value);
    return result.ec == std::errc{} && result.ptr == text.data() + text.size();
}

bool parse(int argc, char** argv, Options& options)
{
    for (int i = 1; i < argc; ++i) {
        const std::string_view arg = argv[i];
        if (arg == "--smoke") options.smoke = true;
        else if (arg == "--save-smoke" && i + 1 < argc) options.saveSmokeDirectory = std::filesystem::u8path(argv[++i]);
        else if (arg == "--seed" && i + 1 < argc) {
            if (!parseNumber(argv[++i], options.launch.seed)) return false;
        } else if (arg == "--load" && i + 1 < argc) {
            options.launch.save = std::filesystem::u8path(argv[++i]);
        } else if (arg == "--capture" && i + 1 < argc) {
            options.capture = argv[++i];
        } else if (arg == "--bench" && i + 1 < argc) {
            if (!parseNumber(argv[++i], options.frames) || !options.frames) return false;
            if (i + 1 < argc && !std::string_view(argv[i + 1]).starts_with("--")) options.report = argv[++i];
        } else return false;
    }
    return !(options.frames && (options.smoke || !options.capture.empty()));
}

struct Graphics {
    SDL_Window* window{};
    SDL_Renderer* renderer{};
    std::unique_ptr<SdlRmlRenderer> bridge;
    bool initialized{};
    ~Graphics()
    {
        if (initialized) Rml::Shutdown();
        bridge.reset();
        if (renderer) SDL_DestroyRenderer(renderer);
        if (window) SDL_DestroyWindow(window);
        SDL_Quit();
    }
};

void check(bool ok, std::string error)
{
    if (!ok) throw std::runtime_error(error);
}

double elapsed(Uint64 start, Uint64 end = SDL_GetTicksNS())
{
    return static_cast<double>(end - start) / 1e6;
}

Value stats(const std::vector<double>& samples)
{
    if (samples.empty()) return {};
    const auto data = waffle::SummarizeFrameTimes(samples);
    return Value(Value::Object{{"p50", Value(data.p50)}, {"p95", Value(data.p95)},
        {"p99", Value(data.p99)}, {"max", Value(data.max)}});
}

void benchmark(SDL_Renderer* renderer, SdlRmlRenderer& bridge, View& view, Session& session, Selection& selection,
    const Options& options, double startup, Uint64 start)
{
    const auto present = [&] {
        view.frame();
        check(SDL_RenderPresent(renderer), SDL_GetError());
    };
    waitFor(session, [&] { return !session.opening(); }, [&](const char*) { present(); });
    const double ready = elapsed(start);
    preparePracticeShop(session, selection, [&](const char*) { present(); });

    // Exercise the same graph pointer path once before timing the replacement.
    waitFor(session, [&] {
        return session.chart().through && *session.chart().through > session.liveSnapshot()->second + 3;
    }, [&](const char*) { present(); });
    present();
    const auto warm = view.plot();
    view.scrubAt(warm.x + warm.w * .75f);
    waitFor(session, [&] { return session.previewReady(); }, [&](const char*) { present(); });
    session.live();
    selection.stage(session.displayed(), 1);
    check(session.reorder(selection.region, *selection.card, *selection.destination), "Could not start benchmark Practice action");
    selection.destination.reset();
    selection.card.reset();

    std::vector<double> frames, renders, summaries, restoreRender, visible, scrubFrames;
    std::vector<double> loadedVisible, loadedFrames;
    std::vector<Second> targets;
    std::optional<Uint64> input;
    bool inputLoaded = false;
    unsigned inputFrame{}, frame{};
    Uint64 available{}, complete{};
    Second lastTarget = 0;
    const auto generation = session.generation();
    const auto forecastStarted = SDL_GetTicksNS();
    for (; frame < options.frames; ++frame) {
        const auto frameStart = SDL_GetTicksNS();
        const auto coverage = session.coverage();
        const bool loaded = !session.busy() && coverage && coverage->generation != generation;
        const bool forecasting = loaded && coverage->completion == waffle::timegraph::Completion::running;
        if (loaded && !available) available = frameStart;
        if (loaded && !forecasting && !complete) complete = frameStart;
        if (loaded && session.chart().through && !input && (forecasting || visible.size() < 64)) {
            const auto& chart = session.chart();
            const auto cap = *chart.through;
            const auto live = session.liveSnapshot()->second;
            if (cap > live + 3) {
                // Spread offsets across anchors and vary the residual 0..63 steps.
                const auto target = live + 1 + (static_cast<Second>(frame) * 137) % (cap - live);
                const auto area = view.plot();
                const auto x = area.x + area.w * static_cast<float>(static_cast<double>(target - chart.start) /
                    static_cast<double>(chart.end - chart.start));
                if (target != lastTarget && view.scrubAt(x)) {
                    input = frameStart;
                    inputLoaded = forecasting;
                    inputFrame = frame;
                    lastTarget = target;
                }
            }
        }
        const auto summaryBefore = session.chart().through;
        session.update();
        const auto renderStart = SDL_GetTicksNS();
        present();
        const auto end = SDL_GetTicksNS();
        if (forecasting) {
            frames.push_back(elapsed(frameStart, end));
            renders.push_back(elapsed(renderStart, end));
            if (session.chart().through != summaryBefore) summaries.push_back(session.summaryMs());
        }
        if (input && session.previewReady()) {
            targets.push_back(session.displayed()->second);
            restoreRender.push_back(elapsed(renderStart, end));
            visible.push_back(elapsed(*input, end));
            scrubFrames.push_back(frame - inputFrame + 1.);
            if (inputLoaded) {
                loadedVisible.push_back(visible.back());
                loadedFrames.push_back(scrubFrames.back());
            }
            input.reset();
        }
        if (loaded && !forecasting && visible.size() >= 64 && session.chart().through == coverage->publishedThrough) break;
        if (!session.error().empty()) throw std::runtime_error(session.error());
    }
    const auto final = session.coverage();
    check(final && final->publishedThrough && !frames.empty() && !visible.empty(), "Benchmark did not sample replacement and scrubs");
    const auto process = waffle::ReadDemoMetrics(renderer);
    const auto reconstructed = session.benchmarkReconstruction(targets);
    for (std::size_t i = 0; i < restoreRender.size(); ++i) restoreRender[i] += reconstructed[i];
    const auto backend = SDL_GetRendererName(renderer);
    const Value result(Value::Object{
        {"startup_first_present_ms", Value(startup)}, {"startup_interactive_ms", Value(ready)},
        {"replacement_job_ms", Value(elapsed(forecastStarted, available))},
        {"replacement_forecast_ms", complete ? Value(elapsed(available, complete)) : Value()},
        {"published_through", Value(static_cast<double>(*final->publishedThrough))},
        {"target_sec", Value(static_cast<double>(final->target))},
        {"completion", Value(std::array{"running", "horizon", "terminal", "storageLimit", "retained", "failed"}
            [static_cast<std::size_t>(final->completion)])},
        {"frames_forecasting", Value(static_cast<double>(frames.size()))},
        {"scrubs", Value(static_cast<double>(visible.size()))},
        {"scrubs_started_during_forecast", Value(static_cast<double>(loadedVisible.size()))},
        {"summary_batches", Value(static_cast<double>(summaries.size()))},
        {"frame_ms", stats(frames)}, {"summary_transfer_ms", stats(summaries)},
        {"render_present_ms", stats(renders)}, {"isolated_reconstruction_ms", stats(reconstructed)},
        {"reconstruction_plus_render_ms", stats(restoreRender)},
        {"scrub_to_present_ms", stats(visible)}, {"scrub_to_present_frames", stats(scrubFrames)},
        {"loaded_scrub_to_present_ms", stats(loadedVisible)}, {"loaded_scrub_to_present_frames", stats(loadedFrames)},
        {"working_set_bytes", Value(static_cast<double>(process.working_set.value_or(0)))},
        {"private_bytes", Value(static_cast<double>(process.private_bytes.value_or(0)))},
        {"forecast_charged_bytes", Value(static_cast<double>(session.storage().chargedBytes()))},
        {"texture_bytes", Value(static_cast<double>(bridge.texture_bytes()))},
        {"backend", Value(backend ? backend : "")}, {"gpu", Value(process.gpu)}});
    const auto json = waffle::core::json::stringify(result) + "\n";
    if (options.report.empty()) std::fputs(json.c_str(), stdout);
    else check(SDL_SaveFile(options.report.c_str(), json.data(), json.size()), SDL_GetError());
}

int run(const Options& options)
{
    const auto start = SDL_GetTicksNS();
    if (!options.saveSmokeDirectory.empty()) {
        saveSmoke(options.launch, options.saveSmokeDirectory);
        return 0;
    }
    Session session;
    Selection selection;
    session.open(options.launch);
    if (options.smoke && options.capture.empty()) {
        smoke(session, selection, {});
        return 0;
    }
    auto preparingArt = std::async(std::launch::async, prepareArtwork);
    const bool automated = !options.capture.empty() || options.frames;
    waffle::Utf8Files files;
    waffle::DemoClock clock;
    Graphics graphics;
    SDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, "1");
    SDL_SetHint(SDL_HINT_MOUSE_FOCUS_CLICKTHROUGH, "1");
    check(SDL_Init(SDL_INIT_VIDEO), SDL_GetError());
    check(SDL_CreateWindowAndRenderer("Laughing Waffle", 1120, 640, SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY,
        &graphics.window, &graphics.renderer), SDL_GetError());
    SDL_SetWindowMinimumSize(graphics.window, 820, 450);
    const bool paced = SDL_SetRenderVSync(graphics.renderer, automated ? 0 : 1);
    graphics.bridge = std::make_unique<SdlRmlRenderer>(graphics.renderer, WAFFLE_ART_ROOT);
    Rml::SetSystemInterface(&clock);
    Rml::SetFileInterface(&files);
    Rml::SetRenderInterface(graphics.bridge.get());
    check(Rml::Initialise(), "Could not initialize RmlUi");
    graphics.initialized = true;
    int width{}, height{};
    check(SDL_GetRenderOutputSize(graphics.renderer, &width, &height), SDL_GetError());
    auto* context = Rml::CreateContext("connected", {width, height});
    check(context != nullptr, "Could not create RmlUi context");
    auto art = preparingArt.get();
    graphics.bridge->SetPreparedAtlas({art.width, art.height}, std::move(art.rgba));
    View view(*context, graphics.renderer, session, selection, options.launch, std::move(art));
    const auto present = [&] {
        clock.seconds = elapsed(start) / 1000;
        view.frame();
        check(graphics.bridge->error().empty() && clock.last_error.empty(), graphics.bridge->error() + clock.last_error);
        check(SDL_RenderPresent(graphics.renderer), SDL_GetError());
    };
    present();
    const auto first = elapsed(start);
    if (!options.capture.empty()) {
        std::filesystem::create_directories(std::filesystem::u8path(options.capture));
        smoke(session, selection, [&](const char* capture) {
            view.frame();
            if (capture) {
                const std::unique_ptr<SDL_Surface, decltype(&SDL_DestroySurface)> surface(
                    SDL_RenderReadPixels(graphics.renderer, nullptr), SDL_DestroySurface);
                const auto path = options.capture + "/" + capture + ".png";
                check(surface && SDL_SavePNG(surface.get(), path.c_str()), SDL_GetError());
            }
            check(graphics.bridge->error().empty() && clock.last_error.empty(), graphics.bridge->error() + clock.last_error);
            check(SDL_RenderPresent(graphics.renderer), SDL_GetError());
        });
        return 0;
    }
    if (options.frames) {
        benchmark(graphics.renderer, *graphics.bridge, view, session, selection, options, first, start);
        return 0;
    }
    for (;;) {
        SDL_Event event;
        while (SDL_PollEvent(&event)) if (!view.input(event)) return 0;
        session.update();
        present();
        if (!paced) SDL_Delay(16);
    }
}

}

int main(int argc, char** argv)
{
    Options options;
    if (!parse(argc, argv, options)) {
        std::fputs("Usage: waffle_native_game [--seed N | --load browser.json] [--smoke [--capture DIR] | --bench FRAMES [JSON]]\n", stderr);
        return 2;
    }
    try {
        return run(options);
    } catch (const std::exception& failure) {
        std::fprintf(stderr, "%s\n", failure.what());
        return 1;
    }
}
