#pragma once

#include "sim/practice/detail.hpp"

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
Assignments workers(const RuntimeState& state, const Site& site);
double specialists(const RuntimeState& state, const Site& site, content::SpecialistClass kind);
ModifierList modifiers(const RuntimeState& state, const Site& site);
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

struct StockPlan {
    Buffer<PlannedProvider, 128> providers;
    bool ok{};
};

using Sources = Buffer<Source, 128>;
Sources stock_sources(const RuntimeState& state, const Site& site, bool localOnly,
                      FactionId beneficiary = {});
StockPlan plan_stock(const RuntimeState& state, const Site& site,
                     std::span<const content::StockInput> consume,
                     std::span<const content::StockInput> require,
                     const PracticeSlot* consumer, bool scholar, bool localOnly,
                     std::span<const content::StockInput> extraConsume = {},
                     std::span<const content::StockInput> extraRequire = {});
void apply_stock(RuntimeState& state, const Site& site, const StockPlan& plan);
double stock_capacity(const RuntimeState& state, const Site& site, Index<PracticeSlot> slot,
                      bool scholar);
double stock_output(const RuntimeState& state, const Site& site, const content::PracticeDefinition& def,
                    const ModifierList& list, bool scholar);

}
