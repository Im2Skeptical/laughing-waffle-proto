#pragma once

#include <RmlUi/Core.h>

namespace waffle {

// Reads APK assets through SDL_IOFromFile. Android compresses unknown extensions
// and fopen cannot see the asset pack; SDL falls back from a file descriptor to
// the asset stream. Installed before Rml::Initialise on Android only.
class SdlAssetFile final : public Rml::FileInterface {
public:
	Rml::FileHandle Open(const Rml::String& path) override;
	void Close(Rml::FileHandle file) override;
	size_t Read(void* buffer, size_t size, Rml::FileHandle file) override;
	bool Seek(Rml::FileHandle file, long offset, int origin) override;
	size_t Tell(Rml::FileHandle file) override;
};

} // namespace waffle
