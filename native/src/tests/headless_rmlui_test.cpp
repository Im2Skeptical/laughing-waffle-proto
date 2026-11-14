#include "../ui/demo_probe.hpp"

#include <RmlUi/Core.h>

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>

namespace {

class CountingRenderer final : public Rml::RenderInterface {
public:
	Rml::CompiledGeometryHandle CompileGeometry(Rml::Span<const Rml::Vertex> vertices, Rml::Span<const int> indices) override {
		(void)indices;
		if (vertices.size() == 0) {
			return 0;
		}
		++compiles;
		return static_cast<Rml::CompiledGeometryHandle>(compiles);
	}

	void RenderGeometry(Rml::CompiledGeometryHandle geometry, Rml::Vector2f translation, Rml::TextureHandle texture) override {
		(void)translation;
		(void)texture;
		if (geometry != 0) {
			++draws;
		}
	}

	void ReleaseGeometry(Rml::CompiledGeometryHandle geometry) override {
		(void)geometry;
	}

	Rml::TextureHandle LoadTexture(Rml::Vector2i& texture_dimensions, const Rml::String& source) override {
		(void)source;
		texture_dimensions = Rml::Vector2i(0, 0);
		return 0;
	}

	Rml::TextureHandle GenerateTexture(Rml::Span<const Rml::byte> source, Rml::Vector2i source_dimensions) override {
		++generate_calls;
		last_w = source_dimensions.x;
		last_h = source_dimensions.y;
		last_bytes = static_cast<int>(source.size());
		if (source_dimensions.x <= 0 || source_dimensions.y <= 0) {
			return 0;
		}
		const std::size_t expected = static_cast<std::size_t>(source_dimensions.x) * static_cast<std::size_t>(source_dimensions.y) * 4u;
		if (source.size() < expected) {
			return 0;
		}
		++textures;
		texture_w = source_dimensions.x;
		texture_h = source_dimensions.y;
		return static_cast<Rml::TextureHandle>(textures);
	}

	void ReleaseTexture(Rml::TextureHandle texture) override {
		(void)texture;
	}

	void EnableScissorRegion(bool enable) override {
		(void)enable;
	}

	void SetScissorRegion(Rml::Rectanglei region) override {
		(void)region;
	}

	int compiles = 0;
	int draws = 0;
	int textures = 0;
	int texture_w = 0;
	int texture_h = 0;
	int generate_calls = 0;
	int last_w = 0;
	int last_h = 0;
	int last_bytes = 0;
};

int Fail(const char* message) {
	std::fprintf(stderr, "headless-rmlui error: %s\n", message);
	return 1;
}

} // namespace

int main(int argc, char** argv) {
	std::string rml_path = WAFFLE_DEMO_RML, font_path = WAFFLE_FONT_PATH;
	std::filesystem::path utf8_dir;
	if (argc > 1 && std::strcmp(argv[1], "--utf8-assets") == 0) {
		utf8_dir = std::filesystem::current_path() / std::filesystem::u8path(u8"utf8-\u96ea");
		std::filesystem::create_directories(utf8_dir);
		const auto rml = utf8_dir / "demo.rml", font = utf8_dir / "LatoLatin-Regular.ttf";
		std::filesystem::copy_file(rml_path, rml, std::filesystem::copy_options::overwrite_existing);
		std::filesystem::copy_file(font_path, font, std::filesystem::copy_options::overwrite_existing);
		rml_path = rml.u8string(); font_path = font.u8string();
	}
	waffle::FixedClock clock;
	waffle::Utf8Files files;
	CountingRenderer renderer;
	Rml::SetSystemInterface(&clock);
	Rml::SetFileInterface(&files);
	Rml::SetRenderInterface(&renderer);
	if (!Rml::Initialise()) {
		return Fail(clock.last_error.empty() ? "Rml::Initialise failed" : clock.last_error.c_str());
	}

	Rml::Context* context = Rml::CreateContext("headless", Rml::Vector2i(640, 360));
	if (!context) {
		Rml::Shutdown();
		return Fail("Rml::CreateContext failed");
	}

	waffle::DemoSession session;
	std::string error;
	if (!waffle::LoadDemo(context, rml_path, font_path, session, error)) {
		if (!clock.last_error.empty()) {
			error += " (" + clock.last_error + ")";
		}
		Rml::Shutdown();
		return Fail(error.c_str());
	}
	if (waffle::StatusText(session) != "ready") {
		Rml::Shutdown();
		return Fail("initial status was not ready");
	}

	context->Update();
	context->Render();
	context->Update();
	context->Render();
	if (renderer.textures < 1 || renderer.texture_w < 1 || renderer.texture_h < 1) {
		std::fprintf(stderr, "headless-rmlui detail: generates=%d last=%dx%d bytes=%d compiles=%d draws=%d log=%s\n",
			renderer.generate_calls, renderer.last_w, renderer.last_h, renderer.last_bytes, renderer.compiles, renderer.draws,
			clock.log.c_str());
		Rml::Shutdown();
		return Fail("font texture was not generated");
	}
	if (renderer.compiles < 1 || renderer.draws < 1) {
		Rml::Shutdown();
		return Fail("document produced no geometry");
	}

	float x = 0.f;
	float y = 0.f;
	if (!waffle::HitCenter(session, x, y, error)) {
		Rml::Shutdown();
		return Fail(error.c_str());
	}
	waffle::PointerMove(context, x, y);
	waffle::PointerButton(context, true);
	waffle::PointerButton(context, false);
	context->Update();
	const std::string status = waffle::StatusText(session);
	const bool ok = status == "clicked" && session.listener.clicks == 1;
	std::printf(
		"headless-rmlui ok=%d status=ready->%s geometry=%d textures=%d texture=%dx%d draws=%d clicks=%d\n",
		ok ? 1 : 0, status.c_str(), renderer.compiles, renderer.textures, renderer.texture_w, renderer.texture_h,
		renderer.draws, session.listener.clicks);
	std::fflush(stdout);
	Rml::Shutdown();
	if (!utf8_dir.empty()) {
		std::filesystem::remove(utf8_dir / "demo.rml");
		std::filesystem::remove(utf8_dir / "LatoLatin-Regular.ttf");
		std::filesystem::remove(utf8_dir);
	}
	return ok ? 0 : 1;
}
