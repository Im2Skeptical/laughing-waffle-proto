#include "demo_probe.hpp"

#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <filesystem>

namespace waffle {
namespace {

std::string Trim(std::string value) {
	std::size_t begin = 0;
	while (begin < value.size() && std::isspace(static_cast<unsigned char>(value[begin]))) {
		++begin;
	}
	std::size_t end = value.size();
	while (end > begin && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
		--end;
	}
	return value.substr(begin, end - begin);
}

} // namespace

StatusClickListener::~StatusClickListener() {
	if (attachments != 0) {
		std::fputs("native-listener: destroyed before detach\n", stderr);
		std::fflush(stderr);
		std::_Exit(3); // Fail the demo/test before RmlUi calls a dead listener.
	}
}

Rml::FileHandle Utf8Files::Open(const Rml::String& path) {
#ifdef _WIN32
	return reinterpret_cast<Rml::FileHandle>(_wfopen(std::filesystem::u8path(path).c_str(), L"rb"));
#else
	return reinterpret_cast<Rml::FileHandle>(std::fopen(path.c_str(), "rb"));
#endif
}
void Utf8Files::Close(Rml::FileHandle file) { std::fclose(reinterpret_cast<std::FILE*>(file)); }
std::size_t Utf8Files::Read(void* buffer, std::size_t size, Rml::FileHandle file) {
	return std::fread(buffer, 1, size, reinterpret_cast<std::FILE*>(file));
}
bool Utf8Files::Seek(Rml::FileHandle file, long offset, int origin) {
	return std::fseek(reinterpret_cast<std::FILE*>(file), offset, origin) == 0;
}
std::size_t Utf8Files::Tell(Rml::FileHandle file) {
	return static_cast<std::size_t>(std::ftell(reinterpret_cast<std::FILE*>(file)));
}

double FixedClock::GetElapsedTime() {
	return 0.0;
}

bool FixedClock::LogMessage(Rml::Log::Type type, const Rml::String& message) {
	if (type == Rml::Log::LT_ERROR || type == Rml::Log::LT_ASSERT) {
		last_error = message;
	}
	if (log.size() < 2000) {
		log += message;
		log += "\n";
	}
	return true;
}

void StatusClickListener::ProcessEvent(Rml::Event& event) {
	++clicks;
	Rml::Element* target = event.GetTargetElement();
	if (!target) {
		return;
	}
	Rml::ElementDocument* document = target->GetOwnerDocument();
	if (!document) {
		return;
	}
	if (Rml::Element* status = document->GetElementById("status")) {
		status->SetInnerRML("clicked");
	}
}

bool LoadDemo(Rml::Context* context, const std::string& rml_path, const std::string& font_path, DemoSession& session,
	std::string& error) {
	if (!context) {
		error = "missing RmlUi context";
		return false;
	}
	// This Latin subset reports its family as "LatoLatin". The document asks for "Lato".
	if (!Rml::LoadFontFace(font_path, "Lato", Rml::Style::FontStyle::Normal, Rml::Style::FontWeight::Auto, true)) {
		error = "LoadFontFace failed for " + font_path;
		return false;
	}
	session.document = context->LoadDocument(rml_path);
	if (!session.document) {
		error = "LoadDocument failed for " + rml_path;
		return false;
	}
	Rml::Element* hit = session.document->GetElementById("hit");
	Rml::Element* status = session.document->GetElementById("status");
	if (!hit || !status) {
		error = "demo document is missing #hit or #status";
		return false;
	}
	hit->AddEventListener(Rml::EventId::Click, &session.listener);
	session.document->Show();
	context->Update();
	return true;
}

bool HitCenter(const DemoSession& session, float& x, float& y, std::string& error) {
	if (!session.document) {
		error = "demo document is not loaded";
		return false;
	}
	Rml::Element* hit = session.document->GetElementById("hit");
	if (!hit) {
		error = "missing #hit";
		return false;
	}
	const Rml::Vector2f offset = hit->GetAbsoluteOffset(Rml::BoxArea::Border);
	const Rml::Vector2f size = hit->GetBox().GetSize(Rml::BoxArea::Border);
	if (size.x < 1.f || size.y < 1.f) {
		error = "hit box is empty";
		return false;
	}
	x = offset.x + (size.x * 0.5f);
	y = offset.y + (size.y * 0.5f);
	return true;
}

void PointerMove(Rml::Context* context, float x, float y) {
	context->ProcessMouseMove(static_cast<int>(x), static_cast<int>(y), 0);
}

void PointerButton(Rml::Context* context, bool down) {
	if (down) {
		context->ProcessMouseButtonDown(0, 0);
	} else {
		context->ProcessMouseButtonUp(0, 0);
	}
}

std::string StatusText(const DemoSession& session) {
	if (!session.document) {
		return {};
	}
	Rml::Element* status = session.document->GetElementById("status");
	if (!status) {
		return {};
	}
	return Trim(status->GetInnerRML());
}

} // namespace waffle
