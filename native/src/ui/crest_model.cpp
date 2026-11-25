#include "crest_model.hpp"

#include "sim/practice/stock.hpp"
#include "sim/territory/detail.hpp"

#include <algorithm>
#include <cmath>

namespace waffle::connected {
namespace {

using sim::RuntimeState;
using namespace sim::runtime;
namespace territory = sim::territory;
namespace settlement = sim::settlement;
namespace stock = sim::practice::detail;
namespace content = sim::content;

CrestReading town(const RuntimeState& state, const Region& region, const Site& site)
{
    CrestReading row;
    const auto& settings = state.compiledContent->settings();
    const auto& v = state.practiceVocabulary;
    const auto& people = settlement::population_totals(state, site.id).byResidency;
    const auto residents = static_cast<double>(people[0].total() + people[1].total());
    for (const auto [faction, count] : settlement::faction_totals(state, site.id)) {
        if (faction == v.player) row.allegiance[0] = count;
        else if (faction == v.external) row.allegiance[1] = count;
    }
    row.allegiance[2] = std::max(0., residents - row.allegiance[0] - row.allegiance[1]);
    const auto denom = std::max(1., settings.populationPerToken);
    const auto seats = std::floor(static_cast<double>(people[0].adults + people[0].elders) / denom) +
        std::floor(static_cast<double>(people[1].adults + people[1].elders) / denom);
    for (const auto& assignment : stock::workers(state, site)) row.assigned += assignment.tokens;
    row.workers = std::max(row.assigned, seats);
    row.prestige = std::floor(residents / 20.);
    const auto& control = site.detailedState.control;
    if (control && control->unrest) {
        row.unrestYears = std::max(0., control->unrest->untilSec - state.hot.tSec) /
            (4 * settings.seasonDurationSec);
        row.unrestChaos = settings.unrestChaosPerYear;
        row.control = CrestControl::unrest;
    }
    row.town = residents > 0 || row.unrestYears.has_value();
    row.held = !row.unrestYears && (region.controller == v.player || region.controller == v.external);
    row.income = row.held && region.controller == v.player;
    row.crown = row.held && region.controller == v.external && state.hot.civilization.remnant &&
        state.hot.civilization.remnant->capitalRegionId == region.id;
    if (row.held) {
        const auto military = territory::military(state, region.id, region.controller);
        const auto support = territory::resistance(state, site, region.controller);
        row.force = military.force;
        row.warriors = military.warriors;
        row.received = military.received;
        if (support.total > 0) {
            const auto pressure = territory::holding_pressure(support);
            row.zeroForceShare = territory::retaining_share;
            row.minimumShare = row.zeroForceShare / (1 + std::max(0., row.force) / pressure);
            row.minimumLoyal = std::max(1., std::ceil(support.total * row.minimumShare - 1e-9));
            if (support.loyal > 0)
                row.requiredForce = std::max(0., pressure * (row.zeroForceShare * support.total / support.loyal - 1));
            row.control = support.loyal / support.total >= row.zeroForceShare ? CrestControl::supported :
                row.force > 0 && support.loyal >= row.minimumLoyal ? CrestControl::occupied : CrestControl::contested;
        }
    }
    return row;
}

MonsterReading monster(const RuntimeState& state, const Region& region)
{
    MonsterReading result;
    result.strength = region.monster->defense;
    if (const auto target = territory::expansion_target(state, region.id)) {
        result.target = target.value;
        if (state.hot.rulesetId) {
            const auto* site = territory::site_at_region(state, target);
            result.defense = site && site->simulationMode == state.territory.detailed ?
                territory::military(state, target, territory::region_at(state, target).controller).defense : 0.;
            result.willBeRepelled = territory::defense_holds(*result.defense, result.strength);
        }
    }
    const auto& last = state.hot.civilization.chaos.lastMonsterSpawn;
    if (last && last->sourceRegionId == region.id && last->outcome == sim::browser::SpawnOutcome::intercepted &&
        last->strengthBefore && last->strengthAfter) {
        result.repelGain = *last->strengthAfter - *last->strengthBefore;
        result.repelSecond = last->tSec;
    }
    return result;
}

struct Provider {
    std::span<const TraitId> traits;
    const content::PracticeDefinition* practice{};
    bool holder{}, used{}, produces{};
};

void tag(const RuntimeState& state, CrestReading& row, TraitId trait, StockException issue)
{
    const auto name = trait ? state.name(trait) : "Stock";
    const auto existing = std::ranges::find(row.stock, name, &StockBadge::trait);
    if (existing == row.stock.end()) row.stock.push_back({std::string(name), issue});
    else existing->issue = std::max(existing->issue, issue);
}

bool generatesStock(const RuntimeState& state, Range<content::PracticeEffect> effects)
{
    return std::ranges::any_of(state.compiledContent->tables.view(effects), [](const auto& effect) {
        return std::holds_alternative<content::PracticeEffectgenerateStock>(effect);
    });
}

// Coverage counts eligible empty holders and installed recipes, independently of
// throughput. The activation planner only enumerates Stock it can spend now.
void coverage(const RuntimeState& state, CrestAtlas& result)
{
    const auto sites = state.tables.view(state.hot.world.sites);
    const auto& t = state.compiledContent->tables;
    const auto& v = state.practiceVocabulary;
    std::vector<Provider> providers;
    providers.reserve(sites.size() * 5);
    std::vector<std::pair<std::size_t, std::size_t>> providerRegions(result.regions.size());
    for (const auto& site : sites) {
        const auto first = providers.size();
        if (site.neutral) {
            for (const auto& slot : state.tables.view(state.tables.at(*site.neutral).stocks)) {
                const auto traits = state.tables.view(slot.traits);
                providers.push_back({traits, nullptr, !traits.empty() && slot.stock > 0, false, true});
            }
        } else {
            for (const auto slot : site.detailedState.practiceSlots.slots) {
                if (!slot) continue;
                const auto& def = stock::definition(state, state.tables.at(slot).practiceId);
                const auto traits = t.view(def.stockTraits);
                const bool holder = !traits.empty() && (state.practiceStock[slot.value].value_or(0) > 0 ||
                    stock::stock_capacity(state, site, slot, false) > 0);
                providers.push_back({traits, &def, holder, false, generatesStock(state, def.effects)});
            }
        }
        providerRegions[site.regionId.value] = {first, providers.size() - first};
    }
    const auto providersAt = [&](std::size_t region) {
        const auto [first, count] = providerRegions[region];
        return std::span(providers).subspan(first, count);
    };
    for (const auto& site : sites) {
        const auto region = site.regionId;
        auto& row = result.regions[region.value];
        const auto holder = territory::region_at(state, region).controller;
        const auto& local = site.detailedState;
        constexpr auto modifierKinds = content::mask_bit(content::ModifierKind::flexibleProvider) |
            content::mask_bit(content::ModifierKind::currencyWildcard) |
            content::mask_bit(content::ModifierKind::requireSubstitution);
        const auto mods = stock::modifiers(state, site, modifierKinds);
        const auto wildcard = std::ranges::any_of(mods, [](const auto& mod) {
            return mod.def->kind == content::ModifierKind::currencyWildcard;
        });
        std::optional<sim::practice::Assignments> staffing;
        const auto visitCost = [&](std::span<const TraitId> traits, FactionId faction, bool requiring,
                                    bool flexible) {
            bool covered = false;
            const auto sources = [&](RegionId id, bool market) {
                if (market && requiring) return;
                for (auto& source : providersAt(id.value)) {
                    if ((!source.holder && !(market && !source.traits.empty())) ||
                        !(stock::intersects(traits, source.traits) || (!market && (flexible ||
                            (wildcard && stock::has(source.traits, v.currency)) ||
                            (requiring && std::ranges::any_of(mods, [&](const auto& item) {
                                const auto& mod = *item.def;
                                return mod.kind == content::ModifierKind::requireSubstitution && mod.to &&
                                    stock::has(traits, *mod.to) && mod.from && stock::has(source.traits, *mod.from) &&
                                    (!mod.providerTagsAny || (source.practice && stock::intersects(
                                        t.view(*mod.providerTagsAny), t.view(source.practice->tags))));
                            })))))) continue;
                    covered = source.used = true;
                }
            };
            sources(region, false);
            if ((!local.control || !local.control->unrest) && (state.hot.rulesetId ?
                    holder != v.frontier && (faction == v.player || faction == v.external) : holder == v.player)) {
                const auto roads = territory::roads(state, region);
                for (const auto neighbor : territory::neighbors(state, region)) {
                    if (!stock::has(roads, neighbor)) continue;
                    const auto* other = settlement::detailed_site(state, neighbor);
                    if (!other) continue;
                    const bool allied = territory::region_at(state, neighbor).controller == (state.hot.rulesetId ? faction : v.player);
                    if (allied || other->neutral) sources(neighbor, !allied);
                }
            }
            if (!covered) for (const auto trait : traits) tag(state, row, trait, StockException::missing);
        };
        const auto costs = [&](Range<content::StockInput> inputs, FactionId faction, bool requiring, bool flexible) {
            for (const auto& cost : t.view(inputs)) {
                const auto traits = t.view(cost.traits);
                if (cost.amount > 0 && !traits.empty()) visitCost(traits, faction, requiring, flexible);
            }
        };
        for (const auto& slot : state.tables.view(local.practiceSlots.rows)) {
            const auto& def = stock::definition(state, slot.practiceId);
            const auto beneficiary = def.category == content::Category::influence ? slot.allegiance.value_or(holder) : holder;
            const auto flexible = std::ranges::any_of(mods, [&](const auto& mod) {
                if (mod.def->kind != content::ModifierKind::flexibleProvider) return false;
                if (!staffing) staffing = stock::workers(state, site);
                return !mod.def->query || stock::matches(state, def, *mod.def->query, (*staffing)[slot.slot].scholar);
            });
            costs(def.consume, beneficiary, false, flexible);
            costs(def.require_, beneficiary, true, flexible);
        }
        for (const auto& cell : state.tables.view(local.structureSlots.origins)) {
            const auto& def = stock::definition(state, cell.structureId);
            if (cell.construction) costs(def.construction.consume, holder, false, false);
            else if (def.upkeep) costs(def.upkeep->consume, holder, false, false);
        }
        const auto& people = settlement::population_totals(state, site.id).byResidency;
        if (!site.neutral && people[0].total() + people[1].total() > 0)
            visitCost(std::span(&v.edible, 1), holder, false, false);
    }
    for (std::size_t i = 0; i < providerRegions.size(); ++i) {
        auto& row = result.regions[i];
        const auto local = providersAt(i);
        if (!row.town || row.monster) {
            row.stock.clear();
            continue;
        }
        for (const auto& source : local) {
            if (!source.produces) continue;
            if (source.traits.empty()) tag(state, row, {}, StockException::unhosted);
            for (const auto trait : source.traits) {
                const bool hosted = !source.practice || std::ranges::any_of(local, [&](const Provider& candidate) {
                    return candidate.practice && candidate.practice->category != content::Category::influence &&
                        candidate.practice->stockCapacity != 0 && stock::has(candidate.traits, trait);
                });
                if (!hosted) tag(state, row, trait, StockException::unhosted);
                else if (!source.used) tag(state, row, trait, StockException::unused);
            }
        }
        std::ranges::sort(row.stock, {}, &StockBadge::trait);
    }
}

void transfers(const RuntimeState& state, CrestAtlas& result)
{
    const auto& civ = state.hot.civilization;
    const auto second = state.hot.tSec;
    const auto recent = [second](double stamp) { return stamp > 0 && stamp <= second && second - stamp < 2; };
    using Resource = TransferReading::Resource;
    if (const auto& batch = civ.practiceEvents.stockTransfers; batch && recent(batch->tSec)) {
        state.histories.at(batch->transfers.row).for_each([&](const StockTransfersTransfersEntry& entry, const HistoryPayload& page) {
            const auto traits = page.view(entry.traits);
            const bool food = page.text.at(entry.resourceId.value) == "food";
            result.transfers.push_back({entry.sourceRegionId.value, entry.destinationRegionId.value,
                entry.boundarySec, entry.amount, food ? Resource::food : Resource::stock,
                food ? "Edible" : traits.empty() ? "Stock" : std::string(state.name(traits.front())),
                page.text.at(entry.kind.value) == "require"});
        });
    }
    std::vector<TransferId> seen;
    const auto add = [&](const MigrationReport& report, double stamp) {
        if (!recent(stamp)) return;
        for (const auto& movement : state.tables.view(report.outbound)) {
            if (stock::has(seen, movement.transferId)) continue;
            seen.push_back(movement.transferId);
            if (movement.sourceRegionId && movement.destinationRegionId)
                result.transfers.push_back({movement.sourceRegionId.value, movement.destinationRegionId.value,
                    stamp, movement.amount, Resource::population});
        }
    };
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        if (site.detailedState.lastMeal) {
            const auto& meal = state.tables.at(*site.detailedState.lastMeal);
            add(meal.migration, meal.tSec);
        }
    }
    if (const auto& moon = civ.currentMoonTurn) {
        for (const auto& entry : state.tables.view(moon->regions)) {
            if (!entry.value.migration) continue;
            const auto& report = state.tables.at(*entry.value.migration);
            if (report.tSec) add(report, *report.tSec);
        }
    }
}

}

CrestAtlas readCrests(const sim::RuntimeState& state)
{
    CrestAtlas result;
    const auto regions = state.tables.view(state.hot.world.regions);
    result.regions.resize(regions.size());
    for (const auto& region : regions) {
        auto& row = result.regions[region.id.value];
        if (region.monster && !region.monster->cleared.value_or(false)) row.monster = monster(state, region);
        else if (const auto* site = territory::site_at_region(state, region.id);
            site && site->simulationMode == state.territory.detailed) row = town(state, region, *site);
    }
    coverage(state, result);
    transfers(state, result);
    return result;
}

}
