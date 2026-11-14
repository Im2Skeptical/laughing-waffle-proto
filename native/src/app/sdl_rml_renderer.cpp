#include "sdl_rml_renderer.hpp"

namespace {

SDL_FColor ToColor(Rml::ColourbPremultiplied colour) {
	SDL_FColor out;
	out.r = static_cast<float>(colour.red) / 255.f;
	out.g = static_cast<float>(colour.green) / 255.f;
	out.b = static_cast<float>(colour.blue) / 255.f;
	out.a = static_cast<float>(colour.alpha) / 255.f;
	return out;
}

} // namespace

SdlRmlRenderer::SdlRmlRenderer(SDL_Renderer* renderer) : renderer_(renderer) {}

SdlRmlRenderer::~SdlRmlRenderer() {
	for (SDL_Texture* texture : textures_) {
		if (texture) {
			SDL_DestroyTexture(texture);
		}
	}
}

Rml::CompiledGeometryHandle SdlRmlRenderer::CompileGeometry(Rml::Span<const Rml::Vertex> vertices, Rml::Span<const int> indices) {
	auto mesh = std::make_unique<Mesh>();
	mesh->vertices.reserve(vertices.size());
	for (const Rml::Vertex& vertex : vertices) {
		SDL_Vertex sdl_vertex;
		sdl_vertex.position.x = vertex.position.x;
		sdl_vertex.position.y = vertex.position.y;
		sdl_vertex.color = ToColor(vertex.colour);
		sdl_vertex.tex_coord.x = vertex.tex_coord.x;
		sdl_vertex.tex_coord.y = vertex.tex_coord.y;
		mesh->vertices.push_back(sdl_vertex);
	}
	mesh->indices.assign(indices.begin(), indices.end());
	meshes_.push_back(std::move(mesh));
	return static_cast<Rml::CompiledGeometryHandle>(meshes_.size());
}

void SdlRmlRenderer::RenderGeometry(Rml::CompiledGeometryHandle geometry, Rml::Vector2f translation, Rml::TextureHandle texture) {
	if (geometry == 0 || geometry > meshes_.size() || !meshes_[geometry - 1]) {
		return;
	}
	const Mesh& mesh = *meshes_[geometry - 1];
	std::vector<SDL_Vertex> translated = mesh.vertices;
	for (SDL_Vertex& vertex : translated) {
		vertex.position.x += translation.x;
		vertex.position.y += translation.y;
	}
	SDL_Texture* sdl_texture = nullptr;
	if (texture != 0 && texture <= textures_.size()) {
		sdl_texture = textures_[texture - 1];
	}
	const int* index_data = mesh.indices.empty() ? nullptr : mesh.indices.data();
	const int index_count = static_cast<int>(mesh.indices.size());
	if (SDL_RenderGeometry(renderer_, sdl_texture, translated.data(), static_cast<int>(translated.size()), index_data, index_count)) {
		++draw_count_;
	}
}

void SdlRmlRenderer::ReleaseGeometry(Rml::CompiledGeometryHandle geometry) {
	if (geometry == 0 || geometry > meshes_.size()) {
		return;
	}
	meshes_[geometry - 1].reset();
}

Rml::TextureHandle SdlRmlRenderer::LoadTexture(Rml::Vector2i& texture_dimensions, const Rml::String& source) {
	(void)source;
	texture_dimensions = Rml::Vector2i(0, 0);
	return 0;
}

Rml::TextureHandle SdlRmlRenderer::GenerateTexture(Rml::Span<const Rml::byte> source, Rml::Vector2i source_dimensions) {
	if (source_dimensions.x <= 0 || source_dimensions.y <= 0) {
		return 0;
	}
	const std::size_t expected = static_cast<std::size_t>(source_dimensions.x) * static_cast<std::size_t>(source_dimensions.y) * 4u;
	if (source.size() < expected) {
		return 0;
	}
	SDL_Texture* texture = SDL_CreateTexture(renderer_, SDL_PIXELFORMAT_RGBA32, SDL_TEXTUREACCESS_STATIC, source_dimensions.x, source_dimensions.y);
	if (!texture) {
		return 0;
	}
	if (!SDL_UpdateTexture(texture, nullptr, source.data(), source_dimensions.x * 4)) {
		SDL_DestroyTexture(texture);
		return 0;
	}
	const SDL_BlendMode premultiplied = SDL_ComposeCustomBlendMode(
		SDL_BLENDFACTOR_ONE, SDL_BLENDFACTOR_ONE_MINUS_SRC_ALPHA, SDL_BLENDOPERATION_ADD,
		SDL_BLENDFACTOR_ONE, SDL_BLENDFACTOR_ONE_MINUS_SRC_ALPHA, SDL_BLENDOPERATION_ADD);
	if (!SDL_SetTextureBlendMode(texture, premultiplied)) {
		SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
	}
	textures_.push_back(texture);
	++texture_count_;
	return static_cast<Rml::TextureHandle>(textures_.size());
}

void SdlRmlRenderer::ReleaseTexture(Rml::TextureHandle texture) {
	if (texture == 0 || texture > textures_.size()) {
		return;
	}
	if (SDL_Texture* sdl_texture = textures_[texture - 1]) {
		SDL_DestroyTexture(sdl_texture);
		textures_[texture - 1] = nullptr;
	}
}

void SdlRmlRenderer::EnableScissorRegion(bool enable) {
	scissor_ = enable;
	ApplyClip();
}

void SdlRmlRenderer::SetScissorRegion(Rml::Rectanglei region) {
	clip_.x = region.Left();
	clip_.y = region.Top();
	clip_.w = region.Width();
	clip_.h = region.Height();
	if (scissor_) {
		ApplyClip();
	}
}

void SdlRmlRenderer::ApplyClip() {
	if (scissor_) {
		SDL_SetRenderClipRect(renderer_, &clip_);
	} else {
		SDL_SetRenderClipRect(renderer_, nullptr);
	}
}
