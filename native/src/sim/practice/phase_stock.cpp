#include "sim/practice/stock.hpp"

#include <charconv>

namespace waffle::sim::practice {
namespace {

using namespace detail;

void add_debit(const RuntimeState& state, StockPlan& plan, const Source& source,
               const TraitId& trait, double amount, RegionId paymentFor = {})
{
    StockProvider row{.kind = state.practiceVocabulary.consume, .regionId = source.region,
                      .slotIndex = double(source.slot), .amount = amount};
    if (source.practice) row.practiceId = state.tables.at(source.practice).practiceId;
    plan.providers.push_back({Provider{row, {&trait, 1}, {}}, source, paymentFor});
}

void debit(RuntimeState& state, const Source& source, double amount)
{
    if (source.market) state.tables.at(source.market).stock -= amount;
    else *state.practiceStock[source.practice.value] -= amount;
}

double local_currency(const RuntimeState& state, const Sources& sources, RegionId region)
{
    double total = 0;
    for (const auto& source : sources) {
        if (source.region != region) break;
        if (has(source.traits, state.practiceVocabulary.currency)) total += source.remaining;
    }
    return total;
}

void add_payment(const RuntimeState& state, Sources& sources, StockPlan& plan,
                 RegionId buyer, RegionId seller, double owed)
{
    const auto& currency = state.practiceVocabulary.currency;
    for (auto& source : sources) {
        if (owed <= 0 || source.region != buyer) break;
        if (!has(source.traits, currency) || source.remaining <= 0) continue;
        const auto paid = std::min(owed, source.remaining);
        add_debit(state, plan, source, currency, paid, seller);
        source.remaining -= paid;
        owed -= paid;
    }
}

void pay_for_meal(RuntimeState& state, const Site& site, Sources& sources, RegionId seller, double owed)
{
    // Payment queues events for the later drain, so this workspace cannot be
    // reentered. Each call replaces its receipts before they are used.
    static thread_local StockPlan payment;
    payment.providers.count = 0;
    payment.ok = true;
    add_payment(state, sources, payment, site.regionId, seller, owed);
    apply_stock(state, site, payment);
}

struct MealTransfer {
    RegionId region;
    std::uint32_t slot;
    Index<PracticeSlot> practice;
    double amount;
};

void record_meal_transfers(RuntimeState& state, RegionId destination,
                           std::span<const MealTransfer> food)
{
    if (food.empty()) return;
    auto& transfers = state.hot.civilization.practiceEvents.stockTransfers;
    using Ref = decltype(transfers->transfers);
    if (!transfers) {
        const auto row = state.histories.table<Ref::Storage>().append(1, "Food Stock transfers").begin;
        transfers = PracticeEventJournalStockTransfers{state.hot.tSec, {{row}}};
    }
    auto& history = state.histories.at(transfers->transfers.row);
    if (transfers->tSec != state.hot.tSec) {
        transfers->tSec = state.hot.tSec;
        history.clear();
    }
    for (const auto& [region, slot, practiceSlot, amount] : food) {
        std::array<char, 48> buffer;
        auto* end = std::ranges::copy(std::string_view{"stock:"}, buffer.data()).out;
        auto* limit = buffer.data() + buffer.size();
        end = std::to_chars(end, limit, static_cast<std::uint64_t>(state.hot.tSec)).ptr;
        *end++ = ':';
        end = std::to_chars(end, limit, history.size()).ptr;
        const std::string_view id(buffer.data(), end);
        const auto practice = practiceSlot ? std::optional{state.tables.at(practiceSlot).practiceId} : std::nullopt;
        history.append([&](HistoryPayload& page) {
            const auto text = [&](std::string_view value) { return page.intern_text(value, "Food Stock transfer"); };
            return StockTransfersTransfersEntry{text(id), state.hot.tSec, text("stock"), text("food"),
                text("food"), text("consume"), region, destination, double(slot), practice,
                store(page, std::span<const TraitId>(&state.practiceVocabulary.edible, 1)), amount};
        }, state.practiceRecipeStorage.historyArena);
    }
}

}

double consume_meal_stock(RuntimeState& state, const Site& site, double amount, bool localOnly)
{
    if (amount <= 0) return amount;
    const auto& edible = state.practiceVocabulary.edible;
    auto remaining = amount;
    if (localOnly) {
        const auto& ediblePractices = state.content->migration.ediblePractices;
        const auto& board = site.detailedState.practiceSlots;
        for (const auto slot : board.slots) {
            if (remaining <= 0) break;
            if (!slot) continue;
            auto& stock = state.practiceStock[slot.value];
            if (stock.value_or(0) <= 0 ||
                !ediblePractices.at(state.tables.at(slot).practiceId.value))
                continue;
            const auto taken = std::min(remaining, *stock);
            *stock -= taken;
            remaining -= taken;
        }
        return amount - remaining;
    }

    // No writer can refill the local Edible between the local and shared
    // passes. A town without routing therefore still has nothing to take.
    const auto held = holder(state, site.regionId);
    if ((held != state.practiceVocabulary.player &&
         (!state.hot.rulesetId || held != state.practiceVocabulary.external)) ||
        (site.detailedState.control && site.detailedState.control->unrest) ||
        roads(state, site.regionId).empty()) return 0;

    // Payment emits events into the FIFO; it never re-enters Stock planning.
    auto& sources = stock_sources(state, site, false);
    Buffer<MealTransfer, 128> transfers;
    for (auto& source : sources) {
        if (remaining <= 0) break;
        if (!has(source.traits, edible) || source.remaining <= 0) continue;
        const auto price = source.priced ? state.tables.at(source.market).price : 0;
        const auto available = source.priced ? std::min(source.remaining,
            std::floor(local_currency(state, sources, site.regionId) / price)) : source.remaining;
        const auto taken = std::min(remaining, available);
        if (taken <= 0) continue;
        if (source.priced) {
            // Currency transfers have the Practice reason and are journaled
            // immediately. Food transfers follow all of this site's payments.
            pay_for_meal(state, site, sources, source.region, taken * price);
        }
        debit(state, source, taken);
        source.remaining -= taken;
        remaining -= taken;
        if (source.region != site.regionId) transfers.push_back({source.region, source.slot, source.practice, taken});
    }
    record_meal_transfers(state, site.regionId, transfers.view());
    return amount - remaining;
}

double garrison_upkeep_cost(const RuntimeState& state, const Site& site)
{
    using content::ModifierKind;
    // Most boards have no upkeep modifier. Avoid evaluating unrelated
    // Structure conditions unless a finished Structure can contribute.
    const auto cells = state.tables.view(site.detailedState.structureSlots.origins);
    const auto& tables = state.compiledContent->tables;
    const auto canCharge = std::ranges::any_of(cells, [&](const auto& cell) {
        if (cell.construction || cell.upkeepActive == false) return false;
        const auto mods = definition(state, cell.structureId).modifiers;
        if (!mods) return false;
        const auto entries = tables.view(*mods);
        return std::ranges::find(entries, ModifierKind::garrisonUpkeep,
                                &content::StructureDefinitionModifiersEntry::kind) != entries.end();
    });
    if (!canCharge) return 0;

    double cost = 0;
    for (const auto& modifier : modifiers(state, site))
        if (modifier.def->kind == ModifierKind::garrisonUpkeep) cost += modifier.amount;
    return cost;
}

bool pay_garrison_stock(RuntimeState& state, const Site& site, double amount, bool localOnly)
{
    if (amount <= 0) return true;
    const auto& v = state.practiceVocabulary;
    auto sources = stock_sources(state, site, localOnly);
    StockPlan plan;
    auto needed = amount;
    for (auto& source : sources) {
        if (needed <= 0) break;
        if (source.priced || !has(source.traits, v.edible) || source.remaining <= 0) continue;
        const auto taken = std::min(needed, source.remaining);
        add_debit(state, plan, source, v.edible, taken);
        source.remaining -= taken;
        needed -= taken;
    }
    if (needed > 0) {
        const auto mods = modifiers(state, site);
        const bool wildcard = std::ranges::any_of(mods, [](const auto& mod) {
            return mod.def->kind == content::ModifierKind::currencyWildcard;
        });
        if (wildcard) {
            const auto source = std::ranges::find_if(sources, [&](const auto& entry) {
                return !entry.priced && entry.remaining > 0 && has(entry.traits, v.currency);
            });
            if (source != sources.end()) {
                add_debit(state, plan, *source, v.currency, 1);
                plan.providers[plan.providers.size() - 1].receipt.substitution = {&v.edible, 1};
                --source->remaining;
                --needed;
            }
        }
    }
    for (auto& source : sources) {
        if (needed <= 0) break;
        if (!source.priced || !has(source.traits, v.edible) || source.remaining <= 0) continue;
        const auto price = state.tables.at(source.market).price;
        const auto available = std::floor(local_currency(state, sources, site.regionId) / price);
        const auto taken = std::min({needed, source.remaining, available});
        if (taken <= 0) continue;
        add_payment(state, sources, plan, site.regionId, source.region, taken * price);
        add_debit(state, plan, source, v.edible, taken);
        needed -= taken;
    }
    // This path has a single input and commits immediately. The only provider
    // that can exceed fractional Stock is the recipe Currency wildcard.
    plan.ok = needed <= 0 && std::ranges::none_of(sources, [](const auto& source) { return source.remaining < 0; });
    return apply_stock(state, site, plan);
}

}
