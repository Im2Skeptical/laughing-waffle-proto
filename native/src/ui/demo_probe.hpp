#pragma once

#include "map_camera.hpp"

#include <RmlUi/Core.h>

#include <array>
#include <cstdint>
#include <string>

namespace waffle {

class DemoClock final : public Rml::SystemInterface {
public:
	double GetElapsedTime() override;
	bool LogMessage(Rml::Log::Type type, const Rml::String& message) override;

	double seconds = 0.0;
	std::string last_error;
};

// SDL and RmlUi paths are UTF-8; the Windows CRT's narrow fopen is not.
class Utf8Files final : public Rml::FileInterface {
public:
	Rml::FileHandle Open(const Rml::String& path) override;
	void Close(Rml::FileHandle file) override;
	std::size_t Read(void* buffer, std::size_t size, Rml::FileHandle file) override;
	bool Seek(Rml::FileHandle file, long offset, int origin) override;
	std::size_t Tell(Rml::FileHandle file) override;
};

class DemoSession final : public Rml::EventListener {
public:
	bool Load(Rml::Context& context, const std::string& rml_path, const std::string& font_path, std::string& error);
	void Resize(Rml::Vector2i dimensions);
	void Tick(std::uint64_t frame);
	void Update();
	void ProcessEvent(Rml::Event& event) override;

	Rml::Element* Find(const char* id) const { return document_->GetElementById(id); }
	Rml::Vector2f Center(const char* id) const;
	bool InMap(Rml::Vector2f point) const;
	bool CanPan(Rml::Vector2f point) const;
	void SetPanning(bool panning);
	void Pan(Rml::Vector2f pixels);
	void Zoom(float factor, Rml::Vector2f point);

	const MapCamera& camera() const { return camera_; }
	bool in_ledger() const { return in_ledger_; }
	int selected_card() const { return selected_; }

private:
	void ApplyCamera();
	void SelectCard(int index);
	void ShowLedger(bool show);

	Rml::Context* context_ = nullptr;
	Rml::ElementDocument* document_ = nullptr;
	std::array<Rml::Element*, 5> cards_{};
	MapCamera camera_{0.f, -6.f, .92f};
	float density_ = 1.f;
	float overview_scroll_ = 0.f;
	float pending_scroll_ = -1.f;
	int selected_ = 0;
	bool in_ledger_ = false;
};

} // namespace waffle
