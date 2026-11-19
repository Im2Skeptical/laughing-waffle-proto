#include "sdl_rml_renderer.hpp"

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_NO_STDIO
#define STBI_MAX_DIMENSIONS 4096
#include <stb_image.h>

#include <algorithm>
#include <limits>
#include <memory>
#include <utility>

SdlRmlRenderer::SdlRmlRenderer(SDL_Renderer* renderer, std::string art_root)
	: renderer_(renderer), art_root_(std::move(art_root)) {}

void SdlRmlRenderer::SetPreparedAtlas(Rml::Vector2i size, std::vector<Rml::byte> pixels) {
	atlas_size_ = size;
	atlas_pixels_ = std::move(pixels);
}

Rml::CompiledGeometryHandle SdlRmlRenderer::CompileGeometry(Rml::Span<const Rml::Vertex> vertices, Rml::Span<const int> indices) {
	auto mesh = std::make_unique<Mesh>();
	mesh->vertices.reserve(vertices.size());
	for (const Rml::Vertex& vertex : vertices) {
		const auto& color = vertex.colour;
		mesh->vertices.push_back({
			{vertex.position.x, vertex.position.y},
			{color.red / 255.f, color.green / 255.f, color.blue / 255.f, color.alpha / 255.f},
			{vertex.tex_coord.x, vertex.tex_coord.y},
		});
	}
	mesh->indices.assign(indices.begin(), indices.end());
	return reinterpret_cast<Rml::CompiledGeometryHandle>(mesh.release());
}

void SdlRmlRenderer::RenderGeometry(Rml::CompiledGeometryHandle geometry, Rml::Vector2f translation, Rml::TextureHandle texture) {
	const auto& mesh = *reinterpret_cast<const Mesh*>(geometry);
	draw_vertices_.assign(mesh.vertices.begin(), mesh.vertices.end());
	for (auto& vertex : draw_vertices_) {
		const float x = vertex.position.x + translation.x;
		const float y = vertex.position.y + translation.y;
		if (transformed_) {
			const auto point = transform_ * Rml::Vector4f(x, y, 0.f, 1.f);
			vertex.position = {point.x, point.y};
		} else {
			vertex.position = {x, y};
		}
	}
	const auto* image = reinterpret_cast<const Texture*>(texture);
	if (SDL_RenderGeometry(renderer_, image ? image->handle : nullptr, draw_vertices_.data(),
		static_cast<int>(draw_vertices_.size()), mesh.indices.data(), static_cast<int>(mesh.indices.size()))) {
		++draw_count_;
	} else {
		error_ = SDL_GetError();
	}
}

void SdlRmlRenderer::ReleaseGeometry(Rml::CompiledGeometryHandle geometry) {
	delete reinterpret_cast<Mesh*>(geometry);
}

Rml::TextureHandle SdlRmlRenderer::LoadTexture(Rml::Vector2i& dimensions, const Rml::String& source) {
	if (source == "connected-cards" || source == "/connected-cards") {
		dimensions = atlas_size_;
		const auto texture = GenerateTexture({atlas_pixels_.data(), atlas_pixels_.size()}, dimensions);
		if (texture) ++art_count_;
		std::vector<Rml::byte>().swap(atlas_pixels_);
		return texture;
	}
	// The RML uses root-relative artwork paths. SDL reads UTF-8 paths on Windows
	// and the same relative paths from the Android asset manager.
	const std::string path = art_root_ + source;
	std::size_t size = 0;
	const std::unique_ptr<void, decltype(&SDL_free)> encoded(SDL_LoadFile(path.c_str(), &size), SDL_free);
	if (!encoded || size > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
		error_ = "cannot read " + path;
		return 0;
	}
	int width = 0, height = 0;
	const std::unique_ptr<stbi_uc, decltype(&stbi_image_free)> pixels(
		stbi_load_from_memory(static_cast<const stbi_uc*>(encoded.get()), static_cast<int>(size), &width, &height, nullptr, 4),
		stbi_image_free);
	if (!pixels) {
		error_ = "cannot decode " + path + ": " + stbi_failure_reason();
		return 0;
	}
	const std::size_t bytes = static_cast<std::size_t>(width) * height * 4;
	for (std::size_t i = 0; i < bytes; i += 4) {
		auto* pixel = pixels.get() + i;
		for (int channel = 0; channel < 3; ++channel) {
			pixel[channel] = static_cast<stbi_uc>((pixel[channel] * pixel[3] + 127) / 255);
		}
	}
	dimensions = {width, height};
	const auto texture = GenerateTexture({pixels.get(), bytes}, dimensions);
	if (texture) ++art_count_;
	return texture;
}

Rml::TextureHandle SdlRmlRenderer::GenerateTexture(Rml::Span<const Rml::byte> source, Rml::Vector2i dimensions) {
	if (dimensions.x <= 0 || dimensions.y <= 0) return 0;
	const auto bytes = static_cast<std::uint64_t>(dimensions.x) * dimensions.y * 4;
	if (source.size() < bytes) return 0;

	SDL_Texture* texture = SDL_CreateTexture(renderer_, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC, dimensions.x, dimensions.y);
	if (!texture || !SDL_UpdateTexture(texture, nullptr, source.data(), dimensions.x * 4) ||
		!SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND_PREMULTIPLIED)) {
		error_ = SDL_GetError();
		if (texture) SDL_DestroyTexture(texture);
		return 0;
	}
	texture_bytes_ += bytes;
	peak_texture_bytes_ = std::max(peak_texture_bytes_, texture_bytes_);
	return reinterpret_cast<Rml::TextureHandle>(new Texture{texture, bytes});
}

void SdlRmlRenderer::ReleaseTexture(Rml::TextureHandle texture) {
	const std::unique_ptr<Texture> image(reinterpret_cast<Texture*>(texture));
	if (!image) return;
	texture_bytes_ -= image->bytes;
	SDL_DestroyTexture(image->handle);
}

void SdlRmlRenderer::EnableScissorRegion(bool enable) {
	if (!enable && !SDL_SetRenderClipRect(renderer_, nullptr)) error_ = SDL_GetError();
}

void SdlRmlRenderer::SetScissorRegion(Rml::Rectanglei region) {
	const SDL_Rect clip{region.Left(), region.Top(), region.Width(), region.Height()};
	if (!SDL_SetRenderClipRect(renderer_, &clip)) error_ = SDL_GetError();
}

void SdlRmlRenderer::SetTransform(const Rml::Matrix4f* transform) {
	transformed_ = transform != nullptr;
	if (transform) transform_ = *transform;
}
