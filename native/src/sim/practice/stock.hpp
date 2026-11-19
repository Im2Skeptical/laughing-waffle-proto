#pragma once

#include "sim/practice/detail.hpp"

namespace waffle::sim::practice { struct StockPlan; }

namespace waffle::sim::practice::detail {

template<class T, std::size_t N>
struct Buffer {
    std::array<T, N> rows;
    std::size_t count{};

    auto begin() { return rows.data(); }
    auto begin() const { return rows.data(); }
    auto end() { return begin() + count; }
    auto end() const { return begin() + count; }
    bool empty() const { return count == 0; }
    auto size() const { return count; }
    auto& operator[](std::size_t i) { return rows[i]; }
    const auto& operator[](std::size_t i) const { return rows[i]; }
    void push_back(T value)
    {
        if (count == N) throw std::length_error("Practice scratch capacity exhausted");
        rows[count++] = value;
    }
    std::span<const T> view() const { return {begin(), count}; }
};

struct Assignment {
    std::uint32_t tokens{};
    double effective{};
    bool scholar{};
};

struct Modifier {
    const content::StructureDefinitionModifiersEntry* def;
    double amount;
};

using ModifierList = Buffer<Modifier, 96>;
using Assignments = std::array<Assignment, 5>;
inline constexpr auto staffStockModifiers = content::mask_bit(content::ModifierKind::flexibleProvider) |
    content::mask_bit(content::ModifierKind::consumeReduction);
Assignments workers(const RuntimeState& state, const Site& site);
double specialists(const RuntimeState& state, const Site& site, content::SpecialistClass kind);
inline bool has_modifiers(const RuntimeState& state, const Site& site, unsigned kinds)
{
    const auto& siteKinds = state.practiceListeners.modifierKindsBySite;
    return !site.neutral && (site.id.value >= siteKinds.size() || (siteKinds[site.id.value] & kinds));
}

ModifierList modifiers(const RuntimeState& state, const Site& site, unsigned kinds = ~0u);
bool matches(const RuntimeState& state, const content::PracticeDefinition& def,
             const content::ModifiersQuery& query, bool scholar);
double sum_modifier(const RuntimeState& state, const content::PracticeDefinition& def,
                    const ModifierList& list, content::ModifierKind kind, bool scholar);

struct Source {
    RegionId region;
    std::uint32_t slot;
    Index<PracticeSlot> practice;
    Index<NeutralStock> market;
    std::span<const TraitId> traits;
    double remaining;
    bool priced;
};

struct PlannedProvider {
    Provider receipt;
    Source source;
    RegionId paymentFor;
};

using Sources = Buffer<Source, 128>;
// Scratch is overwritten by the next Stock source query on this thread.
Sources& stock_sources(const RuntimeState& state, const Site& site, bool localOnly,
                       FactionId beneficiary = {});
void plan_stock_into(StockPlan& result, const RuntimeState& state, const Site& site,
                     std::span<const content::StockInput> consume,
                     std::span<const content::StockInput> require,
                     const PracticeSlot* consumer, bool scholar, bool localOnly,
                     std::span<const content::StockInput> extraConsume = {},
                     std::span<const content::StockInput> extraRequire = {});
bool stock_available(const RuntimeState& state, const Site& site,
                     std::span<const content::StockInput> consume,
                     std::span<const content::StockInput> require,
                     const PracticeSlot* consumer, bool scholar, bool localOnly);
double stock_capacity(const RuntimeState& state, const Site& site, Index<PracticeSlot> slot,
                      bool scholar);
double stock_output(const RuntimeState& state, const Site& site, const content::PracticeDefinition& def,
                    const ModifierList& list, bool scholar);

}

namespace waffle::sim::practice {

struct StockPlan {
    detail::Buffer<detail::PlannedProvider, 128> providers;
    struct Missing {
        runtime::SymbolId kind;
        double amount;
        std::span<const runtime::TraitId> traits;
    };
    std::optional<Missing> missing;
    bool ok{};
};

// Plan reads activation-start Stock. Apply once against the same state before
// another writer changes the board or inventories. Receipts borrow trait spans.
StockPlan plan_stock(const RuntimeState& state, const runtime::Site& site,
                     std::span<const content::StockInput> consume,
                     std::span<const content::StockInput> require,
                     const runtime::PracticeSlot* consumer, bool scholar, bool localOnly,
                     std::span<const content::StockInput> extraConsume = {},
                     std::span<const content::StockInput> extraRequire = {});
bool apply_stock(RuntimeState& state, const runtime::Site& site, const StockPlan& plan);

}
