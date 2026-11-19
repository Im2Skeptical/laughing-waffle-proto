#include "sim/settlement/migration_reservation.hpp"

#include "core/js_number.hpp"
#include "sim/settlement/population.hpp"

#include <algorithm>
#include <span>
#include <stdexcept>

namespace waffle::sim::settlement {
namespace {

using namespace runtime;
using Bin = MigrationReservationCache::Bin;
namespace js = core::js;
constexpr auto storagePath = "Moon migration reservations";
// Food, Housing and Faith (moon phases 1-3) can each reserve the same source
// class. Each keeps its own payload so earlier intents stay immutable.
constexpr std::size_t reservationPhases = 3;

std::size_t payload_index(SiteId site, Residency residency, std::size_t phase)
{
    return (site.value * 2 + static_cast<std::size_t>(residency)) * reservationPhases + phase;
}

std::size_t reservation_phase(const MoonTurn& turn)
{
    const auto phase = static_cast<std::size_t>(turn.phaseIndex) - 1;
    if (phase >= reservationPhases) throw std::logic_error("unexpected migration reservation phase");
    return phase;
}

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

std::span<Bin> collect_legacy(const RuntimeState& state, const PopulationClass& population, std::span<Bin> storage)
{
    const auto rows = specialist_views(state, population);
    const auto& vocab = state.populationVocabulary;
    std::size_t used = 0;
    for (std::size_t specialty = 0; specialty < rows.size(); ++specialty) {
        const auto& row = rows[specialty];
        const bool ordinary = specialty == 0;
        const auto add = [&](LifeStageId stage, std::optional<std::uint64_t> age, double count, std::size_t order) {
            storage[used++] = {{FactionId{}, vocab.specialties[specialty], stage, age}, count, 0, 0, order * 3 + specialty};
        };
        add(vocab.stages[1], {}, row.children - (ordinary ? rows[1].children + rows[2].children : 0), 0);
        add(vocab.stages[0], {}, row.adults - (ordinary ? rows[1].adults + rows[2].adults : 0), 1);
        const auto elderStart = used;
        for (const auto& elder : row.elders) {
            const auto specialists = ordinary ? elder_count(rows[1].elders, elder.age) + elder_count(rows[2].elders, elder.age) : 0;
            if (double(elder.count) > specialists)
                add(vocab.stages[2], elder.age, double(elder.count) - specialists, 2);
        }
        std::ranges::sort(storage.subspan(elderStart, used - elderStart), {}, [](const Bin& bin) { return bin.key.age; });
    }
    return storage.first(used);
}

void remove_reserved(const RuntimeState& state, const MoonTurn& turn, RegionId region, Residency residency,
                     bool joint, std::span<Bin> bins)
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

double select_bins(std::span<Bin>& bins, std::span<std::size_t> rankStorage, double requested, bool joint)
{
    const auto unavailable = std::ranges::remove_if(bins, [](const auto& bin) { return bin.count <= 0; });
    bins = bins.first(unavailable.begin() - bins.begin());
    double available = 0;
    std::array<std::size_t, 3> nextElder{2, 2, 2};
    for (auto& bin : bins) {
        available += bin.count;
        // Legacy tie ranks are based on the surviving age list after
        // subtracting the reservations, independently for each specialty.
        if (!joint && bin.key.age) {
            const auto specialty = bin.order % 3;
            bin.order = nextElder[specialty]++ * 3 + specialty;
        }
    }
    const auto target = std::min(available, requested);
    if (target <= 0) return 0;
    std::size_t candidates = 0;
    double allocated = 0;
    for (auto& bin : bins) {
        const auto exact = target * bin.count / available;
        bin.selected = std::min(bin.count, js::floor(exact));
        bin.remainder = exact - bin.selected;
        allocated += bin.selected;
        if (bin.selected < bin.count) rankStorage[candidates++] = &bin - bins.data();
    }
    if (allocated < target) {
        const auto ranked = rankStorage.first(candidates);
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
    const auto unselected = std::ranges::remove_if(bins, [](const auto& bin) { return bin.selected <= 0; });
    bins = bins.first(unselected.begin() - bins.begin());
    return allocated;
}

ClassComposition write_composition(RuntimeState& state, MigrationReservationCache::Payload& payload,
                                   std::span<const Bin> bins, bool joint)
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

std::size_t legacy_bin_capacity(const PopulationClass& population)
{
    return 6 + population.eldersByAge.size() + population.specialists.scholar.eldersByAge.size()
        + population.specialists.warrior.eldersByAge.size();
}

void prepare_scratch(MigrationReservationCache& cache, std::size_t bins)
{
    // Size these buffers so a value-copy of RuntimeState retains the
    // workspace through restore and preview forks.
    if (cache.bins.size() >= bins) return;
    const auto size = std::max(bins, cache.bins.size() * 2);
    cache.bins.resize(size);
    cache.ranked.resize(size);
}

double select_composition(RuntimeState& state, const MoonTurn& turn, const Site& site,
                          Residency residency, double requested,
                          MigrationReservationCache::Payload& payload, ClassComposition& output)
{
    if (!(requested > 0)) return 0;
    auto& cache = state.migrationReservations;
    const auto& population = population_class(site.detailedState.populationByClass, residency);
    const bool joint = population.joint.has_value();
    const auto size = joint ? population.joint->size() : legacy_bin_capacity(population);
    prepare_scratch(cache, size);
    auto bins = std::span(cache.bins).first(size);
    if (joint) {
        const auto view = population_bins(state, site.detailedState.populationByClass, residency);
        for (std::size_t i = 0; i < view.size(); ++i) bins[i] = {view.keys[i], double(view.counts[i]), 0, 0, i};
    } else {
        bins = collect_legacy(state, population, bins);
    }
    remove_reserved(state, turn, site.regionId, residency, joint, bins);
    const auto selected = select_bins(bins, cache.ranked, requested, joint);
    if (selected > 0) output = write_composition(state, payload, bins, joint);
    return selected;
}

void append_intent(RuntimeState& state, MoonTurn& turn, MigrationReservationCache::Bank& bank,
                   const MigrationIntent& intent)
{
    const auto prior = turn.migrationIntents;
    ensure_capacity(state, bank.intents, prior.size() + 1);
    auto intents = state.tables.view(bank.intents);
    if (prior.size() && prior.begin != bank.intents.begin)
        std::ranges::copy(state.tables.view(prior), intents.begin());
    intents[prior.size()] = intent;
    turn.migrationIntents = {bank.intents.begin, bank.intents.begin + prior.size() + 1};
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
        ensure_capacity(state, bank.intents, sites.size() * 2 * reservationPhases + imported);
        bank.payloads.resize(sites.size() * 2 * reservationPhases);
    }
    for (const auto& site : sites) {
        for (const auto residency : {Residency::villager, Residency::stranger}) {
            const auto& population = population_class(site.detailedState.populationByClass, residency);
            const std::size_t joints = population.joint.value_or(Range<JointCohort>{}).size();
            const auto elders = legacy_bin_capacity(population) - 6;
            const auto bins = std::max(joints, elders + 6);
            constexpr std::size_t headroom = 8;
            prepare_scratch(cache, bins + headroom);
            for (auto& bank : cache.banks) {
                for (std::size_t phase = 0; phase < reservationPhases; ++phase) {
                    auto& payload = bank.payloads[payload_index(site.id, residency, phase)];
                    if (population.joint) ensure_capacity(state, payload.joint, joints + headroom);
                    ensure_capacity(state, payload.elders, 3 * (std::max(joints, elders) + headroom));
                }
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
    const auto& site = site_at(state, siteId);
    auto& bank = cache.banks[state.settlementPrelude.nextMoonBuffer ^ 1];
    const auto classIndex = static_cast<std::size_t>(residency);
    auto& payload = bank.payloads[payload_index(siteId, residency, reservation_phase(turn))];
    PopulationComposition composition{};
    auto& source = residency == Residency::villager ? composition.villager : composition.stranger;
    auto& other = residency == Residency::villager ? composition.stranger : composition.villager;
    const auto selected = select_composition(state, turn, site, residency, requested, payload, source);
    if (selected <= 0) return 0;
    if (source.joint) other.joint.emplace();
    append_intent(state, turn, bank, {reason, site.regionId, cache.residencies[classIndex], composition, selected});
    return selected;
}

double reserved_migration_population(const RuntimeState& state, const MoonTurn& turn, RegionId region)
{
    double total = 0;
    for (const auto& intent : state.tables.view(turn.migrationIntents)) {
        if (intent.sourceId != region) continue;
        const auto& [villager, stranger] = intent.composition;
        const bool joint = villager.joint || stranger.joint;
        for (const auto* part : {&villager, &stranger}) {
            if (joint) {
                const auto range = part->joint.value_or(Range<JointCohort>{});
                for (auto i = range.begin; i < range.end; ++i)
                    total += static_cast<double>(state.jointCounts[i]);
            } else {
                total += static_cast<double>(part->children) + static_cast<double>(part->adults);
                for (const auto& age : state.tables.view(part->eldersByAge))
                    total += static_cast<double>(age.count);
            }
        }
    }
    return total;
}

double reserve_housing_migration(RuntimeState& state, MoonTurn& turn, SiteId siteId, double overflow)
{
    if (overflow < 1) return 0;
    auto& bank = state.migrationReservations.banks[state.settlementPrelude.nextMoonBuffer ^ 1];
    const auto& site = site_at(state, siteId);
    const auto phase = reservation_phase(turn);
    PopulationComposition composition{};
    const auto strangers = select_composition(state, turn, site, Residency::stranger, js::floor(overflow),
        bank.payloads[payload_index(siteId, Residency::stranger, phase)], composition.stranger);
    const auto villagers = select_composition(state, turn, site, Residency::villager, js::floor(overflow - strangers),
        bank.payloads[payload_index(siteId, Residency::villager, phase)], composition.villager);
    const auto requested = strangers + villagers;
    if (requested > 0)
        append_intent(state, turn, bank, {turn.phaseId, site.regionId, std::nullopt, composition, requested});
    return requested;
}

}
