#include "sim/vassal/detail.hpp"

#include "sim/practice/practice.hpp"
#include "sim/practice/stock.hpp"
#include "sim/settlement/site_access.hpp"

namespace waffle::sim::vassal::detail {
namespace {

template<std::size_t N>
std::string portrait_pick(RuntimeState& state, const char* const (&values)[N])
{
    auto& seed = state.hot.rng.vassalPortraitSeed;
    return values[static_cast<std::size_t>(core::rng_next_seed_float(seed) * N)];
}

browser::Portrait portrait(RuntimeState& state)
{
    return {
        portrait_pick(state, {"umber", "sienna", "ochre", "olive", "rose", "ivory"}),
        portrait_pick(state, {"crop", "waves", "braids", "coils", "long", "shaved"}),
        portrait_pick(state, {"black", "brown", "auburn", "gold", "silver"}),
        portrait_pick(state, {"round", "oval", "angular"}),
        portrait_pick(state, {"red", "blue", "green", "gold", "purple", "charcoal"}),
        portrait_pick(state, {"none", "band", "pin", "beads", "earring"}),
        portrait_pick(state, {"calm", "bright", "stern"}),
    };
}

browser::SignatureNode signature(const SignatureDef& def)
{
    const auto optional_text = [](std::string_view value) -> std::optional<std::string> {
        if (value.empty()) return {};
        return std::string(value);
    };
    return {std::string(def.id), std::string(def.group), std::string(def.label), std::string(def.glyph),
        def.color, std::string(def.description), std::string(def.id), optional_text(def.removal), optional_text(def.tag)};
}

using SignatureCandidates = std::vector<std::size_t>;
void assign_signatures(RuntimeState& state, browser::LineagePendingCandidates& pool)
{
    const auto& design = state.content->config.lifeMapGenerator.design;
    if (!design.enabled) {
        std::array groups{"legacyPlus"sv, "monsterHunt"sv, "removal"sv, "tagShop"sv};
        shuffle(state, groups);
        // The legacy generator draws three signatures even for founder pools.
        for (std::size_t i = 0; i < 3; ++i) {
            SignatureCandidates available;
            for (std::size_t j = 0; j < std::size(signatureDefs); ++j)
                if (signatureDefs[j].group == groups[i]) available.push_back(j);
            const auto selected = available[pick(state, available.size())];
            if (i < pool.size()) pool[i].signatureNode = signature(signatureDefs[selected]);
        }
        return;
    }
    const auto& nodes = design.nodes;
    const std::array rules{&nodes.signature_legacyPlus, &nodes.signature_monsterHunt, &nodes.signature_removePractice,
        &nodes.signature_foodShop, &nodes.signature_knowledgeShop, &nodes.signature_housingShop};
    const auto weight = [&](std::size_t i) {
        const auto& key = rules[i]->occurrence;
        return key == "rare" ? design.occurrence.rare
            : key == "uncommon" ? design.occurrence.uncommon : design.occurrence.common;
    };
    std::vector<std::string_view> used;
    for (auto& candidate : pool) {
        const auto identity = candidate.founderClassId ? std::string_view(*candidate.founderClassId)
            : !candidate.classId ? "unclassed"sv
            : *candidate.classId == browser::SpecialistClass::scholar ? "scholar"sv : "warrior"sv;
        SignatureCandidates available, unused;
        for (std::size_t i = 0; i < rules.size(); ++i) {
            const auto& rule = *rules[i];
            if (!rule.enabled || (i == 0 && !design.bookends.legacy.enabled)) continue;
            if (rule.scope != "common" && rule.scope != identity
                && !(rule.scope == "specialist" && identity != "unclassed")) continue;
            available.push_back(i);
            if (std::ranges::find(used, signatureDefs[i].group) == used.end()) unused.push_back(i);
        }
        const auto& choices = unused.empty() ? available : unused;
        if (choices.empty()) continue;
        double total = 0;
        for (auto i : choices) total += weight(i);
        auto draw = roll(state) * total;
        auto selected = choices.back();
        for (auto i : choices) {
            draw -= weight(i);
            if (draw < 0) { selected = i; break; }
        }
        used.push_back(signatureDefs[selected].group);
        candidate.signatureNode = signature(signatureDefs[selected]);
    }
}

double academy_bonus(RuntimeState& state, const Site& site, std::optional<browser::SpecialistClass> classId)
{
    const auto className = !classId ? ""sv
        : *classId == browser::SpecialistClass::scholar ? "scholar"sv : "warrior"sv;
    const auto& content = *state.compiledContent;
    auto& civ = state.hot.civilization;
    using enum content::HistorySource;
    std::array<double, 9> values{};
    const auto value = [&](content::HistorySource source) -> double& { return values[static_cast<std::size_t>(source)]; };
    value(age) = whole((state.hot.year - 1) / 10);
    value(chaos) = core::js::floor(civ.chaos.chaosPower.value_or(0) / 100);
    value(losses) = civ.history.lostSettlements;
    value(conquests) = civ.history.conquests;
    value(victories) = civ.history.victories;
    double retiredStats = 0;
    state.histories.at(civ.retiredVassals.row).for_each([&](const CivilizationRetiredVassalsEntry& row, const HistoryPayload&) {
        if ((row.classId ? state.name(*row.classId) : ""sv) != className) return;
        ++value(retired);
        value(commissions) += row.completedCommissions;
        if (row.retirementRegionId == site.regionId)
            retiredStats += className == "scholar" ? row.finalCunning : row.finalIntelligence;
    });
    const auto record = state.find_id<TraitId>("Record");
    for (const auto index : site.detailedState.practiceSlots.slots) {
        if (!index || state.practiceStock[index.value].value_or(0) <= 0) continue;
        const auto& def = content.practices()[state.tables.at(index).practiceId.value].value;
        auto traits = content.tables.view(def.stockTraits);
        if (std::ranges::find(traits, record) != traits.end()) ++value(records);
    }
    const auto knowledge = state.find_id<TagId>("Knowledge");
    std::vector<StructureId> known;
    bool institution = false;
    double structures = 0;
    const auto pool = className == "scholar" ? content::Pool::scholar : content::Pool::warrior;
    const auto count = classId ? practice::detail::specialists(state, site, *classId) : 0;
    for (const auto& row : state.tables.view(site.detailedState.structureSlots.origins)) {
        if (row.construction) continue;
        const auto& def = content.structures()[row.structureId.value].value;
        const auto tags = content.tables.view(def.tags);
        if (std::ranges::find(tags, knowledge) != tags.end() && std::ranges::find(known, row.structureId) == known.end())
            known.push_back(row.structureId);
        if (classId && def.pool == pool && count >= def.specialistGate.value_or(0)) {
            institution = true;
            structures += def.candidateBonus.value_or(0);
        }
    }
    value(knowledgeStructures) = static_cast<double>(known.size());
    double historyBonus = 0;
    for (const auto& mod : practice::detail::modifiers(state, site, content::mask_bit(content::ModifierKind::historyCandidate))) {
        double sum = 0;
        if (mod.def->sources) {
            for (auto source : content.tables.view(*mod.def->sources)) sum += value(source);
        } else {
            sum = value(retired) + value(conquests) + value(losses);
        }
        historyBonus = std::max(historyBonus, std::min(mod.def->cap.value_or(3), sum * mod.amount));
    }
    double development = 0;
    if (classId) {
        auto& bank = className == "scholar" ? civ.candidateDevelopment.scholar : civ.candidateDevelopment.warrior;
        development = std::min(3.0, bank);
        if (development) {
            bank -= development;
            practice::EventData event;
            event.fields.classId = browser::OptionalNullable<SymbolId>(intern<SymbolId>(state, className));
            event.fields.amount = development;
            practice::emit(state, practice::EventKind::candidateDevelopment, site.regionId, event);
        }
    }
    return std::min(5.0, structures + historyBonus + (institution ? whole(retiredStats / 5) : 0)) + development;
}

}

void generate_candidates(RuntimeState& state)
{
    auto& civ = state.hot.civilization;
    auto& lineage = civ.vassalLineage;
    browser::LineagePendingCandidates pool;
    const auto sites = player_sites(state);
    const bool founder = lineage.selectedVassalIds.size() == 0;
    const auto& legacy = civ.vassalLegacy.futureStartingStatBonuses;
    if (!sites.empty()) {
        for (std::size_t i = 0; i < (founder ? 2u : 3u); ++i) {
            const auto& site = settlement::site_at(state, sites[pick(state, sites.size())]);
            browser::Candidate entry;
            if (founder) entry.founderClassId = i == 0 ? "scholar" : "warrior";
            else if (i != 1) entry.classId = lineage.establishedClassId;
            const auto academy = academy_bonus(state, site, entry.classId);
            const bool scholar = entry.classId == browser::SpecialistClass::scholar;
            entry.archetype = founder ? (i == 0 ? "Philosopher" : "Warlord")
                : !entry.classId ? "Unclassed" : scholar ? "Scholar" : "Warrior";
            entry.candidateId = "candidate-" + decimal(std::max(1.0, whole(lineage.nextVassalId))) + "-" + std::to_string(i + 1);
            entry.age = 12 + static_cast<double>(pick(state, 11));
            entry.locationRegionId = entry.originRegionId = state.name(site.regionId);
            entry.prestige = 18 + static_cast<double>(pick(state, 7)) + whole(civ.vassalLegacy.futureStartingPrestigeBonus);
            entry.stats = {
                static_cast<double>(pick(state, 3)) + (scholar ? academy : 0) + legacy.cunning,
                static_cast<double>(pick(state, 3)) + legacy.wisdom,
                static_cast<double>(pick(state, 3)) + legacy.effectiveness,
                static_cast<double>(pick(state, 3)) + (scholar ? 0 : academy) + legacy.intelligence,
            };
            entry.portrait = portrait(state);
            pool.push_back(std::move(entry));
        }
    }
    assign_signatures(state, pool);
    replace(state, lineage.pendingCandidates, pool);
}

}
