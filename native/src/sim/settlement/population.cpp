#include "sim/settlement/population.hpp"

#include "core/js_number.hpp"

#include <algorithm>

namespace waffle::sim::settlement {
namespace {

using namespace runtime;
namespace js = core::js;

constexpr std::array residencies{Residency::villager, Residency::stranger};

template<class T, std::size_t N>
std::size_t rank(const std::array<T, N>& order, T value)
{
    const auto found = std::ranges::find(order, value);
    if (found == order.end()) throw std::invalid_argument("unknown population ledger key");
    return found - order.begin();
}

bool age_key_less(std::optional<std::uint64_t> left, std::optional<std::uint64_t> right)
{
    if (!left || !right) return !left && right.has_value();
    // JS joins the age as decimal text. Compare decimal prefixes without
    // converting to strings. A shorter matching prefix sorts first.
    auto a = *left;
    auto b = *right;
    if (a >= 10 && a < 100 && b >= 10 && b < 100) return a < b;
    auto aDigits = 1U;
    auto bDigits = 1U;
    for (auto n = a; n >= 10; n /= 10) ++aDigits;
    for (auto n = b; n >= 10; n /= 10) ++bDigits;
    for (auto i = aDigits; i > bDigits; --i) a /= 10;
    for (auto i = bDigits; i > aDigits; --i) b /= 10;
    return a == b ? aDigits < bDigits : a < b;
}

bool key_less(const PopulationVocabulary& vocabulary, const PopulationBin& a, const PopulationBin& b)
{
    if (a.key.allegiance != b.key.allegiance)
        return rank(vocabulary.factions, a.key.allegiance) < rank(vocabulary.factions, b.key.allegiance);
    if (a.residency != b.residency) return a.residency == Residency::stranger;
    if (a.key.specialty != b.key.specialty)
        return rank(vocabulary.specialties, a.key.specialty) < rank(vocabulary.specialties, b.key.specialty);
    if (a.key.kind != b.key.kind)
        return rank(vocabulary.stages, a.key.kind) < rank(vocabulary.stages, b.key.kind);
    return age_key_less(a.key.age, b.key.age);
}

bool same_key(const PopulationBin& a, const PopulationBin& b)
{
    return a.residency == b.residency && a.key.allegiance == b.key.allegiance &&
           a.key.specialty == b.key.specialty && a.key.kind == b.key.kind && a.key.age == b.key.age;
}

std::uint64_t count_from_number(double count)
{
    if (!(count >= 0 && count < 0x1p64))
        throw std::invalid_argument("population count exceeds native range");
    return static_cast<std::uint64_t>(count);
}

void merge_population(const PopulationVocabulary& vocabulary, std::span<const PopulationBin> bins,
                      LedgerScratch& scratch)
{
    // Cache the browser's closed-vocabulary sort prefix once per live bin.
    // The original index breaks ties so binary64 additions retain input order.
    auto& ranks = scratch.keyOrder;
    ranks.clear();
    for (std::size_t i = 0; i < bins.size(); ++i) {
        const auto& bin = bins[i];
        if (!bin.count) continue;
        const auto faction = rank(vocabulary.factions, bin.key.allegiance);
        const auto specialty = rank(vocabulary.specialties, bin.key.specialty);
        const auto stage = rank(vocabulary.stages, bin.key.kind);
        if (stage == 2 && !bin.key.age) throw std::invalid_argument("elder bin has no age");
        const auto prefix = ((faction * 2 + (bin.residency == Residency::villager)) * 3 + specialty) * 3 + stage;
        ranks.push_back({i, prefix});
    }
    std::ranges::sort(ranks, [&](const auto& a, const auto& b) {
        if (a.prefix != b.prefix) return a.prefix < b.prefix;
        const auto left = bins[a.index].key.age, right = bins[b.index].key.age;
        return left == right ? a.index < b.index : age_key_less(left, right);
    });
    auto& merged = scratch.merged;
    merged.clear();
    for (const auto rank : ranks) {
        const auto& bin = bins[rank.index];
        if (merged.empty() || !same_key(merged.back(), bin)) merged.push_back(bin);
        else merged.back().count = count_from_number(double(merged.back().count) + double(bin.count));
    }
}

void clear_cohort(Cohort& cohort)
{
    cohort.children = 0;
    cohort.adults = 0;
    cohort.elders.clear();
}

void accumulate(Cohort& cohort, std::size_t stage, const PopulationBin& bin)
{
    if (stage == 0) cohort.adults += double(bin.count);
    else if (stage == 1) cohort.children += double(bin.count);
    else {
        const auto age = *bin.key.age;
        const auto existing = std::ranges::find(cohort.elders, age, &ElderCohort::age);
        if (existing == cohort.elders.end()) cohort.elders.push_back({age, bin.count});
        else existing->count = count_from_number(double(existing->count) + double(bin.count));
    }
}

template<class T>
Range<T> acquire_rows(Table<T>& table, Range<T>& storage, std::size_t count)
{
    if (count > storage.size())
        storage = table.append(std::max(count, std::size_t{2} * storage.size()), "population storage");
    return {storage.begin, storage.begin + static_cast<std::uint32_t>(count)};
}

template<class T>
void seed_storage(Range<T>& storage, Range<T> live)
{
    if (storage.size() == 0) storage = live;
}

template<class T>
void copy_cohort(T& target, const Cohort& source, Range<ElderCohort> elders, RuntimeState& state)
{
    target.children = count_from_number(source.children);
    target.adults = count_from_number(source.adults);
    target.eldersByAge = elders;
    std::ranges::copy(source.elders, state.tables.view(elders).begin());
}

CohortView view(const Cohort& cohort)
{
    return {cohort.children, cohort.adults, cohort.elders};
}

void load(Cohort& cohort, CohortView source)
{
    cohort.children = source.children;
    cohort.adults = source.adults;
    cohort.elders.assign(source.elders.begin(), source.elders.end());
}

}

void prepare_population(RuntimeState& state)
{
    constexpr auto path = "population vocabulary";
    auto& vocabulary = state.populationVocabulary;
    vocabulary.factions = {state.intern<FactionId>("external-a", path), state.intern<FactionId>("neutral", path),
                           state.intern<FactionId>("player", path)};
    vocabulary.specialties = {state.intern<SpecialtyId>("ordinary", path), state.intern<SpecialtyId>("scholar", path),
                               state.intern<SpecialtyId>("warrior", path)};
    vocabulary.stages = {state.intern<LifeStageId>("adults", path), state.intern<LifeStageId>("children", path),
                         state.intern<LifeStageId>("elder", path)};
}

const PopulationClass& population_class(const PopulationByClass& population, Residency residency)
{
    return residency == Residency::villager ? population.villager : population.stranger;
}

PopulationBinView population_bins(const RuntimeState& state, const PopulationByClass& population, Residency residency)
{
    const auto bins = population_class(population, residency).joint.value_or(Range<JointCohort>{});
    return {residency, state.tables.view(bins), std::span(state.jointCounts).subspan(bins.begin, bins.size())};
}

void CohortScratch::reserve(std::size_t agesPerClass)
{
    ages.reserve(agesPerClass);
}

void LedgerScratch::reserve(std::size_t binsPerSite)
{
    ranks.reserve(binsPerSite);
    keyOrder.reserve(binsPerSite);
    merged.reserve(binsPerSite);
    for (auto& byClass : summaries)
        for (auto& cohort : byClass) cohort.elders.reserve(binsPerSite);
}

void collect_population(const RuntimeState& state, const PopulationByClass& population,
                        std::vector<PopulationBin>& output, const PopulationFilter& filter, FactionId beneficiary)
{
    output.clear();
    for (const auto residency : residencies) {
        if (filter.residency && *filter.residency != residency) continue;
        const auto bins = population_bins(state, population, residency);
        for (std::size_t index = 0; index < bins.size(); ++index) {
            const auto bin = bins[index];
            const auto& key = bin.key;
            if ((!filter.kind || filter.kind == key.kind) &&
                (!filter.specialty || filter.specialty == key.specialty) &&
                (!filter.allegiance || filter.allegiance == key.allegiance) &&
                (!filter.beneficiaryOnly || beneficiary == key.allegiance) &&
                (!filter.opposing || beneficiary != key.allegiance)) output.push_back(bin);
        }
    }
}

void allocate_population(const RuntimeState& state, std::span<const PopulationBin> bins,
                         double requested, std::vector<PopulationBin>& output, LedgerScratch& scratch,
                         PopulationTie tie)
{
    output.clear();
    double available = 0;
    for (const auto& bin : bins) available += double(bin.count);
    if (!(requested > 0)) return;
    const auto target = std::min(available, js::floor(requested));
    if (target == 0) return;

    auto& ranks = scratch.ranks;
    ranks.clear();
    double allocated = 0;
    for (const auto& bin : bins) {
        const double exact = target * double(bin.count) / available;
        const bool inputOrder = tie == PopulationTie::input_order;
        const double whole = inputOrder ? std::min(double(bin.count), js::floor(exact)) : js::floor(exact);
        ranks.push_back({output.size(), inputOrder ? exact - whole : js::remainder(exact, 1)});
        output.push_back({bin.residency, bin.key, count_from_number(whole)});
        allocated += whole;
    }
    auto left = target - allocated;
    if (left != 0) {
        std::ranges::sort(ranks, [&](const auto& a, const auto& b) {
            if (a.remainder != b.remainder) return a.remainder > b.remainder;
            if (tie == PopulationTie::input_order) return a.index < b.index;
            const auto& first = bins[a.index];
            const auto& second = bins[b.index];
            return same_key(first, second) ? a.index < b.index : key_less(state.populationVocabulary, first, second);
        });
        for (const auto ranked : ranks) {
            if (left == 0) break;
            auto& count = output[ranked.index].count;
            if (tie == PopulationTie::input_order && count == bins[ranked.index].count) continue;
            count = count_from_number(double(count) + 1);
            --left;
        }
    }
    std::erase_if(output, [](const auto& bin) { return bin.count == 0; });
}

void remove_population(std::span<PopulationBin> bins, std::span<const PopulationBin> selected,
                       std::vector<PopulationBin>& removed)
{
    removed.clear();
    for (const auto& selection : selected) {
        const auto source = std::ranges::find_if(bins, [&](const auto& bin) { return same_key(bin, selection); });
        if (source == bins.end()) continue;
        const auto count = std::min(source->count, selection.count);
        if (!count) continue;
        source->count = count_from_number(double(source->count) - double(count));
        removed.push_back({selection.residency, selection.key, count});
    }
}

namespace {

auto summarize_population(const PopulationVocabulary& vocabulary, std::span<const PopulationBin> bins,
                          LedgerScratch& scratch)
{
    std::array<std::size_t, 2> sizes{};
    for (auto& summaries : scratch.summaries)
        for (auto& summary : summaries) clear_cohort(summary);
    std::uint64_t siteTotal = 0;
    for (const auto& bin : bins) {
        if (!bin.count) continue;
        if (bin.count > UINT64_MAX - siteTotal) throw std::invalid_argument("population total exceeds native range");
        siteTotal += bin.count;
        const auto index = static_cast<std::size_t>(bin.residency);
        ++sizes[index];
        auto& summaries = scratch.summaries[index];
        const auto stage = rank(vocabulary.stages, bin.key.kind);
        const auto specialty = rank(vocabulary.specialties, bin.key.specialty);
        accumulate(summaries[0], stage, bin);
        if (specialty != 0) accumulate(summaries[specialty], stage, bin);
    }
    // Check the browser-rounded summary values before publishing any rows.
    for (auto& summaries : scratch.summaries) {
        std::ranges::sort(summaries[0].elders, {}, &ElderCohort::age);
        for (const auto& summary : summaries) {
            count_from_number(summary.children);
            count_from_number(summary.adults);
        }
    }
    return sizes;
}

}

void write_population_bins(RuntimeState& state, SiteId site, std::span<const PopulationBin> bins,
                           LedgerScratch& scratch, bool joint)
{
    if (joint) {
        merge_population(state.populationVocabulary, bins, scratch);
        bins = scratch.merged;
    }
    const auto sizes = summarize_population(state.populationVocabulary, bins, scratch);
    auto& population = site_at(state, site).detailedState.populationByClass;
    const std::array classes{&population.villager, &population.stranger};
    auto& index = state.indexes.sites.at(site.value);
    std::array<Range<JointCohort>, 2> joints;
    std::array<std::array<Range<ElderCohort>, 3>, 2> ages;
    for (std::size_t c = 0; c < classes.size(); ++c) {
        auto& cohort = *classes[c];
        auto& summaries = scratch.summaries[c];
        // Browser sorts the class totals by numeric age. The specialist
        // columns preserve first occurrence in the sorted joint bins.
        if (joint) {
            seed_storage(index.jointStorage[c], cohort.joint.value_or(Range<JointCohort>{}));
            joints[c] = acquire_rows(state.tables.table<JointCohort>(), index.jointStorage[c], sizes[c]);
        }
        const std::array current{cohort.eldersByAge, cohort.specialists.scholar.eldersByAge,
                                 cohort.specialists.warrior.eldersByAge};
        for (std::size_t s = 0; s < summaries.size(); ++s) {
            seed_storage(index.elderStorage[c][s], current[s]);
            ages[c][s] = acquire_rows(state.tables.table<ElderCohort>(), index.elderStorage[c][s], summaries[s].elders.size());
        }
    }
    state.jointCounts.resize(state.tables.rows<JointCohort>().size());

    std::array next{joints[0].begin, joints[1].begin};
    if (joint) {
        for (const auto& bin : bins) {
            const auto row = next[static_cast<std::size_t>(bin.residency)]++;
            state.tables.rows<JointCohort>()[row] = bin.key;
            state.jointCounts[row] = bin.count;
        }
    }
    for (std::size_t c = 0; c < classes.size(); ++c) {
        auto& cohort = *classes[c];
        if (joint) cohort.joint = joints[c];
        const auto& summaries = scratch.summaries[c];
        copy_cohort(cohort, summaries[0], ages[c][0], state);
        copy_cohort(cohort.specialists.scholar, summaries[1], ages[c][1], state);
        copy_cohort(cohort.specialists.warrior, summaries[2], ages[c][2], state);
    }
    refresh_site_population_index(state, site);
}

PopulationComposition write_population_composition(RuntimeState& state, std::span<const PopulationBin> bins,
                                                   bool joint, LedgerScratch& scratch,
                                                   std::uint32_t& jointCursor, std::uint32_t& elderCursor)
{
    if (joint) {
        merge_population(state.populationVocabulary, bins, scratch);
        bins = scratch.merged;
    }
    const auto sizes = summarize_population(state.populationVocabulary, bins, scratch);
    PopulationComposition composition;
    const std::array classes{&composition.villager, &composition.stranger};
    for (std::size_t c = 0; c < classes.size(); ++c) {
        auto& cohort = *classes[c];
        if (joint) {
            const auto end = jointCursor + static_cast<std::uint32_t>(sizes[c]);
            cohort.joint = Range<JointCohort>{jointCursor, end};
            for (const auto& bin : bins) {
                if (static_cast<std::size_t>(bin.residency) != c) continue;
                state.tables.rows<JointCohort>()[jointCursor] = bin.key;
                state.jointCounts[jointCursor++] = bin.count;
            }
        }
        const auto copy = [&](auto& target, const Cohort& source) {
            const auto end = elderCursor + static_cast<std::uint32_t>(source.elders.size());
            copy_cohort(target, source, {elderCursor, end}, state);
            elderCursor = end;
        };
        const auto& summaries = scratch.summaries[c];
        copy(cohort, summaries[0]);
        copy(cohort.specialists.scholar, summaries[1]);
        copy(cohort.specialists.warrior, summaries[2]);
    }
    return composition;
}

CohortView cohort_view(const RuntimeState& state, const AgeCounts& counts)
{
    return {double(counts.children), double(counts.adults), state.tables.view(counts.eldersByAge)};
}

CohortView cohort_view(const RuntimeState& state, const PopulationClass& population)
{
    return {double(population.children), double(population.adults), state.tables.view(population.eldersByAge)};
}

double cohort_total(CohortView cohort)
{
    double elders = 0;
    for (const auto& elder : cohort.elders) elders += double(elder.count);
    return (cohort.children + cohort.adults) + elders;
}

void add_age_cohort(Cohort& target, CohortView source, int sign, CohortScratch& scratch)
{
    auto& ages = scratch.ages;
    ages.clear();
    for (const auto& elder : target.elders) {
        const auto found = std::ranges::find(ages, elder.age, &std::pair<std::uint64_t, double>::first);
        if (found == ages.end()) ages.emplace_back(elder.age, double(elder.count));
        else found->second = double(elder.count);
    }
    for (const auto& elder : source.elders) {
        const auto found = std::ranges::find(ages, elder.age, &std::pair<std::uint64_t, double>::first);
        const auto delta = sign * double(elder.count);
        if (found == ages.end()) ages.emplace_back(elder.age, delta);
        else found->second += delta;
    }
    std::ranges::sort(ages, {}, &std::pair<std::uint64_t, double>::first);
    target.children += sign * source.children;
    target.adults += sign * source.adults;
    target.elders.clear();
    for (const auto [age, count] : ages)
        if (count > 0) target.elders.push_back({age, count_from_number(count)});
}

void split_specialist_cohorts(const RuntimeState& state, const PopulationClass& population,
                              std::array<Cohort, 3>& parts, CohortScratch& scratch)
{
    load(parts[0], cohort_view(state, population));
    load(parts[1], cohort_view(state, population.specialists.scholar));
    load(parts[2], cohort_view(state, population.specialists.warrior));
    add_age_cohort(parts[0], view(parts[1]), -1, scratch);
    add_age_cohort(parts[0], view(parts[2]), -1, scratch);
}

void combine_specialist_cohorts(const std::array<Cohort, 3>& parts, Cohort& combined, CohortScratch& scratch)
{
    clear_cohort(combined);
    for (const auto& part : parts) add_age_cohort(combined, view(part), 1, scratch);
}

void write_legacy_cohorts(RuntimeState& state, SiteId site, Residency residency,
                          const std::array<Cohort, 3>& parts, const Cohort& combined)
{
    auto& populations = site_at(state, site).detailedState.populationByClass;
    auto& population = residency == Residency::villager ? populations.villager : populations.stranger;
    auto& storage = state.indexes.sites[site.value].elderStorage[static_cast<std::size_t>(residency)];
    auto& table = state.tables.table<ElderCohort>();
    seed_storage(storage[0], population.eldersByAge);
    seed_storage(storage[1], population.specialists.scholar.eldersByAge);
    seed_storage(storage[2], population.specialists.warrior.eldersByAge);
    copy_cohort(population, combined, acquire_rows(table, storage[0], combined.elders.size()), state);
    copy_cohort(population.specialists.scholar, parts[1],
                acquire_rows(table, storage[1], parts[1].elders.size()), state);
    copy_cohort(population.specialists.warrior, parts[2],
                acquire_rows(table, storage[2], parts[2].elders.size()), state);
}

}
