#pragma once

#include "sim/content/compiled_content.hpp"
#include "sim/state/runtime_state.hpp"

#include <algorithm>
#include <cmath>
#include <string_view>

namespace waffle::sim::vassal::detail {

using namespace runtime;
using namespace std::literals;

struct HeirloomDef {
    std::string_view id, label, quality, description;
    double patronage, development, crossroads, cunning, wisdomMultiplier, extraShopOffers;
    bool mandate;
};
struct SignatureDef {
    std::string_view id, group, label, glyph;
    double color;
    std::string_view description, removal, tag;
};
struct CommissionDef {
    std::string_view id, difficulty, label, description, event, parameter, minimumQuality;
    double prestige, amount;
};
struct NodeFamilyLabel { std::string_view id, label; };
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
void finish_vassal(RuntimeState& state, Vassal& actor, std::string_view cause = {});
void inherit(RuntimeState& state, Vassal& actor);
void generate_candidates(RuntimeState& state);
std::optional<browser::LifeMapGraph> action_graph(const RuntimeState& state, const browser::Candidate& candidate,
                                                 std::string_view id, double& seed);
browser::LifeMapNodeStateOptions campaign_options(const RuntimeState& state, const Vassal& actor,
                                                   const browser::LifeMapNodeState& node);
browser::LifeMapNodeStateInventory shop_inventory(RuntimeState& state, Vassal& actor, browser::LifeMapNodeState& node);
browser::OptionalNullable<browser::LifeMapNodeStateShopSelection>
shop_specialties(RuntimeState& state, const Vassal& actor, const browser::LifeMapNodeState& node);
bool apply_timed_class_action(RuntimeState& state, Vassal& actor, const browser::LifeMapOptionClassAction& action);
bool commission_due(const RuntimeState& state, const Vassal& actor);
void ensure_commission_offers(RuntimeState& state, Vassal& actor);
void step_commission(RuntimeState& state, Vassal& actor);
void credit_prestige(RuntimeState& state, Vassal& actor, double amount);
void record_commission_event(RuntimeState& state, Vassal& actor, std::string_view kind,
                             std::string_view subject = {}, double amount = 0);

inline constexpr std::array qualityIds{"bronze"sv, "silver"sv, "gold"sv, "diamond"sv};
inline std::size_t quality_index(std::string_view quality)
{
    const auto found = std::ranges::find(qualityIds, quality);
    return found == qualityIds.end() ? 0 : static_cast<std::size_t>(found - qualityIds.begin());
}

inline std::size_t research_unlock(const RuntimeState& state)
{
    const auto& settings = state.compiledContent->settings();
    const auto research = std::max(0.0, state.hot.civilization.research.total);
    if (research >= settings.researchDiamondThreshold) return 3;
    if (research >= settings.researchGoldThreshold) return 2;
    if (research >= settings.researchSilverThreshold) return 1;
    return 0;
}

inline std::string_view practice_prototype_tag(const RuntimeState& state, std::string_view id)
{
    const auto& prototype = state.content->config.keywordPrototype;
    if (!prototype) return {};
    if (id == "barter") return "Economic Regions";
    if (prototype->mode == "disciplines") {
        if (id == "monsterHunting") return "Monster Trophies";
        if (id == "copyingTexts") return "Synthesis";
    } else if (id == "observation") return "Monster Trophies";
    return {};
}

inline std::string_view practice_pool(const RuntimeState& state, const browser::PracticeDefinition& def)
{
    const auto& prototype = state.content->config.keywordPrototype;
    return prototype && prototype->mode != "disciplines" && !practice_prototype_tag(state, def.id).empty()
        ? "common"sv : std::string_view(def.pool);
}

template<class Bands>
double balance_value(const content::BalanceValue& assignment, const Bands& bands)
{
    if (const auto* amount = std::get_if<double>(&assignment)) return *amount;
    using enum browser::BalancePreset;
    switch (std::get<browser::BalancePreset>(assignment)) {
    case cheap: return bands.cheap;
    case fair: return bands.fair;
    case expensive: return bands.expensive;
    default: return 0;
    }
}

inline double year_phases(const RuntimeState& state, double years)
{
    const auto& settings = state.compiledContent->settings();
    const auto seasons = state.hot.seasons.size() == 0 ? 4 : state.hot.seasons.size();
    const auto phases = static_cast<double>(seasons) * settings.seasonDurationSec / settings.phaseDurationSec;
    return std::max(years > 0 ? 1.0 : 0.0, core::js::round(years * phases));
}

std::vector<SiteId> player_sites(const RuntimeState& state);
void add_event(RuntimeState& state, Vassal& actor, std::string_view kind,
               const std::string& id, std::optional<NodeId> node = {},
               std::string_view result = {}, std::optional<double> age = {},
               std::string_view text = {}, std::optional<std::string_view> deathCause = {},
               std::string_view cause = {});

}
