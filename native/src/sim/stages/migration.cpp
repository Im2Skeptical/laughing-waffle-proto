#include "sim/stages/entries.hpp"

#include "core/js_number.hpp"
#include "sim/settlement/migration.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"

#include <algorithm>
#include <numeric>
#include <tuple>

namespace waffle::sim::settlement {
namespace {

using namespace runtime;
using MoonRegion = Entry<RegionId, MoonRegionResult>;
namespace js = core::js;
constexpr auto path = "migration";
constexpr std::array classes{Residency::villager, Residency::stranger};

struct BinRange {
    std::size_t begin{}, size{};
};

struct Candidate {
    RegionId region;
    double occupancy, food, room;
    SiteId site;
};

struct SiteWork {
    std::vector<PopulationBin> available, residents;
    std::vector<Candidate> candidates;
    double projected{}, housing{};
    std::size_t reportCopies{};
    bool initialized{}, emits{}, changed{};
};

struct IntentWork {
    MigrationIntent intent;
    SiteId source;
    std::vector<PopulationBin> bins;
    std::size_t candidate{}, original{};
    unsigned classOrder{};
    double requested{}, remaining{}, external{}, grant{}, remainder{};
};

struct Booking {
    std::size_t intent;
    RegionId destination;
    double amount;
    BinRange bins;
    bool external;
};

struct Workspace {
    std::vector<SiteWork> sites;
    std::vector<IntentWork> intentRows;
    std::span<IntentWork> work;
    std::vector<PopulationBin> eligible, selected, removed, payload;
    std::vector<Booking> bookings;
    std::vector<std::size_t> proposals, ranked;
    std::vector<double> refunds;
    LedgerScratch ledger;
    CohortScratch cohort;
    std::array<Cohort, 3> parts;
};

Workspace& workspace()
{
    // Stage evaluation is synchronous and does not call the recipe engine.
    // Each worker can reuse its capacity across private state copies.
    thread_local Workspace scratch;
    return scratch;
}

SiteId site_for(const RuntimeState& state, RegionId region)
{
    return region.value < state.indexes.detailedSitesByRegion.size()
        ? state.indexes.detailedSitesByRegion[region.value] : SiteId{};
}

bool has_ledger(const PopulationByClass& population)
{
    return population.villager.joint || population.stranger.joint;
}

std::span<const RegionId> neighbors(const RuntimeState& state, RegionId region)
{
    // Migration uses current roads (getConnectedRegionIds in the browser).
    // Physical neighbors alone are insufficient and need no topology lookup.
    if (region.value >= state.indexes.roadsByRegion.size()) return {};
    const auto range = state.indexes.roadsByRegion[region.value];
    return std::span(state.indexes.roadNeighbors).subspan(range.begin, range.size());
}

double total(std::span<const PopulationBin> bins)
{
    double result = 0;
    for (const auto& bin : bins) result += double(bin.count);
    return result;
}

void collect_composition(const RuntimeState& state, const PopulationComposition& composition,
                         std::vector<PopulationBin>& bins, Workspace& scratch)
{
    const std::array cohorts{&composition.villager, &composition.stranger};
    const bool joint = cohorts[0]->joint || cohorts[1]->joint;
    bins.clear();
    for (std::size_t c = 0; c < cohorts.size(); ++c) {
        const auto& cohort = *cohorts[c];
        if (joint) {
            const auto span = cohort.joint.value_or(Range<JointCohort>{});
            const auto keys = state.tables.view(span);
            for (std::size_t index = 0; index < keys.size(); ++index)
                bins.push_back({classes[c], keys[index], state.jointCounts[span.begin + index]});
            continue;
        }
        const PopulationClass summary{cohort.specialists, cohort.children, cohort.adults, cohort.eldersByAge};
        split_specialist_cohorts(state, summary, scratch.parts, scratch.cohort);
        for (auto& part : scratch.parts) std::ranges::sort(part.elders, {}, &ElderCohort::age);
        const auto& lex = state.populationVocabulary;
        const auto append = [&](std::size_t specialty, auto kind, auto age, std::uint64_t count) {
            if (count) bins.push_back({classes[c], {{}, lex.specialties[specialty], kind, age}, count});
        };
        // Legacy composition selection ranks age position before specialty.
        for (std::size_t i = 0; i < scratch.parts.size(); ++i)
            append(i, lex.stages[1], std::nullopt, static_cast<std::uint64_t>(scratch.parts[i].children));
        for (std::size_t i = 0; i < scratch.parts.size(); ++i)
            append(i, lex.stages[0], std::nullopt, static_cast<std::uint64_t>(scratch.parts[i].adults));
        const auto ages = std::max({scratch.parts[0].elders.size(), scratch.parts[1].elders.size(),
                                    scratch.parts[2].elders.size()});
        for (std::size_t j = 0; j < ages; ++j) {
            for (std::size_t i = 0; i < scratch.parts.size(); ++i) {
                if (j >= scratch.parts[i].elders.size()) continue;
                const auto& elder = scratch.parts[i].elders[j];
                append(i, lex.stages[2], elder.age, elder.count);
            }
        }
    }
}

void collect_residents(const RuntimeState& state, SiteId id, std::vector<PopulationBin>& bins, Workspace& scratch)
{
    const auto& population = site_at(state, id).detailedState.populationByClass;
    if (has_ledger(population)) {
        collect_population(state, population, bins);
        return;
    }
    const auto composition = [](const PopulationClass& row) {
        return ClassComposition{row.specialists, row.children, row.adults, row.eldersByAge, row.joint};
    };
    collect_composition(state, {composition(population.villager), composition(population.stranger)}, bins, scratch);
}

double housing_capacity(const RuntimeState& state, SiteId id)
{
    if (!id) return 0;
    const auto& site = site_at(state, id);
    if (site.neutral) return state.tables.at(*site.neutral).housing;
    const auto& housing = state.content->migration.structureHousing;
    double capacity = 0;
    for (const auto& cell : state.tables.view(site.detailedState.structureSlots.origins)) {
        if (cell.construction || cell.structureId.value >= housing.size()) continue;
        const double quality = 1 + .25 * std::max(0.0, cell.qualityBonus.value_or(0));
        capacity += js::floor(housing[cell.structureId.value] * quality);
    }
    return capacity;
}

double local_food(const RuntimeState& state, const Site& site)
{
    const auto& edible = state.content->migration.ediblePractices;
    double food = 0;
    for (const auto slot : site.detailedState.practiceSlots.slots) {
        if (!slot) continue;
        const auto practice = state.tables.at(slot).practiceId.value;
        if (practice < edible.size() && edible[practice])
            food += std::max(0.0, state.practiceStock[slot.value].value_or(0));
    }
    return food;
}

void refresh_intents(RuntimeState& state, std::span<const MigrationIntent> intents, Workspace& scratch)
{
    const auto siteCount = state.hot.world.sites.size();
    if (scratch.sites.size() < siteCount) scratch.sites.resize(siteCount);
    if (scratch.intentRows.size() < intents.size()) scratch.intentRows.resize(intents.size());
    scratch.work = std::span(scratch.intentRows).first(intents.size());
    for (auto& site : std::span(scratch.sites).first(siteCount)) {
        site.initialized = site.emits = site.changed = false;
        site.reportCopies = 0;
        site.candidates.clear();
    }
    std::size_t original = 0;
    for (std::size_t i = 0; i < intents.size(); ++i) {
        auto& work = scratch.work[i];
        work.intent = intents[i];
        work.source = site_for(state, work.intent.sourceId);
        const auto selected = std::ranges::find(state.migration.classes, work.intent.sourceClassId.value_or(ResidencyId{}));
        work.classOrder = selected == state.migration.classes.end() ? 0 : 1 + unsigned(selected - state.migration.classes.begin());
        work.candidate = 0;
        work.external = 0;
        if (work.source && has_ledger(site_at(state, work.source).detailedState.populationByClass)) {
            auto& source = scratch.sites[work.source.value];
            if (!source.initialized) {
                collect_residents(state, work.source, source.available, scratch);
                source.initialized = true;
            }
            scratch.eligible.clear();
            for (const auto& bin : source.available) {
                if (bin.count && 1 + unsigned(bin.residency) == work.classOrder)
                    scratch.eligible.push_back(bin);
            }
            allocate_population(state, scratch.eligible, work.intent.requested, work.bins, scratch.ledger,
                                PopulationTie::input_order);
            remove_population(source.available, work.bins, scratch.removed);
            work.requested = total(work.bins);
            if (work.requested > 0) source.emits = true;
        } else {
            collect_composition(state, work.intent.composition, work.bins, scratch);
            work.requested = work.intent.requested;
            if (work.source && work.requested > 0) scratch.sites[work.source.value].emits = true;
        }
        work.remaining = work.requested;
        work.original = original;
        if (work.requested > 0) ++original;
    }
}

void rank_destinations(const RuntimeState& state, Workspace& scratch)
{
    for (const auto site : detailed_sites(state)) {
        auto& output = scratch.sites[site.value];
        ++scratch.sites[site_for(state, site_at(state, site).regionId).value].reportCopies;
        const auto& residents = population_totals(state, site).byResidency;
        output.projected = double(residents[0].total() + residents[1].total());
        output.housing = housing_capacity(state, site);
    }
    const auto regions = state.tables.view(state.hot.world.regions);
    const auto player = state.populationVocabulary.factions[2];
    for (const auto id : detailed_sites(state)) {
        auto& source = scratch.sites[id.value];
        if (!source.emits) continue;
        const auto sourceRatio = source.housing > 0 ? source.projected / source.housing
            : std::numeric_limits<double>::infinity();
        for (const auto region : neighbors(state, site_at(state, id).regionId)) {
            const auto destination = site_for(state, region);
            if (!destination) continue;
            const auto first = state.indexes.sitesByRegion[region.value];
            const auto controller = regions[region.value].controller;
            if ((first && site_at(state, first).neutral) || controller == state.migration.ruin ||
                (!state.hot.rulesetId && controller != player)) continue;
            const auto& target = scratch.sites[destination.value];
            if (target.emits || target.housing <= 0) continue;
            const auto room = js::floor(target.housing) - target.projected;
            const auto occupancy = target.projected / target.housing;
            if (room <= 0 || occupancy >= sourceRatio) continue;
            const auto food = local_food(state, site_at(state, destination));
            if (food > 0) source.candidates.push_back({region, occupancy, food, room, destination});
        }
        std::ranges::sort(source.candidates, [](const auto& a, const auto& b) {
            return std::tuple(a.occupancy, -a.food, -a.room, a.site) <
                   std::tuple(b.occupancy, -b.food, -b.room, b.site);
        });
    }
}

bool joint_bins(std::span<const PopulationBin> bins)
{
    return !bins.empty() && bool(bins.front().key.allegiance);
}

void rank_legacy_bins(const RuntimeState& state, Workspace& scratch, std::vector<PopulationBin>& bins)
{
    // Each specialty numbers its remaining elder ages independently. After a
    // partial booking removes an age, that specialty's later ages move up.
    const auto& vocabulary = state.populationVocabulary;
    std::array<std::array<std::size_t, 3>, 2> elderRanks{};
    scratch.ranked.clear();
    for (const auto& bin : bins) {
        const auto residency = std::size_t(bin.residency);
        const auto specialty = std::size_t(std::ranges::find(vocabulary.specialties, bin.key.specialty) -
                                           vocabulary.specialties.begin());
        const auto order = bin.key.age ? 2 + elderRanks[residency][specialty]++
            : (bin.key.kind == vocabulary.stages[1] ? 0 : 1);
        scratch.ranked.push_back((1000 * residency + order) * 3 + specialty);
    }
    // Stable insertion sort on the small, nearly ordered cohort slice.
    for (std::size_t i = 1; i < bins.size(); ++i) {
        auto j = i;
        while (j > 0 && scratch.ranked[j - 1] > scratch.ranked[j]) {
            std::swap(scratch.ranked[j - 1], scratch.ranked[j]);
            std::swap(bins[j - 1], bins[j]);
            --j;
        }
    }
}

BinRange append_bins(Workspace& scratch, std::span<const PopulationBin> bins)
{
    const auto offset = scratch.payload.size();
    scratch.payload.insert(scratch.payload.end(), bins.begin(), bins.end());
    return {offset, bins.size()};
}

void book_departure(const RuntimeState& state, Workspace& scratch, std::size_t index,
                    RegionId destination, double count, bool external)
{
    auto& work = scratch.work[index];
    allocate_population(state, work.bins, count, scratch.selected, scratch.ledger, PopulationTie::input_order);
    remove_population(work.bins, scratch.selected, scratch.removed);
    std::erase_if(work.bins, [](const auto& bin) { return !bin.count; });
    if (external) {
        count = total(scratch.selected);
        if (count <= 0) return;
        work.external = count;
    }
    scratch.bookings.push_back({index, destination, count, append_bins(scratch, scratch.selected), external});
    work.remaining = external ? 0 : work.remaining - count;
    if (work.remaining > 0 && !joint_bins(work.bins)) rank_legacy_bins(state, scratch, work.bins);

    if (!work.source) return;
    auto& source = scratch.sites[work.source.value];
    if (!source.changed) {
        collect_residents(state, work.source, source.residents, scratch);
        source.changed = true;
    }
    remove_population(source.residents, scratch.selected, scratch.removed);
}

void grant_proposals(const RuntimeState& state, Workspace& scratch, SiteId destination,
                     std::span<const std::size_t> proposals)
{
    auto& target = scratch.sites[destination.value];
    const double room = std::max(0.0, js::floor(target.housing) - target.projected);
    double requested = 0;
    for (const auto index : proposals) requested += scratch.work[index].remaining;
    const double grant = std::min(room, requested);
    double assigned = 0;
    for (const auto index : proposals) {
        auto& work = scratch.work[index];
        const double exact = grant * work.remaining / requested;
        work.grant = std::min(work.remaining, js::floor(exact));
        work.remainder = exact - js::floor(exact);
        assigned += work.grant;
    }
    auto left = grant - assigned;
    if (left > 0) {
        scratch.ranked.assign(proposals.begin(), proposals.end());
        std::ranges::sort(scratch.ranked, [&](auto i, auto j) {
            const auto& a = scratch.work[i];
            const auto& b = scratch.work[j];
            return std::tuple(-a.remainder, a.source, a.classOrder, i) <
                   std::tuple(-b.remainder, b.source, b.classOrder, j);
        });
        for (const auto index : scratch.ranked) {
            if (left <= 0) break;
            auto& work = scratch.work[index];
            if (work.grant >= work.remaining) continue;
            ++work.grant;
            --left;
        }
    }
    const auto region = site_at(state, destination).regionId;
    for (const auto index : proposals) {
        auto& work = scratch.work[index];
        if (work.grant > 0) {
            book_departure(state, scratch, index, region, work.grant, false);
            target.projected += work.grant;
        }
        ++work.candidate;
    }
}

void allocate_housing(const RuntimeState& state, Workspace& scratch)
{
    scratch.bookings.clear();
    scratch.payload.clear();
    std::size_t bookingCapacity = 0;
    std::size_t payloadCapacity = 0;
    for (const auto& work : scratch.work) {
        if (work.requested <= 0) continue;
        const auto capacity = 1 + (work.source ? scratch.sites[work.source.value].candidates.size() : 0);
        bookingCapacity += capacity;
        payloadCapacity += capacity * work.bins.size();
    }
    scratch.bookings.reserve(bookingCapacity);
    scratch.payload.reserve(payloadCapacity);
    const auto target = [&](std::size_t index) {
        const auto& work = scratch.work[index];
        return scratch.sites[work.source.value].candidates[work.candidate].site;
    };
    for (;;) {
        // Build the full round before advancing any candidate cursor.
        scratch.proposals.clear();
        for (std::size_t i = 0; i < scratch.work.size(); ++i) {
            const auto& work = scratch.work[i];
            if (work.remaining > 0 && work.source &&
                work.candidate < scratch.sites[work.source.value].candidates.size()) scratch.proposals.push_back(i);
        }
        if (scratch.proposals.empty()) break;
        std::ranges::sort(scratch.proposals, [&](auto i, auto j) {
            return std::tuple(target(i), i) < std::tuple(target(j), j);
        });
        const auto proposals = std::span(scratch.proposals);
        for (std::size_t i = 0; i < proposals.size();) {
            const auto destination = target(proposals[i]);
            std::size_t end = i + 1;
            while (end < proposals.size() && target(proposals[end]) == destination) ++end;
            grant_proposals(state, scratch, destination, proposals.subspan(i, end - i));
            i = end;
        }
    }
    if (state.hot.rulesetId) return;
    const auto regions = state.tables.view(state.hot.world.regions);
    const auto player = state.populationVocabulary.factions[2];
    for (std::size_t i = 0; i < scratch.work.size(); ++i) {
        const auto& work = scratch.work[i];
        if (work.remaining <= 0) continue;
        RegionId destination;
        for (const auto region : neighbors(state, work.intent.sourceId)) {
            if (regions[region.value].controller != player && (!destination || region < destination))
                destination = region;
        }
        if (destination) book_departure(state, scratch, i, destination, work.remaining, true);
    }
}

template<class T>
bool owns(Range<T> capacity, Range<T> live)
{
    return live.size() && capacity.begin <= live.begin && live.end <= capacity.end;
}

bool owns_report(const RuntimeState& state, const MigrationStorage& storage, const MigrationReport& report)
{
    if (owns(storage.movements, report.inbound) || owns(storage.movements, report.outbound) ||
        owns(storage.summaries, report.intents)) return true;
    // An arrival report created for a newly detailed site can have its
    // own movement rows while still borrowing this booking's compositions.
    const auto ownsComposition = [&](const PopulationComposition& composition) {
        for (const auto* cohort : {&composition.villager, &composition.stranger}) {
            if (owns(storage.joint, cohort->joint.value_or(Range<JointCohort>{})) ||
                owns(storage.elders, cohort->eldersByAge) ||
                owns(storage.elders, cohort->specialists.scholar.eldersByAge) ||
                owns(storage.elders, cohort->specialists.warrior.eldersByAge)) return true;
        }
        return false;
    };
    for (const auto range : {report.inbound, report.outbound}) {
        for (const auto& move : state.tables.view(range)) {
            if (ownsComposition(move.composition) ||
                (move.survivorComposition && ownsComposition(*move.survivorComposition))) return true;
        }
    }
    return false;
}

bool referenced(const RuntimeState& state, const MigrationStorage& storage)
{
    for (const auto* turn : {&state.hot.civilization.currentMoonTurn, &state.hot.civilization.lastMoonTurn}) {
        if (!*turn) continue;
        const auto& moon = **turn;
        if (owns(storage.movements, moon.movements) || owns(storage.unresolved, moon.unresolved) ||
            owns(storage.summaries, moon.migrationIntentSummaries.value_or(Range<MigrationIntentSummary>{}))) return true;
        for (const auto& region : state.tables.view(moon.regions))
            if (region.value.migration && owns_report(state, storage, state.tables.at(*region.value.migration))) return true;
    }
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        const auto& detail = site.detailedState;
        if (detail.lastMeal && owns_report(state, storage, state.tables.at(*detail.lastMeal).migration)) return true;
        if (detail.lastMoonResult) {
            const auto report = state.tables.at(*detail.lastMoonResult).migration;
            if (report && owns_report(state, storage, state.tables.at(*report))) return true;
        }
    }
    return false;
}

template<class T>
void grow(Table<T>& table, Range<T>& storage, std::size_t needed)
{
    if (needed > storage.size()) storage = table.append(std::max(needed, std::size_t{2} * storage.size()), path);
}

MigrationStorage* acquire_storage(RuntimeState& state, const Workspace& scratch)
{
    const auto intents = std::ranges::count_if(scratch.work, [](const auto& w) { return w.requested > 0; });
    if (!intents) return {};
    auto& buffers = state.migration.storage;
    const auto reusable = std::ranges::find_if(buffers, [&](const auto& storage) { return !referenced(state, storage); });
    auto& storage = reusable == buffers.end() ? buffers.emplace_back() : *reusable;
    const auto copies = [&](RegionId region) -> std::size_t {
        const auto site = site_for(state, region);
        return site ? scratch.sites[site.value].reportCopies : 0;
    };
    std::size_t movementRows = 0;
    for (const auto& booking : scratch.bookings)
        movementRows += 1 + copies(scratch.work[booking.intent].intent.sourceId) + copies(booking.destination);
    std::size_t summaryRows = 0;
    std::size_t unresolved = 0;
    std::size_t binCount = scratch.payload.size();
    for (const auto& work : scratch.work) {
        if (work.requested > 0) summaryRows += 1 + copies(work.intent.sourceId);
        if (work.remaining <= 0) continue;
        ++unresolved;
        binCount += work.bins.size();
    }
    grow(state.tables.table<MigrationMovement>(), storage.movements, movementRows);
    grow(state.tables.table<MigrationIntentSummary>(), storage.summaries, summaryRows);
    grow(state.tables.table<MigrationSourceLoss>(), storage.unresolved, unresolved);
    // Death can retain a smaller composition beside the original booking.
    binCount += scratch.payload.size();
    grow(state.tables.table<JointCohort>(), storage.joint, binCount);
    grow(state.tables.table<ElderCohort>(), storage.elders, 2 * binCount);
    state.jointCounts.resize(state.tables.rows<JointCohort>().size());
    return &storage;
}

MigrationReport publish_bookings(RuntimeState& state, MoonTurn& turn, Workspace& scratch, MigrationStorage& storage)
{
    auto nextMovement = storage.movements.begin;
    auto nextSummary = storage.summaries.begin;
    auto nextUnresolved = storage.unresolved.begin;
    auto joint = storage.joint.begin;
    auto elders = storage.elders.begin;
    const auto make_composition = [&](std::span<const PopulationBin> bins) {
        return write_population_composition(state, bins, joint_bins(bins), scratch.ledger, joint, elders);
    };
    auto& losses = state.hot.civilization.chaos.pendingLosses;
    std::uint32_t internal = 0;
    std::uint32_t external = 0;
    double externalEmigrants = 0;
    for (const auto& booking : scratch.bookings) {
        const auto& intent = scratch.work[booking.intent];
        const auto bins = std::span(scratch.payload).subspan(booking.bins.begin, booking.bins.size);
        auto& movement = state.tables.rows<MigrationMovement>()[nextMovement++];
        movement = {};
        movement.transferSecond = std::max(0.0, js::floor(state.hot.tSec));
        movement.transferOrdinal = booking.external ? external++ : internal++;
        movement.reason = intent.intent.reason;
        movement.sourceRegionId = intent.intent.sourceId;
        movement.destinationRegionId = booking.destination;
        movement.sourceClassId = intent.intent.sourceClassId;
        movement.amount = movement.survivors = booking.amount;
        movement.composition = make_composition(bins);
        if (booking.external) {
            movement.external = true;
            movement.originalIndex = double(intent.original);
            movement.survivorComposition = movement.composition;
            externalEmigrants += booking.amount;
        }
    }
    losses.externalEmigrants += js::floor(externalEmigrants);
    for (const auto& work : scratch.work) {
        if (work.requested <= 0) continue;
        const auto& intent = work.intent;
        state.tables.rows<MigrationIntentSummary>()[nextSummary++] = {
            intent.reason, intent.sourceId, intent.sourceClassId, work.requested, work.requested,
            work.requested - work.remaining, work.external, work.remaining, state.migration.stayed,
        };
        if (work.remaining > 0) {
            state.tables.rows<MigrationSourceLoss>()[nextUnresolved++] = {
                intent.reason, intent.sourceId, intent.sourceClassId, work.remaining, make_composition(work.bins),
            };
        }
    }
    turn.movements = {storage.movements.begin, nextMovement};
    turn.unresolved = {storage.unresolved.begin, nextUnresolved};
    turn.migrationIntentSummaries = Range<MigrationIntentSummary>{storage.summaries.begin, nextSummary};
    storage.survivorJoint = joint;
    storage.survivorElders = elders;
    return {{nextSummary, storage.summaries.end}, {nextMovement, storage.movements.end}};
}

MoonRegionResult& region_result(RuntimeState& state, MoonTurn& turn, RegionId region, std::size_t ordinal)
{
    auto rows = state.tables.view(turn.regions);
    if (ordinal < rows.size() && rows[ordinal].key == region) return rows[ordinal].value;
    const auto found = std::ranges::find(rows, region, &MoonRegion::key);
    if (found != rows.end()) return found->value;
    // A detailed town may have joined since this moon began.
    const auto old = turn.regions;
    turn.regions = state.tables.table<MoonRegion>().append(old.size() + 1, path);
    rows = state.tables.view(turn.regions);
    std::ranges::copy(state.tables.view(old), rows.begin());
    rows.back() = {region, MoonRegionResult{region}};
    return rows.back().value;
}

Index<MigrationReport> report_slot(const RuntimeState& state, SiteId id, const Site& site)
{
    const auto first = state.migration.reports.begin + id.value * 3;
    Index<MigrationReport> sitePrior;
    if (site.detailedState.lastMoonResult)
        sitePrior = state.tables.at(*site.detailedState.lastMoonResult).migration.value_or(Index<MigrationReport>{});
    Index<MigrationReport> moonPrior;
    if (const auto& prior = state.hot.civilization.lastMoonTurn) {
        const auto regions = state.tables.view(prior->regions);
        if (id.value < regions.size() && regions[id.value].key == site.regionId) {
            moonPrior = regions[id.value].value.migration.value_or(Index<MigrationReport>{});
        } else {
            const auto found = std::ranges::find(regions, site.regionId, &MoonRegion::key);
            if (found != regions.end()) moonPrior = found->value.migration.value_or(Index<MigrationReport>{});
        }
    }
    auto slot = first;
    while (slot == sitePrior.value || slot == moonPrior.value) ++slot;
    return {slot};
}

template<class T, class Select, class Transform = std::identity>
Range<T> copy_selected(RuntimeState& state, Range<T> input, std::uint32_t& next,
                       Select select, Transform transform = {})
{
    const auto begin = next;
    auto& rows = state.tables.rows<T>();
    for (auto i = input.begin; i < input.end; ++i)
        if (select(rows[i])) rows[next++] = transform(rows[i]);
    return {begin, next};
}

void update_last_meal(RuntimeState& state, Site& site, MigrationReport report)
{
    if (!site.detailedState.lastMeal) return;
    report.tSec.reset();
    state.tables.at(*site.detailedState.lastMeal).migration = report;
}

MigrationMovement compact_movement(MigrationMovement movement)
{
    movement.external = movement.external.value_or(false);
    movement.originalIndex.reset();
    // The booking defers arrival survival. Its report clones the absent
    // survivor composition as an empty pair of cohorts.
    if (!movement.survivorComposition) movement.survivorComposition.emplace();
    return movement;
}

void publish_reports(RuntimeState& state, MoonTurn& turn, MigrationReport available)
{
    auto nextSummary = available.intents.begin;
    auto nextMovement = available.outbound.begin;
    std::size_t ordinal = 0;
    for (const auto id : detailed_sites(state)) {
        auto& site = site_at(state, id);
        const auto region = site.regionId;
        MigrationReport report;
        report.tSec = state.hot.tSec;
        report.intents = copy_selected(state, *turn.migrationIntentSummaries, nextSummary,
                                       [&](const auto& item) { return item.sourceRegionId == region; });
        report.outbound = copy_selected(state, turn.movements, nextMovement,
                                        [&](const auto& item) { return item.sourceRegionId == region; }, compact_movement);
        report.inbound = copy_selected(state, turn.movements, nextMovement,
                                        [&](const auto& item) { return item.destinationRegionId == region; }, compact_movement);
        auto& result = region_result(state, turn, region, ordinal++);
        const auto index = report_slot(state, id, site);
        state.tables.at(index) = report;
        result.migration = index;
        update_last_meal(state, site, report);
        reset_empty_stranger_cohort(state, site.detailedState.populationByClass.stranger);
    }
}

template<class T, class Keep>
void retain(RuntimeState& state, Range<T>& range, Keep keep)
{
    auto next = range.begin;
    range = copy_selected(state, range, next, keep);
}

}

void prepare_migration(RuntimeState& state)
{
    if (!state.hot.variantFlags.settlementPrototypeEnabled) return;
    auto& cache = state.migration;
    cache.reports = state.tables.table<MigrationReport>().append(state.hot.world.sites.size() * 3, path);
    cache.storage.reserve(4);
    const std::size_t sites = state.hot.world.sites.size();
    // Food, Housing and Faith can each reserve both residencies per site.
    const auto intents = sites * 6;
    const auto bins = state.birthStorage.binCapacityHint;
    auto& scratch = workspace();
    scratch.sites.resize(sites);
    scratch.intentRows.resize(intents);
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        auto& row = scratch.sites[site.id.value];
        row.available.reserve(bins);
        row.residents.reserve(bins);
        row.candidates.reserve(neighbors(state, site.regionId).size());
    }
    for (auto& row : scratch.intentRows) row.bins.reserve(bins);
    scratch.eligible.reserve(bins);
    scratch.selected.reserve(bins);
    scratch.removed.reserve(bins);
    scratch.ledger.reserve(bins);
    scratch.cohort.reserve(bins);
    for (auto& row : scratch.parts) row.elders.reserve(bins);
    scratch.proposals.reserve(intents);
    scratch.ranked.reserve(std::max(intents, bins));
    scratch.refunds.reserve(intents);
    scratch.bookings.reserve(intents);
    scratch.payload.reserve(sites * bins);

    // Headroom for live moon reports and the new booking. Logical rows are
    // still acquired on demand, so anchors only copy materialized reports.
    auto reserveRows = [&]<class T>(std::size_t extra) {
        auto& rows = state.tables.rows<T>();
        rows.reserve(rows.size() + extra);
    };
    reserveRows.operator()<MigrationSourceLoss>(3 * intents);
    reserveRows.operator()<MigrationMovement>(3 * intents);
    reserveRows.operator()<MigrationIntentSummary>(3 * intents);
    cache.stayed = state.intern<SymbolId>("stayed", path);
    cache.ruin = state.intern<FactionId>("ruin", path);
    cache.classes = {state.intern<ResidencyId>("villager", path), state.intern<ResidencyId>("stranger", path)};
}

void resolve_migration(RuntimeState& state, MoonTurn& turn)
{
    auto& losses = state.hot.civilization.chaos.pendingLosses;
    if (!losses.prematureDeathMitigation) losses.prematureDeathMitigation = 0;
    if (!turn.migrationIntents.size()) {
        turn.movements = {};
        turn.unresolved = {};
        turn.migrationIntentSummaries.emplace();
        publish_reports(state, turn, {});
        return;
    }
    auto& scratch = workspace();
    const auto intents = state.tables.view(turn.migrationIntents);
    scratch.proposals.reserve(intents.size());
    scratch.ranked.reserve(intents.size());
    refresh_intents(state, intents, scratch);
    rank_destinations(state, scratch);
    allocate_housing(state, scratch);
    auto* storage = acquire_storage(state, scratch);
    MigrationStorage empty;
    const auto available = publish_bookings(state, turn, scratch, storage ? *storage : empty);
    for (const auto id : detailed_sites(state)) {
        const auto& source = scratch.sites[id.value];
        if (source.changed)
            write_population_bins(state, id, source.residents, scratch.ledger, joint_bins(source.residents));
    }
    publish_reports(state, turn, available);
}

PopulationComposition store_arrival_survivors(RuntimeState& state, Range<MigrationMovement> movements,
                                              std::span<const PopulationBin> bins, bool joint,
                                              LedgerScratch& scratch)
{
    for (auto& storage : state.migration.storage) {
        if (owns(storage.movements, movements))
            return write_population_composition(state, bins, joint, scratch,
                                                storage.survivorJoint, storage.survivorElders);
    }
    // A stage probe or restored save can contain bookings created before
    // admission, outside this state's reusable Migration storage.
    auto jointCursor = joint ? state.tables.table<JointCohort>().append(bins.size(), path).begin : 0;
    auto elderCursor = state.tables.table<ElderCohort>().append(2 * bins.size(), path).begin;
    state.jointCounts.resize(state.tables.rows<JointCohort>().size());
    return write_population_composition(state, bins, joint, scratch, jointCursor, elderCursor);
}

double finish_migration_report(RuntimeState& state, SiteId id, const MoonTurn& turn,
                               MoonRegionResult& result)
{
    auto& site = site_at(state, id);
    if (!result.migration) {
        result.migration = report_slot(state, id, site);
        state.tables.at(*result.migration) = {};
    }
    auto& report = state.tables.at(*result.migration);
    double arrivalDeaths = 0;
    if (turn.movements.size()) {
        const auto refresh = [&](auto& range, auto regionField) {
            const auto matches = [&](const auto& movement) { return movement.*regionField == site.regionId; };
            const auto count = std::ranges::count_if(state.tables.view(turn.movements), matches);
            // Usually the current report already has slots for these bookings.
            // A site joining the detailed list mid-moon can need new slots.
            if (static_cast<std::size_t>(count) != range.size())
                range = state.tables.table<MigrationMovement>().append(count, path);
            auto next = range.begin;
            copy_selected(state, turn.movements, next, matches, compact_movement);
        };
        refresh(report.outbound, &MigrationMovement::sourceRegionId);
        refresh(report.inbound, &MigrationMovement::destinationRegionId);
        for (const auto& movement : state.tables.view(report.inbound)) arrivalDeaths += movement.arrivalDeaths;
    } else {
        report.outbound = report.inbound = {};
    }
    // Death copies the whole regional result, including Migration's tSec.
    if (site.detailedState.lastMeal)
        state.tables.at(*site.detailedState.lastMeal).migration = report;
    return arrivalDeaths;
}

void cancel_moon_migration(RuntimeState& state, RegionId region)
{
    auto& current = state.hot.civilization.currentMoonTurn;
    if (!current || current->phaseId == state.settlementPrelude.phases[std::size_t(LunarPhase::death)]) return;
    auto& turn = *current;
    const auto cancelled = [&](const MigrationMovement& movement) {
        return !movement.external.value_or(false) &&
               (movement.sourceRegionId == region || movement.destinationRegionId == region);
    };
    auto& scratch = workspace();
    const auto movements = state.tables.view(turn.movements);
    scratch.refunds.resize(movements.size());
    for (std::size_t i = 0; i < movements.size(); ++i) {
        const auto& movement = movements[i];
        scratch.refunds[i] = cancelled(movement) ? movement.amount : 0;
        if (!scratch.refunds[i]) continue;
        const auto source = site_for(state, movement.sourceRegionId);
        if (!source || !has_ledger(site_at(state, source).detailedState.populationByClass)) continue;
        collect_residents(state, source, scratch.eligible, scratch);
        collect_composition(state, movement.composition, scratch.selected, scratch);
        scratch.eligible.insert(scratch.eligible.end(), scratch.selected.begin(), scratch.selected.end());
        write_population_bins(state, source, scratch.eligible, scratch.ledger);
    }
    retain(state, turn.migrationIntents, [&](const auto& intent) { return intent.sourceId != region; });
    retain(state, turn.unresolved, [&](const auto& loss) { return loss.sourceRegionId != region; });
    if (!turn.migrationIntentSummaries) turn.migrationIntentSummaries.emplace();
    auto& summaries = *turn.migrationIntentSummaries;
    retain(state, summaries, [&](const auto& intent) { return intent.sourceRegionId != region; });
    for (auto& intent : state.tables.view(summaries)) {
        double returned = 0;
        for (std::size_t i = 0; i < movements.size(); ++i) {
            const auto& movement = movements[i];
            if (!scratch.refunds[i] || movement.sourceRegionId != intent.sourceRegionId ||
                movement.sourceClassId != intent.sourceClassId || movement.reason != intent.reason) continue;
            const auto amount = std::min(std::max(0.0, intent.admitted - returned), scratch.refunds[i]);
            returned += amount;
            scratch.refunds[i] -= amount;
        }
        if (returned > 0) {
            intent.admitted = std::max(0.0, intent.admitted - returned);
            intent.unresolved += returned;
            intent.unresolvedOutcome = state.migration.stayed;
        }
    }
    retain(state, turn.movements, [&](const auto& movement) { return !cancelled(movement); });
    const auto regions = state.tables.view(turn.regions);
    for (const auto id : detailed_sites(state)) {
        auto& site = site_at(state, id);
        const auto found = std::ranges::find(regions, site.regionId, &MoonRegion::key);
        if (found == regions.end() || !found->value.migration) continue;
        auto& report = state.tables.at(*found->value.migration);
        auto next = report.intents.begin;
        report.intents = copy_selected(state, summaries, next,
                                       [&](const auto& item) { return item.sourceRegionId == site.regionId; });
        retain(state, report.outbound, [&](const auto& movement) { return !cancelled(movement); });
        retain(state, report.inbound, [&](const auto& movement) { return !cancelled(movement); });
        report.sourceLosses = {};
        update_last_meal(state, site, report);
    }
}

}

namespace waffle::sim::stages {

bool migration(RuntimeState& state, StageContext& context)
{
    auto& turn = settlement::set_moon_turn_phase(state, context.lunar);
    settlement::resolve_migration(state, turn);
    return true;
}

}
