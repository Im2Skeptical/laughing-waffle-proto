#include "connected_model.hpp"

#include <algorithm>

namespace waffle::connected {

const Region* Selection::selected(const Snapshot* snapshot) const
{
    if (!snapshot) return nullptr;
    const auto match = std::ranges::find(snapshot->regions, region, &Region::id);
    return match == snapshot->regions.end() ? nullptr : &*match;
}

void Selection::select(std::string id)
{
    region = std::move(id);
    card.reset();
    destination.reset();
}

bool Selection::inspect(const Snapshot* snapshot, std::size_t slot)
{
    const auto* site = selected(snapshot);
    if (!site || slot >= site->cards.size() || site->cards[slot].id.empty()) return false;
    card = slot;
    destination.reset();
    return true;
}

bool Selection::stage(const Snapshot* snapshot, std::size_t slot)
{
    const auto* site = selected(snapshot);
    if (!site || !card || slot == *card || slot >= site->cards.size() || site->cards[slot].locked) return false;
    destination = slot;
    return true;
}

}
