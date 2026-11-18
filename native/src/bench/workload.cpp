#include "workload.hpp"

#include <algorithm>
#include <bit>
#include <cmath>
#include <map>
#include <stdexcept>
#include <string_view>
#include <utility>

namespace waffle::bench {
namespace {

using core::json::Value;
constexpr Id missing = UINT32_MAX;
constexpr Id child = 0, adult = 1, elder = 2, scholar = 1;
constexpr std::array phases{"birth", "food", "housing", "faith", "migration", "death", "season"};

const Value& field(const Value& value, std::string_view key)
{
    if (const auto* found = value.find(key)) return *found;
    throw std::runtime_error("missing benchmark input field " + std::string(key));
}

std::string_view name(const Value& value, std::string_view key)
{
    if (value.kind() == Value::Kind::null) return {};
    const auto* found = value.find(key);
    return found && found->kind() != Value::Kind::null ? found->as_string() : std::string_view{};
}

Id units(const Value& value, std::string_view key, Id fallback = 0)
{
    const auto* found = value.find(key);
    if (!found || found->kind() == Value::Kind::null) return fallback;
    const double number = found->as_number();
    if (number < 0 || number >= missing || std::floor(number) != number)
        throw std::runtime_error("expected integer in benchmark input field " + std::string(key));
    return static_cast<Id>(number);
}

template<typename T>
Id count(const std::vector<T>& values) { return static_cast<Id>(values.size()); }

template<typename T>
std::size_t bytes(const std::vector<T>& values) { return sizeof(T) * values.capacity(); }

using Names = std::map<std::string_view, Id>;

Id intern(Names& names, std::string_view key)
{
    return names.try_emplace(key, static_cast<Id>(names.size())).first->second;
}

Mask trait_mask(Names& names, const Value& array)
{
    Mask result = 0;
    for (const auto& entry : array.as_array()) {
        const auto id = intern(names, entry.as_string());
        if (id >= 64) throw std::runtime_error("benchmark supports at most 64 Stock traits");
        result |= Mask{1} << id;
    }
    return result;
}

void schedule(World& world, Id slot, std::string_view type)
{
    const auto phase = std::find_if(phases.begin(), phases.end(), [&](auto key) { return key == type; });
    if (phase != phases.end()) world.scheduled[phase - phases.begin()].push_back(slot);
}

void sample_people(State& state, const World& world, Scratch& scratch, bool births)
{
    for (Id site = 0; site < count(world.sites); ++site) {
        const auto& def = world.sites[site];
        if (!def.active || def.market) continue;
        using Counts = std::array<Id, 3>;
        std::array<std::array<Counts, 3>, 2> groups{};
        for (Id b = def.bins.begin; b < def.bins.end; ++b) {
            const auto& bin = world.bins[b];
            groups[bin.residency][bin.specialty][bin.kind] += state.populations[b];
        }
        Id result = 0;
        const auto roll = [&](Id population, double probability) {
            scratch.draws += population;
            for (Id person = 0; person < population; ++person)
                result += core::rng_next_float(state.clock.rng) < probability;
        };
        for (const auto& residency : groups) for (const auto& g : residency) {
            if (births) {
                roll(g[adult], 0.025);
                roll(g[child], 0.02);
                roll(g[adult], 0.01);
            } else {
                roll(g[elder], 0.03);
            }
        }
        // Keep the captured census stable across samples. The roll output is observable.
        state.sites[site].sample = result;
    }
}

bool plan_recipe(State& state, const World& world, Scratch& scratch, Id slot, bool shared)
{
    const auto& host = world.slots[slot];
    const auto& recipe = world.recipes[host.recipe];
    const auto& site = world.sites[host.site];
    scratch.debits.clear();
    for (Id c = recipe.costs.begin; c < recipe.costs.end; ++c) {
        const auto& cost = world.costs[c];
        Id needed = cost.amount;
        const auto scan = [&](Range stock) {
            for (Id provider = stock.begin; provider < stock.end && needed != 0; ++provider) {
                if (!(cost.traits & world.recipes[world.slots[provider].recipe].traits)) continue;
                Id available = state.slots[provider].stock;
                if (cost.consume) {
                    const auto debit = std::find_if(scratch.debits.begin(), scratch.debits.end(),
                        [&](const Debit& entry) { return entry.slot == provider; });
                    if (debit != scratch.debits.end()) {
                        const Id taken = std::min(needed, available - debit->amount);
                        debit->amount += taken;
                        needed -= taken;
                        continue;
                    }
                }
                const Id taken = std::min(needed, available);
                if (!taken) continue;
                if (cost.consume) scratch.debits.push_back({provider, taken});
                needed -= taken;
            }
        };
        scan(site.stock);
        if (shared && needed) {
            const Id beneficiary = recipe.influence ? host.faction : site.controller;
            for (bool markets : {false, true}) {
                for (Id i = site.roads.begin; i < site.roads.end && needed; ++i) {
                    const auto& provider = world.sites[world.roads[i]];
                    ++scratch.shared_visits;
                    if (provider.active && provider.market == markets &&
                        (markets || provider.controller == beneficiary))
                        scan(provider.stock);
                }
            }
        }
        if (needed) return false;
    }
    for (const auto& debit : scratch.debits) state.slots[debit.slot].stock -= debit.amount;
    auto& output = state.slots[slot].stock;
    output = std::min(recipe.capacity, output + recipe.output + (recipe.output ? state.slots[slot].workers : 0));
    return true;
}

void scheduled(State& state, const World& world, Scratch& scratch, Phase phase)
{
    scratch.retry.clear();
    for (const auto slot : world.scheduled[phase])
        if (!plan_recipe(state, world, scratch, slot, false)) scratch.retry.push_back(slot);
    for (const auto slot : scratch.retry) plan_recipe(state, world, scratch, slot, true);
}

}

Scenario load(const Value& source, Id scale)
{
    Scenario result;
    auto& [world, state] = result;
    Names traits, factions, recipes, regions;
    world.edible = Mask{1} << intern(traits, "Edible");
    world.currency = Mask{1} << intern(traits, "Currency");
    intern(factions, "neutral");
    const auto& config = field(source, "gameConfig");
    const auto& settings = field(field(config, "settings"), "values");
    const auto& pieces = field(config, "gamepieces");
    const auto& practice_defs = field(pieces, "practices");
    const auto& structure_defs = field(pieces, "structures");
    world.season_duration = field(source, "seasonDurationSec").as_number();
    world.season_count = static_cast<Id>(field(source, "seasons").as_array().size());
    world.phase_duration = std::max(Id{1}, units(settings, "phaseDurationSec", 1));
    world.people_per_worker = std::max(Id{1}, units(settings, "populationPerToken"));
    const auto& rng = field(source, "rng");
    state.clock = {{field(rng, "seed").as_number(), field(rng, "baseSeed").as_number(),
        field(rng, "vassalSeed").as_number(), field(rng, "vassalDevelopmentSeed").as_number(),
        field(rng, "vassalLifeMapSeed").as_number(), field(rng, "vassalPortraitSeed").as_number()},
        field(source, "seasonClockSec").as_number(), field(source, "simTime").as_number(), units(source, "tSec"),
        units(source, "currentSeasonIndex"), units(source, "year")};

    const auto& data = field(source, "world");
    std::vector<Id> controllers;
    for (const auto& region : field(data, "regions").as_array()) {
        intern(regions, name(region, "id"));
        controllers.push_back(intern(factions, name(region, "controller")));
    }
    const auto& sites = field(data, "sites").as_array();
    // Keep two index spaces. The fixture happens to list both in the same order.
    std::vector<Id> site_by_region(regions.size(), missing);
    for (Id i = 0; i < sites.size(); ++i) site_by_region.at(regions.at(name(sites[i], "regionId"))) = i;
    std::vector<std::vector<Id>> roads(sites.size());
    for (const auto& edge : field(data, "connections").as_array()) {
        const Id a = regions.at(name(edge, "regionAId")), b = regions.at(name(edge, "regionBId"));
        if (site_by_region[a] == missing || site_by_region[b] == missing) continue;
        roads[site_by_region[a]].push_back(b);
        roads[site_by_region[b]].push_back(a);
    }
    for (auto& list : roads) std::sort(list.begin(), list.end());

    for (const auto& def : practice_defs.as_object()) {
        intern(recipes, def.key);
        Recipe recipe{};
        recipe.traits = trait_mask(traits, field(def.value, "stockTraits"));
        recipe.workers = units(def.value, "workerCapacity");
        recipe.capacity = units(def.value, "stockCapacity");
        recipe.influence = name(def.value, "category") == "influence";
        recipe.costs.begin = count(world.costs);
        for (bool consume : {false, true}) {
            for (const auto& cost : field(def.value, consume ? "consume" : "require").as_array())
                world.costs.push_back({trait_mask(traits, field(cost, "traits")), units(cost, "amount", 1), consume});
        }
        recipe.costs.end = count(world.costs);
        for (const auto& effect : field(def.value, "effects").as_array())
            if (name(effect, "op") == "generateStock") {
                // Amount expressions and the remaining effect ops belong to the rule port.
                const auto* amount = effect.find("amount");
                recipe.output += amount && amount->kind() == Value::Kind::number ? units(effect, "amount") : 1;
            }
        if (const auto* charge = def.value.find("charge"); charge && charge->kind() == Value::Kind::object) {
            recipe.charge_threshold = units(*charge, "threshold");
            recipe.charge_gain = units(*charge, "gain");
        }
        world.recipes.push_back(recipe);
    }

    for (Id shard = 0; shard < scale; ++shard) {
        Id cascade_count = 0;
        for (Id i = 0; i < sites.size(); ++i) {
            const auto& entry = sites[i];
            const Id site = count(world.sites);
            const Id region = regions.at(name(entry, "regionId"));
            const auto* market = entry.find("neutral");
            Site def{};
            def.active = name(entry, "simulationMode") == "detailed";
            def.market = market && market->kind() == Value::Kind::object;
            def.controller = controllers[region];
            def.slots.begin = count(world.slots);
            def.bins.begin = count(world.bins);
            def.structures.begin = count(world.structures);
            SiteState site_state{};
            if (def.active) {
                const auto& details = field(entry, "detailedState");
                for (const auto& practice : field(details, "practiceSlots").as_array()) {
                    if (practice.kind() == Value::Kind::null) continue;
                    const auto practice_id = name(practice, "practiceId");
                    const Id recipe = recipes.at(practice_id), slot = count(world.slots);
                    world.slots.push_back({site, recipe, intern(factions, name(practice, "allegiance"))});
                    state.slots.push_back({units(practice, "stock"), units(practice, "charge"), 0});
                    const auto& content = field(practice_defs, practice_id);
                    if (!def.market) {
                        const auto& activation = field(content, "activation");
                        schedule(world, slot, name(activation, "type"));
                        if (const auto* also = activation.find("also"))
                            for (const auto& phase : also->as_array()) schedule(world, slot, phase.as_string());
                        if (const auto* charge = content.find("charge"); charge && charge->kind() == Value::Kind::object)
                            for (const auto& trigger : field(field(*charge, "trigger"), "any").as_array())
                                if (name(trigger, "kind") == "defenseSucceeded")
                                    world.listeners.push_back({slot, defense, 0});
                    }
                }
                for (const auto& structure : field(details, "structureSlots").as_array()) {
                    const auto id = name(structure, "structureId");
                    if (!id.empty()) {
                        const auto capacity = units(field(structure_defs, id), "housing");
                        world.structures.push_back(capacity);
                        site_state.housing += capacity;
                    }
                }
                for (const auto& residency : field(details, "populationByClass").as_object()) {
                    const auto* bins = residency.value.find("joint");
                    if (!bins) continue;
                    for (const auto& bin : bins->as_array()) {
                        const auto kind = name(bin, "kind"), specialty = name(bin, "specialty");
                        const Id population = units(bin, "count");
                        world.bins.push_back({residency.key == "stranger" ? 1u : 0u,
                            intern(factions, name(bin, "allegiance")),
                            specialty == "warrior" ? 2u : specialty == "scholar" ? scholar : 0u,
                            kind == "elder" ? elder : kind == "adults" ? adult : child, units(bin, "age")});
                        state.populations.push_back(population);
                        site_state.people += population;
                    }
                }
            }
            def.slots.end = count(world.slots);
            def.stock = def.slots;
            if (def.active && def.market) {
                def.stock.begin = count(world.slots);
                for (const auto& stock : field(*market, "stocks").as_array()) {
                    world.slots.push_back({site, count(world.recipes), 0});
                    Recipe provider{};
                    provider.traits = trait_mask(traits, field(stock, "traits"));
                    provider.capacity = units(stock, "capacity");
                    world.recipes.push_back(provider);
                    state.slots.push_back({units(stock, "stock"), 0, 0});
                }
                def.stock.end = count(world.slots);
            }
            def.bins.end = count(world.bins);
            def.structures.end = count(world.structures);
            def.roads.begin = count(world.roads);
            for (const Id neighbor : roads[i]) world.roads.push_back(shard * static_cast<Id>(sites.size()) + site_by_region[neighbor]);
            def.roads.end = count(world.roads);
            world.sites.push_back(def);
            state.sites.push_back(site_state);

            // Deliberate stress overlay. The opening has only defense listeners.
            if (cascade_count < 2 && def.active && !def.market && def.slots.size() >= 2) {
                world.listeners.push_back({def.slots.begin, resolved, 0});
                world.listeners.push_back({def.slots.begin + 1, generated,
                    world.recipes[world.slots[def.slots.begin].recipe].traits});
                ++cascade_count;
            }
        }
    }
    world.trait_count = static_cast<Id>(traits.size());
    std::stable_sort(world.listeners.begin(), world.listeners.end(), [&](const auto& a, const auto& b) {
        return std::pair{world.slots[a.slot].site, a.kind} < std::pair{world.slots[b.slot].site, b.kind};
    });
    world.triggers.resize(world.sites.size());
    for (Id l = 0; l < count(world.listeners); ++l) {
        const auto& listener = world.listeners[l];
        auto& range = world.triggers[world.slots[listener.slot].site][listener.kind];
        if (!range.end) range.begin = l;
        range.end = l + 1;
    }
    return result;
}

std::size_t World::buffers_bytes() const
{
    std::size_t scheduled_bytes = 0;
    for (const auto& slots : scheduled) scheduled_bytes += bytes(slots);
    return bytes(sites) + bytes(slots) + bytes(bins) + bytes(roads) + bytes(structures) +
        bytes(recipes) + bytes(costs) + scheduled_bytes + bytes(listeners) + bytes(triggers);
}

Scratch::Scratch(const World& world)
{
    std::size_t max_scheduled = 0;
    for (const auto& phase : world.scheduled) max_scheduled = std::max(max_scheduled, phase.size());
    retry.reserve(max_scheduled);
    debits.reserve(world.slots.size());
    discharged.reserve(world.slots.size());
    events.reserve(world.slots.size() + 2);
}

std::size_t Scratch::buffers_bytes() const
{
    return bytes(retry) + bytes(debits) + bytes(discharged) + bytes(events);
}

bool advance(State& state, const World& world)
{
    ++state.clock.second;
    bool due = false;
    for (int step = 0; step < 60; ++step) {
        state.clock.sim_time += 1.0 / 60.0;
        state.clock.season_clock += 1.0 / 60.0;
        if (state.clock.season_clock >= world.season_duration) {
            state.clock.season_clock -= world.season_duration;
            ++state.clock.season_index;
            if (state.clock.season_index == world.season_count) {
                state.clock.season_index = 0;
                ++state.clock.year;
            }
            due = true;
        }
    }
    return due;
}

void assign_workers(State& state, const World& world)
{
    for (Id site = 0; site < count(world.sites); ++site) {
        const auto& def = world.sites[site];
        if (!def.active || def.market) continue;
        struct Group { Id faction, residency, scholars{}, ordinary{}; };
        std::array<Group, 6> groups{};
        Id used = 0;
        for (Id b = def.bins.begin; b < def.bins.end; ++b) {
            const auto& bin = world.bins[b];
            if (bin.kind == child) continue;
            auto* end = groups.data() + used;
            auto* group = std::find_if(groups.data(), end, [&](const Group& g) {
                return g.faction == bin.faction && g.residency == bin.residency;
            });
            if (group == end) {
                if (used == groups.size()) throw std::runtime_error("too many workforce groups in fixture");
                *group = {bin.faction, bin.residency};
                ++used;
            }
            (bin.specialty == scholar ? group->scholars : group->ordinary) += state.populations[b];
        }
        for (Id s = def.slots.begin; s < def.slots.end; ++s) state.slots[s].workers = 0;
        Id allocated = 0;
        for (bool influence : {true, false}) for (bool specialists : {true, false}) {
            for (Id g = 0; g < used; ++g) {
                auto& group = groups[g];
                Id available = specialists ? group.scholars : group.ordinary / world.people_per_worker;
                for (Id s = def.slots.begin; s < def.slots.end && available; ++s) {
                    const auto& slot = world.slots[s];
                    const auto& recipe = world.recipes[slot.recipe];
                    auto& assigned = state.slots[s].workers;
                    if (recipe.influence != influence || (influence && slot.faction != group.faction) ||
                        assigned >= recipe.workers || (specialists && assigned != 0)) continue;
                    const Id n = specialists ? 1 : std::min(available, recipe.workers - assigned);
                    assigned += n;
                    allocated += n;
                    available -= n;
                }
                if (specialists) group.scholars = available;
                else group.ordinary = group.ordinary % world.people_per_worker + available * world.people_per_worker;
            }
        }
        state.sites[site].workers = allocated;
    }
}

Phase due_phase(const State& state, const World& world)
{
    const Id elapsed = state.clock.second - 1;
    return elapsed % world.phase_duration ? phase_count : static_cast<Phase>(elapsed / world.phase_duration % season);
}

namespace {

void serve_meals(State& state, const World& world, Scratch& scratch)
{
    const auto feed = [&](SiteState& residents, Range stock) {
        for (Id s = stock.begin; s < stock.end && residents.meal < residents.people; ++s) {
            auto& units = state.slots[s].stock;
            if (!(world.recipes[world.slots[s].recipe].traits & world.edible)) continue;
            const Id taken = std::min(units, (residents.people - residents.meal + 29) / 30);
            units -= taken;
            residents.meal = std::min(residents.people, residents.meal + 30 * taken);
        }
    };
    for (Id i = 0; i < count(world.sites); ++i) {
        const auto& site = world.sites[i];
        if (!site.active || site.market) continue;
        auto& residents = state.sites[i];
        residents.meal = 0;
        feed(residents, site.stock);
    }
    for (Id i = 0; i < count(world.sites); ++i) {
        const auto& site = world.sites[i];
        auto& residents = state.sites[i];
        if (!site.active || site.market || residents.meal == residents.people) continue;
        for (bool markets : {false, true}) {
            for (Id edge = site.roads.begin; edge < site.roads.end && residents.meal < residents.people; ++edge) {
                const auto& provider = world.sites[world.roads[edge]];
                ++scratch.shared_visits;
                if (provider.active && provider.market == markets &&
                    (markets || site.controller == provider.controller))
                    feed(residents, provider.stock);
            }
        }
    }
}

void refresh_housing(State& state, const World& world)
{
    for (Id i = 0; i < count(world.sites); ++i) {
        Id capacity = 0;
        const auto span = world.sites[i].structures;
        for (Id s = span.begin; s < span.end; ++s) capacity += world.structures[s];
        state.sites[i].housing = capacity;
    }
}

void read_destination_capacity(State& state, const World& world)
{
    for (Id i = 0; i < count(world.sites); ++i) {
        auto& source = state.sites[i];
        source.movement = 0;
        if (source.meal == source.people) continue;
        const auto adjacent = world.sites[i].roads;
        for (Id n = adjacent.begin; n < adjacent.end; ++n) {
            const auto& dest = state.sites[world.roads[n]];
            if (dest.housing > dest.people)
                source.movement = std::max(source.movement, dest.housing - dest.people);
        }
    }
}

}

void run_phase(State& state, const World& world, Scratch& scratch, Phase phase)
{
    if (phase == phase_count) return;
    if (phase == birth) {
        // Refresh some inventory to keep both successful and failed plans in the loop.
        const Id moon = (state.clock.second - 1) / (world.phase_duration * season);
        for (Id s = 0; s < count(world.slots); ++s) {
            auto& stock = state.slots[s].stock;
            const auto& recipe = world.recipes[world.slots[s].recipe];
            stock = std::min(recipe.capacity, stock + ((s + moon) % 3 != 0));
        }
    }
    scheduled(state, world, scratch, phase);
    if (phase == birth || phase == death) sample_people(state, world, scratch, phase == birth);
    if (phase == food) serve_meals(state, world, scratch);
    if (phase == housing) refresh_housing(state, world);
    if (phase == migration) read_destination_capacity(state, world);
    if (phase == faith)
        for (auto& site : state.sites) site.faith = (site.faith + site.meal) * 0.5;
}

void drain(State& state, const World& world, Scratch& scratch)
{
    for (Id site = 0; site < count(world.sites); ++site) {
        if (!world.sites[site].active) continue;
        scratch.events.clear();
        scratch.discharged.clear();
        scratch.events.push_back({site, missing, resolved});
        if (state.clock.second % 6 == 0) scratch.events.push_back({site, missing, defense});
        // A single root in this skeleton. All gains for a message precede effects.
        for (std::size_t head = 0; head < scratch.events.size(); ++head) {
            const auto event = scratch.events[head];
            const auto listeners = world.triggers[event.site][event.kind];
            const Mask traits = event.origin == missing ? 0 : world.recipes[world.slots[event.origin].recipe].traits;
            for (Id i = listeners.begin; i < listeners.end; ++i) {
                const auto& listener = world.listeners[i];
                if (listener.traits && !(listener.traits & traits)) continue;
                const auto& recipe = world.recipes[world.slots[listener.slot].recipe];
                auto& charge = state.slots[listener.slot].charge;
                charge = std::min(std::max(Id{1}, recipe.charge_threshold),
                    charge + std::max(Id{1}, recipe.charge_gain));
            }
            for (Id i = listeners.begin; i < listeners.end; ++i) {
                const auto slot = world.listeners[i].slot;
                const auto& recipe = world.recipes[world.slots[slot].recipe];
                auto& charge = state.slots[slot].charge;
                if (charge < std::max(Id{1}, recipe.charge_threshold) ||
                    std::find(scratch.discharged.begin(), scratch.discharged.end(), slot) != scratch.discharged.end()) continue;
                if (!plan_recipe(state, world, scratch, slot, false)) continue;
                charge = 0;
                scratch.discharged.push_back(slot);
                ++state.sites[event.site].charge_result;
                ++scratch.discharges;
                scratch.events.push_back({event.site, slot, generated});
            }
        }
    }
}

void summarize(const State& state, const World& world, HeaderRow& header, std::span<SiteRow> rows)
{
    header = {};
    header[0] = state.clock.second;
    header[1] = state.clock.year;
    header[2] = state.clock.rng.seed; // Benchmark replay witness, outside the proposed UI ABI.
    header[3] = state.clock.season_clock;
    for (Id i = 0; i < count(world.sites); ++i) {
        const auto& site = world.sites[i];
        const auto& live = state.sites[i];
        auto& row = rows[i];
        row = {};
        row[0] = live.people;
        row[1] = live.workers;
        row[2] = live.meal;
        row[3] = live.faith;
        row[4] = live.sample;
        row[5] = live.charge_result;
        for (Id b = site.bins.begin; b < site.bins.end; ++b) {
            const auto& bin = world.bins[b];
            row[6 + bin.residency * 3 + bin.kind] += state.populations[b];
        }
        for (Id s = site.stock.begin; s < site.stock.end; ++s) {
            const auto traits = world.recipes[world.slots[s].recipe].traits;
            if (traits & world.edible) row[12] += state.slots[s].stock;
            if (traits & world.currency) row[13] += state.slots[s].stock;
            row[15] += state.slots[s].stock + state.slots[s].charge;
        }
        row[14] = live.housing;
        row[15] += live.movement;
        for (Id k = 0; k < 8; ++k) header[4 + k] += row[k];
    }
}

std::uint64_t digest(const HeaderRow& header, std::span<const SiteRow> rows)
{
    std::uint64_t hash = 14695981039346656037ull;
    const auto add = [&](double value) {
        hash = (hash ^ std::bit_cast<std::uint64_t>(value)) * 1099511628211ull;
    };
    for (double value : header) add(value);
    for (const auto& row : rows) for (double value : row) add(value);
    return hash;
}

}
