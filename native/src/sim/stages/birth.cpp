#include "sim/stages/entries.hpp"

#include "core/js_number.hpp"
#include "sim/practice/practice.hpp"
#include "sim/settlement/population.hpp"
#include "sim/settlement/prelude.hpp"

#include <algorithm>
#include <array>

namespace waffle::sim::settlement {

using namespace runtime;

namespace {
constexpr std::size_t groups_per_site = 6;
constexpr std::size_t factions_per_group = 3;
// A group can add one newborn, adult and new Elder bin per faction.
constexpr std::size_t additional_bins = groups_per_site * factions_per_group * 3;
constexpr std::string_view birth_storage_path = "Birth storage";

struct BirthWorkspace {
    LedgerScratch ledger;
    std::vector<PopulationBin> bins, candidates, matured, elderly, removed;
    CohortScratch cohorts;
    std::array<Cohort, 3> legacy;
    Cohort combined;
    std::size_t capacity{};

    void reserve(std::size_t binsPerSite);
};

// No scratch data outlives an invocation. Forecast copies only carry the
// authoritative tables and the capacity needed when a worker first uses them.
thread_local BirthWorkspace birthWork;

std::uint32_t credit_group_base(const BirthStorage& storage, SiteId site)
{
    return storage.groups.begin + static_cast<std::uint32_t>(site.value * groups_per_site);
}

std::uint32_t credit_faction_base(const BirthStorage& storage, SiteId site, std::size_t group)
{
    return storage.factions.begin + static_cast<std::uint32_t>(
        (site.value * groups_per_site + group) * factions_per_group);
}

void BirthWorkspace::reserve(std::size_t binsPerSite)
{
    if (binsPerSite <= capacity) return;
    binsPerSite = std::max(binsPerSite, capacity * 2);
    ledger.reserve(binsPerSite);
    bins.reserve(binsPerSite);
    candidates.reserve(factions_per_group);
    matured.reserve(factions_per_group);
    elderly.reserve(factions_per_group);
    removed.reserve(factions_per_group);
    cohorts.reserve(binsPerSite);
    for (auto& part : legacy) part.elders.reserve(binsPerSite);
    combined.elders.reserve(binsPerSite);
    capacity = binsPerSite;
}

}

void prepare_birth(RuntimeState& state)
{
    if (!state.hot.variantFlags.settlementPrototypeEnabled) return;
    auto& storage = state.birthStorage;
    constexpr std::array tiers{"bronze", "silver", "gold", "diamond"};
    constexpr std::array keys{"villager:ordinary", "villager:scholar", "villager:warrior",
                              "stranger:ordinary", "stranger:scholar", "stranger:warrior"};
    for (std::size_t i = 0; i < tiers.size(); ++i)
        storage.faithTiers[i] = state.intern<SymbolId>(tiers[i], birth_storage_path);
    for (std::size_t i = 0; i < keys.size(); ++i)
        storage.groupKeys[i] = state.intern<BirthCreditId>(keys[i], birth_storage_path);

    const auto siteCount = state.hot.world.sites.size();
    for (auto& report : storage.reports)
        report = state.tables.table<MoonRegionResultBirth>().append(siteCount, birth_storage_path);
    storage.groups = state.tables.table<BirthCredit>().append(siteCount * groups_per_site, birth_storage_path);
    storage.factions = state.tables.table<BirthFactionCredit>().append(
        siteCount * groups_per_site * factions_per_group, birth_storage_path);

    std::size_t maxBins = 0;
    auto& groups = state.tables.rows<BirthCredit>();
    auto& factions = state.tables.rows<BirthFactionCredit>();
    for (auto& row : state.tables.view(state.hot.world.sites)) {
        const auto id = row.id;
        auto& site = row.detailedState;
        const auto original = state.tables.view(site.birthAllegianceCredits);
        if (original.size() > groups_per_site) throw std::invalid_argument("invalid Birth credit groups");
        auto output = credit_group_base(storage, id);
        for (const auto& group : original) {
            const auto ordinal = std::ranges::find(storage.groupKeys, group.key) - storage.groupKeys.begin();
            if (ordinal == groups_per_site || group.value.size() > factions_per_group)
                throw std::invalid_argument("invalid Birth credit group");
            const auto begin = credit_faction_base(storage, id, ordinal);
            std::ranges::copy(state.tables.view(group.value), factions.begin() + begin);
            groups[output++] = {group.key, {begin, begin + group.value.size()}};
        }
        site.birthAllegianceCredits = {credit_group_base(storage, id), output};
        const auto& classes = site.populationByClass;
        const auto ageRows = [](const auto& population) {
            return std::size_t{population.eldersByAge.size()} + population.specialists.scholar.eldersByAge.size() +
                   population.specialists.warrior.eldersByAge.size();
        };
        maxBins = std::max({maxBins, std::size_t{classes.villager.joint.value_or(Range<JointCohort>{}).size()} +
                                       classes.stranger.joint.value_or(Range<JointCohort>{}).size(),
                            ageRows(classes.villager), ageRows(classes.stranger)});
    }
    storage.binCapacityHint = maxBins + additional_bins;
    birthWork.reserve(storage.binCapacityHint);
}

namespace {

namespace js = core::js;

constexpr std::array residencies{Residency::villager, Residency::stranger};

struct BirthSettings {
    std::array<double, 4> rates;
    double maturity;
    double elder;
    std::uint64_t newElderAge;
    std::uint64_t ageAdvance;
};

struct Rolls {
    std::uint64_t births, matured, newElders;
};

struct BirthShares {
    std::array<BirthFactionCredit, factions_per_group> factions;
    std::size_t size{};
};

std::uint64_t roll_count(core::RngState& rng, double count, double probability)
{
    return count > 0 ? core::rng_count_below(rng, static_cast<std::uint64_t>(js::ceil(count)), probability) : 0;
}

template<class Report>
Rolls roll_cohort(core::RngState& rng, double adults, double children, Report& report)
{
    const Rolls rolls{roll_count(rng, adults, report.birthRate),
                      roll_count(rng, children, report.childToAdultRate),
                      roll_count(rng, adults, report.adultToElderRate)};
    report.births += static_cast<double>(rolls.births);
    report.matured += static_cast<double>(rolls.matured);
    report.newElders += static_cast<double>(rolls.newElders);
    return rolls;
}

BirthShares pre_birth_shares(const RuntimeState& state, SiteId site)
{
    BirthShares shares{};
    const auto totals = faction_totals(state, site);
    double total = 0;
    for (const auto id : state.populationVocabulary.factions) {
        const auto found = std::ranges::find(totals, id, &FactionPopulationTotal::key);
        if (found == totals.end() || found->value <= 0) continue;
        shares.factions[shares.size++] = *found;
        total += found->value;
    }
    for (std::size_t i = 0; i < shares.size; ++i) shares.factions[i].value /= total;
    return shares;
}

void add_newborns(RuntimeState& state, SiteId site, Residency residency, std::size_t specialty,
                  std::uint64_t births, const BirthShares& shares, std::vector<PopulationBin>& bins)
{
    if (births == 0 || shares.size == 0) return;
    const auto& storage = state.birthStorage;
    const auto group = static_cast<std::size_t>(residency) * 3 + specialty;
    const auto key = storage.groupKeys[group];
    auto& groups = site_at(state, site).detailedState.birthAllegianceCredits;
    auto& rows = state.tables.rows<BirthCredit>();
    const auto liveGroups = state.tables.view(groups);
    const auto existing = std::ranges::find(liveGroups, key, &BirthCredit::key);
    const auto start = credit_faction_base(storage, site, group);
    auto& groupRow = existing == liveGroups.end() ? rows[groups.end++] : *existing;
    if (existing == liveGroups.end()) groupRow = {key, {start, start}};
    auto credits = state.tables.view(groupRow.value);
    std::array<BirthFactionCredit*, factions_per_group> ordered{};
    if (credits.size() == shares.size) {
        for (std::size_t i = 0; i < shares.size; ++i) {
            const auto credit = std::ranges::find(credits, shares.factions[i].key, &BirthFactionCredit::key);
            if (credit != credits.end()) ordered[i] = &*credit;
        }
    }
    if (std::find(ordered.begin(), ordered.begin() + shares.size, nullptr) != ordered.begin() + shares.size) {
        groupRow.value = {start, start + static_cast<std::uint32_t>(shares.size)};
        credits = state.tables.view(groupRow.value);
        for (std::size_t i = 0; i < shares.size; ++i) {
            credits[i] = {shares.factions[i].key, 0};
            ordered[i] = &credits[i];
        }
    }

    std::array<std::uint64_t, factions_per_group> counts{};
    if (shares.size == 1) {
        ordered[0]->value = 0;
        counts[0] = births;
    } else {
        for (std::uint64_t person = 0; person < births; ++person) {
            std::size_t winner = 0;
            for (std::size_t i = 0; i < shares.size; ++i) {
                ordered[i]->value += shares.factions[i].value;
                if (ordered[i]->value > ordered[winner]->value + 1e-12) winner = i;
            }
            ordered[winner]->value -= 1;
            ++counts[winner];
            double remainder = 0;
            for (std::size_t i = 0; i + 1 < shares.size; ++i) remainder += ordered[i]->value;
            ordered[shares.size - 1]->value = remainder == 0 ? 0 : -remainder;
        }
    }
    const auto& vocabulary = state.populationVocabulary;
    for (std::size_t i = 0; i < shares.size; ++i) {
        if (counts[i] != 0)
            bins.push_back({residency, {shares.factions[i].key, vocabulary.specialties[specialty],
                                       vocabulary.stages[1], std::nullopt}, counts[i]});
    }
}

void select_transition(const RuntimeState& state, BirthWorkspace& work, std::vector<PopulationBin>& selection,
                       Residency residency, SpecialtyId specialty, LifeStageId stage, std::uint64_t count)
{
    selection.clear();
    if (count == 0) return;
    work.candidates.clear();
    for (const auto& bin : work.bins)
        if (bin.residency == residency && bin.key.specialty == specialty && bin.key.kind == stage)
            work.candidates.push_back(bin);
    allocate_population(state, work.candidates, static_cast<double>(count), selection, work.ledger);
}

void move_selection(BirthWorkspace& work, std::span<const PopulationBin> selection,
                    LifeStageId target, std::optional<std::uint64_t> age)
{
    remove_population(work.bins, selection, work.removed);
    for (auto bin : work.removed) {
        bin.key.kind = target;
        bin.key.age = age;
        work.bins.push_back(bin);
    }
}

template<class Report>
std::array<Rolls, 3> roll_joint_class(RuntimeState& state, const PopulationClass& population, Report& report)
{
    const auto& scholar = population.specialists.scholar;
    const auto& warrior = population.specialists.warrior;
    const std::array adultCounts{(double(population.adults) - double(scholar.adults)) - double(warrior.adults),
                                 double(scholar.adults), double(warrior.adults)};
    const std::array childCounts{(double(population.children) - double(scholar.children)) - double(warrior.children),
                                 double(scholar.children), double(warrior.children)};
    std::array<Rolls, 3> results;
    for (std::size_t specialty = 0; specialty < results.size(); ++specialty)
        results[specialty] = roll_cohort(state.hot.rng, adultCounts[specialty], childCounts[specialty], report);
    return results;
}

void apply_joint_rolls(RuntimeState& state, SiteId site, Residency residency, const std::array<Rolls, 3>& results,
                       const BirthSettings& settings, const BirthShares& shares, BirthWorkspace& work)
{
    const auto& vocabulary = state.populationVocabulary;
    const auto adults = vocabulary.stages[0];
    const auto children = vocabulary.stages[1];
    const auto elders = vocabulary.stages[2];
    for (std::size_t specialty = 0; specialty < results.size(); ++specialty) {
        const auto rolls = results[specialty];
        if (!rolls.matured && !rolls.newElders && !rolls.births) continue;
        const auto id = vocabulary.specialties[specialty];
        select_transition(state, work, work.matured, residency, id, children, rolls.matured);
        select_transition(state, work, work.elderly, residency, id, adults, rolls.newElders);
        move_selection(work, work.matured, adults, std::nullopt);
        move_selection(work, work.elderly, elders, settings.newElderAge);
        add_newborns(state, site, residency, specialty, rolls.births, shares, work.bins);
    }
}

template<class Report>
void resolve_legacy_class(RuntimeState& state, SiteId site, Residency residency, const PopulationClass& population,
                          const BirthSettings& settings, BirthWorkspace& work, Report& report)
{
    split_specialist_cohorts(state, population, work.legacy, work.cohorts);
    for (auto& cohort : work.legacy) {
        for (auto& elder : cohort.elders) elder.age += settings.ageAdvance;
        const auto rolls = roll_cohort(state.hot.rng, cohort.adults, cohort.children, report);
        cohort.children = cohort.children - double(rolls.matured) + double(rolls.births);
        cohort.adults = cohort.adults + double(rolls.matured) - double(rolls.newElders);
        if (rolls.newElders != 0) {
            const auto found = std::ranges::find(cohort.elders, settings.newElderAge, &ElderCohort::age);
            if (found == cohort.elders.end()) cohort.elders.push_back({settings.newElderAge, rolls.newElders});
            else found->count = static_cast<std::uint64_t>(double(found->count) + double(rolls.newElders));
        }
        std::ranges::sort(cohort.elders, {}, &ElderCohort::age);
    }
    combine_specialist_cohorts(work.legacy, work.combined, work.cohorts);
    write_legacy_cohorts(state, site, residency, work.legacy, work.combined);
}

template<class Report>
std::array<Rolls, 3> resolve_class(RuntimeState& state, SiteId site, Residency residency,
                                   const PopulationClass& population, const BirthSettings& settings,
                                   bool joint, BirthWorkspace& work, Report& report)
{
    const auto& tiers = state.birthStorage.faithTiers;
    const auto tier = population.faith.tier ? population.faith.tier : tiers[2];
    const auto slot = std::ranges::find(tiers, tier) - tiers.begin();
    if (slot == tiers.size()) throw std::invalid_argument("unknown Birth faith tier");
    report.birthRate = settings.rates[slot];
    report.childToAdultRate = settings.maturity;
    report.adultToElderRate = settings.elder;
    report.ageAdvance = static_cast<double>(settings.ageAdvance);
    if (joint) return roll_joint_class(state, population, report);
    resolve_legacy_class(state, site, residency, population, settings, work, report);
    return {};
}

void resolve_birth(RuntimeState& state, SiteId id, const BirthSettings& settings, BirthWorkspace& work,
                   MoonRegionResultBirth& report)
{
    const auto& populations = site_at(state, id).detailedState.populationByClass;
    const auto joint = populations.villager.joint.has_value() || populations.stranger.joint.has_value();
    report = {state.hot.tSec, state.hot.year};
    const auto villagerRolls = resolve_class(state, id, residencies[0], populations.villager, settings, joint,
                                             work, report.byClass.villager);
    // With a ledger, the browser's villager writes also refresh the stranger
    // cache before its rolls. A missing stranger ledger is treated as empty.
    auto stranger = populations.stranger;
    if (joint && !stranger.joint) {
        stranger.children = 0;
        stranger.adults = 0;
        stranger.specialists = {};
    }
    const auto strangerRolls = resolve_class(state, id, residencies[1], stranger, settings, joint,
                                             work, report.byClass.stranger);
    if (!joint) {
        refresh_site_population_index(state, id);
        return;
    }
    // A first write also normalizes imported joint keys and serialized summaries.
    // After that, an inert Birth only owes the draws and its report.
    const auto& index = state.indexes.sites[id.value];
    const auto changed = [](const auto& result) { return result.births || result.matured || result.newElders; };
    const bool aging = settings.ageAdvance && (index.byResidency[0].elders || index.byResidency[1].elders);
    if (index.canonicalJoint && !aging && !changed(report.byClass.villager) && !changed(report.byClass.stranger))
        return;

    const auto bins = populations.villager.joint.value_or(Range<JointCohort>{}).size() +
                      populations.stranger.joint.value_or(Range<JointCohort>{}).size();
    work.reserve(bins + additional_bins);
    collect_population(state, populations, work.bins);
    if (settings.ageAdvance != 0)
        for (auto& bin : work.bins)
            if (bin.key.kind == state.populationVocabulary.stages[2])
                *bin.key.age += settings.ageAdvance;
    const auto shares = pre_birth_shares(state, id);
    apply_joint_rolls(state, id, residencies[0], villagerRolls, settings, shares, work);
    apply_joint_rolls(state, id, residencies[1], strangerRolls, settings, shares, work);
    write_population_bins(state, id, work.bins, work.ledger);
}

}

void resolve_birth_cohorts(RuntimeState& state)
{
    auto& civ = state.hot.civilization;
    const auto reportBuffer = state.settlementPrelude.nextMoonBuffer ^ 1u;
    const auto lastYear = std::max(1.0, js::floor(civ.lastPopulationAgingYear));
    const auto year = js::floor(state.hot.year);
    const auto& values = state.content->config.settings.values;
    const BirthSettings settings{
        {std::clamp(values.birthRateBronze, 0.0, 1.0), std::clamp(values.birthRateSilver, 0.0, 1.0),
         std::clamp(values.birthRateGold, 0.0, 1.0), std::clamp(values.birthRateDiamond, 0.0, 1.0)},
        values.childToAdultRate, values.adultToElderRate, static_cast<std::uint64_t>(values.newElderAge),
        static_cast<std::uint64_t>(std::max(0.0, year - lastYear)),
    };
    const auto reports = state.birthStorage.reports[reportBuffer];
    const auto sites = detailed_sites(state);
    auto regions = state.tables.view(civ.currentMoonTurn->regions);
    auto& work = birthWork;
    work.reserve(state.birthStorage.binCapacityHint);
    // begin_moon_turn created these rows in the same detailed-site order.
    for (std::size_t i = 0; i < sites.size(); ++i) {
        const auto id = sites[i];
        if (site_at(state, id).neutral) continue;
        const auto index = Index<MoonRegionResultBirth>{reports.begin + id.value};
        resolve_birth(state, id, settings, work, state.tables.at(index));
        regions[i].value.birth = index;
    }
    civ.lastPopulationAgingYear = std::max(lastYear, year);
}

}

namespace waffle::sim::stages {

bool birth(RuntimeState& state, StageContext& context)
{
    settlement::begin_moon_turn(state, context.lunar);
    state.hot.civilization.phaseModifiers.faithResistance = 0;
    practice::activate(state, content::Activation::birth);
    settlement::resolve_birth_cohorts(state);
    return true;
}

}
