#pragma once

#include <RmlUi/Core.h>

namespace waffle {

std::string readAsset(const char* path);

// SDL reads UTF-8 file paths on Windows and relative package assets on Android.
class SdlAssetFile final : public Rml::FileInterface {
public:
	Rml::FileHandle Open(const Rml::String& path) override;
	void Close(Rml::FileHandle file) override;
	size_t Read(void* buffer, size_t size, Rml::FileHandle file) override;
	bool Seek(Rml::FileHandle file, long offset, int origin) override;
	size_t Tell(Rml::FileHandle file) override;
};

} // namespace waffle
