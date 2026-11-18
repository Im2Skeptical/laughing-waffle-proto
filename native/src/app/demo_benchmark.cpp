#include "demo_benchmark.hpp"
#include "frame_stats.hpp"

#include <cstdio>
#include <iomanip>
#include <locale>
#include <sstream>

namespace waffle {
namespace {

void WriteStats(std::ostream& out, const std::vector<double>& values) {
	const auto stats = SummarizeFrameTimes(values);
	out << "{\"p50\": " << stats.p50 << ", \"p95\": " << stats.p95
		<< ", \"p99\": " << stats.p99 << ", \"max\": " << stats.max << "}";
}

void WriteName(std::ostream& out, const std::string& name) {
	if (name.empty()) {
		out << "null";
		return;
	}
	out << '"';
	for (unsigned char c : name) {
		if (c == '"' || c == '\\') out << '\\';
		if (c >= 32) out << c;
	}
	out << '"';
}

} // namespace

bool DemoBenchmark::Write(const std::string& path, SDL_Renderer* renderer, int width, int height,
	std::uint64_t texture_bytes, std::uint64_t peak_texture_bytes) const {
	const auto metrics = ReadDemoMetrics(renderer);
	std::ostringstream out;
	out.imbue(std::locale::classic());
	out << std::fixed << std::setprecision(3);
	out << "{\n  \"frames\": " << frame_ms.size() << ",\n  \"width_px\": " << width
		<< ",\n  \"height_px\": " << height << ",\n  \"startup_to_first_present_ms\": " << startup_ms
		<< ",\n  \"frame_ms\": ";
	WriteStats(out, frame_ms);
	out << ",\n  \"cpu_frame_ms_excluding_present\": ";
	WriteStats(out, cpu_frame_ms);
	out << ",\n  \"backend\": ";
	const char* name = SDL_GetRendererName(renderer);
	WriteName(out, name ? name : "");
	out << ",\n  \"gpu\": ";
	WriteName(out, metrics.gpu);
	out << ",\n  \"gpu_driver\": ";
	auto* gpu = SDL_GetGPURendererDevice(renderer);
	const char* gpu_driver = gpu ? SDL_GetGPUDeviceDriver(gpu) : nullptr;
	WriteName(out, gpu_driver ? gpu_driver : "");
	out << ",\n  \"working_set_bytes\": " << (metrics.working_set ? std::to_string(*metrics.working_set) : "null")
		<< ",\n  \"private_bytes\": " << (metrics.private_bytes ? std::to_string(*metrics.private_bytes) : "null")
		<< ",\n  \"texture_bytes_estimate\": " << texture_bytes
		<< ",\n  \"peak_texture_bytes_estimate\": " << peak_texture_bytes << "\n}\n";
	const std::string json = out.str();
	if (path.empty()) {
		return std::fwrite(json.data(), 1, json.size(), stdout) == json.size();
	}
	return SDL_SaveFile(path.c_str(), json.data(), json.size());
}

} // namespace waffle
