#include "sim/state/runtime_state.hpp"
#include "sim/vassal/vassal.hpp"
#include "sim/content/compiled_content.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"
#include "sim/world/topology.hpp"
#include "sim/stages/faith.hpp"
#include "sim/stages/food.hpp"
#include "sim/stages/housing.hpp"
#include "sim/practice/detail.hpp"

#include "core/js_number.hpp"
#include "core/sha256.hpp"
#include "sim/browser/detail/json_path.hpp"

#include <algorithm>

namespace waffle::sim {
namespace {

using namespace runtime;
using browser::detail::index_path;
using browser::detail::property_path;

template<class T, template<class...> class Wrapper>
inline constexpr bool wrapped = false;
template<template<class...> class Wrapper, class... Ts>
inline constexpr bool wrapped<Wrapper<Ts...>, Wrapper> = true;

template<class T> struct Mapping;

template<class Key>
Key seed_id(CapturedContent& content, std::string_view value, const std::string& path)
{
    auto& dictionary = content.ids.get<Key>();
    if (const auto id = dictionary.find(value)) return Key{*id};
    const auto id = checked_index(dictionary.offsets.size(), path);
    dictionary.append(value, path);
    return Key{id};
}

template<class Key, class Rows, class Name>
void seed_rows(CapturedContent& content, const Rows& rows, const std::string& path, Name name)
{
    std::size_t ordinal = 0;
    for (const auto& row : rows) {
        const auto& id = name(row);
        auto& dictionary = content.ids.get<Key>();
        // Build in authored order; the ordinal doubles as the original row index.
        if (dictionary.find(id)) throw std::invalid_argument(index_path(path, ordinal) + ": duplicate ID " + id);
        dictionary.append(id, path);
        ++ordinal;
    }
}

template<class Key>
void seed_terms(CapturedContent& content, const core::json::Value& value, const std::string& path)
{
    using Kind = core::json::Value::Kind;
    if (value.kind() == Kind::string) seed_id<Key>(content, value.as_string(), path);
    if (value.kind() == Kind::array) {
        for (const auto& term : value.as_array()) {
            if (term.kind() == Kind::string) seed_id<Key>(content, term.as_string(), path);
        }
    }
}

// Collect the authored vocabulary only. The recipe port owns interpreting
// these values and resolving all executable operands.
void seed_recipe_vocabulary(CapturedContent& content, const core::json::Value& value, const std::string& path)
{
    using Kind = core::json::Value::Kind;
    static constexpr std::string_view traitFields[]{
        "traits", "stockTraits", "traitsAny", "stockedTraitsAny", "triggerTraitsAny",
        "consumesAny", "requiresOrConsumesAny", "requiresAny", "consumeTrait",
    };
    static constexpr std::string_view tagFields[]{"tags", "tagsAny", "providerTagsAny"};
    if (value.kind() == Kind::array) {
        std::size_t index = 0;
        for (const auto& item : value.as_array()) seed_recipe_vocabulary(content, item, index_path(path, index++));
    }
    if (value.kind() != Kind::object) return;
    for (const auto& field : value.as_object()) {
        const auto child = property_path(path, field.key);
        if (std::ranges::find(traitFields, field.key) != std::end(traitFields)) seed_terms<TraitId>(content, field.value, child);
        if (std::ranges::find(tagFields, field.key) != std::end(tagFields)) seed_terms<TagId>(content, field.value, child);
        seed_recipe_vocabulary(content, field.value, child);
    }
}

template<class UInt>
UInt read_unsigned(double number, const std::string& path)
{
    constexpr auto upper = std::is_same_v<UInt, std::uint32_t> ? 0x1p32 : 0x1p64;
    if (number >= 0 && number < upper) {
        const auto value = static_cast<UInt>(number);
        if (static_cast<double>(value) == number) return value;
    }
    throw std::invalid_argument(path + ": expected an unsigned " +
                                std::to_string(std::numeric_limits<UInt>::digits) + "-bit integer");
}

template<class T>
T& side_column(std::vector<T>& values, std::uint32_t row)
{
    if (row == no_index) throw std::logic_error("missing runtime side-column index");
    if (values.size() <= row) values.resize(static_cast<std::size_t>(row) + 1);
    return values[row];
}

struct Import {
    CapturedContent& content;
    RuntimeState& state;
    HistoryPayload* payload = nullptr;

    template<class Key>
    Key existing_id(std::string_view value, const std::string& path) const
    {
        const auto id = content.ids.get<Key>().find(value);
        if (!id) throw std::invalid_argument(path + ": unknown ID " + std::string(value));
        return Key{*id};
    }

    RegionId region(std::string_view value, const std::string& path) const { return existing_id<RegionId>(value, path); }
    SiteId site(std::string_view value, const std::string& path) const { return existing_id<SiteId>(value, path); }

    auto& practiceStock(std::uint32_t row) { return side_column(state.practiceStock, row); }
    auto& practiceCharge(std::uint32_t row) { return side_column(state.practiceCharge, row); }
    auto& jointCounts(std::uint32_t row) { return side_column(state.jointCounts, row); }
    auto& eventPayload(std::uint32_t row) { return side_column(state.eventPayloads, row); }

    PracticeBoard practices(const browser::DetailedSettlementPracticeSlots& source, const std::string& path);
    StructureBoard structures(const browser::DetailedSettlementStructureSlots& source, const std::string& path);

    template<class R, class M>
    R read(const M& source, const std::string& path, std::uint32_t row = no_index)
    {
        if constexpr (std::is_same_v<R, M>) {
            return source;
        } else if constexpr (std::is_same_v<R, HistoryTextId>) {
            return payload->intern_text(source, path);
        } else if constexpr (wrapped<R, Id>) {
            return seed_id<R>(content, source, path);
        } else if constexpr (std::is_same_v<R, std::uint32_t> || std::is_same_v<R, std::uint64_t>) {
            return read_unsigned<R>(source, path);
        } else if constexpr (wrapped<R, std::optional>) {
            if (!source) return std::nullopt;
            return read<typename R::value_type>(*source, path);
        } else if constexpr (wrapped<R, browser::OptionalNullable>) {
            if (!source.has_key()) return {};
            using Optional = std::remove_cvref_t<decltype(R{}.value())>;
            const auto value = read<Optional>(source.value(), path);
            return value ? R{*value} : R{std::nullopt};
        } else {
            return read_row(source, path, row, static_cast<R*>(nullptr));
        }
    }

    template<class R, class M>
    R read_row(const M& source, const std::string& path, std::uint32_t row, R*)
    {
        if constexpr (std::is_same_v<R, PracticeEvent>) {
            Import eventCodec{content, state, &state.pendingPracticePayload};
            return Mapping<R>::read(eventCodec, source, path, row);
        } else if constexpr (requires { Mapping<R>::read(*this, source, path, row); })
            return Mapping<R>::read(*this, source, path, row);
        else
            return Mapping<R>::read(*this, source, path);
    }

    template<class T, class M>
    Range<T> read_row(const M& source, const std::string& path, std::uint32_t, Range<T>*)
    {
        auto& table = range_table<T>();
        const auto range = table.append(source.size(), path);
        auto row = range.begin;
        for (const auto& element : source) {
            if constexpr (wrapped<T, Entry>)
                table.values[row] = read<T>(element, property_path(path, element.first), row);
            else
                table.values[row] = read<T>(element, index_path(path, row - range.begin), row);
            ++row;
        }
        return range;
    }

    template<class T>
    Table<T>& range_table()
    {
        if constexpr (HistoryPayload::contains<T>) {
            if (payload) return payload->table<T>();
        }
        if constexpr (HotTables::contains<T>) return state.tables.table<T>();
        throw std::logic_error("missing history payload");
    }

    template<class Key, class T, class M>
    Entry<Key, T> read_row(const M& source, const std::string& path, std::uint32_t, Entry<Key, T>*)
    {
        return {read<Key>(source.first, path), read<T>(source.second, path)};
    }

    template<class T, class M>
    Index<T> read_row(const M& source, const std::string& path, std::uint32_t, Index<T>*)
    {
        const auto row = state.tables.table<T>().append(1, path).begin;
        state.tables.rows<T>()[row] = read<T>(source, path, row);
        return {row};
    }

    template<class T, class Field, class M>
    ColdRef<T, Field> read_row(const M& source, const std::string& path, std::uint32_t, ColdRef<T, Field>*)
    {
        auto& rows = state.cold.rows<ColdValue<T, Field>>();
        const auto row = checked_index(rows.size(), path);
        rows.emplace_back(source);
        return {{row}};
    }

    template<class T, std::uint32_t Limit, class Field, class M>
    HistoryRef<T, Limit, Field> read_row(const M& source, const std::string& path, std::uint32_t, HistoryRef<T, Limit, Field>*)
    {
        using Storage = History<T, Limit, Field>;
        auto& rows = state.histories.rows<Storage>();
        const auto row = checked_index(rows.size(), path);
        auto build = [&](HistoryPayload& page, std::size_t index) {
            return Import{content, state, &page}.read<T>(source[index], index_path(path, index));
        };
        if constexpr (std::is_same_v<T, PracticeEventTrace> || std::is_same_v<T, StockTransfersTransfersEntry>)
            rows.push_back(Storage::load(source.size(), build, state.practiceRecipeStorage.historyArena));
        else
            rows.push_back(Storage::load(source.size(), build));
        return {{row}};
    }
};

struct Export {
    const RuntimeState& state;
    const HistoryPayload* payload = nullptr;

    const auto& practiceStock(std::uint32_t row) const { return state.practiceStock.at(row); }
    double practiceCharge(std::uint32_t row) const { return state.practiceCharge.at(row); }
    std::uint64_t jointCounts(std::uint32_t row) const { return state.jointCounts.at(row); }
    const auto& eventPayload(std::uint32_t row) const { return state.eventPayloads.at(row); }

    void migration_transfer_id(std::string& result, const MigrationMovement& movement) const
    {
        if (movement.transferId) {
            result = state.name(movement.transferId);
            return;
        }
        result = "migration:" + core::js::number_to_string(movement.transferSecond) + ':';
        if (movement.external.value_or(false)) result += "external:";
        result += state.name(movement.reason);
        result += ':' + std::to_string(movement.transferOrdinal);
    }

    void practices(browser::DetailedSettlementPracticeSlots& result, const PracticeBoard& board) const;
    void structures(browser::DetailedSettlementStructureSlots& result, const StructureBoard& board) const;

    template<class M, class R>
    void write(M& result, const R& source, std::uint32_t row = no_index) const
    {
        if constexpr (std::is_same_v<M, R>) {
            result = source;
        } else if constexpr (std::is_same_v<R, HistoryTextId>) {
            result = payload->text.at(source.value);
        } else if constexpr (wrapped<R, Id>) {
            result = state.name(source);
        } else if constexpr (std::is_same_v<R, std::uint32_t> || std::is_same_v<R, std::uint64_t>) {
            result = static_cast<double>(source);
            if (read_unsigned<R>(result, "$") != source)
                throw std::invalid_argument("runtime integer cannot be represented by a browser number");
        } else if constexpr (wrapped<R, std::optional>) {
            if (source) write(result.emplace(), *source, row);
            else result.reset();
        } else if constexpr (wrapped<R, browser::OptionalNullable>) {
            if (source.has_key()) {
                M present{std::nullopt};
                write(present.value(), source.value(), row);
                result = std::move(present);
            } else {
                result = {};
            }
        } else {
            write_row(result, source, row);
        }
    }

    template<class M, class R>
    void write_row(M& result, const R& source, std::uint32_t row) const
    {
        if constexpr (std::is_same_v<R, PracticeEvent>) {
            const Export eventCodec{state, &state.pendingPracticePayload};
            result = Mapping<R>::write(eventCodec, source, row);
        } else if constexpr (requires { Mapping<R>::write(*this, source, row); })
            result = Mapping<R>::write(*this, source, row);
        else
            result = Mapping<R>::write(*this, source);
    }

    template<class M, class T>
    void write_row(M& result, Range<T> range, std::uint32_t) const
    {
        result.reserve(range.size());
        auto row = range.begin;
        for (const auto& element : range_view(range)) write(result.emplace_back(), element, row++);
    }

    template<class T>
    std::span<const T> range_view(Range<T> range) const
    {
        if constexpr (HistoryPayload::contains<T>) {
            if (payload) return payload->view(range);
        }
        if constexpr (HotTables::contains<T>) return state.tables.view(range);
        throw std::logic_error("missing history payload");
    }

    template<class M, class Key, class T>
    void write_row(M& result, const Entry<Key, T>& source, std::uint32_t) const
    {
        write(result.first, source.key);
        write(result.second, source.value);
    }

    template<class M, class T>
    void write_row(M& result, Index<T> index, std::uint32_t) const
    {
        write(result, state.tables.at(index), index.value);
    }

    template<class M, class T, class Field>
    void write_row(M& result, ColdRef<T, Field> ref, std::uint32_t) const
    {
        result = state.cold.at(ref.row).get();
    }

    template<class M, class T, std::uint32_t Limit, class Field>
    void write_row(M& result, HistoryRef<T, Limit, Field> ref, std::uint32_t) const
    {
        const auto& history = state.histories.at(ref.row);
        result.reserve(history.size());
        history.for_each([&](const T& element, const HistoryPayload& page) {
            Export{state, &page}.write(result.emplace_back(), element);
        });
    }
};

#include "sim/state/mapping.generated.inc"

PracticeBoard Import::practices(const browser::DetailedSettlementPracticeSlots& source, const std::string& path)
{
    PracticeBoard board;
    auto& table = state.tables.table<PracticeSlot>();
    board.rows.begin = checked_index(table.values.size(), path);
    for (std::uint32_t slot = 0; slot < source.size(); ++slot) {
        if (!source[slot]) continue;
        const auto child = index_path(path, slot);
        const auto row = table.append(1, child).begin;
        board.slots[slot] = {row};
        auto value = read<PracticeSlot>(*source[slot], child, row);
        value.slot = slot;
        table.values[row] = value;
    }
    board.rows.end = checked_index(table.values.size(), path);
    return board;
}

StructureBoard Import::structures(const browser::DetailedSettlementStructureSlots& source, const std::string& path)
{
    StructureBoard board;
    auto& origins = state.tables.table<StructureCell>();
    board.origins.begin = checked_index(origins.values.size(), path);
    board.footprint = state.tables.table<Index<StructureCell>>().append(source.size(), path);
    auto footprint = state.tables.view(board.footprint);
    for (std::size_t slot = 0; slot < source.size(); ++slot) {
        if (!source[slot]) continue;
        const auto child = index_path(path, slot);
        const auto value = read<StructureCell>(*source[slot], child);
        if (value.origin != slot) throw std::invalid_argument(child + ".origin: does not match the origin slot");
        if (!value.width || value.width > source.size() - slot)
            throw std::invalid_argument(child + ".width: extends beyond the structure strip or is zero");
        const auto row = origins.append(1, child).begin;
        origins.values[row] = value;
        for (auto& cell : footprint.subspan(slot, value.width)) {
            if (cell) throw std::invalid_argument(child + ".origin: overlaps another structure");
            cell = {row};
        }
    }
    board.origins.end = checked_index(origins.values.size(), path);
    return board;
}

void Export::practices(browser::DetailedSettlementPracticeSlots& result, const PracticeBoard& board) const
{
    auto row = board.rows.begin;
    for (const auto& practice : state.tables.view(board.rows)) {
        write(result.at(practice.slot).emplace(), practice, row++);
    }
}

void Export::structures(browser::DetailedSettlementStructureSlots& result, const StructureBoard& board) const
{
    result.resize(board.footprint.size());
    for (const auto& origin : state.tables.view(board.origins)) write(result.at(origin.origin).emplace(), origin);
}

RuntimeState import_live_state(const browser::GameState& state, std::shared_ptr<CapturedContent> content)
{
    content->config = state.gameConfig;
    for (const auto& [id, def] : state.gameConfig.gamepieces.structures)
        content->migration.structureHousing.push_back(def.housing.value_or(0));
    for (const auto& [id, def] : state.gameConfig.gamepieces.practices)
        content->migration.ediblePractices.push_back(std::ranges::find(def.stockTraits, "Edible") != def.stockTraits.end());
    seed_rows<RegionId>(*content, state.world.regions, "$.world.regions",
                         [](const auto& row) -> const auto& { return row.id; });
    seed_rows<SiteId>(*content, state.world.sites, "$.world.sites",
                       [](const auto& row) -> const auto& { return row.id; });

    RuntimeState result;
    // A forecast and its anchors can recycle Practice journal pages from
    // the same pool. A larger first slab covers bursts across the board.
    result.practiceRecipeStorage.historyArena = std::make_shared<HistoryArena>(std::max<std::size_t>(8, 2 * state.world.sites.size()));
    Import codec{*content, result};
    result.hot = codec.read<HotState>(state, "$");
    result.content = std::move(content);
    settlement::prepare_population(result);
    rebuild_runtime_indexes(result);
    vassal::reindex(result);
    settlement::prepare_prelude(result);
    settlement::prepare_birth(result);
    settlement::prepare_migration(result);
    if (result.hot.variantFlags.settlementPrototypeEnabled)
        result.deathReports = result.tables.table<MoonRegionResultDeath>().append(
            3 * result.hot.world.sites.size(), "Death reports");
    stages::prepare_faith(result);
    stages::prepare_food(result);
    stages::prepare_housing(result);
    return result;
}

}

RuntimeState import_runtime(const browser::GameState& state)
{
    auto content = std::make_shared<CapturedContent>();
    const auto configJson = browser::export_game_config(state.gameConfig);
    // Record fields have schema order, while dictionary order contributes to
    // definition ordinals and the captured content's identity.
    content->configHash = core::sha256_text(core::json::stringify(configJson));
    // The compiler interns Practice and Structure ordinals in dictionary order.
    auto compiled = compile_content(state.gameConfig, content->ids);
    auto result = import_live_state(state, std::move(content));
    result.compiledContent = std::move(compiled);
    // Adapter-only imports have no topology; recipes then see no neighbors.
    practice::detail::admit(result);
    territory::prepare(result);
    return result;
}

RuntimeState admit_runtime(const browser::GameState& state, const core::json::Value* topology,
                           const core::json::Value* capturedConfig)
{
    if (!topology) throw std::invalid_argument("world topology for " + state.world.definitionId + ": missing topology");
    auto content = std::make_shared<CapturedContent>();
    auto compiled = compile_content(state.gameConfig, content->ids, capturedConfig);
    if (!compiled->diagnostics.empty()) {
        const auto& diagnostic = compiled->diagnostics.front();
        throw std::invalid_argument(diagnostic.path + " and " + diagnostic.otherPath + ": " + diagnostic.message);
    }
    content->configHash = compiled->key.configHash;
    auto result = import_live_state(state, std::move(content));
    result.topology = load_world_topology(result, *topology);
    result.compiledContent = std::move(compiled);
    practice::detail::admit(result);
    territory::prepare(result);
    return result;
}

browser::GameState export_runtime(const RuntimeState& state)
{
    if (!state.content) throw std::invalid_argument("$.gameConfig: runtime has no captured content");
    return Mapping<HotState>::write(Export{state}, state.hot);
}

}
