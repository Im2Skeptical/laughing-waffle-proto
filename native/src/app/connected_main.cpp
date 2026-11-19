#if !defined(__ANDROID__)
#define SDL_MAIN_HANDLED
#endif
#include <SDL3/SDL_main.h>

#include "connected_smoke.hpp"
#include "connected_view.hpp"
#include "demo_benchmark.hpp"
#include "frame_stats.hpp"
#include "sdl_asset_file.hpp"
#include "sdl_rml_renderer.hpp"

#include <charconv>
#include <cstdio>
#include <fstream>
#include <memory>
#include <stdexcept>

namespace {

using namespace waffle::connected;
using waffle::core::json::Value;

struct Options {
    Launch launch;
    bool smoke{}, direct{};
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
        else if (arg == "--long-benchmark") options.launch.longBenchmark = true;
        else if (arg == "--seed" && i + 1 < argc) {
            if (!parseNumber(argv[++i], options.launch.seed)) return false;
            options.direct = true;
        } else if (arg == "--load" && i + 1 < argc) {
            options.launch.save = std::filesystem::u8path(argv[++i]);
            options.direct = true;
        } else if (arg == "--capture" && i + 1 < argc) {
            options.capture = argv[++i];
        } else if (arg == "--bench" && i + 1 < argc) {
            if (!parseNumber(argv[++i], options.frames) || !options.frames) return false;
            if (i + 1 < argc && !std::string_view(argv[i + 1]).starts_with("--")) options.report = argv[++i];
        } else return false;
    }
    return !(options.frames && (options.smoke || !options.capture.empty())) &&
        (!options.launch.longBenchmark || (options.frames && options.launch.save.empty()));
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

struct System final : Rml::SystemInterface {
    SDL_Window* window{};
    waffle::DemoClock clock;
    double GetElapsedTime() override { return clock.GetElapsedTime(); }
    bool LogMessage(Rml::Log::Type type, const Rml::String& message) override
    {
        return clock.LogMessage(type, message);
    }
    void ActivateKeyboard(Rml::Vector2f, float) override
    {
        if (!window || SDL_TextInputActive(window)) return;
        const auto props = SDL_CreateProperties();
        SDL_SetNumberProperty(props, SDL_PROP_TEXTINPUT_TYPE_NUMBER, SDL_TEXTINPUT_TYPE_NUMBER);
        SDL_StartTextInputWithProperties(window, props);
        SDL_DestroyProperties(props);
    }
    void DeactivateKeyboard() override
    {
        if (window) SDL_StopTextInput(window);
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

class Lifecycle {
public:
    Lifecycle(Session& session, Shell& shell, View& view, SdlRmlRenderer& renderer)
        : session_(session), shell_(shell), view_(view), renderer_(renderer)
    {
        check(SDL_AddEventWatch(watch, this), SDL_GetError());
    }
    ~Lifecycle() { SDL_RemoveEventWatch(watch, this); }

    void suspend()
    {
        if (session_.suspended()) return;
        const auto start = SDL_GetTicksNS();
        session_.suspend();
        view_.cancelInput();
        Rml::ReleaseTextures(&renderer_);
        const bool written = shell_.autosave();
        if (const auto* live = session_.liveSnapshot()) {
            SDL_Log("N04E pause second=%llu autosave=%d textures=%llu work_ms=%.3f",
                static_cast<unsigned long long>(live->second), written,
                static_cast<unsigned long long>(renderer_.texture_bytes()), elapsed(start));
        }
        resumeStart_ = 0;
        background_ = true;
    }

    void foreground()
    {
        if (!background_) return;
        resumeStart_ = SDL_GetTicksNS();
        background_ = false;
    }

    void update()
    {
        if (!background_ && session_.suspended()) {
            view_.syncWindow();
            session_.resume();
        }
    }

    void presented()
    {
        if (resumeStart_ && !session_.opening() && session_.liveSnapshot()) {
            SDL_Log("N04E resume second=%llu generation=%llu first_present_ms=%.3f",
                static_cast<unsigned long long>(session_.liveSnapshot()->second),
                static_cast<unsigned long long>(session_.generation()), elapsed(resumeStart_));
            resumeStart_ = 0;
        }
    }

    bool background() const { return background_; }

private:
    static bool SDLCALL watch(void* user, SDL_Event* event)
    {
        // SDL's Android lifecycle watcher runs on the SDL event-pump thread,
        // before SDL backs up the EGL context. These events are not queued.
        auto& self = *static_cast<Lifecycle*>(user);
        if (event->type == SDL_EVENT_WILL_ENTER_BACKGROUND) self.suspend();
        else if (event->type == SDL_EVENT_DID_ENTER_FOREGROUND) self.foreground();
        return true;
    }

    Session& session_;
    Shell& shell_;
    View& view_;
    SdlRmlRenderer& renderer_;
    Uint64 resumeStart_{};
    bool background_{};
};

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
        SDL_PumpEvents();
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
    auto process = waffle::ReadDemoMetrics(renderer);
#if defined(__ANDROID__)
    std::ifstream status("/proc/self/status");
    for (std::string line; std::getline(status, line);) {
        unsigned long long kib{};
        if (std::sscanf(line.c_str(), "VmRSS: %llu kB", &kib) == 1) process.working_set = kib * 1024;
    }
#endif
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
    if (options.report.empty()) {
#if defined(__ANDROID__)
        SDL_Log("N04E benchmark %s", json.c_str());
#else
        std::fputs(json.c_str(), stdout);
#endif
    }
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
    if (options.smoke && options.capture.empty()) {
        session.open(options.launch);
        smoke(session, selection, {});
        return 0;
    }
    const bool automated = !options.capture.empty() || options.frames;
    waffle::SdlAssetFile files;
    System system;
    Graphics graphics;
    SDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, "0");
    SDL_SetHint(SDL_HINT_MOUSE_TOUCH_EVENTS, "0");
    SDL_SetHint(SDL_HINT_MOUSE_FOCUS_CLICKTHROUGH, "1");
#if defined(__ANDROID__)
    SDL_SetHint(SDL_HINT_ORIENTATIONS, "LandscapeLeft LandscapeRight");
#endif
    check(SDL_Init(SDL_INIT_VIDEO), SDL_GetError());
    const auto flags = SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY
#if defined(__ANDROID__)
        | SDL_WINDOW_FULLSCREEN
#endif
        ;
    check(SDL_CreateWindowAndRenderer("Laughing Waffle", 1120, 640, flags,
        &graphics.window, &graphics.renderer), SDL_GetError());
#if !defined(__ANDROID__)
    SDL_SetWindowMinimumSize(graphics.window, 820, 450);
#endif
    system.window = graphics.window;
    auto preparingArt = std::async(std::launch::async, prepareArtwork);
    Shell shell(session, selection, options.capture.empty() ? SaveSlots::forUser() :
        SaveSlots(std::filesystem::u8path(options.capture) / "saves"));
    if (automated || options.direct) shell.open(options.launch);
    const bool paced = SDL_SetRenderVSync(graphics.renderer, automated ? 0 : 1);
    graphics.bridge = std::make_unique<SdlRmlRenderer>(graphics.renderer, WAFFLE_ART_ROOT);
    Rml::SetSystemInterface(&system);
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
    View view(*context, graphics.renderer, session, selection, shell, std::move(art));
    const auto present = [&] {
        system.clock.seconds = elapsed(start) / 1000;
        view.frame();
        check(graphics.bridge->error().empty() && system.clock.last_error.empty(),
            graphics.bridge->error() + system.clock.last_error);
        check(SDL_RenderPresent(graphics.renderer), SDL_GetError());
    };
    present();
    const auto first = elapsed(start);
    if (!options.capture.empty()) {
        std::filesystem::create_directories(std::filesystem::u8path(options.capture));
        const auto frame = [&](const char* capture) {
            view.frame();
            if (capture) {
                const std::unique_ptr<SDL_Surface, decltype(&SDL_DestroySurface)> surface(
                    SDL_RenderReadPixels(graphics.renderer, nullptr), SDL_DestroySurface);
                const auto path = options.capture + "/" + capture + ".png";
                check(surface && SDL_SavePNG(surface.get(), path.c_str()), SDL_GetError());
            }
            check(graphics.bridge->error().empty() && system.clock.last_error.empty(),
                graphics.bridge->error() + system.clock.last_error);
            check(SDL_RenderPresent(graphics.renderer), SDL_GetError());
        };
        smoke(session, selection, frame);
        shell.show(Screen::save);
        frame("05-save");
        shell.selectSlot(Slot::first);
        if (shell.overwrite()) shell.selectSlot(Slot::first);
        check(shell.returnToTitle(), "Could not capture the title after saving");
        frame("06-title");
        shell.show(Screen::load);
        frame("07-load");
        return 0;
    }
    if (options.frames) {
        benchmark(graphics.renderer, *graphics.bridge, view, session, selection, options, first, start);
        return 0;
    }
    Lifecycle lifecycle(session, shell, view, *graphics.bridge);
    SDL_Log("N04E first_present_ms=%.3f", first);
    std::optional<Uint64> openingStart;
    for (;;) {
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
#if !defined(__ANDROID__)
            if (event.type == SDL_EVENT_WINDOW_MINIMIZED) lifecycle.suspend();
            if (event.type == SDL_EVENT_WINDOW_RESTORED) lifecycle.foreground();
#endif
            if (event.type == SDL_EVENT_RENDER_DEVICE_RESET) Rml::ReleaseTextures(graphics.bridge.get());
            if ((!lifecycle.background() || event.type == SDL_EVENT_QUIT ||
                    event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED) && !view.input(event)) {
                if (!lifecycle.background()) lifecycle.suspend();
                return 0;
            }
        }
        if (lifecycle.background()) {
            SDL_Delay(25);
            continue;
        }
        lifecycle.update();
        const bool opening = shell.screen() == Screen::game && session.opening();
        if (opening && !openingStart) openingStart = SDL_GetTicksNS();
        shell.update();
        present();
        lifecycle.presented();
        if (openingStart && shell.screen() == Screen::game && !session.opening()) {
            SDL_Log("N04E first_playable_ms=%.3f second=%llu", elapsed(*openingStart),
                static_cast<unsigned long long>(session.liveSnapshot()->second));
            openingStart.reset();
        }
        if (shell.screen() == Screen::title) openingStart.reset();
        if (!paced) SDL_Delay(16);
    }
}

}

int main(int argc, char** argv)
{
    Options options;
    if (!parse(argc, argv, options)) {
        std::fputs("Usage: waffle_native_game [--seed N | --load browser.json] [--smoke | --capture DIR | --bench FRAMES [JSON]]\n", stderr);
        return 2;
    }
    try {
        return run(options);
    } catch (const std::exception& failure) {
#if defined(__ANDROID__)
        SDL_LogError(SDL_LOG_CATEGORY_APPLICATION, "%s", failure.what());
#else
        std::fprintf(stderr, "%s\n", failure.what());
#endif
        return 1;
    }
}
