#pragma once

#include <RmlUi/Core.h>

#include <string>

namespace waffle {

// Fixed clock so document setup does not depend on wall time.
// This is presentation scaffolding, not simulation state.
class FixedClock final : public Rml::SystemInterface {
public:
	double GetElapsedTime() override;
	bool LogMessage(Rml::Log::Type type, const Rml::String& message) override;

	std::string last_error;
	std::string log;
};

class StatusClickListener final : public Rml::EventListener {
public:
	~StatusClickListener() override;
	void OnAttach(Rml::Element*) override { ++attachments; }
	void OnDetach(Rml::Element*) override { --attachments; }
	void ProcessEvent(Rml::Event& event) override;
	int clicks = 0;
	int attachments = 0;
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

struct DemoSession {
	Rml::ElementDocument* document = nullptr;
	StatusClickListener listener;
};

bool LoadDemo(Rml::Context* context, const std::string& rml_path, const std::string& font_path, DemoSession& session,
	std::string& error);
bool HitCenter(const DemoSession& session, float& x, float& y, std::string& error);
void PointerMove(Rml::Context* context, float x, float y);
void PointerButton(Rml::Context* context, bool down);
std::string StatusText(const DemoSession& session);

} // namespace waffle
