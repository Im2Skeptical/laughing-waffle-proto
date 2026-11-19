#include "sim/vassal/detail.hpp"

#include "sim/settlement/site_access.hpp"

namespace waffle::sim::vassal::detail {
namespace {

using browser::ShopOffer;
using Inventory = browser::LifeMapNodeStateInventory;

struct DraftPractice {
    std::string_view id;
    std::size_t quality{};
};

std::vector<DraftPractice> draft_practices(const RuntimeState& state, const Site* site,
                                          const browser::LifeMapNodeState& node)
{
    if (!site) return {};
    const auto& confirmed = site->detailedState.practiceSlots;
    auto capacity = site->detailedState.unlockedPracticeSlots;
    for (const auto& purchase : node.purchasedOffers)
        if (purchase.intervention.kind == "practiceSlot") ++capacity;
    const auto count = std::min(static_cast<std::size_t>(capacity), confirmed.slots.size());
    std::vector<DraftPractice> pool;
    for (const auto& purchase : node.purchasedOffers) {
        const auto& action = purchase.intervention;
        if (action.kind == "practice" && action.mode != "remove")
            pool.push_back({*action.practiceId, quality_index(action.resultingTier.value_or("bronze"))});
    }
    for (const auto row : std::span(confirmed.slots).first(count)) {
        if (!row) {
            pool.emplace_back();
            continue;
        }
        const auto& slot = state.tables.at(row);
        const auto id = state.name(slot.practiceId);
        const auto consumed = std::ranges::find_if(node.purchasedOffers, [&](const auto& purchase) {
            return purchase.intervention.kind == "practice" && purchase.intervention.practiceId == id;
        });
        if (consumed == node.purchasedOffers.end()) pool.push_back({id, static_cast<std::size_t>(slot.tier)});
        else if (consumed->intervention.mode == "remove") pool.emplace_back();
    }
    if (node.practiceDraftOrder) {
        std::erase_if(pool, [](auto slot) { return slot.id.empty(); });
        std::vector<DraftPractice> ordered;
        for (const auto& id : *node.practiceDraftOrder) {
            if (!id) {
                ordered.emplace_back();
                continue;
            }
            const auto found = std::ranges::find(pool, *id, &DraftPractice::id);
            if (found == pool.end()) continue;
            ordered.push_back(*found);
            pool.erase(found);
        }
        pool.insert(pool.end(), ordered.begin(), ordered.end());
    } else {
        if (pool.size() < count) pool.resize(count);
        for (const auto& purchase : node.purchasedOffers) {
            if (purchase.intervention.kind != "practice" || !purchase.tableauIndex) continue;
            const auto found = std::ranges::find(pool, *purchase.intervention.practiceId, &DraftPractice::id);
            if (found == pool.end()) continue;
            const auto slot = *found;
            pool.erase(found);
            pool.insert(pool.begin() + static_cast<std::ptrdiff_t>(*purchase.tableauIndex), slot);
        }
    }
    pool.resize(count);
    return pool;
}

std::string title_quality(std::size_t index)
{
    std::string text(qualityIds[index]);
    text[0] -= 'a' - 'A';
    return text;
}

std::size_t offer_quality(RuntimeState& state, std::size_t unlocked)
{
    if (unlocked != 1) return pick(state, unlocked + 1);
    const auto& settings = state.compiledContent->settings();
    const auto threshold = settings.researchSilverThreshold;
    const auto full = std::max(threshold, settings.researchSilverFullThreshold);
    const auto progress = std::clamp((state.hot.civilization.research.total - threshold)
        / std::max(1.0, full - threshold), 0.0, 1.0);
    return roll(state) < .1 + progress * .4 ? 1 : 0;
}

std::size_t scholar_bonus(RuntimeState& state, const Vassal& actor, std::size_t available, const Bonuses& mods)
{
    if (!available || !has_identity(state, actor, "scholar")) return 0;
    const auto chance = (whole(actor.stats.cunning) + mods.cunning) * .05;
    const auto guaranteed = core::js::floor(chance);
    if (guaranteed >= static_cast<double>(available)) return available;
    const auto fraction = chance - guaranteed;
    return static_cast<std::size_t>(guaranteed) + (fraction > 0 && roll(state) < fraction ? 1 : 0);
}

std::size_t offer_count(const RuntimeState& state, const Vassal& actor, std::string_view family)
{
    if (family != "practiceReform" && family != "publicWorks") return 3;
    double extra = 0;
    for (const auto& item : read(state, actor.heirlooms).equipped) {
        if (!item) continue;
        const auto def = std::ranges::find(heirloomDefs, item->definitionId, &HeirloomDef::id);
        if (def != std::end(heirloomDefs)) extra += def->extraShopOffers;
    }
    return 3 + static_cast<std::size_t>(whole(extra));
}

bool produces_stock(const browser::PracticeDefinition& def, std::string_view trait)
{
    return def.stockCapacity > 0 && std::ranges::find(def.stockTraits, trait) != def.stockTraits.end()
        && std::ranges::any_of(def.effects, [](const auto& effect) {
            const auto* output = std::get_if<browser::PracticeEffectgenerateStock>(&effect);
            if (!output) return false;
            const auto seasons = output->seasonAmounts.value_or(browser::SeasonAmounts{});
            return output->amount > 0 || seasons.spring.value_or(0) > 0 || seasons.summer.value_or(0) > 0
                || seasons.autumn.value_or(0) > 0 || seasons.winter.value_or(0) > 0;
        });
}

std::string_view structure_category(const browser::StructureDefinition& def)
{
    if (def.housing.value_or(0) || std::ranges::find(def.tags, "Housing") != def.tags.end()) return "Housing";
    if (def.modifiers && std::ranges::find(*def.modifiers, "capacity",
        &browser::StructureDefinitionModifiersEntry::kind) != def.modifiers->end()) return "Stock";
    return "Special";
}

struct Candidate {
    const browser::PracticeDefinition* practice{};
    const browser::StructureDefinition* structure{};
    std::string_view pool;
};

std::vector<Candidate> select_candidates(RuntimeState& state, const Vassal& actor,
                                          const browser::LifeMapNodeState& node,
                                          std::vector<Candidate> candidates)
{
    const auto family = node.family;
    const auto count = offer_count(state, actor, family);
    shuffle(state, candidates);
    std::vector<Candidate> selected;
    const auto classId = class_name(actor);
    const auto append = [&](std::string_view pool, std::size_t limit) {
        for (const auto& candidate : candidates) {
            if (!limit || selected.size() == count) break;
            if (candidate.pool != pool) continue;
            selected.push_back(candidate);
            --limit;
        }
    };
    if (family == "neutralMarket" || (classId.empty() && family != "classMarket")) append("common", count);
    else if (family == "classMarket") append(classId, count);
    else {
        append(classId, count - 1);
        append("common", 1);
        for (const auto& candidate : candidates) {
            if (selected.size() == count) break;
            if (std::ranges::none_of(selected, [&](const auto& entry) {
                return entry.practice == candidate.practice && entry.structure == candidate.structure;
            })) selected.push_back(candidate);
        }
    }
    return selected;
}

std::vector<Candidate> candidates_for(const RuntimeState& state, const Vassal& actor,
                                    const browser::LifeMapNodeState& node, const std::vector<DraftPractice>& board,
                                    std::string_view requiredTag, std::size_t unlocked)
{
    const auto& cards = state.content->config.gamepieces;
    const auto* selection = node.shopSelection.has_key() && node.shopSelection.value()
        ? &*node.shopSelection.value() : nullptr;
    const auto specialty = selection && selection->selectedTag && *selection->selectedTag != "random"
        ? std::string_view(*selection->selectedTag) : ""sv;
    const auto maxQuality = std::min<std::size_t>(3, unlocked + node.discoveryAccess.value_or(false));
    const bool stock = node.family == "stockShop";
    const bool practiceOnly = stock || (requiredTag.empty() && node.family == "practiceReform");
    const bool structureOnly = requiredTag.empty() && node.family == "publicWorks";
    const auto classId = class_name(actor);
    const auto legal = [&](const auto& def, std::string_view pool) {
        return (pool == "common" || pool == classId) && !def.locked.value_or(false)
            && std::ranges::find(fullMapSeedCardIds, def.id) == std::end(fullMapSeedCardIds)
            && (!state.hot.rulesetId || std::ranges::find(fullMapOfferIds, def.id) != std::end(fullMapOfferIds))
            && quality_index(def.minimumQuality) <= maxQuality;
    };
    const auto matches_tag = [&](const auto& def) {
        return requiredTag.empty() || std::ranges::find(def.tags, requiredTag) != def.tags.end();
    };
    std::vector<Candidate> candidates;
    if (!structureOnly) for (const auto& [id, def] : cards.practices) {
        const auto pool = practice_pool(state, def);
        if (!legal(def, pool) || (!matches_tag(def) && practice_prototype_tag(state, id) != requiredTag)) continue;
        if (stock && node.stockOutput && !produces_stock(def, *node.stockOutput)) continue;
        if (!stock && requiredTag.empty() && node.family == "practiceReform" && !specialty.empty()) {
            const bool matches = specialty == "Food" ? std::ranges::find(def.tags, "Food") != def.tags.end()
                                                     : produces_stock(def, specialty);
            if (!matches) continue;
        }
        if (std::ranges::any_of(board, [&](auto slot) { return slot.id == id && slot.quality == 3; })) continue;
        candidates.push_back({&def, nullptr, pool});
    }
    if (!practiceOnly) for (const auto& [id, def] : cards.structures) {
        if (!legal(def, def.pool) || !matches_tag(def)) continue;
        if (selection && selection->selectedTag && structure_category(def) != *selection->selectedTag) continue;
        candidates.push_back({nullptr, &def, def.pool});
    }
    return candidates;
}

const browser::PracticeDefinition& practice_definition(const RuntimeState& state, std::string_view id)
{
    const auto& defs = state.content->config.gamepieces.practices;
    return std::ranges::find(defs, id, &browser::GamepiecesPractices::value_type::first)->second;
}

double ordinary_year_phases(const RuntimeState& state, double years)
{
    const auto& settings = state.compiledContent->settings();
    const auto seasons = state.hot.seasons.size() == 0 ? 4 : state.hot.seasons.size();
    return std::max(years > 0 ? 1.0 : 0.0,
        core::js::round(years * static_cast<double>(seasons) * settings.seasonDurationSec
            / std::max(1.0, core::js::floor(settings.phaseDurationSec))));
}

Inventory removal_offers(RuntimeState& state, const Site* site, const Vassal& actor,
                         const browser::LifeMapNodeState& node, const std::string& prefix)
{
    if (!site || node.signatureNode->removalKind != "practice") return {};
    const auto region = std::string(state.name(site->regionId));
    Inventory offers;
    for (const auto row : site->detailedState.practiceSlots.slots) {
        if (!row) continue;
        const auto& slot = state.tables.at(row);
        const auto& def = practice_definition(state, state.name(slot.practiceId));
        offers.push_back({
            .label = "Remove " + def.label, .basePrestigeCost = 10, .basePhaseCost = ordinary_year_phases(state, 7.2),
            .intervention = {.kind = "practice", .targetRegionId = region, .practiceId = def.id,
                             .mode = "remove", .tier = std::string(qualityIds[static_cast<std::size_t>(slot.tier)])},
        });
    }
    shuffle(state, offers);
    offers.resize(std::min(offers.size(), offer_count(state, actor, node.family)));
    for (std::size_t i = 0; i < offers.size(); ++i) offers[i].offerId = prefix + "remove:" + std::to_string(i);
    return offers;
}

Inventory card_offers(RuntimeState& state, const Site* site, const Vassal& actor,
                      const browser::LifeMapNodeState& node, std::string_view requiredTag,
                      const std::string& prefix)
{
    const auto unlocked = research_unlock(state);
    const auto board = draft_practices(state, site, node);
    const auto chosen = select_candidates(state, actor, node, candidates_for(state, actor, node, board, requiredTag, unlocked));
    const auto mods = bonuses(state, actor);
    const auto region = std::string(state.name(actor.locationRegionId));
    Inventory offers;
    for (const auto& candidate : chosen) {
        const auto category = !requiredTag.empty() ? "tag" : candidate.practice ? "practice" : "structure";
        const auto id = prefix + category + ":" + std::to_string(offers.size());
        if (candidate.structure) {
            const auto& def = *candidate.structure;
            const auto base = quality_index(def.minimumQuality);
            const auto bonus = scholar_bonus(state, actor, 3 - base, mods);
            offers.push_back({
                .offerId = id, .label = "Build " + title_quality(base + bonus) + " " + def.label,
                .basePrestigeCost = std::max(0.0, def.vassalPrestigeCost), .basePhaseCost = std::max(0.0, def.vassalPhaseCost),
                .intervention = {.kind = "structure", .targetRegionId = region, .mode = "add",
                                 .tier = def.minimumQuality, .structureId = def.id,
                                 .qualityBonus = bonus ? std::optional(static_cast<double>(bonus)) : std::nullopt},
                .baseCurrencyCost = std::max(0.0, def.localCurrencyCost),
            });
        } else {
            const auto& def = *candidate.practice;
            const auto installed = std::ranges::find(board, def.id, &DraftPractice::id);
            const bool upgrade = installed != board.end();
            // The natural tier is rolled even for an upgrade, which uses the next tier.
            const auto natural = offer_quality(state, unlocked);
            const auto before = upgrade ? installed->quality : 0;
            const auto base = upgrade ? before + 1 : natural;
            const auto after = base + scholar_bonus(state, actor, 3 - base, mods);
            offers.push_back({
                .offerId = id, .label = upgrade ? "Upgrade " + def.label + " " + title_quality(before)
                    + " \xe2\x86\x92 " + title_quality(after) : "Learn " + title_quality(after) + " " + def.label,
                .basePrestigeCost = std::max(0.0, def.vassalPrestigeCost), .basePhaseCost = std::max(0.0, def.vassalPhaseCost),
                .intervention = {.kind = "practice", .targetRegionId = region, .practiceId = def.id,
                                 .mode = upgrade ? "upgrade" : "learn", .tier = std::string(qualityIds[before]),
                                 .resultingTier = std::string(qualityIds[after])},
            });
        }
    }
    return offers;
}

void price_offer(const RuntimeState& state, const browser::LifeMapNodeState& node, ShopOffer& offer)
{
    const auto& design = state.compiledContent->values.lifeMapGenerator.design;
    if (!design.enabled || offer.intervention.mode == "adopt") return;
    if (offer.intervention.mode == "remove") {
        if (node.signatureNode->variantId != "removePractice") return;
        const auto& cost = design.optionCosts.signature_removePractice.remove;
        offer.basePhaseCost = year_phases(state, balance_value(cost.time, design.costBands.time));
        offer.basePrestigeCost = balance_value(cost.prestige, design.costBands.prestige);
        return;
    }
    if (!design.shopPricing.enabled) return;
    const auto& prices = design.shopPricing.prices;
    const auto apply = [&](const auto& byTier, std::size_t quality) {
        const std::array choices{&byTier.bronze, &byTier.silver, &byTier.gold, &byTier.diamond};
        const auto& price = *choices[quality];
        offer.basePrestigeCost = price.prestige;
        offer.basePhaseCost = year_phases(state, price.time);
        offer.baseCurrencyCost = price.currency;
        offer.priceQuality = qualityIds[quality];
    };
    const auto& change = offer.intervention;
    if (change.kind == "practice") apply(prices.practice, quality_index(*change.resultingTier));
    else apply(prices.structure, std::min<std::size_t>(3, quality_index(*change.tier)
        + static_cast<std::size_t>(change.qualityBonus.value_or(0))));
}

}

Inventory shop_inventory(RuntimeState& state, Vassal& actor, browser::LifeMapNodeState& node)
{
    if (node.shopSelection.has_key() && node.shopSelection.value() && !node.shopSelection.value()->selectedTag) return {};
    const auto& family = node.family;
    const bool ordinary = family == "practiceReform" || family == "publicWorks" || family == "neutralMarket"
        || family == "classMarket" || family == "foodShop" || family == "housingShop" || family == "stockShop";
    const bool tagged = node.signatureNode && node.signatureNode->groupId == "tagShop";
    if (actor.discoveryAccess.value_or(false) && (ordinary || tagged)) {
        node.discoveryAccess = true;
        actor.discoveryAccess.reset();
    }
    const auto prefix = node.nodeId + ":r" + decimal(whole(node.inventoryRoll)) + ":";
    const auto requiredTag = tagged ? node.signatureNode->tag.value_or("")
        : family == "foodShop" ? "Food" : family == "housingShop" ? "Housing" : "";
    auto* site = settlement::detailed_site(state, actor.locationRegionId);
    Inventory offers;
    if (family == "stockShop" || !requiredTag.empty()) offers = card_offers(state, site, actor, node, requiredTag, prefix);
    else if (node.signatureNode && node.signatureNode->groupId == "removal")
        offers = removal_offers(state, site, actor, node, prefix);
    else if (ordinary) offers = card_offers(state, site, actor, node, requiredTag, prefix);
    if (site && class_name(actor) == "scholar" && !offers.empty()) {
        const auto bonus = site->detailedState.shopQualityBonus.value_or(0);
        if (bonus != 0) {
            for (auto& offer : offers) {
                auto& change = offer.intervention;
                if (change.mode == "learn") {
                    const auto quality = std::min<std::size_t>(3, quality_index(*change.resultingTier)
                        + static_cast<std::size_t>(std::clamp(std::ceil(bonus), 0.0, 3.0)));
                    change.resultingTier = qualityIds[quality];
                    offer.label = "Learn " + title_quality(quality) + " " + practice_definition(state, *change.practiceId).label;
                } else if (change.kind == "structure") change.qualityBonus = std::min(3.0, change.qualityBonus.value_or(0) + bonus);
            }
            site->detailedState.shopQualityBonus = 0;
        }
    }
    if (site && state.hot.rulesetId && family == "practiceReform") {
        for (const auto row : site->detailedState.practiceSlots.slots) {
            if (!row) continue;
            const auto& slot = state.tables.at(row);
            const auto id = state.name(slot.practiceId);
            if (!slot.allegiance || *slot.allegiance == state.practiceVocabulary.player
                || std::ranges::find(fullMapSeedCardIds, id) != std::end(fullMapSeedCardIds)) continue;
            const auto instance = slot.instanceId ? std::string(state.name(*slot.instanceId)) : "undefined";
            const auto tier = std::string(qualityIds[static_cast<std::size_t>(slot.tier)]);
            offers.push_back({
                .offerId = node.nodeId + ":adopt:" + instance, .label = "Adopt " + practice_definition(state, id).label,
                .basePrestigeCost = 10, .basePhaseCost = 2 * ordinary_year_phases(state, 1),
                .intervention = {.kind = "practice", .targetRegionId = std::string(state.name(site->regionId)),
                    .practiceId = std::string(id), .mode = "adopt", .tier = tier, .resultingTier = tier,
                    .instanceId = slot.instanceId ? std::optional(instance) : std::nullopt},
                .baseCurrencyCost = 0,
            });
        }
    }
    for (std::size_t i = 0; i < offers.size(); ++i) {
        price_offer(state, node, offers[i]);
        offers[i].inventoryIndex = static_cast<double>(i);
    }
    return offers;
}

}
