#pragma once

#include <SDL3/SDL.h>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace waffle {

struct DemoMetrics {
	std::optional<std::uint64_t> working_set;
	std::optional<std::uint64_t> private_bytes;
	std::string gpu;
};

#if defined(_WIN32)
DemoMetrics ReadDemoMetrics(SDL_Renderer* renderer);
#else
inline DemoMetrics ReadDemoMetrics(SDL_Renderer*) { return {}; }
#endif

struct DemoBenchmark {
	double startup_ms = 0;
	std::vector<double> frame_ms;
	std::vector<double> cpu_frame_ms;
	bool Write(const std::string& path, SDL_Renderer* renderer, int width, int height, std::uint64_t texture_bytes,
		std::uint64_t peak_texture_bytes) const;
};

} // namespace waffle
