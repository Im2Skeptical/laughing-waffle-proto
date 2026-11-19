#include "sim/world/new_game.hpp"

#include "sim/practice/stock.hpp"
#include "sim/settlement/site_access.hpp"
#include "sim/state/runtime_admission.hpp"
#include "sim/vassal/detail.hpp"
#include "sim/world/generate.hpp"
#include "sim/world/opening_towns.hpp"

#include <algorithm>
#include <array>
#include <numeric>
#include <stdexcept>

namespace waffle::sim {
namespace {

using namespace browser;
using namespace std::string_view_literals;
using practice::detail::has;
using Road = RegionalWorld::Road;
constexpr auto regionCount = regional_region_count;

template<class T>
const T& definition(const OrderedDict<T>& definitions, std::string_view id)
{
    const auto found = std::ranges::find(definitions, id, &OrderedDict<T>::value_type::first);
    if (found == definitions.end()) throw std::invalid_argument("Missing opening definition " + std::string(id));
    return found->second;
}

const PracticeDefinition& practice_def(const GameState& state, std::string_view id)
{
    return definition(state.gameConfig.gamepieces.practices, id);
}

const StructureDefinition& structure_def(const GameState& state, std::string_view id)
{
    return definition(state.gameConfig.gamepieces.structures, id);
}

bool has_edible(const NeutralStock& stock)
{
    return has(stock.traits, "Edible");
}

template<class Predicate>
bool has_practice(const DetailedSettlement& settlement, Predicate test)
{
    return std::ranges::any_of(settlement.practiceSlots, [&](const auto& slot) {
        return slot && test(slot->practiceId);
    });
}

bool has_local_food(const GameState& state, std::string_view id)
{
    const auto& def = practice_def(state, id);
    return has(def.stockTraits, "Edible") && def.consume.empty() && def.require.empty();
}

GameState empty_game(std::uint32_t seed, const GameConfig& config, const RegionalWorld& map)
{
    GameState state;
    state.gameStateSchemaVersion = 53;
    state.seasons = {"spring", "summer", "autumn", "winter"};
    state.year = 1;
    state.seasonDurationSec = config.settings.values.seasonDurationSec;
    state.seasonTimeRemaining = state.seasonDurationSec;
    state.variantFlags.settlementPrototypeEnabled = true;
    state.gameConfig = config;
    state.world.definitionId = map.definitionId;
    state.nextGameEventFeedId = 1;
    state.skillRuntime.modifiers.global.populationFoodMult = 1;
    state.rng = {seed, double(seed), seed ^ 0x56a55a19u, seed ^ 0x3d7e10afu,
        seed ^ 0x19a7c4e3u, seed ^ 0x2f6e2b1du};

    auto& civ = state.civilization;
    civ.practiceEvents.nextId = 1;
    civ.chaos.chaosPower = 0;
    civ.research.total = std::max(0.0, config.settings.values.startingResearch);
    const auto& settings = config.settings.values;
    const double green = settings.greenAutomaticTier
        ? state.year / std::max(1.0, core::js::floor(settings.greenCadenceYears))
        : settings.greenForcedTier;
    civ.green.tier = std::clamp(core::js::floor(green), 0.0, 3.0);
    civ.vassalLineage.tenuresRemaining = 10;
    civ.vassalLineage.nextVassalId = 1;
    civ.vassalLineage.nextHeirloomInstanceId = 1;
    civ.lastPopulationAgingYear = 1;
    return state;
}

bool adjacent(const RegionalWorld& map, int from, int to)
{
    return std::ranges::binary_search(map.regions[from].neighbors, to);
}

void add_road(GameState& state, const RegionalWorld& map, int a, int b)
{
    if (!adjacent(map, a, b)) return;
    if (a > b) std::swap(a, b);
    const auto& from = map.regions[a].id;
    const auto& to = map.regions[b].id;
    auto& roads = state.world.connections;
    if (!std::ranges::any_of(roads, [&](const auto& road) {
            return road.regionAId == from && road.regionBId == to;
        })) roads.push_back({from, to});
}

// The candidate pool reads the pre-full-map Starter_02 cards and cohorts.
// The real full-map boards replace these as soon as the founders are rolled.
DetailedSettlement starter_template(double capacity)
{
    auto settlement = opening::empty_settlement();
    auto& villagers = settlement.populationByClass.villager;
    villagers.children = 5;
    villagers.adults = 15;
    villagers.eldersByAge = {{50, 1}, {53, 1}, {56, 1}};
    settlement.unlockedPracticeSlots = 5;
    settlement.practiceSlots[0] = PracticeSlot{.practiceId = "forage", .stock = 2};
    settlement.structureSlots.resize(static_cast<std::size_t>(capacity));
    settlement.structureSlots[0] = StructureCell{"granary", 0, 1, "lake-country:0"};
    settlement.structureSlots[1] = StructureCell{"mudHouses", 1, 1, "lake-country:1"};
    return settlement;
}

Road seed_starter(GameState& state, const RegionalWorld& map)
{
    auto eligible = map.openingRoads;
    std::erase_if(eligible, [&](auto road) { return !adjacent(map, road.first, road.second); });
    if (eligible.empty()) throw std::invalid_argument("No adjacent connected starting regions");
    const auto draw = [&](int choices) {
        return static_cast<int>(core::js::floor(core::rng_next_seed_float(state.rng.seed) * choices));
    };
    auto players = eligible[draw(static_cast<int>(eligible.size()))];
    if (players.first > players.second) std::swap(players.first, players.second);
    for (int i = 0; i < regionCount; ++i) {
        const auto& region = map.regions[i];
        const bool player = i == players.first || i == players.second;
        const double capacity = 5 + draw(4);
        state.world.regions.push_back({region.id, region.colour, player ? "player" : "frontier", capacity, player});
        if (player)
            state.world.sites.push_back({region.id + "-settlement", region.id, "detailed", region.name,
                                        starter_template(capacity)});
    }
    for (const auto& [a, b] : map.openingRoads) add_road(state, map, a, b);
    state.civilization.capitalRegionId = state.world.sites.front().regionId;
    state.civilization.capitalSiteId = state.world.sites.front().id;
    return players;
}

std::shared_ptr<const CompiledContent> seed_founders(GameState& state, const core::json::Value& topology,
                                                    const core::json::Value* capturedConfig)
{
    auto runtime = admit_runtime(state, &topology, capturedConfig);
    vassal::detail::generate_candidates(runtime);
    auto& pool = state.civilization.vassalLineage.pendingCandidates;
    pool = runtime.cold.at(runtime.hot.civilization.vassalLineage.pendingCandidates.row).get();
    state.rng.vassalSeed = runtime.hot.rng.vassalSeed;
    state.rng.vassalPortraitSeed = runtime.hot.rng.vassalPortraitSeed;
    return std::move(runtime.compiledContent);
}

std::array<int, regionCount> distances(const RegionalWorld& map, int start)
{
    std::array<int, regionCount> result;
    result.fill(regionCount);
    result[start] = 0;
    std::vector<int> queue{start};
    for (std::size_t i = 0; i < queue.size(); ++i) {
        const auto region = queue[i];
        for (int next : map.regions[region].neighbors) {
            if (result[next] != regionCount) continue;
            result[next] = result[region] + 1;
            queue.push_back(next);
        }
    }
    return result;
}

struct Territories {
    Road players;
    int capital;
    std::vector<int> provinces;
    std::vector<int> neutrals;
    int monster;

    bool player(int region) const { return region == players.first || region == players.second; }
    bool province(int region) const { return has(provinces, region); }
    bool neutral(int region) const { return has(neutrals, region); }
    bool player_neighbor(const RegionalWorld& map, int region) const
    {
        return adjacent(map, players.first, region) || adjacent(map, players.second, region);
    }
};

Territories assign_territories(const RegionalWorld& map, Road players)
{
    Territories result{.players = players, .capital = -1, .monster = -1};
    const auto fromCapital = distances(map, players.first);
    const auto fromOther = distances(map, players.second);
    const auto distantFirst = [&](int a, int b) { return fromCapital[a] > fromCapital[b]; };
    std::vector<int> distant(regionCount);
    std::iota(distant.begin(), distant.end(), 0);
    std::erase_if(distant, [&](int id) { return result.player(id); });
    std::ranges::stable_sort(distant, distantFirst);
    for (int region : distant) {
        auto provinces = map.regions[region].neighbors;
        std::erase_if(provinces, [&](int id) { return result.player(id); });
        if (provinces.size() < 3) continue;
        std::ranges::stable_sort(provinces, distantFirst);
        provinces.resize(3);
        const bool trade = std::ranges::any_of(distant, [&](int id) {
            return id != region && !has(provinces, id) && result.player_neighbor(map, id);
        });
        if (!trade) continue;
        result.capital = region;
        result.provinces = std::move(provinces);
        break;
    }
    if (result.capital < 0)
        throw std::invalid_argument("New Game needs a Crown capital with three provinces and an opening trade neighbour");

    std::vector<int> outskirts(regionCount);
    std::iota(outskirts.begin(), outskirts.end(), 0);
    std::erase_if(outskirts, [&](int id) { return result.player(id) || result.province(id) || id == result.capital; });
    std::ranges::stable_sort(outskirts, {}, [&](int id) { return std::min(fromCapital[id], fromOther[id]); });
    result.neutrals.assign(outskirts.begin(), outskirts.begin() + 3);
    result.monster = outskirts.back();
    return result;
}

std::string_view roll_town(GameState& state, std::string_view biome)
{
    const auto draw = static_cast<std::size_t>(core::rng_next_seed_float(state.rng.seed) * 3);
    if (biome == "plains") return std::array{"grain"sv, "grain"sv, "market"sv}[draw];
    if (biome == "forest") return std::array{"timber"sv, "timber"sv, "forager"sv}[draw];
    if (biome == "mountains") return std::array{"quarry"sv, "quarry"sv, "market"sv}[draw];
    return std::array{"forager"sv, "grain"sv, "market"sv}[draw];
}

PracticeSlot new_practice(GameState& state, std::string_view id, Quality tier, std::string_view faction)
{
    auto& next = *state.civilization.nextPracticeInstanceId;
    PracticeSlot slot{.practiceId = std::string(id), .tier = tier,
        .instanceId = "institution:" + std::to_string(static_cast<int>(next++))};
    if (practice_def(state, id).category == "influence") slot.allegiance = faction;
    else slot.stock = 0;
    return slot;
}

void place_structure(DetailedSettlement& settlement, const StructureDefinition& def,
                     std::string placementId, int& cell, std::optional<double> quality = {})
{
    const int width = static_cast<int>(def.footprint);
    if (width < 1 || width > 3) throw std::invalid_argument("Invalid opening footprint for " + def.id);
    if (cell + width > static_cast<int>(settlement.structureSlots.size())) return;
    settlement.structureSlots[cell] = StructureCell{def.id, double(cell), double(width),
        std::move(placementId), quality};
    cell += width;
}

void seed_board(GameState& state, Region& region, Site& site, const StringArray& ids,
                bool player, bool capital, bool province, std::string_view faction)
{
    auto& settlement = site.detailedState;
    const auto tier = capital ? Quality::gold : province ? Quality::silver : Quality::bronze;
    for (std::size_t i = 0; i < ids.size(); ++i)
        settlement.practiceSlots.at(i) = new_practice(state, ids[i], tier, faction);

    if (capital || province) region.structureCapacity = std::max(region.structureCapacity, capital ? 6.0 : 5.0);
    settlement.structureSlots.resize(static_cast<std::size_t>(region.structureCapacity));
    if (site.neutral || site.simulationMode == "ruin") return;
    int cell = 0;
    const auto place = [&](std::string_view id, std::string_view role, std::optional<double> quality = {}) {
        place_structure(settlement, structure_def(state, id), region.id + ':' + std::string(role), cell, quality);
    };
    const auto housing = capital || province ? "fe_garrisonBarracks" : player ? "fm_crumblingCottages" : "fm_crowdedTenement";
    place(housing, "housing");
    if (player || capital) place(housing, "housing:2");
    if (capital || province) {
        place("fm_imperialWaystation", "support", 1);
        if (province) place("fm_villagePalisade", "defense");
        return;
    }
    const auto trait = [&](std::string_view wanted) {
        return std::ranges::any_of(ids, [&](const auto& id) {
            return has(practice_def(state, id).stockTraits, wanted);
        });
    };
    place(trait("Construction") ? "rm_saggingStorehouse" : trait("Edible") ? "fm_leakingGranary" : "fm_villagePalisade",
          "support");
}

void seed_sites(GameState& state, const RegionalWorld& map, const Territories& territories)
{
    auto& civ = state.civilization;
    state.rulesetId = FullMapRuleset::full_map_redesign_v1;
    civ.prestige = 20;
    civ.treasury.emplace();
    civ.nextPracticeInstanceId = 1;
    civ.remnant = CivilizationRemnant{map.regions[territories.capital].id, "warrior", "external-a"};
    int provinceIndex = 0;
    for (int i = 0; i < regionCount; ++i) {
        auto& region = state.world.regions[i];
        const bool player = territories.player(i), capital = i == territories.capital;
        const bool province = territories.province(i), neutral = territories.neutral(i), monster = i == territories.monster;
        const bool dormant = neutral || monster;
        const auto faction = player ? "player"sv : "external-a"sv;
        region.controller = dormant ? "frontier"sv : faction;
        region.detailedSettlementEnabled = !monster;
        auto& site = player ? state.world.sites[i == territories.players.first ? 0 : 1]
            : state.world.sites.emplace_back(Site{region.id + "-settlement", region.id, "detailed"});
        site.name = capital ? "The Unbending Crown" : player ? "Free Settlement" : "Remnant Province";
        if (monster) site.simulationMode = "ruin";
        auto& settlement = site.detailedState = opening::empty_settlement();
        double population = 20;
        if (!player && !capital && !province) {
            const auto type = roll_town(state, map.regions[i].biome);
            auto market = opening::town_market(type);
            population = market.housing;
            site.name = monster ? "Monster-held Settlement" : neutral ? market.template_ : "Crown " + market.template_;
            site.town = Town{std::string(type), !dormant, {}};
            (neutral ? site.neutral : site.town->market) = std::move(market);
        }
        const auto crownRole = player || dormant ? ""sv : capital ? "capital"sv : province ? "province"sv : site.town->type;
        opening::seed_population(settlement, faction, crownRole, population);

        StringArray ids;
        if (player) {
            ids = i == territories.players.first ? StringArray{"fm_fallowFields", "fm_handQuern", "fm_hearthBarter"}
                : StringArray{map.regions[i].biome == "mountains" ? "fm_rubblePicking" : "fm_woodlotRights",
                             "rm_scrubForaging", "fm_hearthBarter"};
        } else if (capital) {
            ids = {"fm_handQuern", "rm_scrubForaging", "fm_fallowFields", "cp_ironCommunion", "fe_capitalDole"};
        } else if (province) {
            ids = {"fm_handQuern", "rm_scrubForaging", "fm_fallowFields",
                   provinceIndex++ == 0 ? "fe_salvageDetail" : "fe_roadRequisition", "fe_barrackLevy"};
        } else if (!dormant) {
            ids = *site.town->market->practices;
        }
        seed_board(state, region, site, ids, player, capital, province, faction);
        if (!site.town) {
            const auto type = i == territories.players.first ? "grain" : province ? "forager" : "market";
            site.town = Town{type, true, opening::town_market(type)};
        }
        settlement.control.emplace();
        settlement.garrison = DetailedSettlementGarrison{true, 0, 0, 0};
        settlement.unlockedPracticeSlots = 5;
    }
}

void seed_stock(GameState& state, const RegionalWorld& map, int monsterIndex,
                const core::json::Value& topology, const std::shared_ptr<const CompiledContent>& compiled)
{
    auto live = detail::admit_with_compiled_config(state, topology, compiled);
    auto regions = live.tables.view(live.hot.world.regions);
    for (int i = 0; i < regionCount; ++i) {
        if (i == monsterIndex) {
            // Later sites can see this Monster through a threatened modifier.
            regions[i].monster = runtime::RegionMonster{2};
            state.world.regions[i].monster = RegionMonster{2};
            continue;
        }
        const auto found = std::ranges::find(state.world.sites, map.regions[i].id, &Site::regionId);
        const auto id = live.find_id<runtime::SiteId>(found->id);
        const auto& site = settlement::site_at(live, id);
        const auto& slots = site.detailedState.practiceSlots.slots;
        for (std::size_t j = 0; j < slots.size(); ++j) {
            auto& slot = found->detailedState.practiceSlots[j];
            if (!slot || !slot->stock) continue;
            slot->stock = slot->practiceId == "cp_ironCommunion" ? 2 :
                practice::detail::stock_capacity(live, site, slots[j], false);
            live.practiceStock[slots[j].value] = slot->stock;
        }
    }
}

void fit_crown_housing(const GameState& state, Site& site)
{
    auto& settlement = site.detailedState;
    auto original = std::move(settlement.structureSlots);
    settlement.structureSlots.resize(original.size());
    const auto& cottage = structure_def(state, "fm_crumblingCottages");
    const auto& population = settlement.populationByClass.villager;
    const double housing = cottage.housing.value_or(0);
    int cell = 0;
    if (housing > 0) {
        const auto houses = core::js::ceil((population.children + population.adults) / housing);
        for (int i = 0; i < houses && cell < static_cast<int>(original.size()); ++i) {
            const auto placement = site.regionId + ":housing" + (i ? ':' + std::to_string(i + 1) : "");
            const int before = cell;
            place_structure(settlement, cottage, placement, cell);
            if (cell == before) return; // The browser stops at the first placement that cannot fit.
        }
    }
    for (auto& slot : original) {
        if (!slot || structure_def(state, slot->structureId).housing.value_or(0) != 0) continue;
        if (cell + slot->width > original.size()) break;
        slot->origin = cell;
        const int origin = cell;
        cell += static_cast<int>(slot->width);
        settlement.structureSlots[origin] = std::move(slot);
    }
}

int region_index(const RegionalWorld& map, std::string_view id)
{
    return static_cast<int>(std::ranges::find(map.regions, id, &RegionalWorld::Region::id) - map.regions.begin());
}

struct FoodStock {
    std::size_t site, slot;
    std::optional<double> previous;
};

std::vector<FoodStock> seed_food(GameState& state, const RegionalWorld& map, const Territories& territories)
{
    auto& sites = state.world.sites;
    for (auto& site : sites) {
        if (site.neutral || site.simulationMode == "ruin") continue;
        const auto region = region_index(map, site.regionId);
        if (territories.player(region) || territories.province(region) || region == territories.capital) continue;
        fit_crown_housing(state, site);
        if (site.town->type == "market")
            for (auto& slot : site.detailedState.practiceSlots)
                if (slot && slot->practiceId == "fm_fallowFields") slot.reset();
    }

    std::array<double, regionCount> budgets{};
    for (const auto& site : sites) {
        if (!site.neutral) continue;
        const auto id = region_index(map, site.regionId);
        for (const auto& stock : site.neutral->stocks)
            if (stock.price == 1 && has_edible(stock)) budgets[id] += stock.replenishment;
        budgets[id] = std::max(0.0, budgets[id] - std::ranges::count_if(map.regions[id].neighbors,
            [&](int neighbor) { return territories.player(neighbor); }));
    }
    const auto source = [&](std::string_view id) { return has_local_food(state, id); };
    const auto noPractice = [](const auto& slot) { return !slot; };
    std::vector<FoodStock> fills;
    std::vector<PracticeSlot> displaced;
    for (std::size_t i = 0; i < sites.size(); ++i) {
        auto& site = sites[i];
        if (site.neutral || site.simulationMode == "ruin" || has_practice(site.detailedState, source)) continue;
        const auto id = region_index(map, site.regionId);
        const auto& neighbors = map.regions[id].neighbors;
        const auto supplier = std::ranges::find_if(neighbors, [&](int neighbor) { return budgets[neighbor] >= 1; });
        if (supplier != neighbors.end() && has_practice(site.detailedState, [](auto id) { return id == "fm_hearthBarter"; })) {
            add_road(state, map, id, *supplier);
            --budgets[*supplier];
            continue;
        }
        auto& slots = site.detailedState.practiceSlots;
        auto slot = std::ranges::find_if(slots, noPractice);
        if (slot == slots.end()) slot = slots.end() - 1;
        if (*slot) displaced.push_back(std::move(**slot));
        *slot = new_practice(state, "rm_scrubForaging", Quality::bronze, "external-a");
        (*slot)->stock = 0; // The opening food insert is always a Stock host.
        (*slot)->allegiance.reset();
        fills.push_back({i, static_cast<std::size_t>(slot - slots.begin()), {}});
    }

    StringArray installed;
    for (auto& site : sites) {
        if (site.neutral || site.simulationMode == "ruin") {
            auto& market = site.neutral ? *site.neutral : *site.town->market;
            auto& practices = *market.practices;
            if (std::ranges::none_of(practices, source)) {
                if (practices.size() < 5) practices.push_back("rm_scrubForaging");
                else practices.back() = "rm_scrubForaging";
            }
            installed.insert(installed.end(), practices.begin(), practices.end());
        } else {
            for (const auto& slot : site.detailedState.practiceSlots)
                if (slot) installed.push_back(slot->practiceId);
        }
    }
    for (auto& slot : displaced) {
        if (has(installed, slot.practiceId)) continue;
        const auto province = std::ranges::find_if(sites, [&](const auto& site) {
            return site.name == "Remnant Province" && std::ranges::any_of(site.detailedState.practiceSlots, noPractice);
        });
        if (province == sites.end()) continue;
        installed.push_back(slot.practiceId);
        auto& slots = province->detailedState.practiceSlots;
        const auto empty = std::ranges::find_if(slots, noPractice);
        if (slot.stock) {
            fills.push_back({static_cast<std::size_t>(province - sites.begin()),
                             static_cast<std::size_t>(empty - slots.begin()), slot.stock});
            slot.stock = 0;
        }
        *empty = std::move(slot);
    }
    for (auto& site : sites) {
        auto& slots = site.detailedState.practiceSlots;
        const auto last = std::find_if(slots.rbegin(), slots.rend(), [](const auto& slot) { return slot.has_value(); });
        site.detailedState.unlockedPracticeSlots = std::max(3.0, double(slots.rend() - last));
        if (site.neutral || site.simulationMode == "ruin") continue;
        auto& practices = *site.town->market->practices;
        practices.clear();
        for (const auto& slot : slots) if (slot) practices.push_back(slot->practiceId);
    }
    return fills;
}

void seed_trade(GameState& state, const RegionalWorld& map, const Territories& territories)
{
    for (int province : territories.provinces) add_road(state, map, territories.capital, province);
    for (auto& site : state.world.sites) {
        if (!site.neutral) continue;
        const auto region = region_index(map, site.regionId);
        if (!territories.player_neighbor(map, region)) continue;
        if (std::ranges::none_of(site.neutral->stocks, has_edible)) {
            site.neutral = opening::town_market("grain");
            site.town->type = "grain";
            site.name = site.neutral->template_;
        }
        const int player = adjacent(map, territories.players.first, region)
            ? territories.players.first : territories.players.second;
        add_road(state, map, player, region);
        break;
    }
}

}

RuntimeState build_new_game(std::uint32_t seed, const browser::GameConfig& config,
                            const core::json::Value* capturedConfig)
{
    const auto map = generate_regional_world(seed);
    const auto topology = map.topology_json();
    auto state = empty_game(seed, config, map);
    const auto players = seed_starter(state, map);
    auto compiled = seed_founders(state, topology, capturedConfig);
    const auto territories = assign_territories(map, players);
    seed_sites(state, map, territories);
    seed_stock(state, map, territories.monster, topology, compiled);
    seed_trade(state, map, territories);
    auto fills = seed_food(state, map, territories);
    for (auto& fill : fills) fill.site = static_cast<std::size_t>(region_index(map, state.world.sites[fill.site].regionId));
    // R01..R20 are ordered by their authored ordinals. The browser keeps the
    // two starters first during seeding and canonicalizes site order last.
    std::ranges::sort(state.world.sites, {}, &Site::regionId);
    std::ranges::sort(state.world.connections, {}, [](const auto& road) {
        return std::tie(road.regionAId, road.regionBId);
    });
    state.civilization.chaos.monsterCount = 1;
    state.civilization.chaos.spatialSpawns = 1;
    auto live = detail::admit_with_compiled_config(state, topology, std::move(compiled));
    for (const auto& fill : fills) {
        const auto& site = settlement::site_at(live, runtime::SiteId{static_cast<std::uint32_t>(fill.site)});
        const auto slot = site.detailedState.practiceSlots.slots[fill.slot];
        const auto capacity = practice::detail::stock_capacity(live, site, slot, false);
        live.practiceStock[slot.value] = fill.previous ? std::min(*fill.previous, capacity) : capacity;
    }
    return live;
}

}
