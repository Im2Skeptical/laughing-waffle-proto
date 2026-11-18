#include "sim/settlement/migration_reservation.hpp"

#include "core/js_number.hpp"
#include "sim/settlement/population.hpp"

#include <algorithm>

namespace waffle::sim::settlement {
namespace {

using namespace runtime;
using Bin = MigrationReservationCache::Bin;
namespace js = core::js;
constexpr auto storagePath = "Faith migration reservations";

template<class T>
void ensure_capacity(RuntimeState& state, Range<T>& range, std::size_t count)
{
    if (count > range.size())
        range = state.tables.table<T>().append(std::max(count, std::size_t{2} * range.size()), storagePath);
}

const ClassComposition& composition_class(const PopulationComposition& composition, Residency residency)
{
    return residency == Residency::villager ? composition.villager : composition.stranger;
}

bool same_cohort(const JointCohort& a, const JointCohort& b)
{
    return a.allegiance == b.allegiance && a.specialty == b.specialty && a.kind == b.kind && a.age == b.age;
}

double elder_count(std::span<const ElderCohort> elders, std::uint64_t age)
{
    const auto found = std::ranges::find(elders, age, &ElderCohort::age);
    return found == elders.end() ? 0.0 : double(found->count);
}

template<class CohortRows>
std::array<CohortView, 3> specialist_views(const RuntimeState& state, const CohortRows& rows)
{
    return {CohortView{double(rows.children), double(rows.adults), state.tables.view(rows.eldersByAge)},
            cohort_view(state, rows.specialists.scholar), cohort_view(state, rows.specialists.warrior)};
}

void collect_legacy(const RuntimeState& state, const PopulationClass& population, std::vector<Bin>& bins)
{
    const auto rows = specialist_views(state, population);
    const auto& vocab = state.populationVocabulary;
    for (std::size_t specialty = 0; specialty < rows.size(); ++specialty) {
        const auto& row = rows[specialty];
        const bool ordinary = specialty == 0;
        const auto add = [&](LifeStageId stage, std::optional<std::uint64_t> age, double count, std::size_t order) {
            bins.push_back({{FactionId{}, vocab.specialties[specialty], stage, age}, count, 0, 0, order * 3 + specialty});
        };
        add(vocab.stages[1], {}, row.children - (ordinary ? rows[1].children + rows[2].children : 0), 0);
        add(vocab.stages[0], {}, row.adults - (ordinary ? rows[1].adults + rows[2].adults : 0), 1);
        std::size_t order = 2;
        for (const auto& elder : row.elders) {
            const auto used = ordinary ? elder_count(rows[1].elders, elder.age) + elder_count(rows[2].elders, elder.age) : 0;
            if (double(elder.count) > used)
                add(vocab.stages[2], elder.age, double(elder.count) - used, order++);
        }
    }
}

void remove_reserved(const RuntimeState& state, const MoonTurn& turn, RegionId region, Residency residency,
                     bool joint, std::vector<Bin>& bins)
{
    const auto& vocab = state.populationVocabulary;
    for (const auto& intent : state.tables.view(turn.migrationIntents)) {
        if (intent.sourceId != region) continue;
        const auto& reserved = composition_class(intent.composition, residency);
        if (joint) {
            const auto range = reserved.joint.value_or(Range<JointCohort>{});
            for (auto i = range.begin; i < range.end; ++i) {
                const auto& key = state.tables.rows<JointCohort>()[i];
                const auto match = std::ranges::find_if(bins, [&](const auto& bin) { return same_cohort(bin.key, key); });
                if (match != bins.end()) match->count = std::max(0.0, match->count - double(state.jointCounts[i]));
            }
        } else {
            const auto rows = specialist_views(state, reserved);
            for (auto& bin : bins) {
                const auto measure = [&](const CohortView& row) {
                    if (bin.key.kind == vocab.stages[1]) return row.children;
                    if (bin.key.kind == vocab.stages[0]) return row.adults;
                    return elder_count(row.elders, *bin.key.age);
                };
                const auto specialty = std::ranges::find(vocab.specialties, bin.key.specialty) - vocab.specialties.begin();
                const auto count = specialty == 0 ? measure(rows[0]) - measure(rows[1]) - measure(rows[2])
                                                   : measure(rows[specialty]);
                bin.count = std::max(0.0, bin.count - count);
            }
        }
    }
}

double select_bins(std::vector<Bin>& bins, std::vector<std::size_t>& ranked, double requested)
{
    std::erase_if(bins, [](const auto& bin) { return bin.count <= 0; });
    double available = 0;
    for (const auto& bin : bins) available += bin.count;
    const auto target = std::min(available, requested);
    if (target <= 0) return 0;
    ranked.clear();
    double allocated = 0;
    for (auto& bin : bins) {
        const auto exact = target * bin.count / available;
        bin.selected = std::min(bin.count, js::floor(exact));
        bin.remainder = exact - bin.selected;
        allocated += bin.selected;
        if (bin.selected < bin.count) ranked.push_back(&bin - bins.data());
    }
    if (allocated < target) {
        std::ranges::sort(ranked, [&](std::size_t a, std::size_t b) {
            const auto& left = bins[a];
            const auto& right = bins[b];
            if (left.remainder != right.remainder) return left.remainder > right.remainder;
            if (left.order != right.order) return left.order < right.order;
            return a < b;
        });
        for (const auto i : ranked) {
            if (allocated >= target) break;
            ++bins[i].selected;
            ++allocated;
        }
    }
    std::erase_if(bins, [](const auto& bin) { return bin.selected <= 0; });
    return allocated;
}

ClassComposition write_composition(RuntimeState& state, MigrationReservationCache::Payload& payload,
                                   const std::vector<Bin>& bins, bool joint)
{
    ClassComposition result{};
    const auto& vocab = state.populationVocabulary;
    const auto elderCount = static_cast<std::size_t>(std::ranges::count_if(bins, [](const auto& bin) { return bin.key.age.has_value(); }));
    ensure_capacity(state, payload.elders, 3 * elderCount);
    if (joint) {
        ensure_capacity(state, payload.joint, bins.size());
        state.jointCounts.resize(state.tables.rows<JointCohort>().size());
        result.joint = Range<JointCohort>{payload.joint.begin, payload.joint.begin + static_cast<std::uint32_t>(bins.size())};
        auto i = result.joint->begin;
        for (const auto& bin : bins) {
            state.tables.rows<JointCohort>()[i] = bin.key;
            state.jointCounts[i++] = static_cast<std::uint64_t>(bin.selected);
        }
    }
    auto elders = state.tables.view(payload.elders);
    const auto write_counts = [&](auto& counts, std::size_t partition) {
        const auto begin = static_cast<std::uint32_t>(payload.elders.begin + partition * elderCount);
        auto ages = elders.subspan(partition * elderCount, elderCount);
        std::size_t used = 0;
        for (const auto& bin : bins) {
            if (partition && bin.key.specialty != vocab.specialties[partition]) continue;
            const auto count = static_cast<std::uint64_t>(bin.selected);
            if (bin.key.kind == vocab.stages[1]) counts.children += count;
            else if (bin.key.kind == vocab.stages[0]) counts.adults += count;
            else {
                auto written = ages.first(used);
                const auto existing = std::ranges::find(written, *bin.key.age, &ElderCohort::age);
                if (existing == written.end()) ages[used++] = {*bin.key.age, count};
                else existing->count += count;
            }
        }
        if (partition == 0) std::ranges::sort(ages.first(used), {}, &ElderCohort::age);
        counts.eldersByAge = {begin, begin + static_cast<std::uint32_t>(used)};
    };
    write_counts(result, 0);
    write_counts(result.specialists.scholar, 1);
    write_counts(result.specialists.warrior, 2);
    return result;
}

}

void prepare_migration_reservations(RuntimeState& state)
{
    auto& cache = state.migrationReservations;
    cache.residencies = {state.intern<ResidencyId>("villager", storagePath), state.intern<ResidencyId>("stranger", storagePath)};
    const auto sites = state.tables.view(state.hot.world.sites);
    const auto imported = state.hot.civilization.currentMoonTurn
        ? state.hot.civilization.currentMoonTurn->migrationIntents.size() : 0;
    for (auto& bank : cache.banks) {
        ensure_capacity(state, bank.intents, sites.size() * 2 + imported);
        bank.payloads.resize(sites.size() * 2);
    }
    for (const auto& site : sites) {
        for (const auto residency : {Residency::villager, Residency::stranger}) {
            const auto& population = population_class(site.detailedState.populationByClass, residency);
            const auto joints = population.joint.value_or(Range<JointCohort>{}).size();
            const auto elders = population.eldersByAge.size()
                + population.specialists.scholar.eldersByAge.size() + population.specialists.warrior.eldersByAge.size();
            const auto bins = std::max(joints, elders + 6);
            constexpr std::size_t headroom = 8;
            cache.bins.reserve(std::max(cache.bins.capacity(), bins + headroom));
            cache.ranked.reserve(std::max(cache.ranked.capacity(), bins + headroom));
            for (auto& bank : cache.banks) {
                auto& payload = bank.payloads[site.id.value * 2 + static_cast<std::size_t>(residency)];
                if (population.joint) ensure_capacity(state, payload.joint, joints + headroom);
                ensure_capacity(state, payload.elders, 3 * (std::max(joints, elders) + headroom));
            }
        }
    }
    state.jointCounts.resize(state.tables.rows<JointCohort>().size());
}

double reserve_migration(RuntimeState& state, MoonTurn& turn, SiteId siteId, Residency residency,
                         SymbolId reason, double requested)
{
    if (!(requested > 0)) return 0;
    auto& cache = state.migrationReservations;
    auto& bins = cache.bins;
    bins.clear();
    const auto& site = site_at(state, siteId);
    const auto& population = population_class(site.detailedState.populationByClass, residency);
    const bool joint = population.joint.has_value();
    if (joint) {
        const auto view = population_bins(state, site.detailedState.populationByClass, residency);
        for (std::size_t i = 0; i < view.size(); ++i) bins.push_back({view.keys[i], double(view.counts[i]), 0, 0, i});
    } else {
        collect_legacy(state, population, bins);
    }
    remove_reserved(state, turn, site.regionId, residency, joint, bins);
    const auto selected = select_bins(bins, cache.ranked, requested);
    if (selected <= 0) return 0;

    auto& bank = cache.banks[state.settlementPrelude.nextMoonBuffer ^ 1];
    const auto classIndex = static_cast<std::size_t>(residency);
    auto& payload = bank.payloads[siteId.value * 2 + classIndex];
    PopulationComposition composition{};
    auto& source = residency == Residency::villager ? composition.villager : composition.stranger;
    auto& other = residency == Residency::villager ? composition.stranger : composition.villager;
    source = write_composition(state, payload, bins, joint);
    if (joint) other.joint.emplace();
    const auto prior = turn.migrationIntents;
    ensure_capacity(state, bank.intents, prior.size() + 1);
    auto intents = state.tables.view(bank.intents);
    if (prior.size() && prior.begin != bank.intents.begin)
        std::ranges::copy(state.tables.view(prior), intents.begin());
    intents[prior.size()] = {reason, site.regionId, cache.residencies[classIndex], composition, selected};
    turn.migrationIntents = {bank.intents.begin, bank.intents.begin + prior.size() + 1};
    return selected;
}

}
