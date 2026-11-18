#pragma once

#include "sim/browser/types.hpp"

#include <array>
#include <compare>
#include <cstdint>
#include <limits>
#include <span>
#include <stdexcept>
#include <string_view>
#include <type_traits>

namespace waffle::sim::runtime {

inline constexpr auto no_index = std::numeric_limits<std::uint32_t>::max();

template<class T>
struct Index {
    std::uint32_t value{no_index};
    explicit operator bool() const { return value != no_index; }
    auto operator<=>(const Index&) const = default;
};

template<class Domain>
struct Id {
    std::uint32_t value{no_index};
    explicit operator bool() const { return value != no_index; }
    auto operator<=>(const Id&) const = default;
};

using RegionId = Id<struct RegionDomain>;
using SiteId = Id<struct SiteDomain>;
using SiteModeId = Id<struct SiteModeDomain>;
using FactionId = Id<struct FactionDomain>;
using TraitId = Id<struct TraitDomain>;
using TagId = Id<struct TagDomain>;
using PracticeId = Id<struct PracticeDomain>;
using StructureId = Id<struct StructureDomain>;
using InstanceId = Id<struct InstanceDomain>;
using MarketStockId = Id<struct MarketStockDomain>;
using ResidencyId = Id<struct ResidencyDomain>;
using BirthCreditId = Id<struct BirthCreditDomain>;
using SpecialtyId = Id<struct SpecialtyDomain>;
using LifeStageId = Id<struct LifeStageDomain>;
using SeasonId = Id<struct SeasonDomain>;
using EventKindId = Id<struct EventKindDomain>;
using TransferId = Id<struct TransferDomain>;
using VassalId = Id<struct VassalDomain>;
using NodeId = Id<struct NodeDomain>;
using SymbolId = Id<struct SymbolDomain>;
using HistoryTextId = Id<struct HistoryTextDomain>;

template<class T>
struct Range {
    std::uint32_t begin{}, end{};
    std::uint32_t size() const { return end - begin; }
};

template<class Key, class T>
struct Entry {
    Key key;
    T value;
};

std::uint32_t checked_index(std::size_t value, std::string_view path);

template<class T>
struct Table {
    std::vector<T> values;

    Range<T> append(std::size_t count, std::string_view path)
    {
        const auto begin = checked_index(values.size(), path);
        if (count >= no_index - begin) throw std::invalid_argument(std::string(path) + ": table exceeds 32-bit range");
        const auto end = begin + static_cast<std::uint32_t>(count);
        values.resize(end);
        return {begin, end};
    }
};

template<class... Ts>
struct Tables : Table<Ts>... {
    template<class T> static constexpr bool contains = (std::is_same_v<T, Ts> || ...);
    template<class T> auto& table() { return static_cast<Table<T>&>(*this); }
    template<class T> const auto& table() const { return static_cast<const Table<T>&>(*this); }
    template<class T> auto& rows() { return table<T>().values; }
    template<class T> const auto& rows() const { return table<T>().values; }

    template<class T> auto view(Range<T> range) { return slice(rows<T>(), range); }
    template<class T> auto view(Range<T> range) const { return slice(rows<T>(), range); }
    template<class T> T& at(Index<T> index) { return rows<T>().at(index.value); }
    template<class T> const T& at(Index<T> index) const { return rows<T>().at(index.value); }

    std::size_t live_bytes() const
    {
        return (std::size_t{0} + ... + (rows<Ts>().size() * sizeof(Ts)));
    }

    template<class Visit>
    void for_each_table(Visit visit) const
    {
        (visit(rows<Ts>()), ...);
    }

private:
    template<class Vector, class T>
    static auto slice(Vector& vector, Range<T> range)
    {
        if (range.end < range.begin || range.end > vector.size()) throw std::out_of_range("runtime table range");
        return std::span(vector).subspan(range.begin, range.size());
    }
};

struct PracticeSlot;
struct StructureCell;

struct PracticeBoard {
    std::array<Index<PracticeSlot>, 5> slots{};
    Range<PracticeSlot> rows;
};

struct StructureBoard {
    Range<StructureCell> origins;
    Range<Index<StructureCell>> footprint;
};

// A per-domain insertion-ordered dictionary. Both strings and their offsets
// occupy flat buffers, including for identities created after admission.
struct Strings {
    std::vector<char> bytes;
    std::vector<Range<char>> offsets;

    std::optional<std::uint32_t> find(std::string_view name) const;
    std::string_view at(std::uint32_t ordinal) const;
    void append(std::string_view name, std::string_view path);
    std::size_t live_bytes() const { return bytes.size() + offsets.size() * sizeof(Range<char>); }
};

template<class Key>
struct Dictionary : Strings {};

template<class... Keys>
struct Dictionaries : Dictionary<Keys>... {
    template<class Key> auto& get() { return static_cast<Dictionary<Key>&>(*this); }
    template<class Key> const auto& get() const { return static_cast<const Dictionary<Key>&>(*this); }
    std::size_t live_bytes() const { return (std::size_t{0} + ... + get<Keys>().live_bytes()); }
};

using IdTables = Dictionaries<RegionId, SiteId, SiteModeId, FactionId, TraitId, TagId,
    PracticeId, StructureId, InstanceId, MarketStockId, ResidencyId, BirthCreditId, SpecialtyId,
    LifeStageId, SeasonId, EventKindId, TransferId, VassalId, NodeId, SymbolId>;

}
