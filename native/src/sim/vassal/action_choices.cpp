#include "sim/vassal/action_choices.hpp"
#include "sim/vassal/detail.hpp"

#include "sim/practice/detail.hpp"
#include "sim/practice/stock.hpp"
#include "sim/territory/detail.hpp"

namespace waffle::sim::vassal::detail {
namespace {

using Option = browser::LifeMapOption;
using Node = browser::LifeMapNodeState;

bool calculated(const content::BalanceValue& value)
{
    return std::get_if<browser::BalancePreset>(&value) &&
        std::get<browser::BalancePreset>(value) == browser::BalancePreset::calculated;
}

void adjust(const RuntimeState& state, Option& option, const content::OptionCost& rule)
{
    const auto& design = state.compiledContent->values.lifeMapGenerator.design;
    if (!design.enabled) return;
    option.balanceKey = option.id;
    option.phaseCost = year_phases(state, balance_value(rule.time, design.costBands.time));
    option.prestigeCost = balance_value(rule.prestige, design.costBands.prestige);
    if (!calculated(rule.risk)) option.immediateDeathChance = balance_value(rule.risk, design.costBands.risk);
    if (!calculated(rule.monsterPressure)) {
        auto& effects = option.effects.emplace();
        const auto pressure = balance_value(rule.monsterPressure, design.costBands.monsterPressure);
        if (pressure > 0) effects.emplace_back(browser::PracticeEffectaddMonsterPressure{.amount = pressure});
    }
}

std::string stat_label(const RuntimeState& state, const Vassal& actor, std::string_view stat)
{
    if (stat == "cunning") return has_identity(state, actor, "scholar") ? "Ingenuity" : "Cunning";
    if (stat == "intelligence") return has_identity(state, actor, "warrior") ? "Prowess" : "Intelligence";
    if (stat == "wisdom") return "Wisdom";
    return "Effectiveness";
}

bool equipped(const RuntimeState& state, const Vassal& actor, std::string_view id)
{
    return std::ranges::any_of(read(state, actor.heirlooms).equipped,
        [&](const auto& item) { return item && item->definitionId == id; });
}

void add_stat(Vassal& actor, const std::optional<std::string>& stat, std::optional<double> amount)
{
    if (!stat || !amount) return;
    const auto it = std::ranges::find(statIds, *stat);
    if (it == statIds.end()) return;
    auto& value = actor.stats.*statMembers[it - statIds.begin()];
    value = std::max(0.0, core::js::floor(value) + core::js::floor(*amount));
}

}

bool create_node_choices(RuntimeState& state, const Vassal& actor, Node& node)
{
    const auto& design = state.compiledContent->values.lifeMapGenerator.design;
    const auto& costs = design.optionCosts;
    if (node.family == "philosopherFounding" || node.family == "warlordFounding") {
        const bool scholar = node.family == "philosopherFounding";
        node.options.push_back({
            .id = "train-estate", .label = scholar ? "Philosopher: establish Scholars" : "Warlord: establish Warriors",
            .phaseCost = 6,
            .description = scholar ? "Train up to two existing adults as Scholars and found a Lyceum if two construction cells are free."
                                   : "Train up to ten existing adults as Warriors.",
            .classAction = browser::LifeMapOptionClassAction{
                .kind = "train", .classId = scholar ? "scholar" : "warrior", .count = scholar ? 2.0 : 10.0,
                .structureId = scholar ? std::optional<std::string>("lyceum") : std::nullopt,
                .establishClass = true, .onCompletion = true,
            },
        });
    } else if (node.family == "patronage") {
        node.options = {
            {.id = "immediateFavor", .label = "Immediate Favor", .phaseCost = year_phases(state, 3.6), .prestigeDelta = 8},
            {.id = "longAppointment", .label = "Long Appointment", .phaseCost = year_phases(state, 4 * 3.6), .prestigeDelta = 20},
            {.id = "cultivateConnections", .label = class_name(actor) == "scholar" ? "Cultivate Ingenuity" : "Cultivate Connections",
                .statDelta = 1, .statId = "cunning", .statLabel = stat_label(state, actor, "cunning"),
                .phaseCost = year_phases(state, 3 * 3.6), .prestigeDelta = 5},
        };
        const std::array rules{&costs.patronage.immediateFavor, &costs.patronage.longAppointment, &costs.patronage.cultivateConnections};
        for (std::size_t i = 0; i < rules.size(); ++i) adjust(state, node.options[i], *rules[i]);
    } else if (node.family == "development") {
        auto stats = statIds;
        shuffle(state, stats);
        const std::array ids{"deepStudy", "hardLesson", "steadyPractice"};
        const std::array labels{"Deep Study", "Hard Lesson", "Steady Practice"};
        const std::array rules{&costs.development.deepStudy, &costs.development.hardLesson, &costs.development.steadyPractice};
        for (std::size_t i = 0; i < rules.size(); ++i) {
            const auto stat = stats[i];
            const auto label = stat_label(state, actor, stat);
            Option option{.id = ids[i], .label = labels[i] + (": " + label), .statDelta = i == 2 ? 1.0 : 2.0,
                .statId = std::string(stat), .statLabel = label, .phaseCost = year_phases(state, (i == 0 ? 6 : 2) * 3.6)};
            if (i == 0 && (stat == "cunning" || stat == "wisdom")) {
                option.effects.emplace().emplace_back(browser::PracticeEffectaddMonsterPressure{
                    .amount = state.compiledContent->settings().deepStudyMonsterProgress,
                });
            }
            if (i == 1) {
                auto losses = std::vector(statIds.begin(), statIds.end());
                std::erase(losses, stat);
                option.lossStatDelta = -1;
                option.lossStatId = losses[pick(state, losses.size())];
                option.lossStatLabel = stat_label(state, actor, *option.lossStatId);
            }
            adjust(state, option, *rules[i]);
            node.options.push_back(std::move(option));
        }
    } else if (node.family == "training") {
        const bool scholar = class_name(actor) == "scholar";
        node.options.push_back({.id = "train-estate", .label = scholar ? "Train Scholars" : "Train Warriors",
            .phaseCost = 6, .description = scholar ? "Convert up to 2 existing adults into Scholars."
                                                 : "Convert up to 10 existing adults into Warriors.",
            .classAction = browser::LifeMapOptionClassAction{.kind = "train"}});
        adjust(state, node.options.back(), costs.training.train_estate);
    } else if (node.family == "legacy" && !node.signatureNode) {
        const std::array stats{
            whole(actor.stats.cunning) + bonuses(state, actor).cunning, whole(actor.stats.wisdom),
            whole(actor.stats.effectiveness), whole(actor.stats.intelligence) + equipped(state, actor, "abacus"),
        };
        const auto highest = std::ranges::max_element(stats) - stats.begin();
        const auto label = stat_label(state, actor, statIds[highest]);
        const auto statAmount = std::floor(stats[highest] / 3);
        const auto renown = std::floor((state.hot.rulesetId ? *state.hot.civilization.prestige : actor.prestige) / 10);
        node.options = {
            {.id = "highest-stat", .label = "Teach " + label,
                .description = "Future Vassals start with +" + decimal(statAmount) + " " + label + ".",
                .legacyReward = browser::LifeMapOptionLegacyReward{"stat", std::string(statIds[highest]), statAmount}},
            {.id = "accumulated-prestige", .label = "Leave renown",
                .description = state.hot.rulesetId ? "Endow the civilization with " + decimal(renown) + " Prestige."
                    : "Future Vassals start with +" + decimal(renown) + " Prestige.",
                .legacyReward = browser::LifeMapOptionLegacyReward{"prestige", {}, renown}},
        };
        adjust(state, node.options[0], costs.legacy.highest_stat);
        adjust(state, node.options[1], costs.legacy.accumulated_prestige);
    } else return false;
    return true;
}

ActionResult commit_node_choice(RuntimeState& state, Vassal& actor, const Node& node, const Option& option,
                                double price)
{
    auto& civ = state.hot.civilization;
    if (option.classAction) {
        const auto& action = *option.classAction;
        if (action.kind != "train") return {"classActionNotPorted"};
        if (!settlement::detailed_site(state, actor.locationRegionId)) return {"settlementLost"};
        if (action.establishClass.value_or(false) && (!actor.founderClassId ||
            action.classId != state.name(*actor.founderClassId) || civ.vassalLineage.establishedClassId))
            return {"foundingUnavailable"};
    }
    if (option.intervention || option.locationRegionId || option.randomReward.has_key() ||
        option.definitionId || option.immediateDeathChance.value_or(0) > 0 ||
        option.baseDanger.value_or(0) > 0 || (node.family == "campaign" && option.id != "campaign-leave"))
        return {"choiceConfirmationNotPorted"};
    auto& account = state.hot.rulesetId ? *civ.prestige : actor.prestige;
    if (price > account) return {"insufficientPrestige"};
    account -= price;
    if (!option.classAction && option.prestigeDelta) {
        auto delta = std::floor(*option.prestigeDelta);
        if (delta > 0 && node.family == "patronage" && equipped(state, actor, "courtiersBrooch")) delta *= 2;
        if (delta > 0) credit_prestige(state, actor, delta);
        else account = std::max(0.0, account + delta);
    }
    add_stat(actor, option.statId, option.statDelta);
    add_stat(actor, option.lossStatId, option.lossStatDelta);
    civ.vassalLegacy.futureStartingPrestigeBonus += whole(option.legacyStartingPrestigeBonus.value_or(0));
    if (option.legacyReward) {
        const auto& reward = *option.legacyReward;
        if (reward.kind == "stat" && reward.statId) {
            const auto stat = std::ranges::find(statIds, *reward.statId);
            if (stat != statIds.end()) {
                auto& stats = civ.vassalLegacy.futureStartingStatBonuses;
                std::array pointers{&stats.cunning, &stats.wisdom, &stats.effectiveness, &stats.intelligence};
                *pointers[stat - statIds.begin()] += reward.amount;
            }
        } else if (state.hot.rulesetId) credit_prestige(state, actor, reward.amount);
        else civ.vassalLegacy.futureStartingPrestigeBonus += reward.amount;
    }
    practice::EventData event;
    event.fields.classId = actor.classId ? browser::OptionalNullable<SymbolId>(intern<SymbolId>(state, class_name(actor)))
                                         : browser::OptionalNullable<SymbolId>(std::nullopt);
    const auto kind = intern<EventKindId>(state, "vassalAction");
    const auto root = practice::emit(state, kind, actor.locationRegionId, event);
    auto& journal = civ.practiceEvents;
    const auto previousRoot = journal.activeRoot;
    const auto previousEvent = journal.activeEvent;
    journal.activeRoot = root.rootId;
    journal.activeEvent = root.id;
    if (option.classAction && !option.classAction->onCompletion.value_or(false)) {
        if (!apply_timed_class_action(state, actor, *option.classAction)) return {"classActionFailed"};
    }
    if (option.effects) for (const auto& effect : *option.effects) {
        const auto* pressure = std::get_if<browser::PracticeEffectaddMonsterPressure>(&effect);
        if (!pressure) return {"optionEffectNotPorted"};
        territory::add_pressure(state, pressure->amount);
    }
    journal.activeRoot = previousRoot;
    journal.activeEvent = previousEvent;
    practice::drain(state);
    record_commission_event(state, actor, "statIncreased");
    return {};
}

}
