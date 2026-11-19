#pragma once

#include "sim/state/runtime_state.hpp"

#include <algorithm>
#include <cmath>
#include <string_view>

namespace waffle::sim::vassal::detail {

using namespace runtime;
using namespace std::literals;

struct HeirloomDef {
    std::string_view id, label, quality;
    double patronage, development, crossroads, cunning, wisdomMultiplier;
    bool mandate;
};
struct SignatureDef {
    std::string_view id, group, label, glyph;
    double color;
    std::string_view description, removal, tag;
};
#include "sim/vassal/tables.inc"

inline constexpr std::array statIds{"cunning"sv, "wisdom"sv, "effectiveness"sv, "intelligence"sv};
inline constexpr std::array statMembers{&VassalStats::cunning, &VassalStats::wisdom,
    &VassalStats::effectiveness, &VassalStats::intelligence};

template<class Key>
Key intern(RuntimeState& state, std::string_view name)
{
    return state.intern<Key>(name, "Vassal resolution");
}

template<class T, class Field>
const T& read(const RuntimeState& state, ColdRef<T, Field> ref)
{
    return state.cold.at(ref.row).get();
}

template<class T, class Field>
void replace(RuntimeState& state, ColdRef<T, Field> ref, const T& value)
{
    state.cold.at(ref.row).replace(value);
}

template<class Ref, class T>
Ref store(RuntimeState& state, const T& value)
{
    auto& rows = state.cold.rows<typename Ref::Storage>();
    const auto index = checked_index(rows.size(), "Vassal cold field");
    rows.emplace_back(value);
    return {{index}};
}

inline double whole(double value) { return std::max(0.0, core::js::floor(value)); }
inline std::string decimal(double value) { return core::js::number_to_string(value); }
inline double roll(RuntimeState& state) { return core::rng_next_seed_float(state.hot.rng.vassalSeed); }

inline std::size_t pick(RuntimeState& state, std::size_t count)
{
    return static_cast<std::size_t>(roll(state) * static_cast<double>(count));
}

template<class T>
void shuffle(RuntimeState& state, T& entries)
{
    for (auto count = entries.size(); count > 1; --count)
        std::swap(entries[count - 1], entries[pick(state, count)]);
}

inline std::string_view class_name(const Vassal& actor)
{
    if (!actor.classId) return {};
    return *actor.classId == browser::SpecialistClass::scholar ? "scholar"sv : "warrior"sv;
}
inline bool has_identity(const RuntimeState& state, const Vassal& actor, std::string_view id)
{
    return actor.classId ? class_name(actor) == id : actor.founderClassId && state.name(*actor.founderClassId) == id;
}

struct Bonuses {
    double patronage{}, development{}, crossroads{}, cunning{};
    double wisdomMultiplier{1};
};

Bonuses bonuses(const RuntimeState& state, const Vassal& actor);
bool spend_mandate(RuntimeState& state, Vassal& actor);
void inherit(RuntimeState& state, Vassal& actor);
void generate_candidates(RuntimeState& state);

std::vector<SiteId> player_sites(const RuntimeState& state);
void add_event(RuntimeState& state, Vassal& actor, std::string_view kind,
               const std::string& id, std::optional<NodeId> node = {},
               std::string_view result = {}, std::optional<double> age = {},
               std::string_view text = {}, std::optional<std::string_view> deathCause = {},
               std::string_view cause = {});

}
