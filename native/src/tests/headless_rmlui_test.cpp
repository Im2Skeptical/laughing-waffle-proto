#include "../ui/demo_probe.hpp"
#include "../app/frame_stats.hpp"

#include <RmlUi/Core.h>

#include <cmath>
#include <cstdio>
#include <filesystem>
#include <string>
#include <string_view>

namespace {

class CountingRenderer final : public Rml::RenderInterface {
public:
	Rml::CompiledGeometryHandle CompileGeometry(Rml::Span<const Rml::Vertex> vertices, Rml::Span<const int>) override {
		return vertices.empty() ? 0 : ++compiles;
	}
	void RenderGeometry(Rml::CompiledGeometryHandle geometry, Rml::Vector2f, Rml::TextureHandle) override {
		if (geometry) ++draws;
	}
	void ReleaseGeometry(Rml::CompiledGeometryHandle) override {}

	Rml::TextureHandle LoadTexture(Rml::Vector2i& dimensions, const Rml::String& source) override {
		if (source.rfind("images/", 0) != 0) return 0;
		dimensions = {4096, 4096}; // Stub dimensions large enough for all fallback sprite rectangles.
		return ++art;
	}
	Rml::TextureHandle GenerateTexture(Rml::Span<const Rml::byte> source, Rml::Vector2i dimensions) override {
		const auto bytes = static_cast<std::size_t>(dimensions.x) * dimensions.y * 4;
		if (dimensions.x <= 0 || dimensions.y <= 0 || source.size() < bytes) return 0;
		return 10 + ++generated;
	}
	void ReleaseTexture(Rml::TextureHandle) override {}

	void EnableScissorRegion(bool) override {}
	void SetScissorRegion(Rml::Rectanglei) override { ++scissors; }
	void SetTransform(const Rml::Matrix4f* matrix) override { if (matrix) ++transforms; }
	void EnableClipMask(bool enable) override { if (enable) ++masks; }
	Rml::LayerHandle PushLayer() override { ++layers; return 0; }
	Rml::CompiledFilterHandle CompileFilter(const Rml::String&, const Rml::Dictionary&) override { ++filters; return 0; }

	int compiles = 0, draws = 0, art = 0, generated = 0, scissors = 0, transforms = 0, masks = 0, layers = 0, filters = 0;
};

struct RmlLifetime {
	~RmlLifetime() { Rml::Shutdown(); }
};

int Fail(const char* message) {
	std::fprintf(stderr, "headless-rmlui error: %s\n", message);
	return 1;
}

void Click(Rml::Context& context, Rml::Vector2f point) {
	context.ProcessMouseMove(static_cast<int>(point.x), static_cast<int>(point.y), 0);
	context.ProcessMouseButtonDown(0, 0);
	context.ProcessMouseButtonUp(0, 0);
}

int CheckDocument(const std::string& rml_path, const std::string& font_path) {
	waffle::DemoClock clock;
	waffle::Utf8Files files;
	CountingRenderer renderer;
	waffle::DemoSession session;
	Rml::SetSystemInterface(&clock);
	Rml::SetFileInterface(&files);
	Rml::SetRenderInterface(&renderer);
	if (!Rml::Initialise()) return Fail("RmlUi initialization failed");
	RmlLifetime rml;

	auto* context = Rml::CreateContext("headless", {844, 390});
	if (!context) return Fail("RmlUi context creation failed");
	std::string error;
	if (!session.Load(*context, rml_path, font_path, error)) return Fail(error.c_str());
	session.Tick(0);
	session.Update();
	context->Render();
	session.Update();
	context->Render();
	const auto counter = session.Find("base")->GetInnerRML();
	Click(*context, session.Center("card-3"));
	session.Tick(30);
	session.Update();
	if (session.selected_card() != 3 || session.Find("base")->GetInnerRML() == counter) return Fail("card selection or live number failed");

	const auto scroll = session.Find("scroll");
	if (scroll->GetScrollHeight() <= scroll->GetClientHeight()) return Fail("inspector content did not overflow");
	scroll->SetScrollTop(15.f);
	session.Update();
	const float before = scroll->GetScrollTop();
	Click(*context, session.Center("detail"));
	session.Update();
	if (!session.in_ledger() || scroll->GetScrollTop() != 0.f) return Fail("nested inspection failed");
	context->Render();
	Click(*context, session.Center("back"));
	session.Update();
	if (session.in_ledger() || std::abs(scroll->GetScrollTop() - before) > 1.f) return Fail("inspector position was not restored");

	const auto old_center = session.Center("map");
	session.Resize({1024, 600});
	session.Update();
	if (session.Center("map") == old_center || context->GetDimensions() != Rml::Vector2i(1024, 600))
		return Fail("document did not re-layout on resize");
	context->Render();
	if (renderer.art != 5 || !renderer.generated || !renderer.compiles || !renderer.draws || !renderer.scissors ||
		!renderer.transforms || renderer.masks || renderer.layers || renderer.filters)
		return Fail("unexpected renderer features or missing assets");
	std::printf("headless-rmlui ok art=%d fonts=%d draws=%d scissors=%d transforms=%d\n",
		renderer.art, renderer.generated, renderer.draws, renderer.scissors, renderer.transforms);
	return 0;
}

int CheckCamera() {
	waffle::MapCamera camera;
	camera.Pan(20.f, -10.f);
	const float anchor_x = 140.f, anchor_y = 45.f;
	const float old_x = (anchor_x - camera.x) / camera.scale;
	const float old_y = (anchor_y - camera.y) / camera.scale;
	camera.Zoom(2.f, anchor_x, anchor_y);
	if (camera.scale != 2.f || (anchor_x - camera.x) / camera.scale != old_x ||
		(anchor_y - camera.y) / camera.scale != old_y) return Fail("zoom did not preserve the focal point");

	camera.Pan(10000.f, -10000.f);
	if (camera.x != 500.f || camera.y != -220.f) return Fail("pan bounds failed");
	camera.Zoom(100.f, 0.f, 0.f);
	camera.Zoom(100.f, 120.f, 100.f);
	if (camera.scale != 2.5f || camera.x != 625.f || camera.y != -275.f) return Fail("maximum zoom and pan bounds failed");
	camera.Zoom(.001f, 0.f, 0.f);
	if (camera.scale != .75f || std::abs(camera.x) > 187.5f || std::abs(camera.y) > 82.5f)
		return Fail("minimum zoom and pan bounds failed");
	return 0;
}

int CheckFrameStats() {
	std::vector<double> samples;
	for (int n = 100; n >= 1; --n) samples.push_back(n);
	const auto stats = waffle::SummarizeFrameTimes(samples);
	if (stats.p50 != 50 || stats.p95 != 95 || stats.p99 != 99 || stats.max != 100)
		return Fail("benchmark tails did not use nearest ranks");
	const auto single = waffle::SummarizeFrameTimes({4.25});
	if (single.p50 != 4.25 || single.p95 != 4.25 || single.p99 != 4.25 || single.max != 4.25)
		return Fail("benchmark tails for one frame did not match the sample");
	return 0;
}

} // namespace

int main(int argc, char** argv) {
	const std::string_view option = argc > 1 ? argv[1] : "";
	if (option == "--math") {
		const int camera = CheckCamera();
		return camera ? camera : CheckFrameStats();
	}
	if (option != "--utf8-assets") return CheckDocument(WAFFLE_DEMO_RML, WAFFLE_FONT_PATH);

	const auto directory = std::filesystem::current_path() / std::filesystem::u8path(u8"utf8-\u96ea");
	std::filesystem::create_directories(directory);
	const auto rml = directory / "demo.rml", font = directory / "LatoLatin-Regular.ttf";
	std::filesystem::copy_file(WAFFLE_DEMO_RML, rml, std::filesystem::copy_options::overwrite_existing);
	std::filesystem::copy_file(WAFFLE_FONT_PATH, font, std::filesystem::copy_options::overwrite_existing);
	const int result = CheckDocument(rml.u8string(), font.u8string());
	std::filesystem::remove(rml);
	std::filesystem::remove(font);
	std::filesystem::remove(directory);
	return result;
}
