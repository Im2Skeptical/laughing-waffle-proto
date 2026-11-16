#include "sdl_asset_file.hpp"

#include <SDL3/SDL.h>

#include <cstdint>
#include <cstdio>

namespace waffle {
namespace {

SDL_IOStream* Stream(Rml::FileHandle file) {
	return reinterpret_cast<SDL_IOStream*>(static_cast<uintptr_t>(file));
}

} // namespace

Rml::FileHandle SdlAssetFile::Open(const Rml::String& path) {
	SDL_IOStream* stream = SDL_IOFromFile(path.c_str(), "rb");
	if (!stream) {
		return 0;
	}
	return static_cast<Rml::FileHandle>(reinterpret_cast<uintptr_t>(stream));
}

void SdlAssetFile::Close(Rml::FileHandle file) {
	if (SDL_IOStream* stream = Stream(file)) {
		SDL_CloseIO(stream);
	}
}

size_t SdlAssetFile::Read(void* buffer, size_t size, Rml::FileHandle file) {
	SDL_IOStream* stream = Stream(file);
	if (!stream || !buffer || size == 0) {
		return 0;
	}
	const Sint64 read = SDL_ReadIO(stream, buffer, size);
	if (read < 0) {
		return 0;
	}
	return static_cast<size_t>(read);
}

bool SdlAssetFile::Seek(Rml::FileHandle file, long offset, int origin) {
	SDL_IOStream* stream = Stream(file);
	if (!stream) {
		return false;
	}
	SDL_IOWhence whence = SDL_IO_SEEK_SET;
	if (origin == SEEK_CUR) {
		whence = SDL_IO_SEEK_CUR;
	} else if (origin == SEEK_END) {
		whence = SDL_IO_SEEK_END;
	}
	return SDL_SeekIO(stream, static_cast<Sint64>(offset), whence) >= 0;
}

size_t SdlAssetFile::Tell(Rml::FileHandle file) {
	SDL_IOStream* stream = Stream(file);
	if (!stream) {
		return 0;
	}
	const Sint64 tell = SDL_TellIO(stream);
	if (tell < 0) {
		return 0;
	}
	return static_cast<size_t>(tell);
}

} // namespace waffle
