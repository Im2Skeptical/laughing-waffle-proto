#include "demo_probe.hpp"

#include <cstdio>
#include <filesystem>

namespace waffle {
namespace {

struct Practice {
	const char* name;
	const char* description;
	const char* storage;
};

constexpr Practice practices[] = {
	{"Scrub Foraging",
		"Crews gather roots, berries and edible shoots from the scrub west of Greywater. The day's haul passes through the Northbank storehouse before households draw their shares.",
		"Fresh forage is counted in baskets. Damp roots are dried in the storehouse before being added to the winter reserve."},
	{"Logging",
		"Crews fell marked trees on the Alderwatch road. They trim each trunk where it falls and haul the lengths back to Greywater.",
		"Timber is stacked by the West Gate. Each crew's share is counted before the stacks are moved under cover."},
	{"Quarrying",
		"Stonecutters work the exposed ridge above the reach. The crews separate building stone from rubble before each cart leaves the quarry.",
		"Stone is tallied by cartload. Rough blocks wait at the gate until the stewards accept them into the settlement stock."},
	{"Mixed Farming",
		"Households tend separate strips of barley and field vegetables. They bring the day's harvest to the threshing yard to be weighed.",
		"Grain is kept dry above the yard. Vegetables are counted separately and put aside for the settlement kitchens."},
	{"Pottery",
		"Workers bring river clay to the kiln yard. They shape it into vessels and fire each batch before delivering it to the steward.",
		"Fired vessels cool overnight. The steward counts only unbroken pots as settled stock."},
};

Rml::Vector2f ElementCenter(Rml::Element& element) {
	return element.GetAbsoluteOffset(Rml::BoxArea::Border) + element.GetBox().GetSize(Rml::BoxArea::Border) * 0.5f;
}

} // namespace

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

double DemoClock::GetElapsedTime() { return seconds; }
bool DemoClock::LogMessage(Rml::Log::Type type, const Rml::String& message) {
	if (type <= Rml::Log::LT_WARNING) {
		std::fprintf(stderr, "rml: %s\n", message.c_str());
		if (type == Rml::Log::LT_ERROR || type == Rml::Log::LT_ASSERT) last_error = message;
	}
	return true;
}

bool DemoSession::Load(Rml::Context& context, const std::string& rml_path, const std::string& font_path, std::string& error) {
	if (!Rml::LoadFontFace(font_path, "Lato", Rml::Style::FontStyle::Normal, Rml::Style::FontWeight::Auto, true)) {
		error = "LoadFontFace failed for " + font_path;
		return false;
	}
	context_ = &context;
	document_ = context.LoadDocument(rml_path);
	if (!document_) {
		error = "LoadDocument failed for " + rml_path;
		return false;
	}

	for (const char* id : {"map", "world", "scroll", "overview", "ledger", "inspector-kind", "inspector-title",
		"description", "storage", "residents", "base", "workers", "stock", "north", "west", "harbor-output",
		"detail", "back", "zoom-in", "zoom-out", "card-0", "card-1", "card-2", "card-3", "card-4"}) {
		if (!Find(id)) {
			error = std::string("demo document is missing #") + id;
			return false;
		}
	}
	for (int index = 0; index < static_cast<int>(cards_.size()); ++index) {
		cards_[index] = Find(("card-" + std::to_string(index)).c_str());
		cards_[index]->AddEventListener(Rml::EventId::Click, this);
	}
	for (const char* id : {"detail", "back", "zoom-in", "zoom-out"}) Find(id)->AddEventListener(Rml::EventId::Click, this);

	SelectCard(0);
	document_->Show();
	Resize(context.GetDimensions());
	Update();
	return true;
}

void DemoSession::Resize(Rml::Vector2i dimensions) {
	if (dimensions.x <= 0 || dimensions.y <= 0) return;
	context_->SetDimensions(dimensions);
	density_ = std::min(dimensions.x / 1120.f, dimensions.y / 510.f);
	context_->SetDensityIndependentPixelRatio(density_);
	ApplyCamera();
}

void DemoSession::Tick(std::uint64_t frame) {
	const auto update = [this](const char* id, double value, bool sign = false) {
		char text[24];
		std::snprintf(text, sizeof(text), sign ? "%+.2f" : "%.2f", value);
		Find(id)->SetInnerRML(text);
	};
	const double steps = static_cast<double>(frame % 400) * 0.01;
	const double north = 2.0 + steps, west = 1.0 + steps, harbor = 1.5 + steps;
	const double base = 12.0 + selected_ * 2.0 + steps;
	const double workers = north + west + harbor;
	Find("residents")->SetInnerRML(std::to_string(96 + (frame / 24) % 20));
	update("base", base);
	update("workers", workers, true);
	update("stock", 96.0 + base + workers);
	update("north", north, true);
	update("west", west, true);
	update("harbor-output", harbor, true);
}

void DemoSession::Update() {
	context_->Update();
	if (pending_scroll_ >= 0.f) {
		Find("scroll")->SetScrollTop(pending_scroll_);
		pending_scroll_ = -1.f;
	}
}

void DemoSession::ProcessEvent(Rml::Event& event) {
	Rml::Element* element = event.GetCurrentElement();
	const auto& id = element->GetId();
	if (id == "detail") return ShowLedger(true);
	if (id == "back") return ShowLedger(false);
	if (id == "zoom-in") return Zoom(1.17f, Center("map"));
	if (id == "zoom-out") return Zoom(1.f / 1.17f, Center("map"));
	for (int index = 0; index < static_cast<int>(cards_.size()); ++index) {
		if (element == cards_[index]) return SelectCard(index);
	}
}

Rml::Vector2f DemoSession::Center(const char* id) const { return ElementCenter(*Find(id)); }

bool DemoSession::InMap(Rml::Vector2f point) const {
	auto* map = Find("map");
	const auto pos = map->GetAbsoluteOffset(Rml::BoxArea::Border);
	const auto size = map->GetBox().GetSize(Rml::BoxArea::Border);
	return point.x >= pos.x && point.y >= pos.y && point.x < pos.x + size.x && point.y < pos.y + size.y;
}

bool DemoSession::CanPan(Rml::Vector2f point) const {
	if (!InMap(point)) return false;
	for (auto* hit = context_->GetElementAtPoint(point); hit && hit != Find("map"); hit = hit->GetParentNode()) {
		if (hit->GetTagName() == "button") return false;
	}
	return true;
}

void DemoSession::SetPanning(bool panning) { Find("map")->SetClass("panning", panning); }
void DemoSession::Pan(Rml::Vector2f pixels) {
	camera_.Pan(pixels.x / density_, pixels.y / density_);
	ApplyCamera();
}
void DemoSession::Zoom(float factor, Rml::Vector2f point) {
	const auto offset = point - Center("map");
	camera_.Zoom(factor, offset.x / density_, offset.y / density_);
	ApplyCamera();
}

void DemoSession::ApplyCamera() {
	char transform[128];
	std::snprintf(transform, sizeof(transform), "translate(%.3fpx, %.3fpx) scale(%.5f)",
		density_ * (camera_.x - 380.f * camera_.scale), density_ * (camera_.y - 160.f * camera_.scale), camera_.scale);
	Find("world")->SetProperty("transform", transform);
}

void DemoSession::SelectCard(int index) {
	cards_[selected_]->SetClass("selected", false);
	selected_ = index;
	cards_[selected_]->SetClass("selected", true);
	const Practice& practice = practices[index];
	Find("description")->SetInnerRML(practice.description);
	Find("storage")->SetInnerRML(practice.storage);
	ShowLedger(false);
	pending_scroll_ = 0.f;
}

void DemoSession::ShowLedger(bool show) {
	if (show) overview_scroll_ = Find("scroll")->GetScrollTop();
	in_ledger_ = show;
	Find("overview")->SetProperty("display", show ? "none" : "block");
	Find("ledger")->SetProperty("display", show ? "block" : "none");
	Find("inspector-kind")->SetInnerRML(show ? "Contribution ledger" : "Practice");
	Find("inspector-title")->SetInnerRML(practices[selected_].name);
	pending_scroll_ = show ? 0.f : overview_scroll_;
}

} // namespace waffle
