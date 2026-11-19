#pragma once

#include "core/json.hpp"
#include "sim/world/generate.hpp"
#include "tools/json_file.hpp"

namespace waffle::tools {

inline core::json::Value read_reference_topology(const std::filesystem::path& directory,
                                                std::string_view definitionId)
{
    using core::json::Value;
    const auto manifestPath = directory / "manifest.json";
    const auto manifest = core::json::parse(read_file(manifestPath));
    const auto* version = manifest.kind() == Value::Kind::object ? manifest.find("formatVersion") : nullptr;
    const auto* entries = version ? manifest.find("topologies") : nullptr;
    if (!version || version->kind() != Value::Kind::number || version->as_number() != 1 ||
        !entries || entries->kind() != Value::Kind::array)
        throw std::invalid_argument("invalid topology manifest " + manifestPath.string());

    const Value* match = nullptr;
    for (const auto& entry : entries->as_array()) {
        const auto* id = entry.kind() == Value::Kind::object ? entry.find("definitionId") : nullptr;
        if (!id || id->kind() != Value::Kind::string)
            throw std::invalid_argument("invalid topology identity in " + manifestPath.string());
        if (id->as_string() != definitionId) continue;
        if (match) throw std::invalid_argument("duplicate topology identity " + std::string(definitionId));
        match = &entry;
    }
    const std::string context = "world topology for " + std::string(definitionId) + ": ";
    if (!match) throw std::invalid_argument(context + "missing manifest entry in " + manifestPath.string());
    const auto* filename = match->find("file");
    if (!filename || filename->kind() != Value::Kind::string)
        throw std::invalid_argument(context + "missing topology filename");
    const std::filesystem::path relative = filename->as_string();
    if (relative.has_root_path() || relative != relative.filename() || relative.extension() != ".json")
        throw std::invalid_argument(context + "invalid topology filename");
    return core::json::parse(read_file(directory / relative));
}

inline std::optional<core::json::Value> reference_topology_override(const std::filesystem::path& directory,
                                                                  const std::filesystem::path& fallbackDirectory,
                                                                  std::string_view definitionId)
{
    if (directory.empty() && sim::generated_regional_seed(definitionId)) return {};
    return read_reference_topology(directory.empty() ? fallbackDirectory : directory, definitionId);
}

}
