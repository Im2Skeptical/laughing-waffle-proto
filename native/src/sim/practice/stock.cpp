#include "sim/practice/stock.hpp"

#include "core/js_number.hpp"

#include <charconv>

namespace waffle::sim::practice::detail {
namespace {

using namespace content;
using settlement::Residency;

constexpr std::array residencies{Residency::villager, Residency::stranger};

bool stocked(const RuntimeState& state, const Site& site, std::span<const TraitId> traits)
{
    for (const auto& slot : state.tables.view(site.detailedState.practiceSlots.rows))
        if (state.practiceStock[site.detailedState.practiceSlots.slots[slot.slot].value].value_or(0) > 0 &&
            intersects(traits, state.compiledContent->tables.view(definition(state, slot.practiceId).stockTraits)))
            return true;
    return false;
}

double effectiveness(const SettingValues& settings, Residency residency)
{
    return residency == Residency::villager ? settings.villagerEffectiveness : settings.strangerEffectiveness;
}

bool modifier_enabled(const RuntimeState& state, const Site& site, const ModifiersQuery& q)
{
    const auto& civ = state.hot.civilization;
    if (q.minimumSpecialists.value_or(0) > 0 &&
        (!q.specialistClass || specialists(state, site, *q.specialistClass) < *q.minimumSpecialists)) return false;
    if (q.stockedTraitsAny && !stocked(state, site, state.compiledContent->tables.view(*q.stockedTraitsAny))) return false;
    if (q.threatened.value_or(false) &&
        !(civ.chaos.lastMoonIncome && civ.chaos.lastMoonIncome->totalIncome > 0) &&
        !std::ranges::any_of(neighbors(state, site.regionId), [&](auto id) { return region_at(state, id).monster.has_value(); }))
        return false;
    if (q.historicalBurdens.value_or(0) > 0) {
        bool retiredScholar = false;
        state.histories.at(civ.retiredVassals.row).for_each([&](const auto& row, const auto&) {
            retiredScholar |= row.classId == state.practiceVocabulary.specialties[0];
        });
        const auto burdens = int(state.hot.year > 10) + int(civ.chaos.chaosPower > 0) +
                             int(civ.history.lostSettlements > 0) + int(retiredScholar);
        if (burdens < *q.historicalBurdens) return false;
    }
    return true;
}

void add_sources(Sources& sources, const RuntimeState& state, const Site& site, bool priced)
{
    if (site.neutral) {
        const auto range = state.tables.at(*site.neutral).stocks;
        for (std::uint32_t i = range.begin; i < range.end; ++i) {
            const auto& stock = state.tables.rows<NeutralStock>()[i];
            if (stock.stock <= 0) continue;
            sources.push_back({site.regionId, i - range.begin, {}, {i}, state.tables.view(stock.traits),
                               std::max(0.0, stock.stock), priced});
        }
        return;
    }
    const auto& board = site.detailedState.practiceSlots;
    for (const auto slot : board.slots) {
        if (!slot) continue;
        const auto stock = state.practiceStock[slot.value].value_or(0);
        if (stock <= 0) continue;
        const auto& row = state.tables.at(slot);
        const auto& def = definition(state, row.practiceId);
        sources.push_back({site.regionId, row.slot, slot, {}, state.compiledContent->tables.view(def.stockTraits),
                           std::max(0.0, stock), false});
    }
}

double current_stock(const RuntimeState& state, const Source& source)
{
    if (source.market) return state.tables.at(source.market).stock;
    return state.practiceStock[source.practice.value].value_or(0);
}

void add_provider(StockPlan& plan, const RuntimeState& state, const Source& source, SymbolId kind,
                  double amount, std::span<const TraitId> traits, RegionId payment = {},
                  std::span<const TraitId> substitution = {})
{
    StockProvider row{.kind = kind, .regionId = source.region, .slotIndex = double(source.slot), .amount = amount};
    if (source.practice) row.practiceId = state.tables.at(source.practice).practiceId;
    if (payment) row.paymentFor = state.practiceVocabulary.regionSymbols[payment.value];
    if (source.priced) {
        const auto& market = state.tables.at(source.market);
        row.marketStockId = market.id;
        row.label = state.practiceVocabulary.marketLabels[source.market.value];
        row.unitPrice = market.price;
    }
    plan.providers.push_back({Provider{row, traits, substitution}, source, payment});
}

double terrain_component(const RuntimeState& state, RegionId region, Biome biome)
{
    if (biome == Biome::mountains) return double(state.topology->mountain_component(region).size());
    Buffer<RegionId, 256> reached;
    reached.push_back(region);
    for (std::size_t i = 0; i < reached.size(); ++i)
        for (auto neighbor : neighbors(state, reached[i]))
            if (state.topology->biome(neighbor) == biome && !has(reached, neighbor)) reached.push_back(neighbor);
    return double(reached.size());
}

double multiplier(const RuntimeState& state, const Site& site, const PracticeDefinition& def,
                  const ModifierList& list, ModifierKind kind, bool scholar)
{
    auto sum = sum_modifier(state, def, list, kind, scholar);
    const auto& tables = state.compiledContent->tables;
    if (def.stockMultipliers) for (const auto& contribution : tables.view(*def.stockMultipliers)) {
        const auto output = multiplier_pool(contribution) == MultiplierPool::outputMultiplier;
        if (output != (kind == ModifierKind::outputMultiplier)) continue;
        std::visit([&](const auto& m) {
            if (m.biome && (!state.topology || state.topology->biome(site.regionId) != m.biome)) return;
            if (m.seasonKeys) {
                const auto current = season(state);
                if (!current || !(m.seasonMask & mask_bit(*current))) return;
            }
            if (m.stockedTraitsAny && !stocked(state, site, tables.view(*m.stockedTraitsAny))) return;
            sum += m.amount * (m.perRegion.value_or(false) && m.biome
                ? terrain_component(state, site.regionId, *m.biome) : 1.0);
        }, contribution);
    }
    const auto& scale = kind == ModifierKind::outputMultiplier ? def.keywordOutputScale : def.keywordCapacityScale;
    if (scale && (!state.hot.rulesetId || holder(state, site.regionId) == state.practiceVocabulary.player)) {
        const auto current = state.indexes.currentVassal;
        if (current) {
            const auto& vassal = state.tables.at(current).value;
            if (!vassal.isDead && !vassal.endedReason && vassal.classId) {
                double score = 0;
                if (scale->keyword == Keyword::monsterTrophies && vassal.classId == SpecialistClass::warrior)
                    score = state.hot.civilization.history.monsterTrophies;
                if (scale->keyword == Keyword::synthesis && vassal.classId == SpecialistClass::scholar) {
                    const auto assignments = workers(state, site);
                    for (const auto& slot : state.tables.view(site.detailedState.practiceSlots.rows)) {
                        if (slot.practiceId == def.id || !assignments[slot.slot].scholar) continue;
                        const auto& other = definition(state, slot.practiceId);
                        if (stock_available(state, site, tables.view(other.consume), tables.view(other.require_),
                                            &slot, true, false)) ++score;
                    }
                }
                sum += std::min(scale->cap.value_or(INFINITY), std::floor(score / scale->per)) * scale->amount;
            }
        }
    }
    return 1 + sum;
}

}

double specialists(const RuntimeState& state, const Site& site, content::SpecialistClass kind)
{
    double count = 0;
    for (auto residency : residencies) {
        const auto& p = settlement::population_class(site.detailedState.populationByClass, residency).specialists;
        count += settlement::cohort_total(settlement::cohort_view(state, kind == content::SpecialistClass::scholar ? p.scholar : p.warrior));
    }
    return count;
}

Assignments workers(const RuntimeState& state, const Site& site)
{
    Assignments result{};
    auto board = state.tables.view(site.detailedState.practiceSlots.rows);
    const auto& pop = site.detailedState.populationByClass;
    const auto& settings = state.compiledContent->settings();
    const auto per = std::max(1.0, settings.populationPerToken);
    if (!pop.villager.joint && !pop.stranger.joint) {
        for (auto residency : residencies) {
            const auto& p = settlement::population_class(pop, residency);
            const auto scholar = settlement::cohort_view(state, p.specialists.scholar);
            double remaining = settlement::cohort_total(scholar) - scholar.children;
            for (bool required : {true, false}) for (const auto& slot : board) {
                if (remaining <= 0) break;
                const auto& def = definition(state, slot.practiceId);
                auto& worker = result[slot.slot];
                if (def.scholarRequired.value_or(false) != required ||
                    worker.scholar || worker.tokens >= def.workerCapacity) continue;
                worker.scholar = true;
                ++worker.tokens;
                worker.effective += effectiveness(settings, residency);
                --remaining;
            }
        }
        for (auto residency : residencies) {
            const auto& p = settlement::population_class(pop, residency);
            const auto scholar = settlement::cohort_view(state, p.specialists.scholar);
            const auto total = settlement::cohort_view(state, p);
            double remaining = std::floor(std::max(0.0, settlement::cohort_total(total) - total.children -
                (settlement::cohort_total(scholar) - scholar.children)) / per);
            for (const auto& slot : board) {
                if (remaining <= 0) break;
                auto& worker = result[slot.slot];
                const auto capacity = definition(state, slot.practiceId).workerCapacity;
                while (remaining > 0 && worker.tokens < capacity) {
                    ++worker.tokens;
                    worker.effective += effectiveness(settings, residency);
                    --remaining;
                }
            }
        }
        return result;
    }
    struct Group {
        FactionId faction;
        Residency residency;
        double scholars{}, ordinary{};
    };
    Buffer<Group, 6> groups;
    for (auto residency : residencies) {
        const auto bins = settlement::population_bins(state, pop, residency);
        for (std::size_t i = 0; i < bins.size(); ++i) {
            const auto bin = bins[i];
            if (bin.key.kind == state.populationVocabulary.stages[1]) continue;
            auto group = std::find_if(groups.begin(), groups.end(), [&](const Group& row) {
                return row.faction == bin.key.allegiance && row.residency == residency;
            });
            if (group == groups.end()) {
                groups.push_back({bin.key.allegiance, residency});
                group = groups.end() - 1;
            }
            (bin.key.specialty == state.populationVocabulary.specialties[1] ? group->scholars : group->ordinary)
                += double(bin.count);
        }
    }
    for (bool influence : {true, false}) for (bool scholar : {true, false}) for (auto& g : groups) {
        const auto eff = effectiveness(settings, g.residency);
        for (const auto& slot : board) {
            if (scholar ? g.scholars <= 0 : g.ordinary < per) break;
            const auto& def = definition(state, slot.practiceId);
            if ((def.category == Category::influence) != influence ||
                (influence && (g.faction == state.practiceVocabulary.neutral || slot.allegiance != g.faction))) continue;
            auto& worker = result[slot.slot];
            if (scholar) {
                if (g.scholars > 0 && !worker.scholar && worker.tokens < def.workerCapacity) {
                    worker.scholar = true;
                    ++worker.tokens;
                    worker.effective += eff;
                    --g.scholars;
                }
            } else while (g.ordinary >= per && worker.tokens < def.workerCapacity) {
                ++worker.tokens;
                worker.effective += eff;
                g.ordinary -= per;
            }
        }
    }
    return result;
}

ModifierList modifiers(const RuntimeState& state, const Site& site, unsigned kinds)
{
    ModifierList result;
    if (!has_modifiers(state, site, kinds)) return result;
    for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins)) {
        if (cell.construction || cell.upkeepActive == false) continue;
        const auto& def = definition(state, cell.structureId);
        if (def.specialistGate.value_or(0) > 0) {
            if (def.pool == Pool::common ||
                specialists(state, site, def.pool == Pool::scholar ? SpecialistClass::scholar : SpecialistClass::warrior) < *def.specialistGate)
                continue;
        }
        if (!def.modifiers) continue;
        for (const auto& mod : state.compiledContent->tables.view(*def.modifiers)) {
            if (!(kinds & mask_bit(mod.kind))) continue;
            if (mod.query && !modifier_enabled(state, site, *mod.query)) continue;
            if (mod.query && mod.query->unique.value_or(false) && std::ranges::any_of(result, [&](const Modifier& prior) {
                return prior.def->kind == mod.kind && prior.def->queryIdentity == mod.queryIdentity;
            })) continue;
            const auto quality = std::max(0.0, cell.qualityBonus.value_or(0));
            auto amount = mod.amount.value_or(0);
            if (mod.kind == ModifierKind::capacity || mod.kind == ModifierKind::outputMultiplier)
                amount += std::min(3.0 - static_cast<double>(def.minimumQuality), quality);
            else amount *= 1 + .25 * quality;
            result.push_back({&mod, amount});
        }
    }
    return result;
}

bool matches(const RuntimeState& state, const PracticeDefinition& def, const ModifiersQuery& q, bool scholar)
{
    const auto& t = state.compiledContent->tables;
    auto input_matches = [&](auto input, auto traits) {
        return std::ranges::any_of(t.view(input), [&](const auto& cost) { return intersects(t.view(cost.traits), traits); });
    };
    if (q.traitsAny && !intersects(t.view(*q.traitsAny), t.view(def.stockTraits))) return false;
    if (q.tagsAny && !intersects(t.view(*q.tagsAny), t.view(def.tags)) &&
        !(scholar && has(t.view(*q.tagsAny), state.practiceVocabulary.knowledge))) return false;
    if (q.scholarStaffed.value_or(false) && !scholar) return false;
    if (q.consumesAny && !input_matches(def.consume, t.view(*q.consumesAny))) return false;
    if (q.requiresAny && !input_matches(def.require_, t.view(*q.requiresAny))) return false;
    if (q.requiresOrConsumesAny && !input_matches(def.consume, t.view(*q.requiresOrConsumesAny)) &&
        !input_matches(def.require_, t.view(*q.requiresOrConsumesAny))) return false;
    if (def.consume.size() + def.require_.size() < q.minimumRequirements.value_or(0)) return false;
    if (q.effectOpsAny && !std::ranges::any_of(t.view(def.effects), [&](const auto& effect) {
        return has(t.view(*q.effectOpsAny), opcode(effect)) && (!q.classId || std::visit([&](const auto& e) {
            if constexpr (requires { e.classId; }) return e.classId == *q.classId;
            else return false;
        }, effect));
    })) return false;
    if (q.triggerKindsAny && (!def.charge || !std::ranges::any_of(t.view(def.charge->trigger.any), [&](const auto& clause) {
        if (!has(t.view(*q.triggerKindsAny), trigger_kind(clause))) return false;
        if (!q.triggerTraitsAny || trigger_kind(clause) != TriggerKind::stockGenerated) return true;
        const auto& generated = std::get<TriggerClausestockGenerated>(clause);
        return generated.traitsAny && intersects(t.view(*q.triggerTraitsAny), t.view(*generated.traitsAny));
    }))) return false;
    return true;
}

double sum_modifier(const RuntimeState& state, const PracticeDefinition& def,
                    const ModifierList& list, ModifierKind kind, bool scholar)
{
    double amount = 0;
    for (const auto& mod : list)
        if (mod.def->kind == kind && (!mod.def->query || matches(state, def, *mod.def->query, scholar))) amount += mod.amount;
    return amount;
}

Sources& stock_sources(const RuntimeState& state, const Site& site, bool localOnly, FactionId beneficiary)
{
    thread_local Sources result;
    result.count = 0;
    add_sources(result, state, site, false);
    if (localOnly || (site.detailedState.control && site.detailedState.control->unrest)) return result;
    const auto held = holder(state, site.regionId);
    if (!beneficiary) beneficiary = held;
    const auto& v = state.practiceVocabulary;
    if (state.hot.rulesetId ? held == v.frontier || (beneficiary != v.player && beneficiary != v.external)
                            : held != v.player) return result;
    const auto connected = roads(state, site.regionId);
    Buffer<const Site*, 20> markets;
    for (const auto region : neighbors(state, site.regionId)) {
        if (!has(connected, region)) continue;
        const auto* host = settlement::detailed_site(state, region);
        if (!host) continue;
        if (holder(state, region) == beneficiary) add_sources(result, state, *host, false);
        else if (host->neutral) markets.push_back(host);
    }
    for (const auto* market : markets) add_sources(result, state, *market, true);
    return result;
}

void plan_stock_into(StockPlan& result, const RuntimeState& state, const Site& site,
                     std::span<const StockInput> consume, std::span<const StockInput> require,
                     const PracticeSlot* consumer, bool scholar, bool localOnly,
                     std::span<const StockInput> extraConsume, std::span<const StockInput> extraRequire)
{
    result.providers.count = 0;
    result.missing.reset();
    result.ok = true;
    if (consume.empty() && require.empty() && extraConsume.empty() && extraRequire.empty()) return;
    const auto* def = consumer ? &definition(state, consumer->practiceId) : nullptr;
    const auto beneficiary = def && def->category == Category::influence ? consumer->allegiance.value_or(FactionId{}) : FactionId{};
    auto& sources = stock_sources(state, site, localOnly, beneficiary);
    constexpr auto stockModifiers = staffStockModifiers | mask_bit(ModifierKind::currencyWildcard) |
        mask_bit(ModifierKind::requireSubstitution);
    const auto mods = modifiers(state, site, stockModifiers);
    const auto& t = state.compiledContent->tables;
    const auto& v = state.practiceVocabulary;
    const bool flexible = def && std::ranges::any_of(mods, [&](const Modifier& mod) {
        return mod.def->kind == ModifierKind::flexibleProvider &&
            (!mod.def->query || matches(state, *def, *mod.def->query, scholar));
    });
    const bool wildcard = std::ranges::any_of(mods, [](const Modifier& mod) { return mod.def->kind == ModifierKind::currencyWildcard; });
    bool wildcardUsed = false, flexibleUsed = false;
    auto compatible = [&](const Source& source, auto traits, bool requiring) {
        return intersects(traits, source.traits) || (requiring && std::ranges::any_of(mods, [&](const Modifier& item) {
            const auto& mod = *item.def;
            return mod.kind == ModifierKind::requireSubstitution && mod.to && has(traits, *mod.to) &&
                mod.from && has(source.traits, *mod.from) &&
                (!mod.providerTagsAny || (source.practice && intersects(t.view(*mod.providerTagsAny),
                    t.view(definition(state, state.tables.at(source.practice).practiceId).tags))));
        }));
    };
    auto allocate = [&](std::span<const StockInput> costs, bool requiring) {
        const auto kind = requiring ? v.require : v.consume;
        for (const auto& cost : costs) {
            const auto traits = t.view(cost.traits);
            auto needed = cost.amount;
            if (!requiring && def && has(traits, v.record))
                needed = std::max(needed > 0 ? 1.0 : 0.0, std::ceil(needed -
                    sum_modifier(state, *def, mods, ModifierKind::consumeReduction, scholar)));
            for (auto& source : sources) {
                if (needed <= 0) break;
                if (source.priced || !compatible(source, traits, requiring)) continue;
                const auto amount = std::min(needed, requiring ? current_stock(state, source) : source.remaining);
                if (amount <= 0) continue;
                add_provider(result, state, source, kind, amount, traits);
                if (!requiring) source.remaining -= amount;
                needed -= amount;
            }
            if (needed > 0 && ((wildcard && !wildcardUsed) || (flexible && !flexibleUsed))) {
                for (auto& source : sources) {
                    if (source.priced || source.remaining <= 0) continue;
                    const bool useCurrency = wildcard && !wildcardUsed && has(source.traits, v.currency);
                    if (!useCurrency && !(flexible && !flexibleUsed)) continue;
                    add_provider(result, state, source, useCurrency ? v.consume : kind, 1, source.traits, {}, traits);
                    if (useCurrency || !requiring) --source.remaining;
                    --needed;
                    if (useCurrency) wildcardUsed = true;
                    else flexibleUsed = true;
                    break;
                }
            }
            if (!requiring && needed > 0) for (auto& market : sources) {
                if (needed <= 0) break;
                if (!market.priced || !compatible(market, traits, false)) continue;
                double currency = 0;
                for (const auto& source : sources)
                    if (source.region == site.regionId && has(source.traits, v.currency)) currency += source.remaining;
                const auto price = state.tables.at(market.market).price;
                const auto amount = std::min({needed, market.remaining, std::floor(currency / price)});
                if (amount <= 0) continue;
                auto owed = amount * price;
                for (auto& source : sources) {
                    if (owed <= 0) break;
                    if (source.region != site.regionId || !has(source.traits, v.currency)) continue;
                    const auto paid = std::min(owed, source.remaining);
                    if (paid <= 0) continue;
                    add_provider(result, state, source, v.consume, paid, std::span<const TraitId>(&v.currency, 1), market.region);
                    source.remaining -= paid;
                    owed -= paid;
                }
                add_provider(result, state, market, v.consume, amount, traits);
                market.remaining -= amount;
                needed -= amount;
            }
            if (needed > 0) {
                result.missing = StockPlan::Missing{kind, needed, traits};
                return false;
            }
        }
        return true;
    };
    result.ok = allocate(require, true) && allocate(extraRequire, true) &&
        allocate(consume, false) && allocate(extraConsume, false);
    if (!result.ok) result.providers.count = 0;
}

bool stock_available(const RuntimeState& state, const Site& site,
                     std::span<const StockInput> consume, std::span<const StockInput> require,
                     const PracticeSlot* consumer, bool scholar, bool localOnly)
{
    thread_local StockPlan check;
    plan_stock_into(check, state, site, consume, require, consumer, scholar, localOnly);
    return check.ok;
}

}

namespace waffle::sim::practice {

using namespace detail;
using namespace content;

StockPlan plan_stock(const RuntimeState& state, const Site& site,
                     std::span<const StockInput> consume, std::span<const StockInput> require,
                     const PracticeSlot* consumer, bool scholar, bool localOnly,
                     std::span<const StockInput> extraConsume, std::span<const StockInput> extraRequire)
{
    StockPlan result;
    plan_stock_into(result, state, site, consume, require, consumer, scholar, localOnly, extraConsume, extraRequire);
    return result;
}

bool apply_stock(RuntimeState& state, const Site& site, const StockPlan& plan)
{
    if (!plan.ok) return false;
    const auto& v = state.practiceVocabulary;
    Buffer<std::pair<RegionId, double>, 20> purchases;
    auto& civ = state.hot.civilization;
    for (const auto& row : plan.providers) {
        const auto& provider = row.receipt.record;
        if (provider.kind != v.consume) continue;
        if (row.source.market) state.tables.at(row.source.market).stock -= provider.amount;
        else *state.practiceStock[row.source.practice.value] -= provider.amount;
        if (!row.paymentFor) continue;
        auto* market = settlement::detailed_site(state, row.paymentFor);
        state.tables.at(*market->neutral).currencyStock += provider.amount;
        auto existing = std::ranges::find_if(purchases, [&](const auto& p) { return p.first == row.paymentFor; });
        if (existing == purchases.end()) purchases.push_back({row.paymentFor, provider.amount});
        else existing->second += provider.amount;
        if (civ.currentMoonTurn) {
            auto reports = state.tables.view(civ.currentMoonTurn->regions);
            auto report = std::ranges::find(reports, provider.regionId, &Entry<RegionId, MoonRegionResult>::key);
            if (report != reports.end())
                report->value.currencySpent += provider.amount;
        }
    }
    for (const auto& [target, amount] : purchases) {
        civ.history.trades = civ.history.trades.value_or(0) + 1;
        EventData event{};
        event.fields.targetRegionId = browser::OptionalNullable<RegionId>{target};
        event.fields.amount = amount;
        emit(state, EventKind::externalTrade, site.regionId, event);
    }
    for (const auto& row : plan.providers) {
        if (!row.paymentFor && row.source.region == site.regionId) continue;
        auto& transfers = civ.practiceEvents.stockTransfers;
        using Ref = decltype(transfers->transfers);
        if (!transfers) {
            const auto index = state.histories.table<Ref::Storage>().append(1, "Stock transfers").begin;
            transfers = PracticeEventJournalStockTransfers{state.hot.tSec, {{index}}};
        }
        auto& history = state.histories.at(transfers->transfers.row);
        if (transfers->tSec != state.hot.tSec) {
            transfers->tSec = state.hot.tSec;
            history.clear();
        }
        const auto& p = row.receipt.record;
        const auto requested = row.receipt.substitution.empty() ? row.receipt.traits : row.receipt.substitution;
        const auto match = std::ranges::find_if(requested, [&](auto trait) { return has(row.source.traits, trait); });
        const auto trait = match != requested.end() ? *match : requested.empty() ? TraitId{} : requested.front();
        std::array<char, 48> textBuffer;
        auto* end = std::ranges::copy(std::string_view{"stock:"}, textBuffer.data()).out;
        auto* limit = textBuffer.data() + textBuffer.size();
        end = std::to_chars(end, limit, static_cast<std::uint64_t>(state.hot.tSec)).ptr;
        *end++ = ':';
        end = std::to_chars(end, limit, history.size()).ptr;
        const std::string_view id(textBuffer.data(), static_cast<std::size_t>(end - textBuffer.data()));
        history.append([&](HistoryPayload& page) {
            auto text = [&](std::string_view value) { return page.intern_text(value, "Stock transfer"); };
            return StockTransfersTransfersEntry{text(id), state.hot.tSec, text("stock"),
                text(trait == v.edible ? "food" : "stock"), text("practice"), text(state.name(p.kind)),
                p.regionId, row.paymentFor ? row.paymentFor : site.regionId, p.slotIndex, p.practiceId,
                store(page, trait ? std::span<const TraitId>(&trait, 1) : std::span<const TraitId>{}), p.amount};
        }, state.practiceRecipeStorage.historyArena);
    }
    return true;
}

}

namespace waffle::sim::practice::detail {

double stock_capacity(const RuntimeState& state, const Site& site, Index<PracticeSlot> slot, bool scholar)
{
    const auto& row = state.tables.at(slot);
    const auto& def = definition(state, row.practiceId);
    if (def.stockCapacity <= 0) return 0;
    const auto base = def.stockCapacity + static_cast<double>(row.tier);
    constexpr auto kind = ModifierKind::capacity;
    if (!def.stockMultipliers && !def.keywordCapacityScale && !has_modifiers(state, site, mask_bit(kind)))
        return std::floor(base);
    return std::floor(base * multiplier(state, site, def, modifiers(state, site, mask_bit(kind)), kind, scholar));
}

double stock_output(const RuntimeState& state, const Site& site, const PracticeDefinition& def,
                    const ModifierList& list, bool scholar)
{
    return multiplier(state, site, def, list, ModifierKind::outputMultiplier, scholar);
}

}
