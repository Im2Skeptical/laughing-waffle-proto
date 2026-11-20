#include "settlement_model.hpp"

#include "sim/practice/stock.hpp"
#include "sim/practice/recipes.hpp"
#include "sim/step/advance_second.hpp"
#include "sim/territory/detail.hpp"

#include <algorithm>
#include <cstdio>

namespace waffle::connected {
namespace {

using sim::RuntimeState;
using namespace sim::runtime;
namespace stock = sim::practice::detail;
namespace content = sim::content;

std::string units(double value)
{
    char buffer[48];
    std::snprintf(buffer, sizeof(buffer), value == std::floor(value) ? "%.0f" : "%.1f", value);
    return buffer;
}

std::string title(std::string_view value)
{
    std::string result;
    for (const char ch : value) {
        if (!result.empty() && result.back() >= 'a' && result.back() <= 'z' && ch >= 'A' && ch <= 'Z') result += ' ';
        result += ch == '_' || ch == '-' ? ' ' : ch;
    }
    if (!result.empty() && result.front() >= 'a' && result.front() <= 'z') result.front() -= 'a' - 'A';
    return result;
}

std::string mood(const RuntimeState& state, SymbolId id)
{
    const auto name = id ? state.name(id) : "";
    return name == "positive" ? "Content" : name == "negative" ? "Distressed" : "Steady";
}

std::string faction(const RuntimeState& state, FactionId id)
{
    if (id == state.practiceVocabulary.player) return "Your faction";
    if (id == state.practiceVocabulary.external) return "Crown";
    if (!id || id == state.practiceVocabulary.frontier || id == state.practiceVocabulary.neutral) return "Unheld";
    return title(state.name(id));
}

template<class Key>
std::string names(const RuntimeState& state, std::span<const Key> keys)
{
    std::string result;
    for (auto key : keys) {
        if (!result.empty()) result += " / ";
        result += state.name(key);
    }
    return result;
}

std::string second(double value) { return "s " + units(value); }
std::string percent(double fraction) { return units(fraction * 100) + "%"; }

std::string demand(double consumed, double needed)
{
    return units(consumed) + " / " + units(needed);
}

Census census(const RuntimeState& state, const PopulationClass& population, const sim::PopulationTotals& totals)
{
    Census result;
    result.children = static_cast<double>(totals.children);
    result.adults = static_cast<double>(totals.adults);
    result.elders = static_cast<double>(totals.elders);
    for (const auto& row : state.tables.view(population.eldersByAge))
        result.elderAges.emplace_back(static_cast<double>(row.age), static_cast<double>(row.count));
    result.scholars = sim::settlement::cohort_total(sim::settlement::cohort_view(state, population.specialists.scholar));
    result.warriors = sim::settlement::cohort_total(sim::settlement::cohort_view(state, population.specialists.warrior));
    result.mood = mood(state, population.happiness.status);
    result.faith = population.faith.tier ? title(state.name(population.faith.tier)) : "Unrecorded";
    if (population.faith.trend) result.faithTrend = mood(state, *population.faith.trend);
    result.fullMeals = population.happiness.fullFeedStreak;
    result.missedMeals = population.happiness.missedFeedStreak;
    result.faithStreak = population.faith.streak;
    result.collapse = population.faith.collapseActive.value_or(false);
    return result;
}

SettlementOverview overview(const RuntimeState& state, const Region& region, const Site& site)
{
    SettlementOverview result;
    const auto& local = site.detailedState;
    const auto& pop = sim::settlement::population_totals(state, site.id).byResidency;
    result.census = {census(state, local.populationByClass.villager, pop[0]),
                     census(state, local.populationByClass.stranger, pop[1])};

    std::string mealDetail = site.neutral ? "Priced market supply" : "No meal recorded";
    bool shortage = false;
    std::optional<double> mealFill;
    if (local.lastMeal && !site.neutral) {
        const auto& meal = state.tables.at(*local.lastMeal);
        result.meal = {static_cast<Second>(meal.tSec), meal.demand, meal.consumed, meal.ratio,
            meal.byClass.villager.ratio, meal.byClass.stranger.ratio};
        shortage = meal.consumed < meal.demand;
        mealFill = meal.ratio;
        mealDetail = (shortage ? "Last meal short · " : "Last meal met · ") +
            demand(meal.consumed, meal.demand) + " at " + second(meal.tSec);
    }
    if (local.lastMoonResult && !site.neutral) {
        const auto& moon = state.tables.at(*local.lastMoonResult);
        if (moon.housing && moon.faith) {
            const auto& lastHousing = state.tables.at(*moon.housing);
            if (lastHousing.overflow > 0) result.housingMoodCap = mood(state, lastHousing.happinessCap);
        }
    }
    if (!site.neutral && region.population > 0 && region.food <= 0) {
        mealDetail = "No local reserve · " + mealDetail;
        shortage = true;
    }
    result.economy.push_back({"food", "Food", units(region.food), mealDetail, shortage, mealFill});
    const double overflow = std::max(0.0, region.population - region.housing);
    result.economy.push_back({"housing", "Housing", demand(region.population, region.housing),
        overflow > 0 ? units(overflow) + " over capacity" : units(region.housing - region.population) + " places free",
        overflow > 0, region.housing > 0 ? region.population / region.housing : (overflow > 0 ? 1. : 0.)});
    result.economy.push_back({"currency", "Currency", units(region.currency), ""});

    struct StockGroup { std::string traits; double local{}, linked{}, market{}; };
    std::vector<StockGroup> groups;
    for (const auto& source : stock::stock_sources(state, site, false)) {
        if (source.traits.empty()) continue;
        std::vector<std::string_view> tags;
        for (const auto trait : source.traits) tags.push_back(state.name(trait));
        std::ranges::sort(tags);
        std::string traits;
        for (const auto tag : tags) {
            if (!traits.empty()) traits += " / ";
            traits += tag;
        }
        auto group = std::ranges::find(groups, traits, &StockGroup::traits);
        if (group == groups.end()) group = groups.insert(groups.end(), {std::move(traits)});
        if (source.priced || site.neutral) group->market += source.remaining;
        else if (source.region == site.regionId) group->local += source.remaining;
        else group->linked += source.remaining;
    }
    std::ranges::sort(groups, {}, &StockGroup::traits);
    for (const auto& group : groups) {
        const auto available = group.local + group.linked;
        const auto detail = available > 0 ? units(group.local) + " local · " + units(group.linked) + " linked" : "";
        if (available > 0) result.economy.push_back({"stock-" + group.traits, group.traits, units(available), detail});
        if (group.market > 0) result.economy.push_back({"market-" + group.traits, group.traits, units(group.market), "Priced market Stock"});
    }

    const auto holder = stock::holder(state, site.regionId);
    const auto* control = local.control ? &*local.control : nullptr;
    if (control && control->unrest) {
        const auto& unrest = *control->unrest;
        result.control.push_back({"holding", "Holding", "Unrest",
            faction(state, unrest.previousController) + " lost control · " +
            units(std::max(0., unrest.untilSec - state.hot.tSec)) + " s left", true});
    } else if (region.holder == Holder::player || region.holder == Holder::crown) {
        const bool noLoyalResidents = region.population > 0 && region.loyalSharePercent == 0;
        const bool atRisk = noLoyalResidents || region.holdingForce < region.requiredForce;
        result.control.push_back({"holding", "Holding", atRisk ? "At risk" : faction(state, holder),
            noLoyalResidents ? "No loyal residents" : units(region.loyalSharePercent) + "% loyal · " +
            demand(region.holdingForce, region.requiredForce) + " Force (have / needed)", atRisk, region.loyalSharePercent / 100});
    } else {
        result.control.push_back({"holding", "Holding", region.holder == Holder::monster ? "Creep" : "Unheld", ""});
    }
    if (control && control->claimant)
        result.control.push_back({"claim", "Claimant", faction(state, *control->claimant),
            units(control->claimChecks) + " completed claim checks", true});
    const auto military = sim::territory::military(state, site.regionId, holder);
    std::string supply = "No recorded upkeep";
    bool unsupplied = false;
    if (local.garrison) {
        const auto& garrison = *local.garrison;
        unsupplied = garrison.supplied == false;
        if (garrison.supplied) supply = unsupplied ? "Unsupplied" : "Supplied";
        if (garrison.required) supply += " · " + demand(garrison.paid.value_or(0), *garrison.required) + " Arms paid";
        if (garrison.supportTargetRegionId.has_key())
            if (const auto target = garrison.supportTargetRegionId.value())
                supply += " · supports " + std::string(state.topology->region_name(*target));
    }
    const auto upkeep = sim::practice::garrison_upkeep_cost(state, site);
    if ((!local.garrison || !local.garrison->required) && upkeep > 0)
        supply += " · " + units(upkeep) + " Arms upkeep";
    if (!control || !control->claimant) supply += " · No claimant";
    result.control.push_back({"garrison", "Garrison", units(military.warriors) + " Warriors",
        supply + " · " + units(military.defense) + " Defense", unsupplied});
    return result;
}

std::string flow(const RuntimeState& state, const MigrationReport& row)
{
    std::string detail;
    for (const auto& move : state.tables.view(row.inbound)) {
        detail += " +" + units(move.survivors) + " from " +
            (move.external.value_or(false) ? std::string("outside") : std::string(state.topology->region_name(move.sourceRegionId))) +
            " (" + title(state.name(move.reason)) + ").";
    }
    for (const auto& move : state.tables.view(row.outbound))
        detail += " −" + units(move.amount) + " to " + std::string(state.topology->region_name(move.destinationRegionId)) +
            " (" + title(state.name(move.reason)) + ").";
    for (const auto& intent : state.tables.view(row.intents))
        if (intent.unresolved > 0)
            detail += " " + units(intent.unresolved) + " " + title(state.name(intent.reason)) +
                " unresolved (" + title(state.name(intent.unresolvedOutcome)) + ").";
    return detail;
}

std::optional<MoonReading> moon(const RuntimeState& state, const Site& site)
{
    const auto& civ = state.hot.civilization;
    const auto& turn = civ.currentMoonTurn ? civ.currentMoonTurn : civ.lastMoonTurn;
    if (!turn) return {};
    const bool inProgress = civ.currentMoonTurn && turn->phaseIndex < static_cast<int>(sim::LunarPhase::death);
    MoonReading result{turn->moonIndex, static_cast<Second>(turn->startedSec), inProgress};
    const auto rows = state.tables.view(turn->regions);
    const auto it = std::ranges::find(rows, site.regionId, &Entry<RegionId, MoonRegionResult>::key);
    if (it == rows.end()) return result;
    const auto& row = it->value;
    const auto missing = result.current ? "Awaiting result" : "No local result";
    for (auto label : {"Birth", "Food", "Housing", "Faith", "Migration", "Death"})
        result.phases.push_back({label, label, missing, ""});
    if (row.birth) {
        const auto& by = state.tables.at(*row.birth).byClass;
        result.phases[0].value = units(by.villager.births + by.stranger.births) + " born";
        result.phases[0].detail = units(by.villager.births) + " Villager / " + units(by.stranger.births) +
            " Stranger · " + units(by.villager.matured + by.stranger.matured) + " matured · " +
            units(by.villager.newElders + by.stranger.newElders) + " became Elders";
    }
    if (row.food) {
        const auto& meal = state.tables.at(*row.food);
        auto& phase = result.phases[1];
        phase.warning = meal.consumed < meal.demand;
        phase.value = phase.warning ? "Meal shortfall" : "Meal met";
        phase.detail = demand(meal.consumed, meal.demand) + " Edible";
        if (meal.byClass.villager.demand > 0) phase.detail += " · " + percent(meal.byClass.villager.ratio) + " Villager demand met";
        if (meal.byClass.stranger.demand > 0) phase.detail += " · " + percent(meal.byClass.stranger.ratio) + " Stranger demand met";
        if (meal.savedStock > 0) phase.detail += " · " + units(meal.savedStock) + " Edible saved";
        if (row.currencySpent > 0) phase.detail += " · " + units(row.currencySpent) + " Currency spent this Moon";
        phase.fill = meal.ratio;
    }
    if (row.housing) {
        const auto& house = state.tables.at(*row.housing);
        result.phases[2] = {"Housing", "Housing", demand(house.population, house.capacity) + " places",
            units(house.overflow) + " over capacity · " + units(house.migrants) + " displaced · happiness capped at " +
            mood(state, house.happinessCap), house.overflow > 0};
    }
    if (row.faith) {
        const auto& faith = state.tables.at(*row.faith).byClass;
        auto& phase = result.phases[3];
        const auto add = [&](const auto& reading, std::string_view label) {
            if (!phase.detail.empty()) phase.detail += " · ";
            phase.detail += label;
            phase.detail += " " + mood(state, reading.happiness) + ", ";
            if (reading.faithShifted) phase.detail += title(state.name(reading.previousFaith)) + " to ";
            phase.detail += title(state.name(reading.faith));
            if (reading.displaced > 0) phase.detail += " · " + units(reading.displaced) + " displaced";
            phase.warning |= reading.collapseEntered;
        };
        add(faith.villager, "Villagers");
        if (faith.stranger) add(*faith.stranger, "Strangers");
        phase.value = phase.warning ? "Faith collapse" :
            faith.villager.faithShifted || (faith.stranger && faith.stranger->faithShifted) ? "Faith shifted" : "Faith held";
    }
    if (row.migration) {
        const auto& report = state.tables.at(*row.migration);
        double arrivals = 0, departures = 0;
        for (const auto& arrival : state.tables.view(report.inbound)) arrivals += arrival.survivors;
        for (const auto& departure : state.tables.view(report.outbound)) departures += departure.amount;
        result.phases[4] = {"Migration", "Migration", "+" + units(arrivals) + " / −" + units(departures), flow(state, report)};
    }
    if (row.death) {
        const auto& report = state.tables.at(*row.death);
        const auto natural = report.byClass.villager.naturalDeaths + report.byClass.stranger.naturalDeaths;
        result.phases[5] = {"Death", "Death", units(natural + report.hardshipDeaths + report.arrivalDeaths) + " deaths",
            units(natural) + " natural · " + units(report.hardshipDeaths) + " hardship · " + units(report.arrivalDeaths) +
            " on arrival · " + units(report.storedFoodRot + report.looseFoodRot) + " Food spoiled", report.hardshipDeaths > 0};
    }
    return result;
}

std::string cost(const RuntimeState& state, const content::StockInput& input)
{
    return units(input.amount) + " " + names(state, state.compiledContent->tables.view(input.traits));
}

std::string providerName(const RuntimeState& state, const StockProvider& receipt)
{
    std::string result;
    if (receipt.practiceId) {
        const auto& definitions = state.content->config.gamepieces.practices;
        const auto it = std::ranges::find(definitions, state.name(*receipt.practiceId),
            &sim::browser::GamepiecesPractices::value_type::first);
        if (it != definitions.end()) result = it->second.label;
    } else if (receipt.label) result = state.name(*receipt.label);
    if (result.empty()) result = "Stock";
    return result + " · " + std::string(state.topology->region_name(receipt.regionId));
}

std::string historyText(const RuntimeState& state, const HistoryPayload& page, HistoryTextId id)
{
    return std::string(id.value & history_symbol_bit ? state.name(SymbolId{id.value & ~history_symbol_bit}) :
        page.text.at(id.value));
}

std::string blockReason(std::string reason)
{
    if (reason == "capacityFull") return "Hosted Stock was full.";
    if (reason == "requiresScholar") return "A Scholar was required.";
    if (reason == "noTraining") return "No eligible adults to train.";
    if (reason == "unmetCondition") return "A recipe condition was unmet.";
    if (reason == "noExternalTarget") return "No eligible target was available.";
    if (reason == "alreadyDischarged") return "Already discharged in this chain.";
    return title(reason);
}

void trace(const RuntimeState& state, const Site& site, const PracticeSlot& slot, PracticeReading& result)
{
    if (!site.detailedState.practiceActivationTrace) return;
    using sim::practice::EventKind;
    struct Activation { double second, root; std::optional<double> slot; };
    std::optional<Activation> activation;
    std::optional<Reading> latest, blocked;
    std::vector<Reading> receipts;
    const auto& events = state.practiceVocabulary.events;
    const auto& history = state.histories.at(site.detailedState.practiceActivationTrace->row);
    const auto duplicate = std::ranges::count(state.tables.view(site.detailedState.practiceSlots.rows),
        slot.practiceId, &PracticeSlot::practiceId) > 1;
    history.for_each([&](const PracticeEventTrace& entry, const HistoryPayload& page) {
        if (entry.targetPracticeId != slot.practiceId && entry.practiceId != slot.practiceId) return;
        if (duplicate && entry.slotIndex != static_cast<double>(slot.slot)) return;
        const auto kind = entry.kind;
        const auto is = [&](EventKind expected) { return kind == events[static_cast<std::size_t>(expected)]; };
        if (is(EventKind::activated) || is(EventKind::discharged)) {
            activation = {entry.tSec, entry.rootId, entry.slotIndex};
            latest = Reading{"activation", "Last activation",
                (is(EventKind::discharged) ? "Discharged · " : "Activated · ") + second(entry.tSec), ""};
            if (blocked) blocked->warning = false;
            receipts.clear();
            if (entry.providers) for (const auto& receipt : page.view(*entry.providers)) {
                receipts.push_back({"receipt-" + std::to_string(receipts.size()), title(state.name(receipt.kind)),
                    units(receipt.amount) + " " + names(state, page.view(receipt.traits)), providerName(state, receipt)});
            }
        } else if (is(EventKind::dischargeBlocked) || is(EventKind::cascadeDeferred)) {
            blocked = Reading{"blocked", "Last block", second(entry.tSec),
                entry.reason ? blockReason(historyText(state, page, *entry.reason)) : "The discharge could not resolve.", true};
        }
    });
    if (latest) {
        result.activity.push_back(std::move(*latest));
        history.for_each([&](const PracticeEventTrace& entry, const HistoryPayload& page) {
            if (entry.tSec != activation->second || entry.rootId != activation->root ||
                entry.practiceId != slot.practiceId || (entry.slotIndex && entry.slotIndex != activation->slot) ||
                !entry.amount) return;
            const auto key = "effect-" + std::to_string(result.activity.size());
            if (entry.kind == events[static_cast<std::size_t>(EventKind::stockGenerated)])
                result.activity.push_back({key, "Produced", units(*entry.amount) + " " +
                    (entry.traits ? names(state, page.view(*entry.traits)) : result.outputTraits), ""});
            else if (entry.kind == events[static_cast<std::size_t>(EventKind::chaosIncreased)])
                result.activity.push_back({key, "Generated", units(*entry.amount) + " Chaos", ""});
            else if (entry.kind == events[static_cast<std::size_t>(EventKind::populationConverted)])
                result.activity.push_back({key, "Converted", units(*entry.amount) + " residents", ""});
        });
        for (auto& receipt : receipts) result.activity.push_back(std::move(receipt));
    }
    if (blocked) result.activity.push_back(std::move(*blocked));
}

PracticeReading readSettlementPractice(const RuntimeState& state, const Site& site, Index<PracticeSlot> index)
{
    PracticeReading result;
    const auto& slot = state.tables.at(index);
    const auto& def = stock::definition(state, slot.practiceId);
    const auto& tables = state.compiledContent->tables;
    const auto assignment = stock::workers(state, site)[slot.slot];
    result.workers = assignment.tokens;
    result.effective = assignment.effective;
    result.scholar = assignment.scholar;
    result.capacity = def.workerCapacity;
    result.category = def.category == content::Category::influence ? "Influence" :
        def.category == content::Category::resource ? "Resource" : "";
    result.stock = state.practiceStock[index.value];
    if (result.stock) {
        result.stockCapacity = stock::stock_capacity(state, site, index, assignment.scholar);
        constexpr auto output = content::mask_bit(content::ModifierKind::outputMultiplier);
        result.outputMultiplier = stock::stock_output(state, site, def, stock::modifiers(state, site, output), assignment.scholar);
    }
    result.outputTraits = names(state, tables.view(def.stockTraits));
    result.chargeMode = def.charge.has_value();
    if (result.chargeMode) {
        result.charge = state.practiceCharge[index.value];
        result.threshold = stock::threshold(state, site, def, assignment.scholar);
        result.chargeGain = stock::charge_gain(state, site, def, assignment);
        const auto& definitions = state.content->config.gamepieces.practices;
        const auto it = std::ranges::find(definitions, state.name(slot.practiceId),
            &sim::browser::GamepiecesPractices::value_type::first);
        if (it != definitions.end() && it->second.charge) {
            result.trigger = it->second.charge->triggerText;
            result.discharge = it->second.charge->dischargeText;
        }
    } else {
        const auto label = [&](content::Activation activation) {
            return title(state.name(state.practiceVocabulary.activations[static_cast<std::size_t>(activation)]));
        };
        result.schedule = label(def.activation.type);
        if (def.activation.seasonKeys) {
            result.schedule.clear();
            for (const auto season : tables.view(*def.activation.seasonKeys)) {
                if (!result.schedule.empty()) result.schedule += " / ";
                result.schedule += title(state.name(state.practiceVocabulary.seasons[static_cast<std::size_t>(season)]));
            }
        }
        if (def.activation.also) for (const auto activation : tables.view(*def.activation.also))
            result.schedule += " / " + label(activation);
        if (def.activation.stage == content::Stage::afterMeals) result.schedule += " · After meals";
        if (def.activation.stage == content::Stage::preRouting) result.schedule += " · Before routing";
        if (def.activation.stage == content::Stage::postRouting) result.schedule += " · After routing";
        if (def.cadenceMoons) result.schedule += " · Every " + units(*def.cadenceMoons) + " Moons";
    }
    const auto addCosts = [&](auto range, const char* label) {
        for (const auto& entry : tables.view(range))
            result.inputs.push_back({"input-" + std::to_string(result.inputs.size()), label, cost(state, entry), ""});
    };
    addCosts(def.require_, "Requires");
    addCosts(def.consume, "Consumes");
    const auto plan = sim::practice::plan_stock(state, site, tables.view(def.consume), tables.view(def.require_),
        &slot, assignment.scholar, false);
    for (const auto& provider : plan.providers) {
        const auto& receipt = provider.receipt.record;
        auto label = title(state.name(receipt.kind));
        if (provider.paymentFor) label = "Market payment";
        auto detail = providerName(state, receipt);
        if (receipt.unitPrice) detail += " · " + units(*receipt.unitPrice) + " Currency each";
        if (!provider.receipt.substitution.empty())
            detail += " · substitutes for " + names(state, provider.receipt.substitution);
        result.providers.push_back({"provider-" + std::to_string(result.providers.size()), std::move(label),
            units(receipt.amount) + " " + names(state, provider.receipt.traits), std::move(detail)});
    }
    result.status = {"status", "Status", "Scheduled", ""};
    if (!stock::eligible(state, site, result.chargeMode)) {
        result.status.value = "Inactive";
        result.status.detail = "This settlement cannot run this Practice at the displayed second.";
    } else if (!plan.ok && plan.missing) {
        result.status.value = "Inputs short";
        result.status.detail = "Missing " + units(plan.missing->amount) + " " + names(state, plan.missing->traits);
        result.status.warning = true;
    } else if (def.scholarRequired.value_or(false) && !result.scholar) {
        result.status.value = "Needs a Scholar";
        result.status.warning = true;
    } else if (result.chargeMode) {
        result.status.value = result.charge < result.threshold ? "Gathering Charge" : "Threshold met";
        result.status.detail = result.charge < result.threshold ? result.trigger : "Checks its recipe on a Discharge opportunity.";
    } else {
        result.status.detail = result.schedule;
    }
    trace(state, site, slot, result);
    return result;
}

StructureReading readSettlementStructures(const RuntimeState& state, const Site& site)
{
    StructureReading result;
    if (site.neutral) return result;
    const auto& board = site.detailedState.structureSlots;
    result.capacity = stock::region_at(state, site.regionId).structureCapacity;
    for (const auto cell : state.tables.view(board.footprint)) result.occupied += static_cast<bool>(cell);
    const auto& definitions = state.content->config.gamepieces.structures;
    const auto& tables = state.compiledContent->tables;
    // The authored reading describes the qualifying Practices and special
    // conditions. Labels below expose the individual modifier entries.
    constexpr std::array labels{"Occupation", "Output multiplier", "Stock capacity multiplier", "Local defense",
        "Network garrison", "Garrison upkeep", "Output", "Candidate history", "Charge gain",
        "Charge threshold reduction", "Stock substitution", "Support", "Defense", "Defense multiplier", "Retinue Force",
        "Loss defense", "Currency wildcard", "Input consumption reduction", "Effect bonus", "Flexible provider",
        "Scaling cap", "Preview", "Loss resistance", "Stock defense", "Network support", "Stock support", "Evacuation share"};
    for (const auto& cell : state.tables.view(board.origins)) {
        Building b{cell.origin, cell.width, std::string(state.name(cell.structureId))};
        const auto authored = std::ranges::find(definitions, b.id, &sim::browser::GamepiecesStructures::value_type::first);
        b.name = authored == definitions.end() ? b.id : authored->second.label;
        if (authored != definitions.end()) b.rule = authored->second.ui.rule;
        const auto& def = stock::definition(state, cell.structureId);
        b.status = "Built";
        if (cell.construction) {
            b.status = "Under construction";
            b.details.push_back({"construction", "Construction cycles",
                demand(cell.construction->completedCycles, def.construction.cycles), "", false,
                cell.construction->completedCycles / std::max(1., def.construction.cycles)});
            for (const auto& input : tables.view(def.construction.consume))
                b.details.push_back({"build-" + std::to_string(b.details.size()), "Per cycle", cost(state, input), ""});
        } else if (cell.upkeepActive == false) {
            b.status = "Upkeep missed";
            b.warning = true;
        }
        if (def.housing) b.details.push_back({"housing", "Base housing", units(*def.housing), ""});
        if (cell.qualityBonus) b.details.push_back({"quality", "Quality bonus", "+" + units(*cell.qualityBonus), ""});
        if (def.mealExtra && *def.mealExtra != 0)
            b.details.push_back({"meals", "Extra meal demand", units(*def.mealExtra) + " Edible", ""});
        if (def.specialistGate && *def.specialistGate > 0)
            b.details.push_back({"gate", "Specialists required", units(*def.specialistGate) +
                (def.pool == content::Pool::scholar ? " Scholars" : " Warriors"), ""});
        if (def.modifiers) for (const auto& mod : tables.view(*def.modifiers)) {
            const std::string label = labels.at(static_cast<std::size_t>(mod.kind));
            std::string value = mod.amount ? units(*mod.amount) : "Enabled by this building";
            if (mod.from && mod.to) value = std::string(state.name(*mod.from)) + " for " + std::string(state.name(*mod.to));
            if (mod.arms) value += " · " + units(*mod.arms) + " Arms";
            if (mod.warriors) value += " · " + units(*mod.warriors) + " Warriors";
            b.details.push_back({"mod-" + std::to_string(b.details.size()), label, value, mod.query ? "Conditional base modifier" : "Base modifier"});
        }
        if (def.upkeep) for (const auto& input : tables.view(def.upkeep->consume)) {
            const auto timing = authored != definitions.end() && authored->second.upkeep ?
                title(authored->second.upkeep->activation) : "Scheduled";
            b.details.push_back({"upkeep-" + std::to_string(b.details.size()), "Upkeep", cost(state, input),
                timing + (def.upkeep->disables ? " · missed upkeep suspends modifiers" : "")});
        }
        result.buildings.push_back(std::move(b));
    }
    return result;
}

}

SettlementReading readSettlement(const RuntimeState& state, const Region& region,
    SettlementTab tab, std::optional<std::size_t> slot)
{
    SettlementReading result;
    const auto key = state.find_id<RegionId>(region.id);
    if (!key || key.value >= state.indexes.sitesByRegion.size()) return result;
    const auto id = state.indexes.sitesByRegion[key.value];
    if (!id) return result;
    const auto& site = sim::settlement::site_at(state, id);
    switch (tab) {
        case SettlementTab::overview: result.overview = overview(state, region, site); break;
        case SettlementTab::moon: result.moon = moon(state, site); break;
        case SettlementTab::structures: result.structures = readSettlementStructures(state, site); break;
        case SettlementTab::practices: {
            const auto& slots = site.detailedState.practiceSlots.slots;
            if (!site.neutral && slot && *slot < slots.size() && slots[*slot])
                result.practice = readSettlementPractice(state, site, slots[*slot]);
            break;
        }
    }
    return result;
}

}
