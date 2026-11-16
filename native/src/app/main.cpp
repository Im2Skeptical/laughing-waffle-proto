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

#include <cstddef>
#include <cstdio>
#include <cstring>
#include <string>

#ifdef _MSC_VER
#include <crtdbg.h>
#endif

namespace {

struct NativeApp {
	SDL_Window* window = nullptr;
	SDL_Renderer* renderer = nullptr;
	SdlRmlRenderer* rml_renderer = nullptr;
	bool sdl_started = false;
	bool rml_started = false;

	void ShutdownRml() {
		if (!rml_started) {
			return;
		}
		Rml::Shutdown();
		rml_started = false;
	}

	~NativeApp() {
		// The system interface and this renderer must still be alive.
		ShutdownRml();
		if (renderer) {
			SDL_FlushRenderer(renderer);
		}
		delete rml_renderer;
		rml_renderer = nullptr;
		if (renderer) {
			SDL_DestroyRenderer(renderer);
			renderer = nullptr;
		}
		if (window) {
			SDL_DestroyWindow(window);
			window = nullptr;
		}
		if (sdl_started) {
			SDL_Quit();
			sdl_started = false;
		}
	}
};

int Fail(const char* message) {
	std::fprintf(stderr, "native-demo error: %s\n", message);
	return 1;
}

int VaryingPixels(SDL_Surface* surface) {
	if (!surface || !surface->pixels || surface->w <= 0 || surface->h <= 0 || surface->pitch <= 0) {
		return -1;
	}
	int bpp = SDL_BYTESPERPIXEL(surface->format);
	if (bpp < 3) {
		return -1;
	}
	const auto* bytes = static_cast<const unsigned char*>(surface->pixels);
	const unsigned char r0 = bytes[0];
	const unsigned char g0 = bytes[1];
	const unsigned char b0 = bytes[2];
	int varying = 0;
	for (int y = 0; y < surface->h; ++y) {
		const unsigned char* row = bytes + (static_cast<std::size_t>(y) * static_cast<std::size_t>(surface->pitch));
		for (int x = 0; x < surface->w; ++x) {
			const unsigned char* pixel = row + (static_cast<std::size_t>(x) * static_cast<std::size_t>(bpp));
			const int dr = static_cast<int>(pixel[0]) - static_cast<int>(r0);
			const int dg = static_cast<int>(pixel[1]) - static_cast<int>(g0);
			const int db = static_cast<int>(pixel[2]) - static_cast<int>(b0);
			if (dr > 12 || dr < -12 || dg > 12 || dg < -12 || db > 12 || db < -12) {
				++varying;
			}
		}
	}
	return varying;
}

void DrawFrame(NativeApp& app, Rml::Context* context) {
	context->Update();
	SDL_SetRenderDrawColor(app.renderer, 20, 24, 32, 255);
	SDL_RenderClear(app.renderer);
	context->Render();
}

void HandleEvent(const SDL_Event& event, Rml::Context* context, waffle::DemoSession& session, bool& running) {
	if (event.type == SDL_EVENT_QUIT) {
		running = false;
		return;
	}
	if (event.type == SDL_EVENT_KEY_DOWN && event.key.key == SDLK_ESCAPE) {
		running = false;
		return;
	}
	if (event.type == SDL_EVENT_MOUSE_MOTION) {
		waffle::PointerMove(context, event.motion.x, event.motion.y);
		return;
	}
	if (event.type == SDL_EVENT_MOUSE_BUTTON_DOWN && event.button.button == SDL_BUTTON_LEFT) {
		waffle::PointerMove(context, event.button.x, event.button.y);
		waffle::PointerButton(context, true);
		return;
	}
	if (event.type == SDL_EVENT_MOUSE_BUTTON_UP && event.button.button == SDL_BUTTON_LEFT) {
		waffle::PointerMove(context, event.button.x, event.button.y);
		waffle::PointerButton(context, false);
		return;
	}
	if (event.type == SDL_EVENT_KEY_DOWN && !event.key.repeat &&
		(event.key.key == SDLK_SPACE || event.key.key == SDLK_RETURN)) {
		float x = 0.f;
		float y = 0.f;
		std::string error;
		if (waffle::HitCenter(session, x, y, error)) {
			waffle::PointerMove(context, x, y);
			waffle::PointerButton(context, true);
			waffle::PointerButton(context, false);
		}
	}
}

} // namespace

#ifdef _MSC_VER
void ReportCrtToStderr() {
	// A failed debug check must not sit on a modal dialog.
	_CrtSetReportMode(_CRT_WARN, _CRTDBG_MODE_FILE);
	_CrtSetReportFile(_CRT_WARN, _CRTDBG_FILE_STDERR);
	_CrtSetReportMode(_CRT_ERROR, _CRTDBG_MODE_FILE);
	_CrtSetReportFile(_CRT_ERROR, _CRTDBG_FILE_STDERR);
	_CrtSetReportMode(_CRT_ASSERT, _CRTDBG_MODE_FILE);
	_CrtSetReportFile(_CRT_ASSERT, _CRTDBG_FILE_STDERR);
}
#endif

SDL_AssertState SDLCALL ReportSdlAssert(const SDL_AssertData* data, void* userdata) {
	(void)userdata;
	std::fprintf(stderr, "sdl-assert: %s %s:%d %s\n", data->condition, data->filename, data->linenum, data->function);
	return SDL_ASSERTION_ABORT;
}

int main(int argc, char** argv) {
#ifdef _MSC_VER
	ReportCrtToStderr();
#endif
	bool smoke = false;
	for (int i = 1; i < argc; ++i) {
		if (std::strcmp(argv[i], "--smoke") == 0) {
			smoke = true;
		}
	}

#if defined(__ANDROID__)
	// Touch taps become the same mouse events the desktop probe already handles.
	// This is untested on a device; N02 still owns pause/resume and renderer proof.
	SDL_SetHint(SDL_HINT_TOUCH_MOUSE_EVENTS, "1");
	waffle::SdlAssetFile assets;
#endif
	// Clock outlives the app so Rml::Shutdown can still log.
	waffle::FixedClock clock;
#if !defined(__ANDROID__)
	waffle::Utf8Files files;
#endif
	waffle::DemoSession session; // Outlives NativeApp's shutdown and listener detach.
	NativeApp app;
	if (!SDL_Init(SDL_INIT_VIDEO)) {
		return Fail(SDL_GetError());
	}
	app.sdl_started = true;
	SDL_SetAssertionHandler(ReportSdlAssert, nullptr);
	if (!SDL_CreateWindowAndRenderer("waffle native", 640, 360, 0, &app.window, &app.renderer)) {
		return Fail(SDL_GetError());
	}

#if defined(__ANDROID__)
	// SDL_GetBasePath() is "./" on Android and does not point at APK assets.
	int window_w = 0;
	int window_h = 0;
	if (!SDL_GetWindowSize(app.window, &window_w, &window_h) || window_w <= 0 || window_h <= 0) {
		return Fail("SDL_GetWindowSize failed");
	}
	const std::string rml_path = "ui/demo.rml";
	const std::string font_path = "ui/LatoLatin-Regular.ttf";
#else
	// SDL3 caches this pointer and frees it in SDL_Quit. Do not SDL_free it.
	const char* base = SDL_GetBasePath();
	if (!base) {
		return Fail(SDL_GetError());
	}
	const std::string rml_path = std::string(base) + "assets/ui/demo.rml";
	const std::string font_path = std::string(base) + "assets/ui/LatoLatin-Regular.ttf";
	const int window_w = 640;
	const int window_h = 360;
#endif

	app.rml_renderer = new SdlRmlRenderer(app.renderer);
	Rml::SetSystemInterface(&clock);
#if defined(__ANDROID__)
	Rml::SetFileInterface(&assets);
#else
	Rml::SetFileInterface(&files);
#endif
	Rml::SetRenderInterface(app.rml_renderer);
	if (!Rml::Initialise()) {
		const char* detail = clock.last_error.empty() ? "Rml::Initialise failed" : clock.last_error.c_str();
		return Fail(detail);
	}
	app.rml_started = true;

	Rml::Context* context = Rml::CreateContext("main", Rml::Vector2i(window_w, window_h));
	if (!context) {
		return Fail("Rml::CreateContext failed");
	}
	std::string error;
	if (!waffle::LoadDemo(context, rml_path, font_path, session, error)) {
		if (!clock.last_error.empty()) {
			error += " (" + clock.last_error + ")";
		}
		return Fail(error.c_str());
	}

	if (smoke) {
		DrawFrame(app, context);
		float x = 0.f;
		float y = 0.f;
		if (!waffle::HitCenter(session, x, y, error)) {
			return Fail(error.c_str());
		}
		SDL_Event down{};
		down.type = SDL_EVENT_MOUSE_BUTTON_DOWN;
		down.button.windowID = SDL_GetWindowID(app.window);
		down.button.button = SDL_BUTTON_LEFT;
		down.button.down = true;
		down.button.x = x;
		down.button.y = y;
		SDL_Event up = down;
		up.type = SDL_EVENT_MOUSE_BUTTON_UP;
		up.button.down = false;
		if (!SDL_PushEvent(&down) || !SDL_PushEvent(&up)) {
			return Fail(SDL_GetError());
		}
		SDL_Event event;
		while (SDL_PollEvent(&event)) {
			bool running = true;
			HandleEvent(event, context, session, running);
		}
		DrawFrame(app, context);
		SDL_Surface* shot = SDL_RenderReadPixels(app.renderer, nullptr);
		const int varying = VaryingPixels(shot);
		if (shot) {
			SDL_DestroySurface(shot);
		}
		SDL_RenderPresent(app.renderer);
		const std::string status = waffle::StatusText(session);
		const char* renderer_name = SDL_GetRendererName(app.renderer);
		const bool ok = status == "clicked" && varying > 30 && app.rml_renderer->texture_count() > 0 &&
			app.rml_renderer->draw_count() > 0;
		std::printf("native-smoke ok=%d status=%s renderer=%s varying_pixels=%d textures=%d draws=%d clicks=%d\n",
			ok ? 1 : 0, status.c_str(), renderer_name ? renderer_name : "none", varying,
			app.rml_renderer->texture_count(), app.rml_renderer->draw_count(), session.listener.clicks);
		std::fflush(stdout);
		return ok ? 0 : 1;
	}

	std::printf("native-demo: click Press or press Space. Escape closes.\n");
	std::fflush(stdout);
	bool running = true;
	while (running) {
		SDL_Event event;
		while (SDL_PollEvent(&event)) {
			HandleEvent(event, context, session, running);
		}
		DrawFrame(app, context);
		SDL_RenderPresent(app.renderer);
		SDL_Delay(16);
	}
	return 0;
}
