#include "sim/territory/territory.hpp"
#include "sim/territory/detail.hpp"

#include "sim/practice/stock.hpp"
#include "sim/settlement/prelude.hpp"

#include <algorithm>
#include <charconv>
#include <cmath>

namespace waffle::sim::territory {
namespace {

constexpr std::string_view path = "territorial control";
constexpr double claim = .75;

template<class K>
K intern(RuntimeState& state, std::string_view name)
{
    return state.intern<K>(name, path);
}

void install_board(RuntimeState& state, Site& site, NeutralMarket& market, FactionId faction)
{
    const auto cards = state.tables.view(market.practices.value_or(Range<PracticeId>{}));
    auto& board = site.detailedState.practiceSlots;
    board = {};
    board.rows = state.tables.table<PracticeSlot>().append(cards.size(), path);
    state.practiceStock.resize(board.rows.end);
    state.practiceCharge.resize(board.rows.end);
    auto& nextId = state.hot.civilization.nextPracticeInstanceId;
    if (!nextId) nextId = 1;
    for (std::size_t i = 0; i < cards.size(); ++i) {
        const auto row = Index<PracticeSlot>{board.rows.begin + static_cast<std::uint32_t>(i)};
        board.slots.at(i) = row;
        const auto& def = practice::detail::definition(state, cards[i]);
        constexpr std::string_view prefix = "institution:";
        std::array<char, 40> buffer;
        const auto start = std::ranges::copy(prefix, buffer.data()).out;
        const auto end = std::to_chars(start, buffer.data() + buffer.size(), static_cast<std::uint64_t>((*nextId)++)).ptr;
        const std::string_view instance(buffer.data(), end);
        state.tables.at(row) = {.practiceId = cards[i], .tier = browser::Quality::bronze,
            .instanceId = intern<InstanceId>(state, instance), .slot = static_cast<std::uint32_t>(i)};
        if (def.category == content::Category::influence) state.tables.at(row).allegiance = faction;
        else state.practiceStock[row.value] = 0;
    }
    auto& local = site.detailedState;
    local.unlockedPracticeSlots = std::max(local.unlockedPracticeSlots, static_cast<std::uint32_t>(cards.size()));
    auto& structures = local.structureSlots;
    if (state.territory.tenement && structures.footprint.size() >= 2) {
        const auto prior = state.tables.view(structures.origins);
        const bool replace = !prior.empty() && prior.front().origin == 0;
        const auto origins = state.tables.table<StructureCell>().append(prior.size() + !replace, path);
        auto cells = state.tables.view(origins);
        const auto old = state.tables.view(structures.origins).subspan(replace ? 1 : 0);
        std::ranges::copy(old, cells.begin() + 1);
        std::string placement(state.name(site.regionId));
        placement += ":housing";
        cells.front() = {.structureId = state.territory.tenement, .width = 2,
                         .placementId = intern<InstanceId>(state, placement)};
        structures.origins = origins;
        auto footprint = state.tables.view(structures.footprint);
        std::ranges::fill(footprint, Index<StructureCell>{});
        for (std::size_t i = 0; i < cells.size(); ++i) {
            const auto cell = Index<StructureCell>{origins.begin + static_cast<std::uint32_t>(i)};
            for (std::size_t p = cells[i].origin; p < cells[i].origin + cells[i].width; ++p)
                footprint[p] = cell;
        }
    }
    for (auto& goods : state.tables.view(market.stocks)) {
        const auto traits = state.tables.view(goods.traits);
        for (const auto row : board.slots) {
            if (!row || !state.practiceStock[row.value]) continue;
            const auto& def = practice::detail::definition(state, state.tables.at(row).practiceId);
            if (!practice::detail::intersects(traits, state.compiledContent->tables.view(def.stockTraits))) continue;
            auto& stock = *state.practiceStock[row.value];
            const auto amount = std::min(goods.stock, std::max(0.0, practice::detail::stock_capacity(state, site, row, false) - stock));
            stock += amount;
            goods.stock -= amount;
        }
        goods.stock = 0;
    }
}

Index<NeutralMarket> clone_market(RuntimeState& state, Index<NeutralMarket> source, Index<NeutralMarket> spare)
{
    auto market = state.tables.at(source);
    const auto reusable = spare && state.tables.at(spare).stocks.size() == market.stocks.size();
    const auto stocks = reusable ? state.tables.at(spare).stocks
        : state.tables.table<NeutralStock>().append(market.stocks.size(), path);
    std::ranges::copy(state.tables.view(market.stocks), state.tables.view(stocks).begin());
    auto& labels = state.practiceVocabulary.marketLabels;
    if (labels.size() < stocks.end) labels.resize(stocks.end);
    for (std::uint32_t i = 0; i < stocks.size(); ++i) labels[stocks.begin + i] = labels[market.stocks.begin + i];
    market.stocks = stocks;
    const auto row = reusable ? spare : Index<NeutralMarket>{state.tables.table<NeutralMarket>().append(1, path).begin};
    state.tables.at(row) = market;
    return row;
}

void transition_town(RuntimeState& state, Site& site, FactionId faction)
{
    if (!site.town) return;
    auto& town = *site.town;
    if (faction == state.practiceVocabulary.frontier) {
        if (!site.neutral && town.market) {
            site.neutral = clone_market(state, *town.market, state.territory.marketSpare[site.id.value]);
            state.territory.marketSpare[site.id.value] = {};
            state.territory.sitesDirty = true;
        }
        return;
    }
    const auto storefront = site.neutral ? site.neutral : (!town.activated ? town.market : std::nullopt);
    if (!storefront) return;
    site.neutral.reset();
    if (town.market && town.market != storefront) state.territory.marketSpare[site.id.value] = *town.market;
    town.market = storefront;
    state.territory.sitesDirty = true;
    if (town.activated) return;
    town.activated = true;
    install_board(state, site, state.tables.at(*storefront), faction);
}

void emit_control(RuntimeState& state, RegionId id, FactionId previous, FactionId faction, bool military = false)
{
    practice::EventData event{};
    event.fields.previousController = browser::OptionalNullable<FactionId>{previous};
    event.fields.faction = browser::OptionalNullable<FactionId>{faction};
    event.fields.military = military;
    practice::emit(state, state.territory.controlChanged, id, event);
}

void change_controller(RuntimeState& state, Site& site, FactionId faction, bool military = false)
{
    auto& region = region_at(state, site.regionId);
    if (region.controller == faction) return;
    const auto previous = region.controller;
    region.controller = faction;
    transition_town(state, site, faction);
    site.detailedState.control = DetailedSettlementControl{};
    emit_control(state, site.regionId, previous, faction, military);
}

void begin_unrest(RuntimeState& state, Site& site)
{
    auto& region = region_at(state, site.regionId);
    auto& local = site.detailedState;
    const auto previous = region.controller;
    const auto frontier = state.practiceVocabulary.frontier;
    region.controller = frontier;
    const auto& settings = state.content->config.settings.values;
    const auto until = state.hot.tSec + settings.unrestDurationYears * (4 * settings.seasonDurationSec);
    local.control = DetailedSettlementControl{ControlUnrest{state.hot.tSec, until, previous}};
    if (!local.garrison) local.garrison.emplace();
    local.garrison->supportTargetRegionId = browser::OptionalNullable<RegionId>{std::nullopt};
    emit_control(state, site.regionId, previous, frontier);
    practice::EventData event{};
    event.fields.previousController = browser::OptionalNullable<FactionId>{previous};
    event.fields.untilSec = until;
    practice::emit(state, state.territory.unrestStarted, site.regionId, event);
}

struct LocalForce {
    Force military;
    bool supplied{}, adjacent{}, network{};
    double adjacentBonus{};
};

LocalForce local_force(const RuntimeState& state, RegionId region, FactionId faction, bool assumeSupplied = false)
{
    const auto* site = site_at_region(state, region);
    if (!site) return {};
    if (site->neutral) return {{.defense = state.tables.at(*site->neutral).defense}};
    if (site->simulationMode != state.territory.detailed) return {};
    LocalForce result{};
    auto& force = result.military;
    const auto& local = site->detailedState;
    for (const auto residency : {settlement::Residency::villager, settlement::Residency::stranger}) {
        const auto bins = settlement::population_bins(state, local.populationByClass, residency);
        for (std::size_t i = 0; i < bins.size(); ++i) {
            const auto& bin = bins.keys[i];
            if (bin.specialty != state.populationVocabulary.specialties[2] ||
                bin.kind == state.populationVocabulary.stages[1] ||
                (faction != state.practiceVocabulary.frontier && bin.allegiance != faction)) continue;
            force.warriors += static_cast<double>(bins.counts[i]);
            if (bin.kind == state.populationVocabulary.stages[0]) force.adultWarriors += static_cast<double>(bins.counts[i]);
        }
    }
    result.supplied = assumeSupplied || (local.garrison && local.garrison->supplied == true);
    double arms = 0;
    if (force.warriors > 0 && result.supplied) {
        for (const auto row : local.practiceSlots.slots) {
            if (!row || !state.practiceStock[row.value]) continue;
            const auto& def = practice::detail::definition(state, state.tables.at(row).practiceId);
            if (practice::detail::has(state.compiledContent->tables.view(def.stockTraits), state.territory.arms))
                arms += *state.practiceStock[row.value];
        }
    }
    double occupation = 0, defense = 0, uncommitted = force.warriors;
    using content::ModifierKind;
    if (force.warriors > 0) for (const auto& mod : practice::detail::modifiers(state, *site)) {
        if (mod.def->kind == ModifierKind::networkGarrison) result.network = true;
        if (mod.def->kind == ModifierKind::occupation) {
            if (mod.def->adjacent.value_or(false)) {
                result.adjacent = true;
                result.adjacentBonus += mod.amount;
            }
            const auto warriors = mod.def->warriors.value_or(1);
            if (arms > 0 && uncommitted >= warriors && arms >= mod.def->arms.value_or(1)) {
                occupation += mod.amount;
                uncommitted -= warriors;
            }
        }
        if (mod.def->kind == ModifierKind::localDefense && arms > 0) defense += mod.amount;
    }
    if (result.supplied && local.politicalForce) {
        for (const auto& entry : state.tables.view(*local.politicalForce)) {
            const auto& effect = entry.value;
            if (effect.allegiance.has_key() && effect.allegiance.value() == faction && effect.untilSec > state.hot.tSec)
                (effect.defenseOnly ? defense : occupation) += effect.amount;
        }
    }
    force.force = force.warriors + (result.supplied ? occupation : 0);
    force.defense = force.force + (result.supplied ? defense : 0);
    return result;
}

RegionId support_target(const RuntimeState& state, RegionId region)
{
    const auto* site = settlement::detailed_site(state, region);
    if (!site || !site->detailedState.garrison) return {};
    const auto& target = site->detailedState.garrison->supportTargetRegionId;
    return target.has_key() ? target.value().value_or(RegionId{}) : RegionId{};
}

Force sent_force(const RuntimeState& state, RegionId source, RegionId target, const LocalForce& base)
{
    const auto holder = region_at(state, source).controller;
    if (!target || !base.military.warriors || (!base.network && !base.adjacent) ||
        (holder != state.practiceVocabulary.player && holder != state.practiceVocabulary.external) ||
        region_at(state, target).controller != holder || !settlement::detailed_site(state, target) ||
        !practice::detail::has(neighbors(state, source), target) ||
        !practice::detail::has(roads(state, source), target)) return {};
    const auto warriors = base.network ? base.military.warriors : 1;
    const auto suppliedBonus = base.supplied ? base.adjacentBonus : 0;
    return {.warriors = warriors, .adultWarriors = std::min(base.military.adultWarriors, warriors),
        .force = base.network ? base.military.force : std::min(base.military.force, warriors + suppliedBonus)};
}

}

void prepare(RuntimeState& state)
{
    auto& c = state.territory;
    c.detailed = intern<SiteModeId>(state, "detailed");
    c.ruin = intern<SiteModeId>(state, "ruin");
    c.arms = intern<TraitId>(state, "Arms");
    c.tenement = state.find_id<StructureId>("fm_crowdedTenement");
    c.controlChanged = intern<EventKindId>(state, "controlChanged");
    c.unrestStarted = intern<EventKindId>(state, "unrestStarted");
    c.unrestEnded = intern<EventKindId>(state, "unrestEnded");
    c.raidResolved = intern<EventKindId>(state, "raidResolved");
    c.evacuation = intern<EventKindId>(state, "evacuation");
    c.defense = intern<EventKindId>(state, "defense");
    c.populationRescued = intern<EventKindId>(state, "populationRescued");
    c.held = intern<SymbolId>(state, "held");
    c.lost = intern<SymbolId>(state, "lost");
    c.advance = intern<SymbolId>(state, "advance");
    c.expand = intern<SymbolId>(state, "expand");
    c.spawn = intern<SymbolId>(state, "spawn");
    c.strengthen = intern<SymbolId>(state, "strengthen");
    c.creep = intern<SymbolId>(state, "creep");
    c.direct = intern<SymbolId>(state, "direct");
    constexpr std::array outcomes{"intercepted", "expanded", "appeared", "strengthened", "blocked"};
    for (std::size_t i = 0; i < outcomes.size(); ++i) c.spawnOutcomes[i] = intern<SymbolId>(state, outcomes[i]);
    const auto count = state.hot.world.sites.size();
    c.unrest.reserve(count);
    c.transfers.reserve(count);
    c.marketSpare.resize(count);
    // A town may reopen as a storefront. Its first transition clones stock
    // rows; subsequent control changes recycle the spare market.
    std::size_t markets = 0, stocks = 0;
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        if (!site.town || !site.town->market) continue;
        ++markets;
        stocks += state.tables.at(*site.town->market).stocks.size();
    }
    auto& stockRows = state.tables.rows<NeutralStock>();
    auto& marketRows = state.tables.rows<NeutralMarket>();
    stockRows.reserve(stockRows.size() + stocks);
    marketRows.reserve(marketRows.size() + markets);
    state.practiceVocabulary.marketLabels.reserve(stockRows.size() + stocks);
    c.supportSources.reserve(state.hot.world.regions.size());
    state.indexes.detailedSites.reserve(count);
    state.indexes.activeSites.reserve(count);
}

void synchronize_sites(RuntimeState& state)
{
    if (!state.territory.sitesDirty) return;
    state.territory.sitesDirty = false;
    auto& index = state.indexes;
    index.detailedSites.clear();
    index.activeSites.clear();
    std::ranges::fill(index.detailedSitesByRegion, SiteId{});
    for (const auto& site : state.tables.view(state.hot.world.sites)) {
        if (site.simulationMode != state.territory.detailed) continue;
        index.detailedSites.push_back(site.id);
        auto& first = index.detailedSitesByRegion[site.regionId.value];
        if (!first) first = site.id;
        if (!site.neutral) index.activeSites.push_back(site.id);
    }
    practice::rebuild_listeners(state);
}

bool can_assign_garrison(const RuntimeState& state, RegionId source)
{
    return state.hot.rulesetId && settlement::detailed_site(state, source) &&
        region_at(state, source).controller == state.practiceVocabulary.player;
}

GarrisonTarget garrison_target(const RuntimeState& state, const Site& source, RegionId target)
{
    if (!target || !settlement::detailed_site(state, target)) return GarrisonTarget::noSettlement;
    if (region_at(state, target).controller != state.practiceVocabulary.player) return GarrisonTarget::notAllied;
    if (!practice::detail::has(neighbors(state, source.regionId), target) ||
        !practice::detail::has(roads(state, source.regionId), target)) return GarrisonTarget::notConnected;
    using content::ModifierKind;
    constexpr auto kinds = content::mask_bit(ModifierKind::networkGarrison) | content::mask_bit(ModifierKind::occupation);
    for (const auto& mod : practice::detail::modifiers(state, source, kinds)) {
        if (mod.def->kind == ModifierKind::networkGarrison ||
            (mod.def->kind == ModifierKind::occupation && mod.def->adjacent.value_or(false)))
            return GarrisonTarget::eligible;
    }
    return GarrisonTarget::noSupportingStructure;
}

SiteId first_player_site(const RuntimeState& state)
{
    for (const auto id : settlement::detailed_sites(state)) {
        const auto& site = settlement::site_at(state, id);
        if (site.simulationMode == state.territory.detailed &&
            region_at(state, site.regionId).controller == state.practiceVocabulary.player) return id;
    }
    return {};
}

void occupy_campaign_site(RuntimeState& state, Site& site)
{
    if (site.simulationMode != state.territory.detailed) state.territory.sitesDirty = true;
    site.simulationMode = state.territory.detailed;
    region_at(state, site.regionId).detailedSettlementEnabled = true;
    if (auto& turn = state.hot.civilization.currentMoonTurn)
        settlement::ensure_moon_region_result(state, *turn, site.regionId);
    change_controller(state, site, state.practiceVocabulary.player, true);
    synchronize_sites(state);
    ++state.hot.civilization.history.conquests;
}

Force military(const RuntimeState& state, RegionId region, FactionId faction, SupportVisitor visitor, void* context,
               bool assumeSupplied)
{
    const auto base = local_force(state, region, faction, assumeSupplied);
    auto result = base.military;
    const auto sent = sent_force(state, region, support_target(state, region), base);
    result.sentWarriors = sent.warriors;
    result.sentAdultWarriors = sent.adultWarriors;
    result.force = std::max(0.0, result.force - sent.force);
    result.defense = std::max(0.0, result.defense - sent.force);
    if (visitor && result.force > 0) visitor(region, result.force, context);
    for (const auto source : neighbors(state, region)) {
        if (region_at(state, source).controller != faction || support_target(state, source) != region) continue;
        const auto incoming = sent_force(state, source, region, local_force(state, source, faction));
        result.received += incoming.force;
        if (visitor && incoming.force > 0) visitor(source, incoming.force, context);
    }
    result.force += result.received;
    result.defense += result.received;
    return result;
}

Resistance resistance(const RuntimeState& state, const Site& site, FactionId holder)
{
    Resistance result{};
    for (const auto entry : settlement::faction_totals(state, site.id)) {
        result.total += entry.value;
        if (entry.key == holder) result.loyal = entry.value;
    }
    for (const auto residency : {settlement::Residency::villager, settlement::Residency::stranger}) {
        const auto bins = settlement::population_bins(state, site.detailedState.populationByClass, residency);
        for (std::size_t i = 0; i < bins.size(); ++i) {
            const auto& bin = bins.keys[i];
            if (bin.allegiance == holder) continue;
            const auto weight = bin.allegiance == state.practiceVocabulary.neutral ? 1 :
                bin.specialty == state.populationVocabulary.specialties[2] && bin.kind != state.populationVocabulary.stages[1] ? 10 : 2;
            result.units += static_cast<double>(bins.counts[i]) * weight;
        }
    }
    return result;
}

double holding_pressure(Resistance pop)
{
    const auto disloyal = pop.total - pop.loyal;
    return pop.total * (disloyal > 0 ? pop.units / disloyal : 1) / 10;
}

void resolve_control(RuntimeState& state)
{
    if (!state.hot.rulesetId) return;
    const auto frontier = state.practiceVocabulary.frontier;
    auto& pending = state.territory;
    pending.unrest.clear();
    pending.transfers.clear();
    // A change to a holder can retract a neighbor's garrison contribution.
    // Decide all holdings against the same pre-transition board.
    for (const auto id : settlement::detailed_sites(state)) {
        auto& site = settlement::site_at(state, id);
        auto& control = site.detailedState.control;
        if (!control) control.emplace();
        if (control->unrest) continue;
        const auto holder = region_at(state, site.regionId).controller;
        const auto counts = settlement::faction_totals(state, id);
        double total = 0, loyal = 0;
        for (const auto entry : counts) {
            total += entry.value;
            if (entry.key == holder) loyal = entry.value;
        }
        bool occupied = false;
        if (holder != frontier && total > 0 && loyal / total < retaining_share) {
            if (loyal > 0) {
                const auto force = military(state, site.regionId, holder).force;
                const auto share = retaining_share / (1 + std::max(0.0, force) / holding_pressure(resistance(state, site, holder)));
                occupied = force > 0 && loyal >= std::max(1.0, std::ceil(total * share - 1e-9));
            }
            if (!occupied) {
                pending.unrest.push_back(id);
                continue;
            }
        }
        FactionId claimant;
        // At most one faction can reach the peaceful-claim share.
        if (total > 0) for (const auto entry : counts) {
            if (entry.key != holder && entry.key != state.practiceVocabulary.neutral && entry.value / total >= claim) {
                claimant = entry.key;
                break;
            }
        }
        control->claimChecks = claimant && !occupied ? (control->claimant == claimant ? control->claimChecks + 1 : 1) : 0;
        control->claimant = claimant ? std::optional(claimant) : std::nullopt;
        if (total == 0) pending.transfers.push_back({id, frontier});
        else if (control->claimChecks >= 2) pending.transfers.push_back({id, claimant});
    }
    for (const auto id : pending.unrest) begin_unrest(state, settlement::site_at(state, id));
    for (const auto transfer : pending.transfers)
        change_controller(state, settlement::site_at(state, transfer.site), transfer.faction);
    if (!first_player_site(state)) end_run(state, browser::RunEndReason::territorialLoss);
}

void finish_unrest_expiry(RuntimeState& state, Site& site)
{
    site.detailedState.control = DetailedSettlementControl{};
    transition_town(state, site, state.practiceVocabulary.frontier);
    practice::emit(state, state.territory.unrestEnded, site.regionId);
}

}
