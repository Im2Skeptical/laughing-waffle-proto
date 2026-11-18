#pragma once

#include <RmlUi/Core.h>
#include <SDL3/SDL.h>

#include <cstdint>
#include <string>
#include <vector>

// The slice uses premultiplied geometry, affine transforms, and rectangular scissors.
class SdlRmlRenderer final : public Rml::RenderInterface {
public:
	SdlRmlRenderer(SDL_Renderer* renderer, std::string art_root);

	Rml::CompiledGeometryHandle CompileGeometry(Rml::Span<const Rml::Vertex> vertices, Rml::Span<const int> indices) override;
	void RenderGeometry(Rml::CompiledGeometryHandle geometry, Rml::Vector2f translation, Rml::TextureHandle texture) override;
	void ReleaseGeometry(Rml::CompiledGeometryHandle geometry) override;
	Rml::TextureHandle LoadTexture(Rml::Vector2i& dimensions, const Rml::String& source) override;
	Rml::TextureHandle GenerateTexture(Rml::Span<const Rml::byte> source, Rml::Vector2i dimensions) override;
	void ReleaseTexture(Rml::TextureHandle texture) override;
	void EnableScissorRegion(bool enable) override;
	void SetScissorRegion(Rml::Rectanglei region) override;
	void SetTransform(const Rml::Matrix4f* transform) override;

	int art_count() const { return art_count_; }
	int draw_count() const { return draw_count_; }
	std::uint64_t texture_bytes() const { return texture_bytes_; }
	std::uint64_t peak_texture_bytes() const { return peak_texture_bytes_; }
	const std::string& error() const { return error_; }

private:
	struct Mesh {
		std::vector<SDL_Vertex> vertices;
		std::vector<int> indices;
	};
	struct Texture {
		SDL_Texture* handle;
		std::uint64_t bytes;
	};

	SDL_Renderer* renderer_;
	std::string art_root_;
	std::string error_;
	std::vector<SDL_Vertex> draw_vertices_;
	Rml::Matrix4f transform_ = Rml::Matrix4f::Identity();
	bool transformed_ = false;
	int art_count_ = 0;
	int draw_count_ = 0;
	std::uint64_t texture_bytes_ = 0;
	std::uint64_t peak_texture_bytes_ = 0;
};
