#include "sim/vassal/detail.hpp"

#include "core/js_math.hpp"
#include "sim/practice/stock.hpp"
#include "sim/territory/detail.hpp"

namespace waffle::sim::vassal::detail {
namespace {

bool calculated(const content::BalanceValue& value)
{
    const auto* preset = std::get_if<browser::BalancePreset>(&value);
    return preset && *preset == browser::BalancePreset::calculated;
}

template<class Costs>
const content::OptionCost& campaign_cost(const Costs& costs, std::string_view key)
{
    if (key == "attack") return costs.attack;
    if (key == "duel") return costs.duel;
    if (key == "quest") return costs.quest;
    return costs.leave;
}

const content::OptionCost* authored_cost(const content::LifeMapDesign& design,
                                        const browser::LifeMapNodeState& node, std::string_view key)
{
    if (!design.enabled) return nullptr;
    if (node.signatureNode && node.signatureNode->variantId == "monsterHunt")
        return &campaign_cost(design.optionCosts.signature_monsterHunt, key);
    if (!node.signatureNode && node.family == "campaign")
        return &campaign_cost(design.optionCosts.campaign, key);
    return nullptr;
}

void apply_cost(const RuntimeState& state, browser::LifeMapOption& option, std::string_view key,
                const content::LifeMapDesignCostBands& bands, const content::OptionCost& cost)
{
    option.balanceKey = key;
    option.phaseCost = year_phases(state, balance_value(cost.time, bands.time));
    option.prestigeCost = balance_value(cost.prestige, bands.prestige);
    if (!option.mode && !calculated(cost.risk))
        option.immediateDeathChance = balance_value(cost.risk, bands.risk);
    if (!calculated(cost.monsterPressure)) {
        option.effects.emplace();
        const auto pressure = balance_value(cost.monsterPressure, bands.monsterPressure);
        if (pressure > 0) option.effects->emplace_back(browser::PracticeEffectaddMonsterPressure{.amount = pressure});
    }
}

std::vector<double> potential_distances(const RuntimeState& state, RegionId origin)
{
    const auto count = state.hot.world.regions.size();
    std::vector<double> distances(count, static_cast<double>(count));
    std::vector<RegionId> queue{origin};
    distances[origin.value] = 0;
    for (std::size_t i = 0; i < queue.size(); ++i)
        for (const auto next : territory::neighbors(state, queue[i])) {
            if (distances[next.value] != static_cast<double>(count)) continue;
            distances[next.value] = distances[queue[i].value] + 1;
            queue.push_back(next);
        }
    if (queue.size() < count && state.topology) {
        const auto from = state.topology->label_point(origin);
        const auto scale = core::js::sqrt(static_cast<double>(count));
        if (from) for (const auto region : state.topology->regions()) {
            auto& distance = distances[region.value];
            if (distance != static_cast<double>(count)) continue;
            const auto to = state.topology->label_point(region);
            if (to) distance = std::max(1.0, core::js::ceil(
                core::js::hypot((*from)[0] - (*to)[0], (*from)[1] - (*to)[1]) * scale));
        }
    }
    return distances;
}

double legacy_warriors(const Site& site)
{
    const auto& people = site.detailedState.populationByClass;
    return static_cast<double>(people.villager.specialists.warrior.adults
        + people.stranger.specialists.warrior.adults);
}

double attack_warriors(const RuntimeState& state, RegionId origin)
{
    double warriors = 0;
    double arms = 0;
    const auto* local = settlement::detailed_site(state, origin);
    const auto unrest = local && local->detailedState.control && local->detailedState.control->unrest;
    for (const auto id : player_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        if (state.hot.rulesetId) {
            if (local && (site.regionId == origin ||
                (!unrest && practice::detail::has(territory::neighbors(state, origin), site.regionId)
                         && practice::detail::has(territory::roads(state, origin), site.regionId))))
                warriors += territory::available_warriors(state, site.regionId);
            continue;
        }
        warriors += legacy_warriors(site);
        for (const auto& source : practice::detail::stock_sources(state, site, true))
            if (practice::detail::has(source.traits, state.territory.arms))
                arms += std::max(0.0, source.remaining);
    }
    return state.hot.rulesetId ? warriors : std::min(warriors, arms);
}

}

browser::LifeMapNodeStateOptions campaign_options(const RuntimeState& state, const Vassal& actor,
                                                   const browser::LifeMapNodeState& node)
{
    using browser::LifeMapOption;
    if (actor.classId != browser::SpecialistClass::warrior) return {};
    const auto& design = state.compiledContent->values.lifeMapGenerator.design;
    const auto& visit = *node.campaign;
    browser::LifeMapNodeStateOptions options;
    if (!visit.failed) {
        double prowess = whole(actor.stats.intelligence);
        for (const auto& item : read(state, actor.heirlooms).equipped)
            if (item && item->definitionId == "abacus") ++prowess;
        const auto retinue = territory::retinue(state, actor);
        const auto warriors = attack_warriors(state, actor.locationRegionId);
        const auto distances = potential_distances(state, actor.locationRegionId);
        bool questAvailable = false;
        const auto add = [&](std::string_view mode, RegionId region, double defense,
                             std::string_view stage, std::string_view label) {
            const bool duel = mode == "duel", attack = mode == "attack", quest = mode == "quest";
            const auto force = prowess + (duel ? 0 : retinue) + (attack ? warriors : 0);
            const auto baseRisk = std::min(100.0, core::js::round(defense / std::max(1.0, force + defense) * 100));
            const auto* cost = authored_cost(design, node, mode);
            const auto risk = cost && !calculated(cost->risk)
                ? core::js::round(balance_value(cost->risk, design.costBands.risk) * 100) : baseRisk;
            const auto bonus = risk > 0 ? 15.0 : 0.0;
            const auto distance = distances[region.value];
            const auto name = state.topology ? state.topology->region_name(region) : "null"sv;
            LifeMapOption option{
                .id = std::string(mode) + ":" + std::string(state.name(region)),
                .label = std::string(label) + ": " + std::string(name),
                .phaseCost = 2,
                .prestigeCost = attack ? 5.0 : 0.0,
                .prestigeDelta = (duel || quest ? 10.0 : stage == "nest" ? 12 + defense * 4 : 0) + bonus,
                .description = duel ? "+1 Prowess and 10 Prestige, plus the Warrior risk bonus."
                    : quest ? "A Relic and 10 Prestige."
                    : stage == "clear" ? "Reset Creep; the nest remains."
                    : stage == "nest" ? "Destroy this Monster nest."
                    : "Bring this settlement into your civilization.",
                .regionId = std::string(state.name(region)), .mode = std::string(mode), .stage = std::string(stage),
                .defense = defense, .force = force, .risk = risk, .baseRisk = baseRisk, .distance = distance,
                .foodCost = duel ? 0.0 : 1 + distance, .warriorBonus = bonus,
            };
            if (cost) apply_cost(state, option, mode, design.costBands, *cost);
            options.push_back(std::move(option));
            questAvailable |= quest;
        };
        const auto visited = [&](RegionId region) {
            return std::ranges::find(visit.questRegionIds, state.name(region)) != visit.questRegionIds.end();
        };
        for (const auto& region : state.tables.view(state.hot.world.regions)) {
            if (!region.monster) continue;
            const bool cleared = region.monster->cleared.value_or(false);
            add("attack", region.id, region.monster->defense + (cleared ? 4 : 0),
                cleared ? "nest" : "clear", cleared ? "Destroy nest" : "Clear monsters");
            if (!visited(region.id)) add("quest", region.id, 4, "quest", "Quest");
        }
        for (const auto& site : state.tables.view(state.hot.world.sites)) {
            if (state.hot.rulesetId) {
                const auto holder = territory::region_at(state, site.regionId).controller;
                if (holder != state.practiceVocabulary.player && settlement::detailed_site(state, site.regionId) == &site)
                    add("attack", site.regionId, std::max(1.0, territory::military(state, site.regionId, holder).defense),
                        "alliance", "Attack settlement");
            } else if (site.neutral) {
                add("attack", site.regionId, state.tables.at(*site.neutral).defense, "alliance", "Attack settlement");
            }
        }
        if (!visit.duelDone) add("duel", actor.locationRegionId, 4, "duel", "Honour duel");
        if (!questAvailable && !visited(actor.locationRegionId)) add("quest", actor.locationRegionId, 4, "quest", "Quest");
    }
    LifeMapOption leave{.id = "campaign-leave", .label = "Leave Campaign"};
    if (const auto* cost = authored_cost(design, node, "leave")) apply_cost(state, leave, "leave", design.costBands, *cost);
    options.push_back(std::move(leave));
    return options;
}

}
