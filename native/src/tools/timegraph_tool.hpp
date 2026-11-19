#pragma once

#include "timegraph/summary.hpp"

#include <bit>
#include <iomanip>
#include <ostream>

namespace waffle::tools {

inline constexpr auto timegraphDigestHeader = "waffle-timegraph-digest-v1";

inline std::uint64_t summary_digest(const timegraph::SummaryHeader& header, std::span<const timegraph::SiteSummary> sites)
{
    std::uint64_t hash = 14695981039346656037ull;
    const auto add = [&](std::uint64_t value) {
        for (int i = 0; i < 8; ++i) {
            hash = (hash ^ (value & 255)) * 1099511628211ull;
            value >>= 8;
        }
    };
    const auto series = [&](std::initializer_list<double> values) {
        for (auto value : values) add(std::bit_cast<std::uint64_t>(value));
    };
    series({header.second, header.year, header.population, header.food, header.currency, header.housing,
            header.chaosPower, header.chaosRawPressure, header.chaosResistance, header.monsterCount, header.prestige,
            header.lossSecond, header.lossYear, header.currentVassalResolutionSecond, header.latestVassalEndSecond});
    add(header.currentVassal.value);
    add(header.terminal ? 1 + static_cast<unsigned>(*header.terminal) : 0);
    for (const auto& row : header.residency) series({row.population, row.freeWorkers});
    add(sites.size());
    for (const auto& site : sites) {
        series({site.population, site.food, site.currency, site.housing, site.loyalSharePercent, site.unrestYears,
                site.holdingForce, site.requiredForce});
        for (const auto& row : site.residency)
            series({row.workers.population, row.workers.freeWorkers, row.faith, row.happiness});
    }
    return hash;
}

inline void write_timegraph_digest(std::ostream& stream, const timegraph::SummaryHeader& header,
                                   std::span<const timegraph::SiteSummary> sites, std::optional<std::uint64_t> anchor)
{
    stream << static_cast<std::uint64_t>(header.second) << '\t' << std::hex << std::setfill('0')
           << std::setw(16) << summary_digest(header, sites);
    if (anchor) stream << '\t' << std::setw(16) << *anchor;
    stream << std::dec << '\n';
}

int timegraph_tool(int argc, char** argv);

}
