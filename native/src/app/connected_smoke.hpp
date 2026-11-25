#pragma once

#include "connected_shell.hpp"

#include <functional>

namespace waffle::connected {

class View;

// Called after each update. Capture uses the same input/readout path as the
// headless run and renders the named checkpoints.
using SmokeFrame = std::function<void(const char* capture)>;
void preparePracticeShop(Session& session, Selection& selection, const SmokeFrame& frame);
void waitFor(Session& session, const std::function<bool()>& condition, const SmokeFrame& frame);
void smoke(Session& session, Selection& selection, const SmokeFrame& frame, View* view = nullptr);
void shellSmoke(Session& session, View& view, const SmokeFrame& frame, const SaveSlots& store);
void settlementSmoke(Session& session, View& view, const SmokeFrame& frame);
void crestSmoke(Session& session, View& view, const SmokeFrame& frame);
void lifeMapSmoke(Session& session, View& view, const SmokeFrame& frame, const SaveSlots& store,
                  const std::filesystem::path& shop);
void saveSmoke(const Launch& launch, const std::filesystem::path& directory);

}
