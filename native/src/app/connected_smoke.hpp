#pragma once

#include "connected_session.hpp"

#include <functional>

namespace waffle::connected {

class View;

// Called after each update. Capture uses the same input/readout path as the
// headless run and renders the named checkpoints.
using SmokeFrame = std::function<void(const char* capture)>;
void preparePracticeShop(Session& session, Selection& selection, const SmokeFrame& frame);
void waitFor(Session& session, const std::function<bool()>& condition, const SmokeFrame& frame);
void smoke(Session& session, Selection& selection, const SmokeFrame& frame, View* view = nullptr);

}
