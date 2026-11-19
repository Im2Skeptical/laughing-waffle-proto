#include "timegraph/anchor.hpp"

#include <algorithm>
#include <bit>
#include <cstring>

namespace waffle::timegraph::detail {
namespace {

using namespace sim::runtime;

template<class... T, class Visit>
void visit_columns(sim::runtime::Tables<T...>& tables, Visit visit)
{
    (visit(tables.template rows<T>()), ...);
}

template<class... T>
constexpr std::size_t column_count(const Tables<T...>&)
{
    return sizeof...(T);
}

template<class T>
bool same_range(Range<T> a, Range<T> b) { return a.begin == b.begin && a.end == b.end; }

bool equal_row(const JointCohort& a, const JointCohort& b)
{
    return a.allegiance == b.allegiance && a.specialty == b.specialty && a.kind == b.kind && a.age == b.age;
}

bool same_age_counts(const AgeCounts& a, const AgeCounts& b)
{
    return a.children == b.children && a.adults == b.adults && same_range(a.eldersByAge, b.eldersByAge);
}

bool same_composition(const ClassComposition& a, const ClassComposition& b)
{
    return a.children == b.children && a.adults == b.adults && same_range(a.eldersByAge, b.eldersByAge) &&
        same_age_counts(a.specialists.scholar, b.specialists.scholar) &&
        same_age_counts(a.specialists.warrior, b.specialists.warrior) &&
        a.joint.has_value() == b.joint.has_value() && (!a.joint || same_range(*a.joint, *b.joint));
}

bool equal_row(const MigrationIntent& a, const MigrationIntent& b)
{
    return a.reason == b.reason && a.sourceId == b.sourceId && a.sourceClassId == b.sourceClassId &&
        same_composition(a.composition.villager, b.composition.villager) &&
        same_composition(a.composition.stranger, b.composition.stranger) &&
        std::bit_cast<std::uint64_t>(a.requested) == std::bit_cast<std::uint64_t>(b.requested);
}

template<class Row>
constexpr bool shareable = std::has_unique_object_representations_v<Row> || std::is_same_v<Row, double> ||
    requires(const Row& a, const Row& b) { equal_row(a, b); };

template<class Row>
bool same_block(std::span<const Row> rows, std::span<const std::byte> previous)
{
    const auto bytes = std::as_bytes(rows);
    if (previous.size() != bytes.size()) return false;
    if constexpr (std::has_unique_object_representations_v<Row> || std::is_same_v<Row, double>) {
        return std::memcmp(bytes.data(), previous.data(), bytes.size()) == 0;
    } else if constexpr (requires(const Row& a, const Row& b) { equal_row(a, b); }) {
        if (std::memcmp(bytes.data(), previous.data(), bytes.size()) == 0) return true;
        for (std::size_t i = 0; i < rows.size(); ++i) {
            Row copy;
            std::memcpy(&copy, previous.data() + i * sizeof(Row), sizeof(Row));
            if (!equal_row(rows[i], copy)) return false;
        }
        return true;
    }
    return false;
}

// The worker is the only owner of the source. Separate its flat columns
// for the duration of capture so the value-copy constructor can preserve
// the rest of RuntimeState without allocating duplicate flat buffers.
struct DetachedColumns {
    sim::RuntimeState& source;
    HotTables tables;
    std::vector<std::uint64_t> jointCounts;

    explicit DetachedColumns(sim::RuntimeState& source) : source(source)
    {
        std::swap(source.tables, tables);
        std::swap(source.jointCounts, jointCounts);
    }

    ~DetachedColumns()
    {
        std::swap(source.tables, tables);
        std::swap(source.jointCounts, jointCounts);
    }
};

template<class... K>
std::size_t dictionary_capacity(const sim::runtime::Dictionaries<K...>& ids)
{
    const auto bytes = [](const auto& dict) {
        return dict.bytes.capacity() + dict.offsets.capacity() * sizeof(dict.offsets.front());
    };
    return (bytes(ids.template get<K>()) + ...);
}

// The anchor owns these buffers, while their immutable contents (e.g. cold
// Life Map values and history pages) share the sim's ownership.
std::size_t sidecar_bytes(const sim::RuntimeState& state)
{
    std::size_t bytes = sizeof(Anchor) + dictionary_capacity(state.addedIds);
    const auto add = [&](const auto& vector) { bytes += vector.capacity() * sizeof(vector.front()); };
    state.cold.for_each_table(add);
    state.histories.for_each_table(add);
    state.pendingPracticePayload.for_each_table(add);
    add(state.pendingPracticePayload.text.bytes);
    add(state.pendingPracticePayload.text.offsets);
    add(state.practiceStock);
    add(state.practiceCharge);
    add(state.eventPayloads);
    const auto& indexes = state.indexes;
    add(indexes.sitesByRegion);
    add(indexes.detailedSitesByRegion);
    add(indexes.detailedSites);
    add(indexes.activeSites);
    add(indexes.roadsByRegion);
    add(indexes.roadNeighbors);
    add(indexes.sites);
    add(indexes.allegianceTotals);
    add(state.foodStage.meals);
    add(state.foodStage.garrisonCosts);
    add(state.housingStage.constructionRetries);
    add(state.housingStage.constructionTraits);
    add(state.migration.storage);
    for (const auto& bank : state.migrationReservations.banks) add(bank.payloads);
    add(state.migrationReservations.bins);
    add(state.migrationReservations.ranked);
    add(state.practiceVocabulary.regionSymbols);
    add(state.practiceVocabulary.marketLabels);
    const auto& listeners = state.practiceListeners;
    add(listeners.candidates);
    add(listeners.local);
    for (const auto& remote : listeners.remoteByKind) add(remote);
    add(listeners.dynamicThreshold);
    add(listeners.fixedThresholds);
    add(listeners.eventKinds);
    add(listeners.modifierKindsBySite);
    for (const auto& list : listeners.scheduled) add(list);
    for (const auto& list : listeners.upkeep) add(list);
    add(state.practiceRecipeStorage.boostSeasons);
    add(state.practiceRecipeStorage.politicalForce);
    add(state.territory.unrest);
    add(state.territory.transfers);
    add(state.territory.marketSpare);
    add(state.territory.supportSources);
    return bytes;
}

}

Anchor::Block::Block(std::atomic_size_t& account, std::span<const std::byte> source)
    : charge(account, sizeof(Block) + source.size() + 2 * sizeof(void*)),
      bytes(source.size())
{
    std::memcpy(bytes.data(), source.data(), source.size());
}

template<class Vector>
void Anchor::store(std::atomic_size_t& account, const Vector& column, const Anchor* previous)
{
    using Row = typename Vector::value_type;
    static_assert(std::is_trivially_copyable_v<Row>);
    static_assert(sizeof(Row) <= anchorBlockBytes);
    constexpr auto blockRows = anchorBlockBytes / sizeof(Row);
    const auto old = previous ? &previous->columns_[columns_.size()] : nullptr;
    auto& entry = columns_.emplace_back(column.size());
    const auto data = std::span(column);
    if constexpr (shareable<Row>) {
        entry.blocks.reserve((data.size() + blockRows - 1) / blockRows);
        for (std::size_t offset = 0; offset < data.size(); offset += blockRows) {
            const auto rows = data.subspan(offset, std::min(blockRows, data.size() - offset));
            const auto index = entry.blocks.size();
            if (old && index < old->blocks.size() && same_block(rows, old->blocks[index]->bytes))
                entry.blocks.push_back(old->blocks[index]);
            else
                entry.blocks.push_back(std::make_shared<const Block>(account, std::as_bytes(rows)));
        }
    } else if (!data.empty()) {
        // Comparing hidden padding would make memory admission depend on
        // stack bytes. Put private rows together in one allocation.
        const auto bytes = std::as_bytes(data);
        entry.privateOffset = privateColumns_.size();
        privateColumns_.resize(entry.privateOffset + bytes.size());
        std::memcpy(privateColumns_.data() + entry.privateOffset, bytes.data(), bytes.size());
    }
}

template<class Vector>
void Anchor::load(Vector& column, const Column& source) const
{
    column.resize(source.elements);
    auto data = std::as_writable_bytes(std::span(column));
    if constexpr (shareable<typename Vector::value_type>) {
        for (const auto& block : source.blocks) {
            const auto count = block->bytes.size();
            std::memcpy(data.data(), block->bytes.data(), count);
            data = data.subspan(count);
        }
    } else if (!data.empty()) {
        std::memcpy(data.data(), privateColumns_.data() + source.privateOffset, data.size());
    }
}

Anchor::Anchor(std::atomic_size_t& account, sim::RuntimeState& state, const Anchor* previous)
{
    const DetachedColumns detached(state);
    sidecar_ = state;
    std::size_t privateBytes = 0;
    detached.tables.for_each_table([&](const auto& column) {
        using Row = typename std::remove_cvref_t<decltype(column)>::value_type;
        if constexpr (!shareable<Row>) privateBytes += column.size() * sizeof(Row);
    });
    privateColumns_.reserve(privateBytes);
    columns_.reserve(column_count(detached.tables) + 1);
    detached.tables.for_each_table([&](const auto& column) { store(account, column, previous); });
    store(account, detached.jointCounts, previous);
    std::size_t bytes = sidecar_bytes(sidecar_) + columns_.capacity() * sizeof(Column) +
        privateColumns_.capacity() + 2 * sizeof(void*);
    for (const auto& column : columns_) bytes += column.blocks.capacity() * sizeof(Blocks::value_type);
    charge_.emplace(account, bytes);
}

sim::RuntimeState Anchor::copy() const
{
    auto state = sidecar_;
    std::size_t index = 0;
    visit_columns(state.tables, [&](auto& column) { load(column, columns_[index++]); });
    load(state.jointCounts, columns_[index]);
    return state;
}

}
