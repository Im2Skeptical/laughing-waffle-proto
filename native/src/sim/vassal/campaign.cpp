#include "sim/vassal/detail.hpp"
#include "sim/vassal/action_choices.hpp"

#include "core/js_math.hpp"
#include "sim/practice/stock.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"
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

void move_garrison(RuntimeState& state, const Site& origin, Site& target)
{
    using namespace settlement;
    const auto player = state.practiceVocabulary.player;
    const auto required = std::ceil(territory::resistance(state, target, player).units / 10);
    std::vector<RegionId> reachable;
    if (territory::region_at(state, origin.regionId).controller == player) reachable.push_back(origin.regionId);
    const auto unrest = origin.detailedState.control && origin.detailedState.control->unrest;
    if (!unrest) for (const auto id : territory::neighbors(state, origin.regionId))
        if (practice::detail::has(territory::roads(state, origin.regionId), id) &&
            territory::region_at(state, id).controller == player && settlement::detailed_site(state, id)) reachable.push_back(id);

    const PopulationFilter filter{.specialty = state.populationVocabulary.specialties[2],
        .kind = state.populationVocabulary.stages[0], .allegiance = player};
    std::vector<PopulationBin> sourceBins, eligible, selected, moved, targetBins;
    LedgerScratch scratch;
    collect_population(state, target.detailedState.populationByClass, targetBins);
    for (const auto id : reachable) {
        if (id == target.regionId) continue;
        auto& source = *settlement::detailed_site(state, id);
        while (territory::available_warriors(state, id) > 0) {
            const auto force = territory::military(state, target.regionId, player, nullptr, nullptr, true).force;
            if (force > 0 && force >= required) break;
            collect_population(state, source.detailedState.populationByClass, eligible, filter);
            allocate_population(state, eligible, 1, selected, scratch);
            if (selected.empty()) break;
            collect_population(state, source.detailedState.populationByClass, sourceBins);
            remove_population(sourceBins, selected, moved);
            write_population_bins(state, source.id, sourceBins, scratch);
            for (auto bin : moved) {
                bin.residency = Residency::stranger;
                targetBins.push_back(bin);
            }
            write_population_bins(state, target.id, targetBins, scratch);
        }
    }
    target.detailedState.garrison = DetailedSettlementGarrison{.supplied = false, .paid = 0, .required = 0, .tSec = state.hot.tSec};
}

void conquer(RuntimeState& state, Site& site, double edge)
{
    using namespace settlement;
    if (state.hot.rulesetId) {
        territory::occupy_campaign_site(state, site);
        return;
    }
    const auto& people = population_totals(state, site.id).byResidency;
    const auto population = static_cast<double>(people[0].total() + people[1].total());
    const auto survivors = std::max(1.0, std::floor(population * (edge >= 3 ? 1 : .8)));
    const std::array<Cohort, 3> empty{};
    const Cohort cohort{.adults = survivors};
    write_legacy_cohorts(state, site.id, Residency::villager, empty, {});
    write_legacy_cohorts(state, site.id, Residency::stranger, {cohort, {}, {}}, cohort);
    if (edge < 3) for (const auto slot : site.detailedState.practiceSlots.slots) {
        if (!slot || !state.practiceStock[slot.value]) continue;
        auto& stock = *state.practiceStock[slot.value];
        stock = std::floor(stock * .8);
    }
    site.neutral.reset();
    site.simulationMode = state.territory.detailed;
    auto& region = territory::region_at(state, site.regionId);
    region.detailedSettlementEnabled = true;
    if (auto& turn = state.hot.civilization.currentMoonTurn)
        ensure_moon_region_result(state, *turn, site.regionId);
    region.controller = state.practiceVocabulary.player;
    ++state.hot.civilization.history.conquests;
    state.territory.sitesDirty = true;
    territory::synchronize_sites(state);
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

bool campaign_blocked(const RuntimeState& state, const Vassal& actor, const browser::LifeMapOption& option)
{
    if (actor.classId != browser::SpecialistClass::warrior) return true;
    if (option.id == "campaign-leave") return false;
    const auto* source = settlement::detailed_site(state, actor.locationRegionId);
    const auto food = option.foodCost.value_or(0);
    if (state.hot.rulesetId) return !action_stock_plan(state, source, state.practiceVocabulary.edible, food).ok;
    return actor.prestige < std::ceil(std::max(0.0, option.prestigeCost)) ||
        action_stock_total(state, source, state.practiceVocabulary.edible) < food;
}

ActionResult commit_campaign(RuntimeState& state, Vassal& actor, browser::LifeMapNodeState& node,
                             const browser::LifeMapOption& option, double price, double phaseCost)
{
    auto* source = settlement::detailed_site(state, actor.locationRegionId);
    const auto& edible = state.practiceVocabulary.edible;
    const auto plan = action_stock_plan(state, source, edible, option.foodCost.value_or(0));
    if (!source || !plan.ok) return {"campaignUnavailable"};
    auto& civ = state.hot.civilization;
    auto& account = state.hot.rulesetId ? *civ.prestige : actor.prestige;
    if (!state.hot.rulesetId && price > account) return {"campaignUnavailable"};
    const auto substitution = state.hot.rulesetId && price > account ? 10.0 : 0.0;
    const auto region = state.find_id<RegionId>(*option.regionId);
    auto& visit = *node.campaign;
    auto& journal = civ.practiceEvents;
    const auto previousRoot = journal.activeRoot;
    const auto previousEvent = journal.activeEvent;
    practice::EventData event;
    event.fields.classId = browser::OptionalNullable<SymbolId>{intern<SymbolId>(state, "warrior")};
    event.fields.actionKind = intern<SymbolId>(state, "campaign");
    const auto root = practice::emit(state, intern<EventKindId>(state, "vassalAction"), actor.locationRegionId, event);
    journal.activeRoot = root.rootId;
    journal.activeEvent = root.id;
    account -= substitution ? 0 : price;
    practice::apply_stock(state, *source, plan);
    const auto dice = 1.0 + pick(state, 100);
    const auto risk = option.risk.value_or(0);
    const auto stage = *option.stage;
    const bool success = dice > risk;
    browser::CampaignLastResult result{.stage = stage, .regionId = *option.regionId, .roll = dice, .risk = risk, .success = success};
    event.fields.actionKind.reset();
    const auto emit = [&](std::string_view kind) {
        practice::emit(state, intern<EventKindId>(state, kind), actor.locationRegionId, event);
    };
    const auto prize = option.prestigeDelta.value_or(0);
    if (!success) {
        visit.failed = true;
        result.text = "Defeat. The expedition ends; your Vassal returns.";
    } else if (stage == "clear") {
        civ.chaos.monsterPressure = 0;
        territory::region_at(state, region).monster->cleared = true;
        result.text = "Monsters cleared. Creep reset; the nest remains.";
    } else if (stage == "nest") {
        territory::region_at(state, region).monster.reset();
        if (auto* site = territory::site_at_region(state, region); site && state.name(site->simulationMode) == "ruin")
            conquer(state, *site, 3);
        territory::recount_monsters(state);
        ++civ.history.victories;
        civ.research.total += option.defense.value_or(0) * 3;
        event.fields.faction = browser::OptionalNullable<FactionId>{state.practiceVocabulary.player};
        emit("monsterDestroyed");
        event.fields.faction = {};
        result.text = "Monster nest destroyed.";
    } else if (stage == "alliance") {
        if (auto* site = territory::site_at_region(state, region)) {
            if (state.hot.rulesetId) move_garrison(state, *source, *site);
            conquer(state, *site, option.force.value_or(0) - option.defense.value_or(0));
        }
        result.text = "Settlement allied with your civilization.";
    } else if (stage == "duel") {
        visit.duelDone = true;
        ++actor.stats.intelligence;
        emit("challengeCompleted");
        result.text = "Duel won. +1 Prowess and +" + decimal(prize) + " Prestige.";
    } else {
        visit.questRegionIds.push_back(*option.regionId);
        auto rewards = relic_options(state, actor, false);
        if (rewards.front().definitionId) {
            auto& reward = node.rewardAcquisition.emplace(std::move(rewards.front()));
            reward.id = "campaign-reward";
            reward.phaseCost = option.phaseCost;
            reward.effects.emplace();
            reward.immediateDeathChance = 0;
        }
        result.text = "Quest complete. +" + decimal(prize) + " Prestige and a Relic.";
    }
    if (success) {
        credit_prestige(state, actor, prize);
        if (risk > 0) {
            event.fields.martial = true;
            emit("dangerSurvived");
            event.fields.martial.reset();
        }
        if (option.mode == "attack") emit("campaignWon");
    }
    visit.lastResult = std::move(result);
    if (state.compiledContent->values.lifeMapGenerator.design.enabled && !node.rewardAcquisition && phaseCost > 0)
        node.heirloomTimeActionUsed = true;
    double pressure = substitution;
    if (option.effects) for (const auto& effect : *option.effects)
        if (const auto* add = std::get_if<browser::PracticeEffectaddMonsterPressure>(&effect)) pressure += add->amount;
    if (pressure > 0) territory::add_pressure(state, pressure);
    journal.activeRoot = previousRoot;
    journal.activeEvent = previousEvent;
    practice::drain(state);
    return {};
}

}
