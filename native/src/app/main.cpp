#include "demo_benchmark.hpp"
#include "sdl_rml_renderer.hpp"
#include "../ui/demo_probe.hpp"

#if !defined(__ANDROID__)
#define SDL_MAIN_HANDLED
#endif
#include <SDL3/SDL.h>
#if defined(__ANDROID__)
#include <SDL3/SDL_main.h>
#include "sdl_asset_file.hpp"
#endif

#include <charconv>
#include <cmath>
#include <cstdio>
#include <memory>
#include <optional>
#include <string_view>

#ifdef _MSC_VER
#include <crtdbg.h>
#endif

namespace {

constexpr int start_width = 1120;
constexpr int start_height = 510;
constexpr int slice_art_textures = 5;

struct Options {
	bool smoke = false;
	bool emulate_touch = false;
	int frames = 0;
	std::string json;
	std::string capture;
};

bool ParseOptions(int argc, char** argv, Options& options) {
	for (int i = 1; i < argc; ++i) {
		const std::string_view arg = argv[i];
		if (arg == "--smoke") options.smoke = true;
		else if (arg == "--touch") options.emulate_touch = true;
		else if (arg == "--capture" && i + 1 < argc) options.capture = argv[++i];
		else if (arg == "--bench" && i + 1 < argc) {
			const std::string_view count = argv[++i];
			const auto result = std::from_chars(count.data(), count.data() + count.size(), options.frames);
			if (result.ec != std::errc{} || result.ptr != count.data() + count.size() || options.frames <= 0) return false;
			if (i + 1 < argc && std::string_view(argv[i + 1]).substr(0, 2) != "--") options.json = argv[++i];
		} else return false;
	}
	return (options.capture.empty() || options.smoke) && !(options.smoke && options.frames) &&
		!(options.emulate_touch && (options.smoke || options.frames));
}

struct App {
	SDL_Window* window = nullptr;
	SDL_Renderer* renderer = nullptr;
	std::unique_ptr<SdlRmlRenderer> rml_renderer;
	bool rml_started = false;

	~App() {
		if (rml_started) Rml::Shutdown();
		rml_renderer.reset();
		if (renderer) SDL_DestroyRenderer(renderer);
		if (window) SDL_DestroyWindow(window);
		SDL_Quit();
	}
};

class Input {
public:
	Input(App& app, Rml::Context& context, waffle::DemoSession& session, bool emulate_touch)
		: app_(app), context_(context), session_(session), emulate_touch_(emulate_touch) {}

	bool Handle(SDL_Event event) {
		if (event.type == SDL_EVENT_QUIT || event.type == SDL_EVENT_WINDOW_CLOSE_REQUESTED ||
			(event.type == SDL_EVENT_KEY_DOWN && event.key.key == SDLK_ESCAPE)) return false;
		if (!SDL_ConvertEventToRenderCoordinates(app_.renderer, &event)) return true;
		switch (event.type) {
		case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
			session_.Resize({event.window.data1, event.window.data2});
			session_.Update();
			break;
		case SDL_EVENT_WINDOW_MOUSE_LEAVE:
			context_.ProcessMouseLeave();
			break;
		case SDL_EVENT_WINDOW_FOCUS_LOST:
			if (panning_) EndPan();
			if (finger_) {
				context_.ProcessTouchCancel({{static_cast<Rml::TouchId>(*finger_), last_}});
				finger_.reset();
			} else if (mouse_down_) {
				context_.ProcessMouseLeave();
				context_.ProcessMouseButtonUp(0, 0);
			}
			mouse_down_ = false;
			break;
		case SDL_EVENT_MOUSE_MOTION:
			if (!emulate_touch_ && !finger_ && event.motion.which != SDL_TOUCH_MOUSEID)
				MoveMouse({event.motion.x, event.motion.y});
			break;
		case SDL_EVENT_MOUSE_BUTTON_DOWN:
		case SDL_EVENT_MOUSE_BUTTON_UP:
			if (!emulate_touch_ && !finger_ && event.button.which != SDL_TOUCH_MOUSEID && event.button.button == SDL_BUTTON_LEFT)
				MouseButton({event.button.x, event.button.y}, event.type == SDL_EVENT_MOUSE_BUTTON_DOWN);
			break;
		case SDL_EVENT_MOUSE_WHEEL:
			if (!finger_ && !mouse_down_) {
				const float sign = event.wheel.direction == SDL_MOUSEWHEEL_FLIPPED ? -1.f : 1.f;
				Wheel({event.wheel.mouse_x, event.wheel.mouse_y}, {event.wheel.x * sign, event.wheel.y * sign});
			}
			break;
		case SDL_EVENT_FINGER_DOWN:
		case SDL_EVENT_FINGER_MOTION:
		case SDL_EVENT_FINGER_UP:
		case SDL_EVENT_FINGER_CANCELED:
			Finger(event.tfinger);
			break;
		default: break;
		}
		return true;
	}

	void MoveMouse(Rml::Vector2f point) {
		if (panning_) {
			session_.Pan(point - last_);
			last_ = point;
		} else {
			context_.ProcessMouseMove(static_cast<int>(point.x), static_cast<int>(point.y), 0);
		}
	}

	void MouseButton(Rml::Vector2f point, bool down) {
		mouse_down_ = down;
		if (down && session_.CanPan(point)) {
			StartPan(point);
		} else if (panning_) {
			MoveMouse(point);
			EndPan();
		} else {
			MoveMouse(point);
			if (down) context_.ProcessMouseButtonDown(0, 0);
			else context_.ProcessMouseButtonUp(0, 0);
		}
	}

	void Wheel(Rml::Vector2f point, Rml::Vector2f delta) {
		if (session_.InMap(point)) {
			session_.Zoom(std::pow(1.17f, delta.y), point);
		} else {
			MoveMouse(point);
			context_.ProcessMouseWheel(-delta, 0);
		}
	}

	void Click(const char* id) {
		const auto point = session_.Center(id);
		MouseButton(point, true);
		MouseButton(point, false);
	}

private:
	void StartPan(Rml::Vector2f point) {
		panning_ = true;
		last_ = point;
		session_.SetPanning(true);
	}

	void EndPan() {
		panning_ = false;
		session_.SetPanning(false);
	}

	void Finger(const SDL_TouchFingerEvent& event) {
		const Rml::Vector2f point{event.x, event.y};
		const auto id = static_cast<Rml::TouchId>(event.fingerID);
		if (event.type == SDL_EVENT_FINGER_DOWN) {
			if (finger_ || mouse_down_) return;
			finger_ = event.fingerID;
			last_ = point;
			if (session_.CanPan(point)) StartPan(point);
			else context_.ProcessTouchStart({{id, point}}, 0);
			return;
		}
		if (!finger_ || *finger_ != event.fingerID) return;

		if (event.type == SDL_EVENT_FINGER_MOTION) {
			if (panning_) MoveMouse(point);
			else context_.ProcessTouchMove({{id, point}}, 0);
			last_ = point;
			return;
		}
		if (panning_) {
			if (event.type == SDL_EVENT_FINGER_UP) MoveMouse(point);
			EndPan();
		} else if (event.type == SDL_EVENT_FINGER_CANCELED) {
			context_.ProcessTouchCancel({{id, point}});
		} else {
			context_.ProcessTouchEnd({{id, point}}, 0);
		}
		finger_.reset();
	}

	App& app_;
	Rml::Context& context_;
	waffle::DemoSession& session_;
	bool emulate_touch_;
	bool mouse_down_ = false;
	bool panning_ = false;
	std::optional<SDL_FingerID> finger_;
	Rml::Vector2f last_{};
};

int Fail(const std::string& message) {
	std::fprintf(stderr, "native-demo error: %s\n", message.c_str());
	return 1;
}

double Milliseconds(Uint64 start, Uint64 end) { return static_cast<double>(end - start) / 1e6; }

bool DrawFrame(App& app, Rml::Context& context, waffle::DemoSession& session, waffle::DemoClock& clock,
	Uint64 start, std::uint64_t frame) {
	clock.seconds = static_cast<double>(SDL_GetTicksNS() - start) / 1e9;
	session.Tick(frame);
	session.Update();
	if (!SDL_SetRenderDrawColor(app.renderer, 21, 25, 24, 255) || !SDL_RenderClear(app.renderer)) return false;
	context.Render();
	return app.rml_renderer->error().empty() && SDL_FlushRenderer(app.renderer);
}

bool InjectTouch(App& app, Input& input, Uint32 type, Rml::Vector2f point) {
	int width = 0, height = 0;
	if (!SDL_GetWindowSize(app.window, &width, &height) || width <= 0 || height <= 0) return false;
	float x = 0, y = 0;
	if (!SDL_RenderCoordinatesToWindow(app.renderer, point.x, point.y, &x, &y)) return false;
	SDL_Event event{};
	event.type = type;
	event.tfinger.windowID = SDL_GetWindowID(app.window);
	event.tfinger.touchID = SDL_MOUSE_TOUCHID;
	event.tfinger.fingerID = 1;
	event.tfinger.x = x / width;
	event.tfinger.y = y / height;
	if (!SDL_PushEvent(&event)) return false;
	while (SDL_PollEvent(&event)) {
		if (!input.Handle(event)) return false;
	}
	return true;
}

using Surface = std::unique_ptr<SDL_Surface, decltype(&SDL_DestroySurface)>;

Surface Readback(App& app, const std::string& directory, const char* name) {
	Surface shot(SDL_RenderReadPixels(app.renderer, nullptr), SDL_DestroySurface);
	if (shot && !directory.empty() && !SDL_SaveBMP(shot.get(), (directory + "/" + name + ".bmp").c_str())) shot.reset();
	return shot;
}

std::uint64_t PixelHash(SDL_Surface& surface, SDL_Rect region) {
	const auto* bytes = static_cast<const Uint8*>(surface.pixels);
	const int bpp = SDL_BYTESPERPIXEL(surface.format);
	std::uint64_t hash = 0;
	for (int y = region.y; y < region.y + region.h; ++y) {
		for (int x = region.x * bpp; x < (region.x + region.w) * bpp; ++x) {
			hash = hash * 31 + bytes[y * surface.pitch + x];
		}
	}
	return hash;
}

int Smoke(App& app, Input& input, Rml::Context& context, waffle::DemoSession& session, waffle::DemoClock& clock,
	Uint64 start, const std::string& capture) {
	const auto initial = context.GetDimensions();
	const auto center = session.Center("map");
	const auto map_box = session.Find("map")->GetBox().GetSize(Rml::BoxArea::Border);
	const SDL_Rect map_region{int(center.x - 100), int(center.y - 55), 200, 110};
	const SDL_Rect below_map{int(center.x - 30), int(center.y + map_box.y / 2.f + 1), 60, 3};
	if (map_region.x < 0 || map_region.y < 0 || below_map.y + below_map.h > initial.y ||
		map_region.x + map_region.w > initial.x) return Fail("map viewport was not laid out inside the window");

	if (!DrawFrame(app, context, session, clock, start, 0)) return Fail(app.rml_renderer->error());
	const auto first = Readback(app, capture, "overview");
	if (!first) return Fail("overview readback failed");
	const auto map_hash = PixelHash(*first, map_region);
	const auto clip_hash = PixelHash(*first, below_map);
	const auto count = session.Find("base")->GetInnerRML();

	const auto card_point = session.Center("card-1");
	if (!InjectTouch(app, input, SDL_EVENT_FINGER_DOWN, card_point) ||
		!session.Find("card-1")->IsPseudoClassSet("active")) return Fail("finger press did not activate the card");
	if (!InjectTouch(app, input, SDL_EVENT_FINGER_UP, card_point) ||
		session.selected_card() != 1) return Fail("touch did not select Logging");
	session.Update();

	const auto scroll = session.Find("scroll");
	const auto scroll_point = session.Center("scroll");
	if (!InjectTouch(app, input, SDL_EVENT_FINGER_DOWN, scroll_point + Rml::Vector2f(0, 30)) ||
		!InjectTouch(app, input, SDL_EVENT_FINGER_MOTION, scroll_point - Rml::Vector2f(0, 20)) ||
		!InjectTouch(app, input, SDL_EVENT_FINGER_UP, scroll_point - Rml::Vector2f(0, 20)) ||
		scroll->GetScrollTop() <= 0.f) return Fail("finger did not scroll the inspector");
	input.Wheel(scroll_point, {0.f, 10.f});
	session.Update();
	if (scroll->GetScrollTop() != 0.f) return Fail("wheel did not scroll the inspector");
	input.Click("card-0");
	session.Update();
	scroll->SetScrollTop(20.f);
	session.Update();
	const float prior_scroll = scroll->GetScrollTop();
	input.Click("detail");
	session.Update();
	if (!session.in_ledger() || scroll->GetScrollTop() != 0.f) return Fail("nested inspector did not open at the top");

	if (!InjectTouch(app, input, SDL_EVENT_FINGER_DOWN, center) || !session.Find("map")->IsClassSet("panning") ||
		!InjectTouch(app, input, SDL_EVENT_FINGER_MOTION, center + Rml::Vector2f(36, 20)) ||
		!InjectTouch(app, input, SDL_EVENT_FINGER_UP, center + Rml::Vector2f(36, 20)) ||
		session.camera().x < 20.f || session.Find("map")->IsClassSet("panning")) return Fail("finger did not pan the map");
	input.Wheel(center, {0, 1});
	if (session.camera().scale <= 1.f) return Fail("wheel did not zoom the map");
	if (!DrawFrame(app, context, session, clock, start, 119)) return Fail(app.rml_renderer->error());
	const auto second = Readback(app, {}, "ledger");
	if (!second || PixelHash(*second, map_region) == map_hash || PixelHash(*second, below_map) != clip_hash)
		return Fail("map readback did not change inside the viewport while staying clipped");
	if (count == session.Find("base")->GetInnerRML()) return Fail("counter did not change");
	input.Click("back");
	session.Update();
	if (session.in_ledger() || std::abs(scroll->GetScrollTop() - prior_scroll) > 1.f)
		return Fail("Back did not restore inspection position");
	if (!SDL_RenderPresent(app.renderer)) return Fail(SDL_GetError());

	if (!SDL_SetWindowSize(app.window, 844, 390) || !SDL_SyncWindow(app.window)) return Fail(SDL_GetError());
	SDL_Event event;
	while (SDL_PollEvent(&event)) {
		if (!input.Handle(event)) return Fail("window closed during resize");
	}
	if (context.GetDimensions() == initial || session.Center("map") == center || !DrawFrame(app, context, session, clock, start, 120) ||
		!SDL_RenderPresent(app.renderer)) return Fail("resize did not relayout the slice");

	const auto zoom_point = session.Center("zoom-out");
	const float scale = session.camera().scale;
	if (!InjectTouch(app, input, SDL_EVENT_FINGER_DOWN, zoom_point) ||
		!InjectTouch(app, input, SDL_EVENT_FINGER_UP, zoom_point) || session.camera().scale >= scale) {
		return Fail("touch zoom button did not work after resize");
	}
	if (!capture.empty()) {
		input.Click("detail");
		if (!session.in_ledger() || !DrawFrame(app, context, session, clock, start, 121) ||
			!Readback(app, capture, "ledger") || !SDL_RenderPresent(app.renderer)) return Fail("resized ledger capture failed");
	}

	const bool ok = app.rml_renderer->art_count() == slice_art_textures && app.rml_renderer->draw_count() > 0;
	std::printf("native-smoke ok=%d renderer=%s art_textures=%d draws=%d touch=card,scroll,pan,zoom mouse=inspect,scroll,zoom clipped=1 resize=%dx%d\n",
		ok, SDL_GetRendererName(app.renderer), app.rml_renderer->art_count(), app.rml_renderer->draw_count(),
		context.GetDimensions().x, context.GetDimensions().y);
	return ok ? 0 : 1;
}

void ScriptFrame(int frame, Input& input, waffle::DemoSession& session) {
	const int phase = frame % 120;
	const float direction = frame % 240 < 120 ? 1.f : -1.f;
	const auto map = session.Center("map");
	const auto scroll = session.Center("scroll");
	if (phase == 0) input.MouseButton(map, true);
	else if (phase < 30) input.MoveMouse(map + Rml::Vector2f(phase, phase * .33f) * direction);
	else if (phase == 30) input.MouseButton(map + Rml::Vector2f(29, 10) * direction, false);
	else if (phase == 32) input.Wheel(map, {0, direction});
	else if (phase >= 34 && phase <= 48) input.Wheel(scroll, {0, -.25f});
	else if (phase >= 49 && phase <= 59) input.Wheel(scroll, {0, .5f});
	else if (phase == 60) input.Click("detail");
	else if (phase >= 64 && phase <= 83) input.Wheel(scroll, {0, -.25f});
	else if (phase >= 84 && phase <= 99) input.Wheel(scroll, {0, .5f});
	else if (phase == 100) input.Click("back");
}

int Benchmark(App& app, Input& input, Rml::Context& context, waffle::DemoSession& session, waffle::DemoClock& clock,
	Uint64 start, const Options& options) {
	waffle::DemoBenchmark bench;
	bench.startup_ms = Milliseconds(start, SDL_GetTicksNS());
	bench.frame_ms.reserve(options.frames);
	bench.cpu_frame_ms.reserve(options.frames);
	for (int i = 0; i < options.frames; ++i) {
		const auto begin = SDL_GetTicksNS();
		SDL_Event event;
		while (SDL_PollEvent(&event)) {
			if (!input.Handle(event)) return Fail("window closed during benchmark");
		}
		ScriptFrame(i, input, session);
		if (!DrawFrame(app, context, session, clock, start, static_cast<std::uint64_t>(i) + 1)) return Fail(app.rml_renderer->error());
		if ((i % 120 == 60 && !session.in_ledger()) || (i % 120 == 100 && session.in_ledger()))
			return Fail("scripted inspector navigation missed its target");
		if ((i % 120 == 48 || i % 120 == 83) && session.Find("scroll")->GetScrollTop() <= 0.f)
			return Fail("scripted inspector scroll did not move");
		const auto cpu_end = SDL_GetTicksNS();
		if (!SDL_RenderPresent(app.renderer)) return Fail(SDL_GetError());
		const auto end = SDL_GetTicksNS();
		bench.cpu_frame_ms.push_back(Milliseconds(begin, cpu_end));
		bench.frame_ms.push_back(Milliseconds(begin, end));
	}
	const auto size = context.GetDimensions();
	if (!bench.Write(options.json, app.renderer, size.x, size.y, app.rml_renderer->texture_bytes(),
		app.rml_renderer->peak_texture_bytes())) return Fail("could not write benchmark JSON");
	return 0;
}

SDL_AssertState SDLCALL ReportSdlAssert(const SDL_AssertData* data, void*) {
	std::fprintf(stderr, "sdl-assert: %s %s:%d %s\n", data->condition, data->filename, data->linenum, data->function);
	return SDL_ASSERTION_ABORT;
}

} // namespace

int main(int argc, char** argv) {
	const auto start = SDL_GetTicksNS();
#ifdef _MSC_VER
	for (const int type : {_CRT_WARN, _CRT_ERROR, _CRT_ASSERT}) {
		_CrtSetReportMode(type, _CRTDBG_MODE_FILE);
		_CrtSetReportFile(type, _CRTDBG_FILE_STDERR);
	}
#endif
	Options options;
	if (!ParseOptions(argc, argv, options)) return Fail("usage: waffle_native_demo [--touch | --smoke [--capture directory] | --bench frames [json]]");

	SDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, "0");
	SDL_SetHint(SDL_HINT_MOUSE_TOUCH_EVENTS, options.emulate_touch ? "1" : "0");
	SDL_SetHint(SDL_HINT_MOUSE_FOCUS_CLICKTHROUGH, "1");
#if defined(__ANDROID__)
	waffle::SdlAssetFile files;
#else
	waffle::Utf8Files files;
#endif
	waffle::DemoClock clock;
	waffle::DemoSession session;
	App app; // RmlUi shuts down before the session, clock and file interface.
	if (!SDL_Init(SDL_INIT_VIDEO)) return Fail(SDL_GetError());
	SDL_SetAssertionHandler(ReportSdlAssert, nullptr);
	if (!SDL_CreateWindowAndRenderer("Greywater Reach", start_width, start_height,
		SDL_WINDOW_RESIZABLE | SDL_WINDOW_HIGH_PIXEL_DENSITY, &app.window, &app.renderer)) return Fail(SDL_GetError());
	SDL_SetWindowMinimumSize(app.window, 720, 330);

	const bool automated = options.smoke || options.frames > 0;
	const bool paced = SDL_SetRenderVSync(app.renderer, automated ? 0 : 1);
	if (!paced && automated) return Fail(SDL_GetError());
	if (!SDL_SetRenderDrawBlendMode(app.renderer, SDL_BLENDMODE_BLEND_PREMULTIPLIED)) return Fail(SDL_GetError());

#if defined(__ANDROID__)
	const std::string ui_path = "ui/";
	const std::string art_root;
#else
	const char* base = SDL_GetBasePath();
	if (!base) return Fail(SDL_GetError());
	const std::string ui_path = std::string(base) + "assets/ui/";
	const std::string art_root = WAFFLE_ART_ROOT;
#endif
	app.rml_renderer = std::make_unique<SdlRmlRenderer>(app.renderer, art_root);
	Rml::SetSystemInterface(&clock);
	Rml::SetFileInterface(&files);
	Rml::SetRenderInterface(app.rml_renderer.get());
	if (!Rml::Initialise()) return Fail("RmlUi initialization failed: " + clock.last_error);
	app.rml_started = true;

	int width = 0, height = 0;
	if (!SDL_GetRenderOutputSize(app.renderer, &width, &height)) return Fail(SDL_GetError());
	auto* context = Rml::CreateContext("main", {width, height});
	if (!context) return Fail("could not create RmlUi context");
	context->SetDefaultScrollBehavior(automated ? Rml::ScrollBehavior::Instant : Rml::ScrollBehavior::Smooth, 1.f);
	std::string error;
	if (!session.Load(*context, ui_path + "demo.rml", ui_path + "LatoLatin-Regular.ttf", error)) return Fail(error);
	Input input(app, *context, session, options.emulate_touch);
	if (options.smoke) return Smoke(app, input, *context, session, clock, start, options.capture);
	if (!DrawFrame(app, *context, session, clock, start, 0)) return Fail(app.rml_renderer->error());
	if (!SDL_RenderPresent(app.renderer)) return Fail(SDL_GetError());
	if (app.rml_renderer->art_count() != slice_art_textures) return Fail("slice artwork is incomplete");
	if (options.frames) return Benchmark(app, input, *context, session, clock, start, options);

	for (std::uint64_t frame = 1; ; ++frame) {
		SDL_Event event;
		while (SDL_PollEvent(&event)) {
			if (!input.Handle(event)) return 0;
		}
		if (!DrawFrame(app, *context, session, clock, start, frame)) return Fail(app.rml_renderer->error());
		if (!SDL_RenderPresent(app.renderer)) return Fail(SDL_GetError());
		if (!paced) SDL_Delay(16);
	}
}
