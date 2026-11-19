#include "sim/practice/recipes.hpp"
#include "core/js_number.hpp"

#include <charconv>

namespace waffle::sim::practice::detail {
namespace {

using namespace content;
using settlement::PopulationBin;
using settlement::Residency;

struct Conversion {
    SiteId target;
    std::optional<SpecialistClass> train;
    std::size_t begin, end;
};

struct PopulationPlan {
    Buffer<Conversion, 32> conversions;
    Buffer<StockInput, 32> extraConsume, extraRequire;
};

struct PopulationScratch {
    std::vector<PopulationBin> bins, selectFrom, selected, selections, victims, removed;
    settlement::LedgerScratch ledger;
};

PopulationScratch& population_scratch()
{
    thread_local PopulationScratch scratch;
    return scratch;
}

constexpr std::array cohorts{Residency::villager, Residency::stranger};
constexpr auto activationAmounts = std::array{
    &ActivationAmounts::season, &ActivationAmounts::birth, &ActivationAmounts::food,
    &ActivationAmounts::housing, &ActivationAmounts::faith, &ActivationAmounts::migration,
    &ActivationAmounts::death, &ActivationAmounts::charge, &ActivationAmounts::passive, &ActivationAmounts::crisis,
};
constexpr auto seasonAmounts = std::array{
    &SeasonAmounts::spring, &SeasonAmounts::summer, &SeasonAmounts::autumn, &SeasonAmounts::winter,
};

double housing(const RuntimeState& state, const Site& site)
{
    if (site.neutral) return state.tables.at(*site.neutral).housing;
    double total = 0;
    for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins))
        if (!cell.construction) total += std::floor(definition(state, cell.structureId).housing.value_or(0) *
                                                       (1 + .25 * std::max(0.0, cell.qualityBonus.value_or(0))));
    return total;
}

double population(const RuntimeState& state, SiteId site)
{
    const auto& totals = settlement::population_totals(state, site).byResidency;
    return double(totals[0].total()) + double(totals[1].total());
}

bool conditions(const RuntimeState& state, const Site& site, const PracticeDefinition& def,
                Assignment assignment, std::optional<Condition> condition, bool localOnly)
{
    const auto& v = state.practiceVocabulary;
    const auto& d = site.detailedState;
    if (!state.hot.rulesetId && def.scholarRequired.value_or(false) && !assignment.scholar) return false;
    if (!state.hot.rulesetId && def.specialistRequired && !specialists(state, site, *def.specialistRequired)) return false;
    if (condition) switch (*condition) {
    case Condition::diverseStock: {
        std::optional<std::span<const TraitId>> first;
        bool diverse = false;
        for (const auto& src : stock_sources(state, site, localOnly)) {
            if (src.priced || src.remaining <= 0) continue;
            if (!first) first = src.traits;
            else if (!std::ranges::is_permutation(*first, src.traits)) {
                diverse = true;
                break;
            }
        }
        if (!diverse) return false;
        break;
    }
    case Condition::ruins:
        if (!std::ranges::any_of(neighbors(state, site.regionId), [&](auto region) {
            const auto& r = region_at(state, region);
            return r.lostAtSec.has_value() || r.monster.has_value();
        })) return false;
        break;
    case Condition::deaths:
        if (!d.history || d.history->lastDeathSec != state.hot.tSec) return false;
        break;
    case Condition::chaos: {
        const auto& income = state.hot.civilization.chaos.lastMoonIncome;
        if (!income || income->totalIncome <= 0) return false;
        break;
    }
    case Condition::externalConnection:
        if (!std::ranges::any_of(roads(state, site.regionId), [&](auto r) {
            const auto faction = holder(state, r);
            return faction == v.frontier || faction == v.external;
        })) return false;
        break;
    }
    if (def.minimumWarriors || def.minimumSupportRequired || def.positiveSupportRequired.value_or(false)) {
        const auto warriors = specialists(state, site, SpecialistClass::warrior);
        const auto support = std::floor(warriors / 5);
        if (warriors < def.minimumWarriors.value_or(0) || support < def.minimumSupportRequired.value_or(0) ||
            (def.positiveSupportRequired.value_or(false) && support <= 0)) return false;
    }
    if (def.connectedSupportRequired.value_or(false) &&
        !std::ranges::any_of(roads(state, site.regionId), [&](auto r) {
            const auto* other = settlement::detailed_site(state, r);
            return holder(state, r) == v.player && other && specialists(state, *other, SpecialistClass::warrior) > 0;
        })) return false;
    return true;
}

double amount(const RuntimeState& state, SiteId siteId, const Site& site, const PracticeDefinition& def,
              Assignment worker, const ModifierList& mods, const PracticeEffect& effect, Activation activation)
{
    const auto op = opcode(effect);
    const auto& d = site.detailedState;
    const auto& v = state.practiceVocabulary;
    const auto& t = state.compiledContent->tables;
    return std::visit([&](const auto& e) {
        auto value = e.amount;
        if constexpr (requires { e.activationAmounts; }) {
            if (e.activationAmounts) {
                const auto alt = (*e.activationAmounts).*activationAmounts[static_cast<std::size_t>(activation)];
                if (alt) value = *alt;
                else if (activation == Activation::season && e.seasonAmounts)
                    if (const auto current = season(state))
                        value = ((*e.seasonAmounts).*seasonAmounts[static_cast<std::size_t>(*current)]).value_or(value);
            } else if (activation == Activation::season && e.seasonAmounts) {
                if (const auto current = season(state))
                    value = ((*e.seasonAmounts).*seasonAmounts[static_cast<std::size_t>(*current)]).value_or(value);
            }
        }
        if (op == EffectOp::addChaos || op == EffectOp::addMonsterPressure || op == EffectOp::triggerMonsterSpawn)
            return std::max(0.0, value);
        if constexpr (requires { e.populationBand; }) {
            const auto deaths = d.history.value_or(DetailedSettlementHistory{});
            if (e.populationBand.value_or(0) > 0)
                value += std::min(3 + sum_modifier(state, def, mods, ModifierKind::scalingCap, worker.scholar),
                                  std::floor(population(state, siteId) / *e.populationBand));
            if (e.historyScale == HistoryScale::losses) value += std::min(4.0, state.hot.civilization.history.lostSettlements);
            if (e.historyScale == HistoryScale::deaths) value += std::min(2.0, deaths.deaths.value_or(0));
            if (e.historyScale == HistoryScale::deathsSinceSpring && activation == Activation::season)
                value += std::min(1.0, std::max(0.0, deaths.deaths.value_or(0) - deaths.springDeaths.value_or(0)));
            if (e.localDeathScale.value_or(false))
                value += std::min(e.localDeathCap.value_or(2), deaths.lastDeathCount.value_or(0));
            if (e.externalConnectionScale.value_or(false))
                value += std::min(3.0, double(std::ranges::count_if(roads(state, site.regionId),
                    [&](auto region) { return holder(state, region) == v.external; })));
        }
        const auto labor = def.mode == Mode::charge ? 1.0 : 1 + worker.effective * def.workerBonus;
        if (op == EffectOp::convertPopulation) return std::floor(value * labor);
        if (op == EffectOp::generateStock) {
            value += sum_modifier(state, def, mods, ModifierKind::output, worker.scholar);
            const auto& boost = d.seasonalFoodBoost;
            if (def.activation.type == Activation::season && has(t.view(def.tags), v.food) &&
                has(t.view(def.stockTraits), v.edible) && boost && boost->year == state.hot.year &&
                boost->practiceId == def.id && !has(state.tables.view(boost->seasons), season_id(state)))
                value += boost->amount;
            value = std::floor(value * stock_output(state, site, def, mods, worker.scholar) * labor);
        }
        return value + sum_modifier(state, def, mods, ModifierKind::effectBonus, worker.scholar);
    }, effect);
}

bool same_bin(const PopulationBin& a, const PopulationBin& b)
{
    return a.residency == b.residency && a.key.allegiance == b.key.allegiance &&
           a.key.specialty == b.key.specialty && a.key.kind == b.key.kind && a.key.age == b.key.age;
}

bool matches_population(const RuntimeState& state, const PopulationBin& bin, const PopulationFilter& filter,
                        FactionId beneficiary)
{
    const auto residency = state.practiceVocabulary.residencies[static_cast<std::size_t>(bin.residency)];
    return (!filter.classId || *filter.classId == residency) && (!filter.kind || *filter.kind == bin.key.kind) &&
        (!filter.specialty || *filter.specialty == bin.key.specialty) &&
        (!filter.allegiance || bin.key.allegiance == (*filter.allegiance == state.practiceVocabulary.beneficiary
            ? beneficiary : *filter.allegiance)) &&
        (!filter.opposing.value_or(false) || bin.key.allegiance != beneficiary);
}

double matching_count(const RuntimeState& state, std::span<const PopulationBin> bins,
                      const PopulationFilter& filter, FactionId beneficiary)
{
    double count = 0;
    for (const auto& bin : bins)
        if (matches_population(state, bin, filter, beneficiary)) count += double(bin.count);
    return count;
}

double number_of_people(std::span<const PopulationBin> bins)
{
    double count = 0;
    for (const auto& bin : bins) count += double(bin.count);
    return count;
}

void select(const RuntimeState& state, PopulationScratch& scratch, const PopulationFilter& filter,
            FactionId beneficiary, double count)
{
    scratch.selectFrom.clear();
    for (const auto& bin : scratch.bins)
        if (bin.count && matches_population(state, bin, filter, beneficiary)) scratch.selectFrom.push_back(bin);
    settlement::allocate_population(state, scratch.selectFrom, count, scratch.selected, scratch.ledger);
}

bool plan_population(const RuntimeState& state, SiteId siteId, const Site& site, Index<PracticeSlot> index,
                     const PracticeDefinition& def, Assignment worker, const ModifierList& mods,
                     PopulationPlan& plan)
{
    if (!state.hot.rulesetId || (!def.populationConsume && !def.populationRequire && !def.populationCondition && def.recipeEffects.size() == 0))
        return true;
    const auto& slot = state.tables.at(index);
    const auto& d = site.detailedState;
    const auto faction = slot.allegiance.value_or(FactionId{});
    const auto& t = state.compiledContent->tables;
    if (def.populationCondition == PopulationCondition::housed && population(state, siteId) > housing(state, site)) return false;
    if (def.populationCondition == PopulationCondition::relief &&
        (!d.mealRelief || d.mealRelief->tSec != state.hot.tSec || d.mealRelief->faction != faction ||
            d.mealRelief->amount <= 0 || !d.mealRelief->fullyFed)) return false;
    auto& scratch = population_scratch();
    settlement::collect_population(state, d.populationByClass, scratch.bins);
    if (def.populationConsume) for (const auto& cost : t.view(*def.populationConsume)) {
        select(state, scratch, {.kind = cost.filter.kind, .specialty = cost.filter.specialty}, faction, cost.amount);
        if (number_of_people(scratch.selected) < cost.amount) return false;
        settlement::remove_population(scratch.bins, scratch.selected, scratch.removed);
        scratch.victims.insert(scratch.victims.end(), scratch.removed.begin(), scratch.removed.end());
    }
    if (def.populationRequire) for (const auto& cost : t.view(*def.populationRequire)) {
        const PopulationFilter filter{.kind = cost.filter.kind, .specialty = cost.filter.specialty};
        auto available = matching_count(state, scratch.bins, filter, faction);
        if (!cost.other) available += matching_count(state, scratch.victims, filter, faction);
        if (available < cost.amount) return false;
    }
    if (def.requireBaseHeadroom.value_or(false)) {
        double base = 0;
        for (const auto& e : t.view(def.effects))
            if (const auto* stock = std::get_if<PracticeEffectgenerateStock>(&e)) base += stock->amount;
        if (stock_capacity(state, site, index, false) - state.practiceStock[index.value].value_or(0) < base) return false;
    }
    Buffer<StructureId, 48> seen;
    Buffer<const StructureDefinitionConversionSupport*, 48> supports;
    for (const auto& cell : state.tables.view(d.structureSlots.origins)) {
        if (cell.construction || cell.upkeepActive == false || has(seen, cell.structureId)) continue;
        seen.push_back(cell.structureId);
        const auto& structure = definition(state, cell.structureId);
        if (structure.conversionSupport) supports.push_back(&*structure.conversionSupport);
    }
    const auto remoteSupport = std::ranges::any_of(supports, [](auto s) { return s->reach == Reach::connectedAdjacent; });
    const auto effects = t.view(def.effects);
    for (auto effectIndex : t.view(def.recipeEffects)) {
        const auto* effect = std::get_if<PracticeEffectconvertPopulation>(&effects[effectIndex]);
        if (!effect) continue;
        const bool remote = effect->reach == Reach::connectedAdjacent ||
            (slot.targetRegionId && *slot.targetRegionId != site.regionId && remoteSupport);
        Buffer<RegionId, 64> candidates;
        if (!remote) candidates.push_back(site.regionId);
        if (remote || remoteSupport) for (auto r : neighbors(state, site.regionId))
            if (has(roads(state, site.regionId), r)) candidates.push_back(r);
        if (slot.targetRegionId) {
            auto target = std::find(candidates.begin(), candidates.end(), *slot.targetRegionId);
            if (target != candidates.end()) std::rotate(candidates.begin(), target, target + 1);
        }
        const auto filter = effect->filter.value_or(PopulationFilter{});
        SiteId target;
        for (auto region : candidates) {
            const auto* receiver = settlement::detailed_site(state, region);
            if (!receiver) continue;
            settlement::collect_population(state, receiver->detailedState.populationByClass, scratch.bins);
            if (matching_count(state, scratch.bins, filter, faction) <= 0) continue;
            target = state.indexes.detailedSitesByRegion[region.value];
            break;
        }
        if (!target) return false;
        select(state, scratch, filter, faction, amount(state, siteId, site, def, worker, mods, effects[effectIndex], def.activation.type));
        // Each supporting Structure can add only the people still eligible.
        Buffer<StockInput, 32> consume, require;
        for (const auto* support : supports) {
            if (support->reach || (support->query && support->query->pool != def.pool) ||
                (support->activation && support->activation != def.activation.type) ||
                (support->train && support->train != effect->train)) continue;
            if (support->consumeTrait && !std::ranges::any_of(t.view(def.consume), [&](const auto& cost) {
                return has(t.view(cost.traits), *support->consumeTrait);
            })) continue;
            if (population(state, siteId) < support->minimumPopulation.value_or(0)) continue;
            if (support->populationRequire) {
                const auto& cost = *support->populationRequire;
                settlement::collect_population(state, d.populationByClass, scratch.selectFrom);
                if (matching_count(state, scratch.selectFrom, {.kind = cost.filter.kind, .specialty = cost.filter.specialty,
                    .allegiance = cost.filter.allegiance}, faction) < cost.amount) continue;
            }
            consume.count = require.count = 0;
            if (support->consume) for (const auto& cost : t.view(*support->consume)) consume.push_back({cost.traits, cost.amount});
            if (support->require_) for (const auto& cost : t.view(*support->require_)) require.push_back({cost.traits, cost.amount});
            if (!plan_stock(state, site, consume.view(), require.view(), &slot, false, true).ok) continue;
            auto combined = filter;
            if (support->filter) {
                if (support->filter->kind) combined.kind = support->filter->kind;
                if (support->filter->specialty) combined.specialty = support->filter->specialty;
            }
            auto left = support->amount.value_or(0);
            const auto desired = left;
            for (const auto& bin : scratch.bins) {
                if (left <= 0) break;
                if (!matches_population(state, bin, combined, faction)) continue;
                double taken = 0;
                for (const auto& selection : scratch.selected)
                    if (same_bin(selection, bin)) taken += double(selection.count);
                const auto add = std::min(left, double(bin.count) - taken);
                if (add <= 0) continue;
                scratch.selected.push_back({bin.residency, bin.key, static_cast<std::uint64_t>(add)});
                left -= add;
            }
            if (left < desired) {
                for (auto cost : consume) plan.extraConsume.push_back(cost);
                for (auto cost : require) plan.extraRequire.push_back(cost);
            }
        }
        const auto begin = scratch.selections.size();
        scratch.selections.insert(scratch.selections.end(), scratch.selected.begin(), scratch.selected.end());
        plan.conversions.push_back({target, effect->train, begin, scratch.selections.size()});
    }
    return true;
}

double transform(RuntimeState& state, SiteId target, std::span<const PopulationBin> selected,
                 FactionId allegiance, std::optional<SpecialistClass> specialty)
{
    auto& scratch = population_scratch();
    const auto& site = settlement::site_at(state, target);
    settlement::collect_population(state, site.detailedState.populationByClass, scratch.bins);
    settlement::remove_population(scratch.bins, selected, scratch.removed);
    const auto count = number_of_people(scratch.removed);
    for (auto bin : scratch.removed) {
        if (allegiance) bin.key.allegiance = allegiance;
        if (specialty) bin.key.specialty = state.populationVocabulary.specialties[1 + static_cast<std::size_t>(*specialty)];
        scratch.bins.push_back(bin);
    }
    settlement::write_population_bins(state, target, scratch.bins, scratch.ledger);
    return count;
}

void apply_population(RuntimeState& state, SiteId siteId, Site& site, const PracticeSlot& slot,
                      const PopulationPlan& plan)
{
    auto& scratch = population_scratch();
    if (!scratch.victims.empty()) {
        settlement::collect_population(state, site.detailedState.populationByClass, scratch.bins);
        settlement::remove_population(scratch.bins, scratch.victims, scratch.removed);
        settlement::write_population_bins(state, siteId, scratch.bins, scratch.ledger);
        const auto deaths = number_of_people(scratch.removed);
        if (deaths > 0) {
            auto& history = site.detailedState.history;
            if (!history) history.emplace();
            history->deaths = history->deaths.value_or(0) + deaths;
            history->lastDeathSec = state.hot.tSec;
            history->lastDeathCount = deaths;
            EventData event{};
            if (slot.instanceId) event.fields.instanceId = browser::OptionalNullable<InstanceId>{*slot.instanceId};
            event.fields.faction = browser::OptionalNullable<FactionId>{slot.allegiance.value_or(holder(state, site.regionId))};
            event.fields.amount = deaths;
            event.fields.premature = true;
            event.fields.cause = state.practiceVocabulary.sacrifice;
            emit(state, EventKind::populationDied, site.regionId, event);
            if (holder(state, site.regionId) == state.practiceVocabulary.player)
                state.hot.civilization.chaos.pendingLosses.prematureDeaths += deaths;
        }
    }
    for (const auto& conversion : plan.conversions) {
        const auto faction = slot.allegiance.value_or(FactionId{});
        const auto selected = std::span(scratch.selections).subspan(conversion.begin, conversion.end - conversion.begin);
        const auto count = transform(state, conversion.target, selected, faction, conversion.train);
        EventData event{};
        event.fields.targetRegionId = browser::OptionalNullable<RegionId>{settlement::site_at(state, conversion.target).regionId};
        if (slot.instanceId) event.fields.instanceId = browser::OptionalNullable<InstanceId>{*slot.instanceId};
        if (slot.allegiance) event.fields.faction = browser::OptionalNullable<FactionId>{*slot.allegiance};
        event.fields.practiceId = slot.practiceId;
        event.fields.amount = count;
        emit(state, EventKind::populationConverted, site.regionId, event);
    }
}

void train(RuntimeState& state, SiteId siteId, Site& site, double amount, SpecialistClass specialty)
{
    auto& pop = site.detailedState.populationByClass;
    if (!pop.villager.joint && !pop.stranger.joint) {
        auto remaining = std::max(0.0, std::floor(amount));
        for (auto* p : {&pop.villager, &pop.stranger}) {
            const auto space = std::max(0.0, double(p->adults) - p->specialists.scholar.adults - p->specialists.warrior.adults);
            const auto added = std::min(remaining, space);
            auto& classCounts = specialty == SpecialistClass::scholar ? p->specialists.scholar : p->specialists.warrior;
            classCounts.adults += static_cast<std::uint64_t>(added);
            remaining -= added;
        }
        return;
    }
    auto& scratch = population_scratch();
    settlement::collect_population(state, pop, scratch.bins);
    select(state, scratch, {.kind = state.populationVocabulary.stages[0],
                           .specialty = state.populationVocabulary.specialties[0]}, {}, amount);
    transform(state, siteId, scratch.selected, {}, specialty);
}

template<class T>
Range<T> reserve_range(RuntimeState& state, Range<T>& range, std::size_t capacity)
{
    auto& table = state.tables.table<T>();
    const auto storage = table.append(std::max<std::size_t>(capacity, range.size()), "Practice state");
    std::ranges::copy(state.tables.view(range), table.values.begin() + storage.begin);
    range = {storage.begin, storage.begin + range.size()};
    return storage;
}

template<class T>
void append_range(RuntimeState& state, Range<T>& range, Range<T>& storage, T item)
{
    if (range.size() >= storage.size()) {
        storage = reserve_range(state, range, std::max<std::size_t>(1, storage.size() * 2));
    } else if (range.begin != storage.begin) {
        auto& rows = state.tables.rows<T>();
        std::ranges::copy(state.tables.view(range), rows.begin() + storage.begin);
        range = {storage.begin, storage.begin + range.size()};
    }
    state.tables.rows<T>()[range.end++] = item;
}

void add_phase_modifier(RuntimeState& state, Range<Entry<RegionId, double>>& entries,
                        Range<Entry<RegionId, double>>& storage, RegionId region, double amount)
{
    auto view = state.tables.view(entries);
    auto found = std::ranges::find(view, region, &Entry<RegionId, double>::key);
    if (found != view.end()) found->value += amount;
    else append_range(state, entries, storage, Entry<RegionId, double>{region, amount});
}

Buffer<TagId, 64> tags(const RuntimeState& state, const PracticeDefinition& def, bool scholar)
{
    Buffer<TagId, 64> result;
    for (const auto tag : state.compiledContent->tables.view(def.tags))
        if (!has(result, tag)) result.push_back(tag);
    if (scholar && !has(result, state.practiceVocabulary.knowledge)) result.push_back(state.practiceVocabulary.knowledge);
    return result;
}

void generate(RuntimeState& state, const Site& site, Index<PracticeSlot> slotIndex, double amount, bool scholar)
{
    const auto& slot = state.tables.at(slotIndex);
    const auto& def = definition(state, slot.practiceId);
    auto& stock = state.practiceStock[slotIndex.value];
    const auto before = std::max(0.0, stock.value_or(0));
    stock = std::max(before, std::min(stock_capacity(state, site, slotIndex, scholar),
                                      before + std::max(0.0, std::floor(amount))));
    if (*stock <= before) return;
    const auto eventTags = tags(state, def, scholar);
    EventData event{};
    event.fields.practiceId = def.id;
    event.fields.slotIndex = slot.slot;
    event.fields.amount = *stock - before;
    event.fields.pool = state.practiceVocabulary.pools[static_cast<std::size_t>(def.pool)];
    event.fields.scholarStaffed = scholar;
    event.traits = state.compiledContent->tables.view(def.stockTraits);
    event.tags = eventTags.view();
    emit(state, EventKind::stockGenerated, site.regionId, event);
}

void apply_effect(RuntimeState& state, SiteId siteId, Site& site, Index<PracticeSlot> index,
                  const PracticeDefinition& def, const PracticeEffect& effect, double amount, bool scholar)
{
    auto& civ = state.hot.civilization;
    auto& d = site.detailedState;
    const auto& slot = state.tables.at(index);
    const auto& v = state.practiceVocabulary;
    const auto player = !state.hot.rulesetId || holder(state, site.regionId) == v.player;
    switch (opcode(effect)) {
    case EffectOp::generateStock:
        generate(state, site, index, amount, scholar);
        break;
    case EffectOp::convertPopulation:
        break;
    case EffectOp::addChaos:
        if (player) {
            if (amount <= 0) break;
            civ.chaos.chaosPower = std::max(0.0, core::js::round((civ.chaos.chaosPower.value_or(0) + amount) * 100000) / 100000);
            EventData event{};
            event.fields.practiceId = def.id;
            event.fields.amount = amount;
            emit(state, EventKind::chaosIncreased, site.regionId, event);
        } else d.regionalChaos = d.regionalChaos.value_or(0) + amount;
        break;
    case EffectOp::addMonsterPressure:
        territory::add_pressure(state, amount);
        break;
    case EffectOp::triggerMonsterSpawn:
        territory::trigger_spawn(state, amount);
        break;
    case EffectOp::politicalForce: {
        if (!slot.instanceId) break;
        const auto& e = std::get<PracticeEffectpoliticalForce>(effect);
        const auto secs = e.duration == Duration::year ? state.hot.seasonDurationSec * state.hot.seasons.size()
            : 6 * state.compiledContent->settings().phaseDurationSec;
        Entry<InstanceId, PoliticalForceEntry> entry{*slot.instanceId, {{}, amount, e.defenseOnly.value_or(false), state.hot.tSec + secs}};
        if (slot.allegiance) entry.value.allegiance = browser::OptionalNullable<FactionId>{*slot.allegiance};
        if (!d.politicalForce) d.politicalForce.emplace();
        auto rows = state.tables.view(*d.politicalForce);
        auto found = std::ranges::find(rows, entry.key, &Entry<InstanceId, PoliticalForceEntry>::key);
        if (found == rows.end()) append_range(state, *d.politicalForce, state.practiceRecipeStorage.politicalForce[siteId.value], entry);
        else *found = entry;
        break;
    }
    case EffectOp::research:
        if (player) civ.research.total += amount;
        else d.research = d.research.value_or(0) + amount;
        break;
    case EffectOp::train: {
        const auto cls = std::get<PracticeEffecttrain>(effect).classId;
        train(state, siteId, site, amount * (scholar && cls == SpecialistClass::scholar ? 2 : 1), cls);
        break;
    }
    case EffectOp::addHousingForPhase:
        add_phase_modifier(state, civ.phaseModifiers.housingByRegion, state.practiceRecipeStorage.housing, site.regionId, amount);
        break;
    case EffectOp::reduceLocalFoodRequirement:
        add_phase_modifier(state, civ.phaseModifiers.foodByRegion, state.practiceRecipeStorage.food, site.regionId, amount);
        break;
    case EffectOp::addFaithChaosResistance:
        if (player) civ.phaseModifiers.faithResistance += amount;
        break;
    case EffectOp::bankCandidateDevelopment: {
        const auto cls = std::get<PracticeEffectbankCandidateDevelopment>(effect).classId;
        auto& bank = d.candidateDevelopment;
        if (!player && !bank) bank.emplace();
        auto& field = cls == SpecialistClass::scholar ? (player ? civ.candidateDevelopment.scholar : bank->scholar)
                                                      : (player ? civ.candidateDevelopment.warrior : bank->warrior);
        field += std::floor(amount);
        EventData event{};
        event.fields.classId = browser::OptionalNullable<SymbolId>{v.specialties[static_cast<std::size_t>(cls)]};
        event.fields.amount = amount;
        emit(state, EventKind::candidateDevelopmentBanked, site.regionId, event);
        break;
    }
    case EffectOp::bankSupport: {
        const auto bank = std::get<PracticeEffectbankSupport>(effect).bank;
        constexpr auto fields = std::array{&runtime::SupportBank::formation, &runtime::SupportBank::siege,
            &runtime::SupportBank::mobility, &runtime::SupportBank::coordination, &runtime::SupportBank::greatHost};
        if (!d.supportBank) d.supportBank.emplace();
        auto& field = (*d.supportBank).*fields[static_cast<std::size_t>(bank)];
        field = std::min(10.0, field.value_or(0) + amount);
        break;
    }
    case EffectOp::bankShopQuality:
        d.shopQualityBonus = std::min(3.0, d.shopQualityBonus.value_or(0) + amount);
        break;
    case EffectOp::bankPreview:
        d.previewBonus = std::min(3.0, d.previewBonus.value_or(0) + amount);
        break;
    case EffectOp::boostSeasonalFood:
        if (d.seasonalFoodBoost && d.seasonalFoodBoost->year == state.hot.year) break;
        for (const auto& row : state.tables.view(d.practiceSlots.rows)) {
            const auto& producer = definition(state, row.practiceId);
            const auto& t = state.compiledContent->tables;
            if (producer.activation.type == Activation::season && has(t.view(producer.tags), v.food) &&
                has(t.view(producer.stockTraits), v.edible)) {
                d.seasonalFoodBoost = SeasonalFoodBoost{state.hot.year, producer.id, amount, {}};
                break;
            }
        }
        break;
    }
}

struct RootScope {
    PracticeEventJournal& journal;
    std::optional<double> root, event;

    RootScope(PracticeEventJournal& journal, PracticeEvent next)
        : journal(journal), root(journal.activeRoot), event(journal.activeEvent)
    {
        journal.activeRoot = next.rootId;
        journal.activeEvent = next.id;
    }

    ~RootScope()
    {
        journal.activeRoot = root;
        journal.activeEvent = event;
    }
};

void resolve(RuntimeState& state, Candidate candidate, Site& site, Index<PracticeSlot> index,
             const PracticeDefinition& def, Assignment worker, const StockPlan& stock,
             const PopulationPlan& population, const ModifierList& mods, Activation activation, bool discharge,
             territory::ExternalPlan external)
{
    const auto& slot = state.tables.at(index);
    const auto& v = state.practiceVocabulary;
    const auto effects = state.compiledContent->tables.view(def.effects);
    Buffer<double, 64> amounts;
    for (const auto& effect : effects)
        amounts.push_back(amount(state, candidate.site, site, def, worker, mods, effect, activation));
    apply_stock(state, site, stock);
    if (state.hot.rulesetId) apply_population(state, candidate.site, site, slot, population);
    Buffer<TraitId, 64> consumedTraits;
    Buffer<Provider, 128> consume, providers;
    for (const auto& item : stock.providers) {
        providers.push_back(item.receipt);
        if (item.receipt.record.kind != v.consume) continue;
        consume.push_back(item.receipt);
        for (const auto trait : item.source.traits)
            if (!has(consumedTraits, trait)) consumedTraits.push_back(trait);
    }
    EventData base{};
    base.fields.practiceId = def.id;
    base.fields.slotIndex = slot.slot;
    if (!consume.empty()) {
        auto event = base;
        event.providers = consume.view();
        event.traits = consumedTraits.view();
        const auto eventTags = tags(state, def, worker.scholar);
        event.tags = eventTags.view();
        event.fields.pool = v.pools[static_cast<std::size_t>(def.pool)];
        emit(state, EventKind::stockConsumed, site.regionId, event);
    }
    if (def.externalAction) territory::commit_external(state, site, *def.externalAction, def.id, external);
    if (discharge) state.practiceCharge[index.value] = 0;
    for (std::size_t i = 0; i < effects.size(); ++i) {
        const bool generate = opcode(effects[i]) == EffectOp::generateStock;
        if (!site.neutral || generate)
            apply_effect(state, candidate.site, site, index, def, effects[i],
                         generate ? amounts[i] + external.bonus : amounts[i], worker.scholar);
    }
    auto& boost = site.detailedState.seasonalFoodBoost;
    if (def.activation.type == Activation::season && boost && boost->practiceId == def.id &&
        !has(state.tables.view(boost->seasons), season_id(state)))
        append_range(state, boost->seasons, state.practiceRecipeStorage.boostSeasons[candidate.site.value], season_id(state));
    const auto& journal = state.hot.civilization.practiceEvents;
    EventData record{};
    record.fields.targetPracticeId = def.id;
    record.fields.slotIndex = slot.slot;
    record.providers = providers.view();
    trace(state, {state.hot.tSec, event_id(state, discharge ? EventKind::discharged : EventKind::activated),
                  site.regionId, *journal.activeRoot, journal.activeEvent, 0}, record);
    base.fields.discharge = discharge;
    emit(state, EventKind::practiceResolved, site.regionId, base);
}

}

void prepare_recipe_storage(RuntimeState& state)
{
    auto& storage = state.practiceRecipeStorage;
    auto& phase = state.hot.civilization.phaseModifiers;
    const auto regionCount = state.hot.world.regions.size();
    storage.food = reserve_range(state, phase.foodByRegion, regionCount);
    storage.housing = reserve_range(state, phase.housingByRegion, regionCount);
    const auto sites = state.tables.view(state.hot.world.sites);
    storage.boostSeasons.resize(sites.size());
    storage.politicalForce.resize(sites.size());
    for (auto& site : sites) {
        auto& detailed = site.detailedState;
        auto seasons = detailed.seasonalFoodBoost ? detailed.seasonalFoodBoost->seasons : Range<SeasonId>{};
        storage.boostSeasons[site.id.value] = reserve_range(state, seasons, state.hot.seasons.size());
        if (detailed.seasonalFoodBoost) detailed.seasonalFoodBoost->seasons = seasons;
        auto force = detailed.politicalForce.value_or(Range<Entry<InstanceId, PoliticalForceEntry>>{});
        storage.politicalForce[site.id.value] = reserve_range(state, force, force.size() + detailed.practiceSlots.slots.size());
        if (detailed.politicalForce) *detailed.politicalForce = force;
    }
}

bool eligible(const RuntimeState& state, const Site& site, bool discharge)
{
    const auto h = holder(state, site.regionId);
    const auto& v = state.practiceVocabulary;
    return !terminal(state) && !site.neutral && settlement::detailed_site(state, site.regionId) == &site &&
        (state.hot.rulesetId || h == v.player || (!discharge && h == v.external));
}

double threshold(const RuntimeState& state, const Site& site, const PracticeDefinition& def, bool scholar)
{
    return std::max(1.0, std::floor(def.charge->threshold -
        sum_modifier(state, def, modifiers(state, site), ModifierKind::chargeThresholdReduction, scholar)));
}

double charge_gain(const RuntimeState& state, const Site& site, const PracticeDefinition& def, Assignment worker)
{
    const auto base = def.charge->gain + sum_modifier(state, def, modifiers(state, site), ModifierKind::chargeGain, worker.scholar);
    return std::max(0.0, std::floor(base * (1 + worker.effective * def.workerBonus)));
}

bool attempt(RuntimeState& state, Candidate candidate, Activation activation, bool localOnly,
             std::optional<PracticeEvent> parent, bool* blocked, bool already)
{
    auto& site = settlement::site_at(state, candidate.site);
    if (!eligible(state, site, parent.has_value())) return false;
    const auto index = site.detailedState.practiceSlots.slots[candidate.slot];
    if (!index) return false;
    const auto& slot = state.tables.at(index);
    if (slot.practiceId != candidate.definition) return false;
    const auto& def = definition(state, slot.practiceId);
    if (parent && (def.mode != Mode::charge || state.practiceCharge[index.value] < 1)) return false;
    const auto worker = workers(state, site)[slot.slot];
    if (parent) {
        if (state.practiceCharge[index.value] < threshold(state, site, def, worker.scholar)) return false;
        if (already) {
            EventData record{};
            record.fields.targetPracticeId = def.id;
            record.fields.reason = state.practiceVocabulary.alreadyDischarged;
            trace(state, {state.hot.tSec, event_id(state, EventKind::cascadeDeferred), site.regionId,
                          parent->rootId, parent->id, 0}, record);
            return false;
        }
    }
    auto fail = [&](SymbolId reason, const std::optional<StockPlan::Missing>& missing = {}) {
        if (blocked) *blocked = true;
        if (parent && !localOnly) {
            EventData record{};
            record.fields.targetPracticeId = def.id;
            record.fields.reason = reason;
            std::array<char, 512> text;
            auto* end = text.data();
            auto* limit = end + text.size();
            if (missing) {
                auto append = [&](std::string_view part) {
                    if (part.size() > static_cast<std::size_t>(limit - end))
                        throw std::length_error("Discharge blocker text exceeds scratch capacity");
                    end = std::ranges::copy(part, end).out;
                };
                append("Missing ");
                append(state.name(missing->kind));
                append(": ");
                const auto length = std::to_chars(end, limit, missing->amount);
                if (length.ec != std::errc{}) throw std::length_error("Discharge blocker amount exceeds scratch capacity");
                end = length.ptr;
                append(" [");
                bool first = true;
                for (auto trait : missing->traits) {
                    if (!first) append(" / ");
                    first = false;
                    append(state.name(trait));
                }
                append("]");
            }
            trace(state, {state.hot.tSec, event_id(state, EventKind::dischargeBlocked), site.regionId,
                          parent->rootId, parent->id, 0}, record, false,
                  {text.data(), static_cast<std::size_t>(end - text.data())});
        }
        return false;
    };
    const auto& v = state.practiceVocabulary;
    if (activation == Activation::death && def.activation.conditions &&
        !conditions(state, site, def, worker, def.activation.conditions->death, localOnly)) return fail(v.unmetCondition);
    if (!conditions(state, site, def, worker, def.condition, localOnly))
        return fail(def.scholarRequired.value_or(false) && !worker.scholar ? v.requiresScholar : v.unmetCondition);
    const auto& t = state.compiledContent->tables;
    auto stock = plan_stock(state, site, t.view(def.consume), t.view(def.require_), &slot, worker.scholar, localOnly);
    if (!stock.ok) return fail(v.unmetCondition, stock.missing);
    if (def.mode == Mode::charge) {
        const auto effects = t.view(def.effects);
        if (std::ranges::any_of(effects, [](const auto& effect) { return opcode(effect) == EffectOp::generateStock; })) {
            double spent = 0;
            for (const auto& provider : stock.providers)
                if (provider.source.practice == index && provider.receipt.record.kind == v.consume) spent += provider.receipt.record.amount;
            if (state.practiceStock[index.value].value_or(0) - spent >= stock_capacity(state, site, index, worker.scholar))
                return fail(v.capacityFull);
        }
        if (std::ranges::all_of(effects, [](const auto& effect) { return opcode(effect) == EffectOp::train; })) {
            const auto& p = site.detailedState.populationByClass;
            if (p.villager.adults <= p.villager.specialists.scholar.adults + p.villager.specialists.warrior.adults &&
                p.stranger.adults <= p.stranger.specialists.scholar.adults + p.stranger.specialists.warrior.adults)
                return fail(v.noTraining);
        }
    }
    const auto mods = modifiers(state, site);
    PopulationPlan population;
    auto& scratch = population_scratch();
    scratch.victims.clear();
    scratch.selections.clear();
    if (!plan_population(state, candidate.site, site, index, def, worker, mods, population))
        return fail(v.unmetCondition);
    if (!population.extraConsume.empty() || !population.extraRequire.empty()) {
        stock = plan_stock(state, site, t.view(def.consume), t.view(def.require_), &slot, worker.scholar, localOnly,
                           population.extraConsume.view(), population.extraRequire.view());
        if (!stock.ok) return fail(v.unmetCondition, stock.missing);
    }
    const auto external = def.externalAction ? territory::plan_external(state, site, *def.externalAction)
                                             : territory::ExternalPlan{};
    if (!external.ok) return fail(v.noExternalTarget);
    auto root = parent ? *parent : [&] {
        EventData event{};
        event.fields.practiceId = def.id;
        event.fields.activationType = v.activations[static_cast<std::size_t>(activation)];
        return emit(state, EventKind::scheduledActivation, site.regionId, event);
    }();
    RootScope scope(state.hot.civilization.practiceEvents, root);
    resolve(state, candidate, site, index, def, worker, stock, population, mods, activation, parent.has_value(), external);
    return true;
}

}

namespace waffle::sim::practice {

void activate(RuntimeState& state, content::Activation activation, std::optional<content::Stage> stage)
{
    using namespace detail;
    using namespace content;
    const auto currentSeason = activation == Activation::season ? season(state) : std::optional<Season>{};
    const auto& tables = state.compiledContent->tables;
    if (state.hot.rulesetId && stage != content::Stage::postRouting && stage != content::Stage::afterMeals)
        for (const auto key : settlement::active_sites(state)) {
            auto& site = settlement::site_at(state, key);
            auto cells = state.tables.view(site.detailedState.structureSlots.origins);
            for (auto& cell : cells) {
                const auto& d = definition(state, cell.structureId);
                if (cell.construction || !d.upkeep) continue;
                const auto timing = d.upkeep->activation;
                if (timing != static_cast<UpkeepActivation>(activation) &&
                    (!currentSeason || timing != static_cast<UpkeepActivation>(static_cast<unsigned>(UpkeepActivation::spring) +
                                                                                static_cast<unsigned>(*currentSeason)))) continue;
                const auto stock = plan_stock(state, site, tables.view(d.upkeep->consume), {}, nullptr, false, true);
                if (d.upkeep->disables) cell.upkeepActive = stock.ok;
                if (stock.ok) apply_stock(state, site, stock);
            }
        }
    Buffer<Candidate, 256> retries;
    for (const auto key : settlement::active_sites(state)) {
        const auto& site = settlement::site_at(state, key);
        if (!eligible(state, site, false)) continue;
        for (const auto slot : state.tables.view(site.detailedState.practiceSlots.rows)) {
            const auto& def = definition(state, slot.practiceId);
            if (def.mode != Mode::scheduled || !(def.activationMask & mask_bit(activation)) ||
                (stage && def.activation.stage != stage)) continue;
            if (def.activation.seasonKeys && activation == Activation::season &&
                (!currentSeason || !(def.seasonMask & mask_bit(*currentSeason)))) continue;
            if (def.cadenceMoons && core::js::remainder(std::floor(state.hot.tSec /
                (state.compiledContent->settings().phaseDurationSec * 6)), *def.cadenceMoons) != 0) continue;
            const Candidate candidate{key, slot.slot, slot.practiceId};
            if (!attempt(state, candidate, activation, true)) retries.push_back(candidate);
        }
    }
    drain_retries(state, retries.view(), activation);
    territory::synchronize_sites(state);
}

}
