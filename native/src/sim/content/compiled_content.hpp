#pragma once

#include "sim/content/content_types.generated.hpp"

#include <memory>

namespace waffle::sim {

inline constexpr std::uint32_t content_compiler_version = 1;

struct ContentCacheKey {
    std::string configHash;
    std::uint32_t compilerVersion{content_compiler_version};
    bool operator==(const ContentCacheKey&) const = default;
};

struct ContentDiagnostic {
    std::string path;
    std::string otherPath;
    std::string message;
};

struct CompiledContent {
    ContentCacheKey key;
    content::GameConfig values;
    content::ContentTables tables;
    runtime::IdTables ids;
    std::vector<ContentDiagnostic> diagnostics;

    auto practices() const { return tables.view(values.gamepieces.practices); }
    auto structures() const { return tables.view(values.gamepieces.structures); }
    const content::SettingValues& settings() const { return values.settings.values; }
};

// Populate config ID domains before interning live rows. Pre-existing IDs in
// those domains must match the captured prefix. Publish only on success.
// Supply the original gameConfig JSON at admission to check browser key
// equivalence before the mirror's schema-order normalization.
std::shared_ptr<const CompiledContent> compile_content(
    const browser::GameConfig& config, runtime::IdTables& ids,
    const core::json::Value* captured = nullptr);

// Executable content only. Used by round-trip checks and inspection tooling.
core::json::Value decompile_content(const CompiledContent& content);
core::json::Value executable_content_fields(const core::json::Value& captured);

namespace content {

inline EffectOp opcode(const PracticeEffect& effect) { return static_cast<EffectOp>(effect.index()); }
inline TriggerKind trigger_kind(const TriggerClause& clause) { return static_cast<TriggerKind>(clause.index()); }
inline MultiplierPool multiplier_pool(const PracticeStockMultiplier& mult) { return static_cast<MultiplierPool>(mult.index()); }

template<class E>
constexpr unsigned mask_bit(E value) { return 1u << static_cast<unsigned>(value); }

}
}
