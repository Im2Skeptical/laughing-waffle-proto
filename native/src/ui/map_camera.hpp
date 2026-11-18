#pragma once

#include <algorithm>

namespace waffle {

// In layout units relative to the viewport center. The window's pixel density
// is applied by the view, so resizing leaves the focal point in the same place.
struct MapCamera {
	float x = 0.f;
	float y = 0.f;
	float scale = 1.f;

	void Pan(float dx, float dy) {
		x = std::clamp(x + dx, -250.f * scale, 250.f * scale);
		y = std::clamp(y + dy, -110.f * scale, 110.f * scale);
	}

	void Zoom(float factor, float anchor_x, float anchor_y) {
		const float next_scale = std::clamp(scale * factor, 0.75f, 2.5f);
		if (next_scale == scale) return;
		const float ratio = next_scale / scale;
		const float nx = anchor_x + (x - anchor_x) * ratio;
		const float ny = anchor_y + (y - anchor_y) * ratio;
		scale = next_scale;
		x = y = 0.f;
		Pan(nx, ny);
	}
};

} // namespace waffle
