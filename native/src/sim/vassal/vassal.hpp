#pragma once

namespace waffle::sim {
struct RuntimeState;

namespace vassal {

// Refresh after actions that change the active actor, pending transaction, or
// Commission and its tracked stat. Update indexes.currentVassal first if the
// actor changes. Import rebuilds both indexes.
void reindex(RuntimeState& state);
bool resolve_due(RuntimeState& state);

}
}
