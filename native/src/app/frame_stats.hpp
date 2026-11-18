#pragma once

#include <algorithm>
#include <cmath>
#include <vector>

namespace waffle {

struct FrameStats {
	double p50, p95, p99, max;
};

// Nearest rank. Benchmarks always contain at least one sample.
inline FrameStats SummarizeFrameTimes(std::vector<double> samples) {
	std::sort(samples.begin(), samples.end());
	const auto percentile = [&](double fraction) {
		return samples[static_cast<std::size_t>(std::ceil(samples.size() * fraction)) - 1];
	};
	return {percentile(.50), percentile(.95), percentile(.99), samples.back()};
}

} // namespace waffle
