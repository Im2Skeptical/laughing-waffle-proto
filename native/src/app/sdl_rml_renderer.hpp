#pragma once

#include <RmlUi/Core.h>
#include <SDL3/SDL.h>

#include <memory>
#include <vector>

// SDL3 2D renderer for RmlUi geometry. Translation and scissor are applied.
// Layers, filters, shaders, and clip masks use the base-class no-ops.
class SdlRmlRenderer final : public Rml::RenderInterface {
public:
	explicit SdlRmlRenderer(SDL_Renderer* renderer);
	~SdlRmlRenderer() override;

	Rml::CompiledGeometryHandle CompileGeometry(Rml::Span<const Rml::Vertex> vertices, Rml::Span<const int> indices) override;
	void RenderGeometry(Rml::CompiledGeometryHandle geometry, Rml::Vector2f translation, Rml::TextureHandle texture) override;
	void ReleaseGeometry(Rml::CompiledGeometryHandle geometry) override;

	Rml::TextureHandle LoadTexture(Rml::Vector2i& texture_dimensions, const Rml::String& source) override;
	Rml::TextureHandle GenerateTexture(Rml::Span<const Rml::byte> source, Rml::Vector2i source_dimensions) override;
	void ReleaseTexture(Rml::TextureHandle texture) override;

	void EnableScissorRegion(bool enable) override;
	void SetScissorRegion(Rml::Rectanglei region) override;

	int texture_count() const { return texture_count_; }
	int draw_count() const { return draw_count_; }

private:
	struct Mesh {
		std::vector<SDL_Vertex> vertices;
		std::vector<int> indices;
	};

	void ApplyClip();

	SDL_Renderer* renderer_ = nullptr;
	std::vector<std::unique_ptr<Mesh>> meshes_;
	std::vector<SDL_Texture*> textures_;
	SDL_Rect clip_{};
	bool scissor_ = false;
	int texture_count_ = 0;
	int draw_count_ = 0;
};
