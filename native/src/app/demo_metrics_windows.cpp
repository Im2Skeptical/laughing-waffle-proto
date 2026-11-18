#include "demo_benchmark.hpp"

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <psapi.h>

namespace waffle {

DemoMetrics ReadDemoMetrics(SDL_Renderer* renderer) {
	DemoMetrics metrics;
	PROCESS_MEMORY_COUNTERS_EX counters{};
	counters.cb = sizeof(counters);
	if (GetProcessMemoryInfo(GetCurrentProcess(), reinterpret_cast<PROCESS_MEMORY_COUNTERS*>(&counters), sizeof(counters))) {
		metrics.working_set = counters.WorkingSetSize;
		metrics.private_bytes = counters.PrivateUsage;
	}

	const auto properties = SDL_GetRendererProperties(renderer);
	auto* device = static_cast<ID3D11Device*>(SDL_GetPointerProperty(properties, SDL_PROP_RENDERER_D3D11_DEVICE_POINTER, nullptr));
	if (device) {
		IDXGIDevice* dxgi = nullptr;
		if (SUCCEEDED(device->QueryInterface(IID_PPV_ARGS(&dxgi)))) {
			IDXGIAdapter* adapter = nullptr;
			if (SUCCEEDED(dxgi->GetAdapter(&adapter))) {
				DXGI_ADAPTER_DESC description{};
				char utf8[512]{};
				if (SUCCEEDED(adapter->GetDesc(&description)) &&
					WideCharToMultiByte(CP_UTF8, 0, description.Description, -1, utf8, sizeof(utf8), nullptr, nullptr) > 0) {
					metrics.gpu = utf8;
				}
				adapter->Release();
			}
			dxgi->Release();
		}
	}
	if (auto* gpu = SDL_GetGPURendererDevice(renderer)) {
		metrics.gpu = SDL_GetStringProperty(SDL_GetGPUDeviceProperties(gpu), SDL_PROP_GPU_DEVICE_NAME_STRING, "");
	}
	return metrics;
}

} // namespace waffle
