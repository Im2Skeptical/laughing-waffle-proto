#include "sim/content/compiled_content.hpp"

#include "core/sha256.hpp"
#include "sim/browser/detail/codec.hpp"

#include <algorithm>
#include <cmath>
#include <type_traits>

namespace waffle::sim {
namespace {

using namespace content;
using namespace browser::detail;
namespace json = core::json;

constexpr std::string_view root = "$.gameConfig";
constexpr std::string_view normal_node_families[]{
    "patronage", "development", "crossroads", "practiceReform", "publicWorks", "crisis", "relic",
    "specialRelic", "training", "discovery", "campaign", "challenge", "neutralMarket", "classMarket",
    "foodShop", "housingShop",
};

bool normal_node_family(std::string_view id)
{
    return std::ranges::find(normal_node_families, id) != std::end(normal_node_families);
}

enum class NumberRule { finite, integer, version };
struct Unsupported { std::string_view reason; };
template<class T> struct Record;
template<class T> struct Union;
template<class T> inline constexpr std::string_view literal{};
template<class T> inline constexpr auto names = std::array<const char*, 0>{};

#include "sim/content/content_layout.generated.hpp"

#define NAMES(Type, ...) template<> inline constexpr auto names<Type> = std::array{__VA_ARGS__}
NAMES(Mode, "scheduled", "charge");
NAMES(Pool, "common", "scholar", "warrior");
NAMES(Provenance, "warrior", "scholar", "neutral", "dictator");
NAMES(Quality, "bronze", "silver", "gold", "diamond");
NAMES(Activation, "season", "birth", "food", "housing", "faith", "migration", "death", "charge", "passive", "crisis");
NAMES(Season, "spring", "summer", "autumn", "winter");
NAMES(Stage, "preRouting", "postRouting", "afterMeals");
NAMES(Category, "influence", "resource");
NAMES(Condition, "diverseStock", "ruins", "deaths", "chaos", "externalConnection");
NAMES(PopulationCondition, "housed", "relief");
NAMES(ExternalAction, "trade", "raid", "hunt");
NAMES(ResponseAction, "rescue");
NAMES(HistoryScale, "losses", "deaths", "deathsSinceSpring");
NAMES(HistorySource, "age", "records", "losses", "retired", "commissions", "knowledgeStructures", "chaos", "victories", "conquests");
NAMES(SupportBank, "formation", "siege", "mobility", "coordination", "greatHost");
NAMES(Reach, "local", "connectedAdjacent");
NAMES(Duration, "moon", "year");
NAMES(Biome, "plains", "mountains", "forest", "water");
NAMES(TriggerScope, "local", "adjacent", "connected", "civilization");
NAMES(MartialAction, "campaign", "defense", "hunt", "conquest");
NAMES(Keyword, "synthesis", "monsterTrophies", "economicRegions");
NAMES(KeywordMode, "disciplines", "lenses", "teachings");
NAMES(KeywordClass, "scholar", "warrior", "priest", "merchant");
NAMES(Rarity, "common", "uncommon", "rare");
NAMES(Timing, "early", "mid", "late");
NAMES(TargetType, "pool", "node");
NAMES(LifeMapStage, "any", "firstLife", "successor");
NAMES(LifeMapScope, "common", "specialist", "scholar", "warrior", "unclassed");
NAMES(GuaranteeCoverage, "map", "eachRoute");
NAMES(UpkeepActivation, "season", "birth", "food", "housing", "faith", "migration", "death", "charge",
    "passive", "crisis", "spring", "summer", "autumn", "winter");
NAMES(ModifierKind, "occupation", "outputMultiplier", "capacity", "localDefense", "networkGarrison",
    "garrisonUpkeep", "output", "historyCandidate", "chargeGain", "chargeThresholdReduction",
    "requireSubstitution", "support", "defense", "defenseMultiplier", "retinueForce", "lossDefense",
    "currencyWildcard", "consumeReduction", "effectBonus", "flexibleProvider", "scalingCap", "preview",
    "lossResistance", "stockDefense", "networkSupport", "stockSupport", "evacuationShare");
NAMES(SpecialistClass, "scholar", "warrior");
NAMES(browser::BalancePreset, "free", "cheap", "fair", "expensive", "calculated");
#undef NAMES

template<class T> inline constexpr bool is_id = false;
template<class D> inline constexpr bool is_id<runtime::Id<D>> = true;
template<class T> inline constexpr bool is_optional = false;
template<class T> inline constexpr bool is_optional<std::optional<T>> = true;
template<class T> inline constexpr bool is_variant = false;
template<class... Ts> inline constexpr bool is_variant<std::variant<Ts...>> = true;
template<class T> inline constexpr bool is_range = false;
template<class T> inline constexpr bool is_range<runtime::Range<T>> = true;
template<class T> struct Element;
template<class T> struct Element<runtime::Range<T>> { using type = T; };
template<class T> struct Element<std::optional<T>> { using type = T; };
template<class T> inline constexpr bool is_entry = false;
template<class K, class V> inline constexpr bool is_entry<runtime::Entry<K, V>> = true;

template<class Key>
Key intern(runtime::IdTables& ids, std::string_view name, const std::string& path)
{
    auto& dictionary = ids.get<Key>();
    if (const auto id = dictionary.find(name)) return Key{*id};
    const auto next = runtime::checked_index(dictionary.offsets.size(), path);
    dictionary.append(name, path);
    return Key{next};
}

template<class Key>
Key read_id(runtime::IdTables& ids, std::string_view name, const std::string& path)
{
    if (name.empty()) fail(path, "expected a nonempty ID");
    if constexpr (std::is_same_v<Key, runtime::PracticeId> || std::is_same_v<Key, runtime::StructureId>) {
        if (const auto id = ids.get<Key>().find(name)) return Key{*id};
        fail(path, "unknown definition ID " + std::string(name));
    }
    if constexpr (std::is_same_v<Key, runtime::TraitId>) {
        static constexpr std::string_view traits[]{
            "Animal", "Arms", "Bone", "Civic", "Cloth", "Construction", "Currency", "Edible", "Fuel",
            "Glass", "Grain", "Instrument", "Knowledge", "Loot", "Medicine", "Metal", "Mineral",
            "Mobility", "Ore", "Paper", "Plant", "Power", "Preserved", "Protection", "Record",
            "Roadwork", "Salt", "Stone", "Storage", "Timber", "Tool", "Trade", "Vessel", "Water", "Wild", "Work",
        };
        if (std::ranges::find(traits, name) == std::end(traits)) fail(path, "unknown Stock trait " + std::string(name));
    }
    if constexpr (std::is_same_v<Key, runtime::SpecialtyId> || std::is_same_v<Key, runtime::ResidencyId> ||
                  std::is_same_v<Key, runtime::LifeStageId>) {
        const auto allowed = [&] {
            if constexpr (std::is_same_v<Key, runtime::SpecialtyId>)
                return name == "ordinary" || name == "scholar" || name == "warrior";
            if constexpr (std::is_same_v<Key, runtime::ResidencyId>) return name == "villager" || name == "stranger";
            return name == "adults" || name == "children" || name == "elders";
        }();
        if (!allowed) fail(path, "unknown population filter operand " + std::string(name));
    }
    return intern<Key>(ids, name, path);
}

template<class V>
std::size_t alternative(const Value& source, const std::string& path)
{
    if constexpr (requires { Union<V>::discriminator; }) {
        const auto key = Union<V>::discriminator;
        const auto* tag = source.find(key);
        if (tag && tag->kind() == Value::Kind::string) {
            const auto& tags = Union<V>::tags;
            const auto found = std::ranges::find(tags, tag->as_string());
            if (found != tags.end()) return static_cast<std::size_t>(found - tags.begin());
        }
        fail(property_path(path, key), "unknown or missing executable discriminator");
    }
    return source.kind() == Value::Kind::number ? 0 : 1;
}

template<class V, std::size_t N = 0, class F>
decltype(auto) visit_type(std::size_t selected, F&& visit)
{
    if constexpr (N + 1 < std::variant_size_v<V>) {
        if (N != selected) return visit_type<V, N + 1>(selected, std::forward<F>(visit));
    }
    return visit.template operator()<std::variant_alternative_t<N, V>, N>();
}

class Compile {
public:
    explicit Compile(CompiledContent& target) : out(target) {}

    template<class T>
    T read(const Value& source, const std::string& path,
           NumberRule rules = NumberRule::finite, double version = 0)
    {
        if constexpr (std::is_same_v<T, bool>) return read_boolean(source, path);
        else if constexpr (std::is_same_v<T, double>) {
            const auto value = rules == NumberRule::integer ? read_integer(source, path) : read_number(source, path);
            if (rules == NumberRule::version && value != version) fail(path, "unsupported schema version");
            return value;
        } else if constexpr (is_id<T>) {
            return read_id<T>(out.ids, read_string(source, path), path);
        } else if constexpr (std::is_enum_v<T>) {
            const auto value = read_string(source, path);
            if constexpr (!literal<T>.empty()) {
                if (value == literal<T>) return T{};
            } else {
                static_assert(!names<T>.empty(), "unclassified executable vocabulary");
                const auto found = std::ranges::find(names<T>, value);
                if (found != names<T>.end()) return static_cast<T>(found - names<T>.begin());
            }
            fail(path, "unsupported value " + value);
        } else if constexpr (is_variant<T>) {
            return visit_type<T>(alternative<T>(source, path), [&]<class A, std::size_t index> {
                if constexpr (std::is_same_v<T, LegacyDepth> && index == 0)
                    return T(std::in_place_index<index>, read_integer(source, path));
                else
                    return T(std::in_place_index<index>, read<A>(source, path));
            });
        } else if constexpr (is_range<T>) {
            return read_range<typename Element<T>::type>(source, path);
        } else {
            T row{};
            Record<T>::visit([&](std::string_view key, auto member, NumberRule number = NumberRule::finite, double expected = 0) {
                const auto* field = source.find(key);
                using M = decltype(member);
                if constexpr (std::is_same_v<M, Unsupported>) {
                    if (field) fail(property_path(path, key), std::string(member.reason));
                } else {
                    using Field = std::remove_cvref_t<decltype(row.*member)>;
                    if constexpr (is_optional<Field>) {
                        if (field) row.*member = read<typename Element<Field>::type>(*field, property_path(path, key), number, expected);
                    } else {
                        const auto next = property_path(path, key);
                        row.*member = read<Field>(required_field(field, next), next, number, expected);
                    }
                }
            });
            finish(row, path);
            return row;
        }
    }

private:
    template<class T>
    runtime::Range<T> read_range(const Value& source, const std::string& path)
    {
        if constexpr (is_entry<T>) {
            const auto& object = read_object(source, path, "definition dictionary");
            const auto range = out.tables.table<T>().append(object.size(), path);
            for (std::size_t i = 0; i < object.size(); ++i) {
                const auto& entry = object[i];
                const auto child = property_path(path, entry.key);
                T row{read_id<decltype(T::key)>(out.ids, entry.key, child), read<decltype(T::value)>(entry.value, child)};
                if constexpr (requires { row.value.id; }) {
                    if (row.key != row.value.id) fail(property_path(child, "id"), "definition ID differs from dictionary key");
                }
                out.tables.rows<T>()[range.begin + i] = std::move(row);
            }
            return range;
        } else {
            const auto& array = read_array(source, path);
            const auto range = out.tables.table<T>().append(array.size(), path);
            for (std::size_t i = 0; i < array.size(); ++i) {
                auto row = read<T>(array[i], index_path(path, i));
                out.tables.rows<T>()[range.begin + i] = std::move(row);
            }
            return range;
        }
    }

    static void positive(double value, const std::string& path)
    {
        if (value <= 0) fail(path, "expected a positive value");
    }

    static void nonnegative(double value, const std::string& path)
    {
        if (value < 0) fail(path, "expected a nonnegative value");
    }

    std::uint8_t season_mask(const std::optional<runtime::Range<Season>>& seasons)
    {
        if (!seasons) return 0b1111;
        unsigned mask = 0;
        for (const auto season : out.tables.view(*seasons)) mask |= mask_bit(season);
        return static_cast<std::uint8_t>(mask);
    }

    void integer_stock(runtime::Range<StockInput> range, const std::string& path, double minimum)
    {
        std::size_t i = 0;
        for (const auto& cost : out.tables.view(range)) {
            if (cost.amount < minimum || std::trunc(cost.amount) != cost.amount)
                fail(index_path(path, i) + ".amount", "expected a whole Stock input amount");
            ++i;
        }
    }

    template<class R>
    void finish(R& row, const std::string& path)
    {
        if constexpr (requires { row.op; }) {
            nonnegative(row.amount, path + ".amount");
            if constexpr (std::is_same_v<R, PracticeEffectbankShopQuality>) {
                if (row.classId != SpecialistClass::scholar) fail(path + ".classId", "Shop Quality requires Scholar");
            }
        }
        if constexpr (std::is_same_v<R, StockInput> || std::is_same_v<R, ConversionSupportConsumeEntry> ||
                      std::is_same_v<R, ConversionSupportRequireEntry>) {
            if (!row.traits.size()) fail(path + ".traits", "expected at least one Stock trait");
            nonnegative(row.amount, path + ".amount");
        }
        if constexpr (std::is_same_v<R, PracticeDefinition>) finish_practice(row, path);
        if constexpr (std::is_same_v<R, StructureDefinition>) {
            positive(row.footprint, path + ".footprint");
        }
        if constexpr (std::is_same_v<R, StructureDefinitionConstruction>) {
            if (row.activation.type != Activation::housing) fail(path + ".activation.type", "construction uses housing");
            positive(row.cycles, path + ".cycles");
            if (!row.consume.size()) fail(path + ".consume", "expected construction inputs");
            integer_stock(row.consume, path + ".consume", 1);
        }
        if constexpr (std::is_same_v<R, PracticeDefinitionCharge>) {
            positive(row.gain, path + ".gain");
            positive(row.threshold, path + ".threshold");
        }
        if constexpr (std::is_same_v<R, ChargeTrigger>) {
            if (!row.any.size()) fail(path + ".any", "expected at least one trigger alternative");
            for (const auto& clause : out.tables.view(row.any)) {
                if (row.anotherPractice.value_or(false) && trigger_kind(clause) == TriggerKind::monsterSpawn)
                    fail(path + ".anotherPractice", "Monster Spawn has no source Practice");
            }
        }
        if constexpr (std::is_same_v<R, TriggerClausemonsterSpawn>) {
            if (row.scope != TriggerScope::civilization) fail(path + ".scope", "Monster Spawn requires civilization scope");
        }
        if constexpr (std::is_same_v<R, TriggerClausemartialActionResolved>) {
            if (row.minimumSources) positive(*row.minimumSources, path + ".minimumSources");
        }
        if constexpr (std::is_same_v<R, LifeMapDesign>) validate_design(row, path);
        if constexpr (std::is_same_v<R, LifeMapGeneratorConfig>) {
            std::size_t i = 0;
            for (const auto family : out.tables.view(row.nonRepeatFamilyIds)) {
                if (!normal_node_family(symbol(family)))
                    fail(index_path(path + ".nonRepeatFamilyIds", i), "unknown Life Map node family");
                ++i;
            }
        }
        if constexpr (requires { row.perRegion; }) {
            row.seasonMask = season_mask(row.seasonKeys);
            nonnegative(row.amount, path + ".amount");
            if (row.perRegion && (!*row.perRegion || !row.biome)) fail(path + ".perRegion", "requires a biome and true");
        }
    }

    std::string_view symbol(runtime::SymbolId id) const
    {
        return out.ids.get<runtime::SymbolId>().at(id.value);
    }

    void validate_design(const LifeMapDesign& design, const std::string& path)
    {
        const auto pools = out.tables.view(design.pools);
        const auto known_pool = [&](runtime::SymbolId id) {
            return std::ranges::any_of(pools, [id](const auto& candidate) { return candidate.id == id; });
        };
        const auto validate_targets = [&](const auto rows, std::string_view field) {
            std::size_t i = 0;
            for (const auto& row : rows) {
                const auto target = symbol(row.targetId);
                const auto known = row.targetType == TargetType::pool ? known_pool(row.targetId) :
                    target == "stockShop" || normal_node_family(target);
                if (!known) fail(index_path(property_path(path, field), i) + ".targetId", "unknown Life Map target");
                ++i;
            }
        };
        Record<LifeMapDesignNodes>::visit([&](std::string_view key, auto member) {
            if (!known_pool((design.nodes.*member).poolId))
                fail(property_path(path + ".nodes", key) + ".poolId", "unknown Life Map pool");
        });
        validate_targets(out.tables.view(design.columns), "columns");
        validate_targets(out.tables.view(design.guarantees), "guarantees");
    }

    void finish_practice(PracticeDefinition& row, const std::string& path)
    {
        if (row.mode != row.lane) fail(path + ".lane", "must equal the Practice mode");
        const auto charge = row.mode == Mode::charge;
        if (charge != (row.activation.type == Activation::charge)) fail(path + ".activation.type", "does not match Practice mode");
        if (charge != row.charge.has_value()) fail(path + ".charge", "Charge configuration must match Practice mode");
        if (charge && (row.consume.size() || row.require_.size())) fail(path, "Charge cannot consume or require Stock");
        integer_stock(row.consume, path + ".consume", 0);
        integer_stock(row.require_, path + ".require", 0);
        nonnegative(row.workerCapacity, path + ".workerCapacity");
        nonnegative(row.stockCapacity, path + ".stockCapacity");
        row.activationMask = static_cast<std::uint16_t>(mask_bit(row.activation.type));
        if (row.activation.also) {
            for (const auto activation : out.tables.view(*row.activation.also)) {
                if (activation == Activation::charge) fail(path + ".activation.also", "Charge is event-driven");
                row.activationMask |= static_cast<std::uint16_t>(mask_bit(activation));
            }
        }
        row.stageMask = static_cast<std::uint8_t>(1u | (row.activation.stage ? mask_bit(*row.activation.stage) << 1 : 0));
        row.seasonMask = season_mask(row.activation.seasonKeys);
        if (row.activation.seasonKeys && !row.seasonMask) fail(path + ".activation.seasonKeys", "expected a nonempty season mask");
        if (row.keywordOutputScale && row.keywordCapacityScale) fail(path, "expected only one keyword multiplier pool");
        if (row.keywordOutputScale) validate_keyword_multiplier(*row.keywordOutputScale, path + ".keywordOutputScale");
        if (row.keywordCapacityScale) validate_keyword_multiplier(*row.keywordCapacityScale, path + ".keywordCapacityScale");

        // Amounts are evaluated across the entire declaration first. Conversion
        // then commits with the recipe. Remaining commands dispatch in order.
        auto& grouped = out.tables.rows<std::uint32_t>();
        row.recipeEffects.begin = runtime::checked_index(grouped.size(), path);
        bool generatesStock = false;
        const auto effects = out.tables.view(row.effects);
        for (std::uint32_t i = 0; i < effects.size(); ++i) {
            const auto op = opcode(effects[i]);
            if (op == EffectOp::convertPopulation) grouped.push_back(i);
            if (op == EffectOp::generateStock) generatesStock = true;
        }
        row.standaloneStockOutput = row.mode == Mode::scheduled && generatesStock && effects.size() == 1 &&
            !row.consume.size() && !row.require_.size() && !row.populationConsume && !row.populationRequire &&
            !row.populationCondition && !row.requireBaseHeadroom.value_or(false) && !row.externalAction;
        row.recipeEffects.end = runtime::checked_index(grouped.size(), path);
        if (!generatesStock && (row.stockMultipliers || row.keywordOutputScale || row.keywordCapacityScale))
            fail(path + ".effects", "Stock multiplier requires generateStock");
    }

    static void validate_keyword_multiplier(const KeywordScale& scale, const std::string& path)
    {
        if (scale.per <= 0 || std::trunc(scale.per) != scale.per)
            fail(path + ".per", "expected a positive whole keyword count");
        nonnegative(scale.amount, path + ".amount");
        if (scale.cap && (*scale.cap < 0 || std::trunc(*scale.cap) != *scale.cap))
            fail(path + ".cap", "expected a nonnegative whole keyword cap");
    }

    CompiledContent& out;
};

template<class Field> struct MemberType;
template<class T, class R> struct MemberType<T R::*> { using type = T; };

template<class T>
Value write(const CompiledContent& content, const T& row)
{
    if constexpr (std::is_same_v<T, bool> || std::is_same_v<T, double>) return Value(row);
    else if constexpr (is_id<T>) return Value(std::string(content.ids.get<T>().at(row.value)));
    else if constexpr (std::is_enum_v<T>) {
        if constexpr (!literal<T>.empty()) return Value(std::string(literal<T>));
        else return Value(names<T>.at(static_cast<std::size_t>(row)));
    } else if constexpr (is_variant<T>) {
        return std::visit([&](const auto& variant) { return write(content, variant); }, row);
    } else if constexpr (is_range<T>) {
        using E = typename Element<T>::type;
        const auto span = content.tables.view(row);
        if constexpr (is_entry<E>) {
            Value::Object output;
            output.reserve(span.size());
            for (const auto& entry : span) output.push_back({write(content, entry.key).as_string(), write(content, entry.value)});
            return Value(std::move(output));
        } else {
            Value::Array output;
            output.reserve(span.size());
            for (const auto& element : span) output.push_back(write(content, element));
            return Value(std::move(output));
        }
    } else {
        Value::Object output;
        Record<T>::visit([&](const char* key, auto member, auto...) {
            if constexpr (!std::is_same_v<decltype(member), Unsupported>) {
                const auto& field = row.*member;
                if constexpr (is_optional<std::remove_cvref_t<decltype(field)>>) {
                    if (field) output.push_back({key, write(content, *field)});
                } else output.push_back({key, write(content, field)});
            }
        });
        return Value(std::move(output));
    }
}

// Projection reads the original JSON, with record normalization and without
// touching compiled rows. Dictionary and array order remain observable.
template<class T>
Value project(const Value& raw)
{
    if constexpr (is_optional<T>) return project<typename Element<T>::type>(raw);
    else if constexpr (is_variant<T>) {
        return visit_type<T>(alternative<T>(raw, std::string(root)), [&]<class A, std::size_t> {
            return project<A>(raw);
        });
    } else if constexpr (is_range<T>) {
        using E = typename Element<T>::type;
        if constexpr (is_entry<E>) {
            Value::Object out;
            for (const auto& field : raw.as_object()) out.push_back({field.key, project<decltype(E::value)>(field.value)});
            return Value(std::move(out));
        } else {
            Value::Array out;
            for (const auto& child : raw.as_array()) out.push_back(project<E>(child));
            return Value(std::move(out));
        }
    } else if constexpr (requires { sizeof(Record<T>); }) {
        Value::Object out;
        Record<T>::visit([&](const char* key, auto member, auto...) {
            if constexpr (!std::is_same_v<decltype(member), Unsupported>) {
                if (const auto* field = raw.find(key)) out.push_back({key, project<typename MemberType<decltype(member)>::type>(*field)});
            }
        });
        return Value(std::move(out));
    } else return raw;
}

template<class Id, class Registry>
void seed_definitions(runtime::IdTables& ids, const Registry& defs, const std::string& path)
{
    for (std::size_t i = 0; i < defs.size(); ++i) {
        const auto& [name, ignored] = defs[i];
        const auto child = property_path(path, name);
        if (name.empty()) fail(child, "expected a nonempty definition ID");
        if (intern<Id>(ids, name, child).value != i) fail(child, "duplicate or out-of-order definition ID");
    }
}

template<class Key>
void publish_ids(runtime::IdTables& destination, const runtime::IdTables& captured)
{
    auto& prior = destination.get<Key>();
    const auto& compiled = captured.get<Key>();
    for (std::uint32_t i = 0; i < compiled.offsets.size(); ++i) {
        if (i >= prior.offsets.size()) prior.append(compiled.at(i), root);
        else if (prior.at(i) != compiled.at(i)) fail(std::string(root), "run ID vocabulary differs from captured order");
    }
}

void modifier_identity(CompiledContent& content, const Value* captured)
{
    auto rows = content.structures();
    for (const auto& entry : rows) {
        if (!entry.value.modifiers) continue;
        for (auto& modifier : content.tables.view(*entry.value.modifiers)) {
            if (!modifier.query) continue;
            modifier.queryIdentity = intern<runtime::SymbolId>(content.ids,
                json::canonical_json(write(content, *modifier.query)), "$.gameConfig.gamepieces.structures");
        }
    }
    if (!captured) return;
    struct Key {
        std::string kind, path, browser, native;
    };
    std::vector<Key> prior;
    const auto* pieces = captured->find("gamepieces");
    if (!pieces) fail("$.gameConfig.gamepieces", "original capture missing gamepieces");
    const auto& defs = required_field(pieces->find("structures"), "$.gameConfig.gamepieces.structures");
    for (const auto& def : defs.as_object()) {
        const auto* modifiers = def.value.find("modifiers");
        if (!modifiers) continue;
        const auto path = property_path("$.gameConfig.gamepieces.structures", def.key) + ".modifiers";
        std::size_t index = 0;
        for (const auto& mod : modifiers->as_array()) {
            const auto* query = mod.find("query");
            const auto child = index_path(path, index++) + ".query";
            if (!query) continue;
            Key current{mod.find("kind")->as_string(), child, json::stringify(*query), json::canonical_json(*query)};
            const auto* unique = query->find("unique");
            if (unique && unique->as_bool()) {
                for (const auto& previous : prior) {
                    if (previous.kind == current.kind && (previous.browser == current.browser) != (previous.native == current.native))
                        content.diagnostics.push_back({child, previous.path, "modifier query identity differs between browser and native"});
                }
            }
            prior.push_back(std::move(current));
        }
    }
}

}

std::shared_ptr<const CompiledContent> compile_content(
    const browser::GameConfig& config, runtime::IdTables& ids, const Value* captured)
{
    auto result = std::make_shared<CompiledContent>();
    seed_definitions<runtime::PracticeId>(result->ids, config.gamepieces.practices, "$.gameConfig.gamepieces.practices");
    seed_definitions<runtime::StructureId>(result->ids, config.gamepieces.structures, "$.gameConfig.gamepieces.structures");
    const auto normalized = browser::export_game_config(config);
    result->key.configHash = core::sha256_text(json::stringify(normalized));
    result->values = Compile(*result).read<GameConfig>(normalized, std::string(root));
    modifier_identity(*result, captured);
    auto published = ids;
    [&]<class... Keys>(runtime::Dictionaries<Keys...>*) { (publish_ids<Keys>(published, result->ids), ...); }(&ids);
    ids = std::move(published);
    return result;
}

Value decompile_content(const CompiledContent& content) { return write(content, content.values); }
Value executable_content_fields(const Value& captured) { return project<GameConfig>(captured); }

}
