#include "connected_view.hpp"
#include "connected_markup.hpp"

#include <RmlUi/Core/ElementText.h>

#include <algorithm>
#include <chrono>
#include <cmath>

namespace waffle::connected {
namespace {

using namespace markup;
using Values = std::map<std::string, std::string, std::less<>>;

constexpr std::array tabNames{"Overview", "Moon", "Structures", "Practices"};
constexpr std::array holderNames{"Your holding", "Crown holding", "Unheld", "Creep"};
constexpr std::array classNames{"Villagers", "Strangers"};
constexpr std::array overviewLedgers{"overview-population", "overview-faith", "overview-provisions", "overview-stock", "overview-control"};

constexpr auto overviewLayout =
    "<div id=\"garrison-entry\"></div><div class=\"settlement-columns\"><div class=\"settlement-column\">"
    "<div class=\"settlement-group\"><h3>Population</h3><p class=\"resident-total\">"
    "<span id=\"overview-total\" class=\"resident-number\">0</span> <span>residents</span></p>"
    "<div id=\"overview-population\"></div></div>"
    "<div class=\"settlement-group\"><h3>Happiness &amp; faith</h3>"
    "<p id=\"overview-empty-faith\" class=\"quiet\">No residents</p><div id=\"overview-faith\"></div></div>"
    "</div><div class=\"settlement-column\">"
    "<div class=\"settlement-group\"><h3>Provisions</h3><div id=\"overview-provisions\"></div></div>"
    "<div class=\"settlement-group\"><h3>Stock by trait</h3>"
    "<p id=\"overview-empty-stock\" class=\"quiet\">No hosted Stock</p><div id=\"overview-stock\"></div></div>"
    "</div><div class=\"settlement-column settlement-control\">"
    "<div class=\"settlement-group\"><h3>Control</h3><div id=\"overview-control\"></div></div></div></div>";

std::string qty(double value)
{
    return number(value, value == std::floor(value) ? 0 : 1);
}

std::string meter(double ratio, const char* treatment = "")
{
    return "<div class=\"settlement-meter " + std::string(treatment) +
        "\"><div style=\"width:" + number(std::clamp(ratio, 0., 1.) * 100) + "%;\"></div></div>";
}

std::string rows(const std::vector<Reading>& readings, Values& values, std::string_view prefix)
{
    std::string html;
    for (const auto& reading : readings) {
        const auto key = std::string(prefix) + reading.key;
        values[key] = reading.value + "\n" + reading.detail;
        html += "<div class=\"ledger-row";
        if (reading.warning) html += " ledger-warning";
        html += "\" data-reading=\"" + escape(key) + "\"><div class=\"ledger-line\"><span>" +
            escape(reading.label) + "</span><span class=\"ledger-value\">" + escape(reading.value) +
            "</span></div>";
        if (reading.fill) html += meter(*reading.fill);
        if (!reading.detail.empty()) html += "<p class=\"quiet ledger-detail\">" + escape(reading.detail) + "</p>";
        html += "</div>";
    }
    return html;
}

std::string group(std::string_view title, std::string body)
{
    return "<div class=\"settlement-group\"><h3>" + std::string(title) + "</h3>" + body + "</div>";
}

std::string ruinLanding(const Snapshot& snapshot, const Region& site, Values& values)
{
    const auto i = static_cast<std::size_t>(&site - snapshot.regions.data());
    const auto& monster = snapshot.crests.regions[i].monster;
    if (!monster)
        return "<div class=\"territory-landing\">" + group("Unrestored ruin",
            "<p class=\"quiet\">The settlement lies idle until it is restored.</p>") + "</div>";

    std::vector<Reading> threat;
    if (monster->target) {
        const auto& target = snapshot.regions[*monster->target];
        const auto detail = monster->defense ? qty(*monster->defense) + " Defense · " +
            (monster->willBeRepelled ? "Would repel the attack" : "Would be overrun") : "";
        threat.push_back({"target", "Next attack target", target.name, detail});
    } else threat.push_back({"target", "Next attack target", "None", ""});
    if (monster->repelGain)
        threat.push_back({"repel", "Last attack", "Repelled",
            "+" + qty(*monster->repelGain) + " Strength at s " + qty(monster->repelSecond)});
    const auto title = "Monster-held ruin · Strength " + qty(monster->strength);
    return "<div class=\"territory-landing monster-landing\">" + group(title, rows(threat, values, "monster-")) + "</div>";
}

std::string storefrontLanding(const StorefrontReading& market, const Region& region, Values& values)
{
    const auto identity = market.identity == region.settlement ? "" : escape(market.identity) + " · ";
    std::string readout = "<p class=\"quiet\">" + identity + qty(region.population) +
        " residents · " + qty(market.defense) + " Defense</p>";
    readout += rows(market.offers, values, "storefront-");
    readout += "<p class=\"quiet\">Adjacent road-connected towns buy supplies through meals and recipes using local Currency.</p>";
    return "<div class=\"territory-landing market-landing\">" + group("Neutral storefront", std::move(readout)) + "</div>";
}

std::string stockSources(const Reading& stock)
{
    return "<div id=\"stock-drilldown\" class=\"territory-landing\">" +
        group(escape(stock.label), "<p>" + escape(stock.value + " Stock · " + stock.detail) +
            "</p><p class=\"stock-source-list\">" + escape(stock.sources) + "</p>") + "</div>";
}

std::string garrisonPicker(const GarrisonReading& garrison)
{
    auto html = "<div id=\"garrison-picker\" class=\"settlement-group territory-landing\"><h3>Garrison support</h3>"
        "<p>Assigned to " + escape(garrison.supported) + " · " + qty(garrison.defense) +
        " local Defense · " + qty(garrison.force) + " holding Force</p>";
    html += "<p class=\"quiet\">Choose where your garrison serves. Eligible allies are marked on the atlas.</p>";
    if (garrison.warriors <= 0) html += "<p class=\"quiet\">No loyal Warriors are available to send.</p>";
    html += "<div class=\"garrison-targets\">";
    for (const auto& choice : garrison.choices) {
        const auto detail = !choice.reason.empty() ? choice.reason : qty(choice.defense) + " current Defense";
        const auto label = choice.name + (choice.current ? " · Assigned" : "");
        html += "<div class=\"garrison-choice\">" + button("settlement-garrison-target", choice.id, label,
            choice.current ? "garrison-target on" : "garrison-target", detail, choice.current || !choice.reason.empty()) +
            "<p class=\"quiet\">" + escape(detail) + "</p></div>";
    }
    return html + "</div></div>";
}

bool canManageGarrison(const Session& session, const Snapshot* snapshot)
{
    return snapshot && !snapshot->terminal && !session.previewing() && !session.busy();
}

bool setText(Rml::ElementText& node, const std::string& text)
{
    if (text == node.GetText()) return false;
    node.SetText(text);
    return true;
}

void visibility(Rml::Element& node, bool visible)
{
    if (node.IsClassSet("reading-hidden") == !visible) return;
    node.SetClass("reading-hidden", !visible);
}

std::string moonReport(const MoonReading* moon, Values& values)
{
    if (!moon) return "<p class=\"empty-reading\">No Moon has resolved here yet.</p>";
    std::string html = "<div class=\"moon-heading\"><h3>Moon " + qty(moon->index + 1) +
        "</h3><span class=\"quiet\">" + (moon->current ? "In progress" : "Last completed") +
        " · began at s " + std::to_string(moon->started) + "</span></div>";
    if (moon->phases.empty()) return html + "<p class=\"empty-reading\">No local results for this Moon.</p>";
    return html + "<div class=\"moon-report\">" + rows(moon->phases, values, "moon-") + "</div>";
}

std::string practiceDetails(const PracticeReading* practice, Values& values)
{
    if (!practice) return "";
    const auto& p = *practice;
    const auto staffing = qty(p.workers) + " / " + qty(p.capacity) + " workers";
    std::vector<Reading> mechanics{
        {"staff", "Staffing", staffing, (p.scholar ? "1 Scholar assigned" : "No Scholar assigned") +
            std::string(" · effective staffing ") + qty(p.effective)}
    };
    if (p.chargeMode)
        mechanics.push_back({"charge", "Charge", qty(p.charge) + " / " + qty(p.threshold),
            "+" + qty(p.chargeGain) + " per trigger · " + p.discharge,
            false, p.threshold > 0 ? p.charge / p.threshold : 0});
    mechanics.push_back(p.status);
    if (p.stock)
        mechanics.push_back({"stock", "Hosted Stock", qty(*p.stock) + " / " + qty(p.stockCapacity.value_or(0)),
            p.outputTraits + " · ×" + qty(p.outputMultiplier) + " output"});
    const auto stockDetail = p.inputs.empty() ? "<p class=\"quiet\">No recurring Stock costs</p>" :
        rows(p.inputs, values, "practice-") + rows(p.providers, values, "practice-");
    const auto activity = p.activity.empty() ? "<p class=\"quiet\">No recent activation recorded.</p>" :
        rows(p.activity, values, "practice-");
    std::string help = "<div class=\"settlement-help\">";
    if (p.chargeMode)
        help += button("settlement-help", "charge", "Charge", "term", "Charge builds on the listed trigger. It is private to this Practice.") +
            button("settlement-help", "discharge", "Discharge", "term", "At its threshold the Practice can automatically run its recipe when its inputs and conditions are met.");
    help += button("settlement-help", "stock", "Stock", "term", "Stock lives on its producing Practice. Recipes match Stock traits.") +
        button("settlement-help", "edible", "Edible", "term", "Edible Stock feeds residents during the Food phase.") + "</div>";
    return help + group("Operation", rows(mechanics, values, "practice-")) +
        group("Stock inputs &amp; providers", stockDetail) + group("Activity", activity);
}

void replace(Rml::Context& context, Rml::Element& root, std::string& oldMarkup, std::string next,
    bool restoreFocus)
{
    if (next == oldMarkup) return;
    auto* focus = context.GetFocusElement();
    auto* ancestor = focus;
    while (ancestor && ancestor != &root) ancestor = ancestor->GetParentNode();
    const bool keyboard = ancestor && focus->IsPseudoClassSet("focus-visible") && restoreFocus;
    const auto op = keyboard ? focus->GetAttribute<Rml::String>("data-op", "") : "";
    const auto id = keyboard ? focus->GetAttribute<Rml::String>("data-id", "") : "";
    root.SetInnerRML(oldMarkup = std::move(next));
    if (op.empty()) return;
    Rml::ElementList controls;
    root.QuerySelectorAll(controls, "button");
    Rml::Element* candidate = nullptr;
    for (auto* control : controls) {
        if (control->HasAttribute("disabled")) continue;
        const auto operation = control->GetAttribute<Rml::String>("data-op", "");
        if (operation == op && control->GetAttribute<Rml::String>("data-id", "") == id) {
            candidate = control;
            break;
        }
        if (!candidate || operation == "review" || (op == "review" && operation == "stage"))
            candidate = control;
    }
    if (candidate) candidate->Focus(true);
}

}

void View::syncOverview(const Region& region, const SettlementOverview& reading, bool comparable)
{
    const auto update = [&](std::size_t ledger, std::span<const Reading> readings) {
        auto& parent = element(overviewLedgers[ledger]);
        auto& cache = overviewRows_[ledger];
        auto* cursor = parent.GetChild(0);
        for (std::size_t i = 0; i < readings.size(); ++i) {
            const auto& value = readings[i];
            const auto [entry, created] = cache.try_emplace(value.key);
            auto& row = entry->second;
            if (created) {
                auto node = document_->CreateElement("div");
                node->SetClass("ledger-row", true);
                node->SetAttribute("data-reading", value.key);
                const bool age = ledger == 0;
                const bool hasMeter = age || value.fill || value.key == "food" || value.key == "holding";
                const std::string meterMarkup = age ? "<div class=\"settlement-meter reading-hidden\">"
                    "<div class=\"younger\"></div><div class=\"adult\"></div><div class=\"elder\"></div></div>" :
                    hasMeter ? "<div class=\"settlement-meter reading-hidden\"><div></div></div>" : "";
                const auto line = ledger == 3 ?
                    "<button class=\"ledger-line stock-disclosure\" data-op=\"settlement-stock\" data-id=\"" +
                        escape(value.key) + "\" data-help=\"Inspect Stock sources\">" :
                    "<div class=\"ledger-line\">";
                node->SetInnerRML(line + "<span>0</span><span class=\"ledger-value\">0</span>" +
                    (ledger == 3 ? "</button>" : "</div>") +
                    meterMarkup + "<p class=\"quiet ledger-detail reading-hidden\">0</p>" +
                    (age ? "<p class=\"quiet ledger-detail reading-hidden\">0</p><p class=\"quiet elder-ages reading-hidden\">0</p>" : ""));
                row.node = parent.InsertBefore(std::move(node), cursor);
                auto* label = row.node->GetChild(0);
                row.text[0] = static_cast<Rml::ElementText*>(label->GetChild(0)->GetChild(0));
                row.text[1] = static_cast<Rml::ElementText*>(label->GetChild(1)->GetChild(0));
                row.meter = hasMeter ? row.node->GetChild(1) : nullptr;
                auto* detail = row.node->GetChild(hasMeter ? 2 : 1);
                row.text[2] = static_cast<Rml::ElementText*>(detail->GetChild(0));
                if (age) {
                    row.text[3] = static_cast<Rml::ElementText*>(detail->GetNextSibling()->GetChild(0));
                    row.text[4] = static_cast<Rml::ElementText*>(detail->GetNextSibling()->GetNextSibling()->GetChild(0));
                }
            } else if (row.node != cursor) {
                parent.InsertBefore(parent.RemoveChild(row.node), cursor);
            }
            cursor = row.node->GetNextSibling();
            bool changed = setText(*row.text[0], value.label);
            changed |= setText(*row.text[1], ledger == 3 ? value.value + " ›" : value.value);
            const auto detail = [&](std::size_t index, const std::string& text) {
                changed |= setText(*row.text[index], text);
                visibility(*row.text[index]->GetParentNode(), !text.empty());
            };
            detail(2, value.detail);
            auto* meter = row.meter;
            std::array<int, 3> widths{};
            if (value.fill) widths[0] = static_cast<int>(std::round(std::clamp(*value.fill, 0., 1.) * 100));
            if (ledger == 0) {
                const auto& people = reading.census[i];
                const auto total = people.children + people.adults + people.elders;
                std::string elders;
                for (const auto& [age, count] : people.elderAges) {
                    if (!elders.empty()) elders += " · ";
                    elders += qty(count) + " aged " + qty(age);
                }
                detail(3, total > 0 ? qty(people.scholars) + " Scholars · " + qty(people.warriors) + " Warriors" : "");
                detail(4, elders);
                if (total > 0) {
                    widths[0] = static_cast<int>(std::round(100 * people.children / total));
                    widths[1] = static_cast<int>(std::round(100 * (people.children + people.adults) / total)) - widths[0];
                    widths[2] = 100 - widths[0] - widths[1];
                }
            }
            if (meter) visibility(*meter, value.fill.has_value() || (ledger == 0 && widths[0] + widths[1] + widths[2] > 0));
            if (meter && widths != row.widths) {
                const auto bars = static_cast<std::size_t>(meter->GetNumChildren());
                for (std::size_t j = 0; j < bars; ++j)
                    if (widths[j] != row.widths[j])
                        meter->GetChild(static_cast<int>(j))->SetProperty("width", std::to_string(widths[j]) + "%");
                row.widths = widths;
                changed = true;
            }
            if (row.warning != value.warning) {
                row.node->SetClass("ledger-warning", row.warning = value.warning);
                changed = true;
            }
            const bool highlight = comparable && !created && changed;
            if (row.highlighted != highlight) row.node->SetClass("reading-changed", row.highlighted = highlight);
        }
        while (cursor) {
            auto* next = cursor->GetNextSibling();
            cache.erase(cursor->GetAttribute<Rml::String>("data-reading", ""));
            parent.RemoveChild(cursor);
            cursor = next;
        }
    };
    std::array<Reading, 2> population;
    std::array<Reading, 2> faith;
    std::size_t faithCount = 0;
    for (std::size_t i = 0; i < reading.census.size(); ++i) {
        const auto& people = reading.census[i];
        const auto total = people.children + people.adults + people.elders;
        const auto label = classNames[i];
        population[i] = {label, label, qty(total), total > 0 ?
            qty(people.children) + " children · " + qty(people.adults) + " adults · " + qty(people.elders) + " Elders" : ""};
        if (total <= 0) continue;
        auto cause = people.fullMeals > 0 ? qty(people.fullMeals) + " full meals in a row" :
            people.missedMeals > 0 ? qty(people.missedMeals) + " missed meals in a row" : "No current meal streak";
        if (reading.meal) {
            const auto ratio = i == 0 ? reading.meal->villagerRatio : reading.meal->strangerRatio;
            cause += " · " + number(ratio * 100) + "% fed last meal";
        }
        if (people.faithStreak > 0 && !people.faithTrend.empty())
            cause += " · " + people.faithTrend + " for " + qty(people.faithStreak) + " Faith checks";
        if (!reading.housingMoodCap.empty()) cause += " · Last housing cap " + reading.housingMoodCap;
        if (people.collapse) cause += " · Faith collapse active";
        faith[faithCount++] = {label, label, people.mood + " · " + people.faith, std::move(cause),
            people.collapse || people.mood == "Distressed"};
    }
    auto& total = element("overview-total");
    setText(*static_cast<Rml::ElementText*>(total.GetChild(0)), qty(region.population));
    visibility(element("overview-empty-faith"), faithCount == 0);
    const auto economy = std::span<const Reading>(reading.economy);
    visibility(element("overview-empty-stock"), economy.size() == 3);
    update(0, population);
    update(1, std::span(faith).first(faithCount));
    update(2, economy.first(3));
    update(3, economy.subspan(3));
    update(4, reading.control);
}

std::string View::practiceBoard(const Snapshot& snapshot, const Region& site, bool editable) const
{
    const bool showStage = selection_.destination && (editable || pendingAction_ == "reform");
    std::string html = "<div id=\"board\">";
    for (std::size_t i = 0; i < site.cards.size(); ++i) {
        auto shown = i;
        if (showStage && selection_.card) {
            const auto from = *selection_.card, to = *selection_.destination;
            if (i == to) shown = from;
            else if (from < to && i >= from && i < to) shown = i + 1;
            else if (from > to && i > to && i <= from) shown = i - 1;
        }
        const auto& card = site.cards[shown];
        const bool placed = !card.id.empty();
        html += "<button class=\"card";
        if (!placed) html += " empty disabled";
        if (selection_.card == shown) html += " chosen";
        if (showStage && selection_.destination == i) html += " staged";
        const auto help = placed ? card.name + " · " + card.mode :
            card.locked ? "This slot is locked." : "No Practice is installed in this slot.";
        html += "\" data-op=\"card\" data-locked=\"" + std::string(card.locked ? "true" : "false") +
            "\" data-id=\"" + std::to_string(shown) + "\" data-help=\"" + escape(help) +
            (placed ? "\"" : "\" disabled=\"disabled\"") + ">";
        if (const auto art = sprites_.find(card.id); art != sprites_.end())
            html += "<div class=\"card-art\" style=\"decorator:image(" + art->second + " fill);\"></div>";
        html += "<div class=\"card-slot\">" + std::to_string(i + 1) + "</div>";
        if (showStage && selection_.destination == i) html += "<div class=\"staged-mark\">Staged</div>";
        html += "<div class=\"card-name\">" + escape(placed ? card.name : card.locked ? "Locked" : "Empty") +
            "</div></button>";
    }
    html += "</div>";
    if (!selection_.card || site.cards[*selection_.card].id.empty()) {
        return html + (editable ? "<p class=\"quiet\">Select a Practice to inspect or reorder it.</p>" :
            "<p class=\"quiet\">Select a Practice to inspect staffing, Stock and activity.</p>");
    }
    if (showStage) {
        html += "<div class=\"reform-controls\"><p class=\"pending\">Staged move to slot " +
            std::to_string(*selection_.destination + 1);
        if (snapshot.shopSeconds) html += " · " + std::to_string(*snapshot.shopSeconds) + " seconds";
        html += "</p>";
        const bool applying = pendingAction_ == "reform";
        html += button("review", {}, applying ? "Applying reform" : "Review reform",
            applying ? "decision primary busy" : "decision primary", "Review the time cost before committing.", applying);
        html += button("undo", {}, "Undo", "decision", "Restore the committed order.", applying);
        html += "</div>";
    } else if (editable) {
        html += "<div class=\"reform-controls\">";
        for (const int step : {-1, 1}) {
            const auto next = static_cast<int>(*selection_.card) + step;
            const bool outside = next < 0 || next >= static_cast<int>(site.cards.size());
            const bool locked = !outside && site.cards[static_cast<std::size_t>(next)].locked;
            html += button("stage", std::to_string(next), step < 0 ? "Move left" : "Move right", "decision",
                outside ? "This Practice is at the edge of the board." : locked ? "The destination slot is locked." :
                "Stage this move.", outside || locked);
        }
        html += "</div>";
    }
    return html;
}

std::string View::structureBoard(const StructureReading* board)
{
    if (!board || !board->capacity) return "<p class=\"empty-reading\">No construction board at this settlement.</p>";
    std::string html = "<div class=\"moon-heading\"><h3>Construction</h3><span class=\"quiet\">" +
        std::to_string(board->occupied) + " / " + std::to_string(board->capacity) + " cells occupied</span></div>";
    html += "<div class=\"construction-board\">";
    for (std::size_t cell = 0; cell < board->capacity;) {
        const auto it = std::ranges::find(board->buildings, cell, &Building::origin);
        if (it == board->buildings.end()) {
            html += "<div class=\"construction-empty\"><span>" + std::to_string(cell + 1) + "</span></div>";
            ++cell;
            continue;
        }
        const auto& b = *it;
        const auto art = sprites_.find(b.id);
        html += "<button class=\"button building";
        if (building_ == cell) html += " chosen";
        if (b.warning) html += " building-warning";
        html += "\" style=\"flex-grow:" + std::to_string(b.width) + ";\" data-op=\"settlement-building\" data-id=\"" +
            std::to_string(cell) + "\" aria-pressed=\"" + (building_ == cell ? "true" : "false") +
            "\" data-help=\"" + escape(b.name + " · " + b.status) + "\">";
        if (art != sprites_.end())
            html += "<div class=\"building-art\" style=\"decorator:image(" + art->second + " cover);\"></div>";
        else html += "<div class=\"building-silhouette\"></div>";
        const auto span = b.width > 1 ? "–" + std::to_string(cell + b.width) : "";
        html += "<span class=\"cell-number\">" + std::to_string(cell + 1) + span + "</span>";
        html += "<div class=\"building-label\">" + escape(b.name) + "</div></button>";
        cell += std::max(std::size_t{1}, b.width);
    }
    return html + "</div>";
}

void View::refreshPanel(const Snapshot* snapshot)
{
    const auto* site = selection_.selected(snapshot);
    const bool sameRegion = selectedRegion_ == selection_.region;
    const auto before = settlementReadSecond_;
    const bool sameReading = sameRegion && !settlementDirty_ && (settlementTab_ != SettlementTab::practices ||
        selectedCard_ == selection_.card) && settlementReadGeneration_ == session_.generation();
    // A restore from either forecast can replace the displayed state at the same second.
    const bool readingChanged = !sameReading || settlementReadRevision_ != session_.viewRevision();
    auto& head = element("settlement-head");
    auto& body = element("settlement-scroll");
    if (!sameRegion) {
        building_.reset();
        stockDisclosure_.clear();
        markersDirty_ = true;
    }
    const bool canManage = canManageGarrison(session_, snapshot);
    const bool wasChoosing = document_->GetElementById("garrison-picker") != nullptr;
    const bool wasStock = document_->GetElementById("stock-drilldown") != nullptr;
    if (!canManage || !sameRegion || settlementTab_ != SettlementTab::overview) garrisonChoosing_ = false;
    if (document_->IsClassSet("settlement-selected") != (site != nullptr))
        markerSizesDirty_ = true;
    document_->SetClass("settlement-selected", site != nullptr);
    if (site && snapshot && readingChanged) {
        const auto start = std::chrono::steady_clock::now();
        settlementReading_ = session_.settlement(*site, settlementTab_, selection_.card, stockDisclosure_);
        settlementModelMs_ = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
        settlementReadSecond_ = snapshot->second;
        settlementReadGeneration_ = session_.generation();
        settlementReadRevision_ = session_.viewRevision();
    } else if (!site) {
        settlementReadSecond_.reset();
        settlementReading_ = {};
    }
    const bool actionStateChanged = busy_ != session_.busy() || previewing_ != session_.previewing();
    if (site && !readingChanged && settlementTab_ != SettlementTab::practices &&
        !(actionStateChanged && settlementReading_.overview && settlementReading_.overview->garrison))
        return;

    std::string header;
    std::string html;
    Values values;
    garrisonHighlights_.clear();
    const GarrisonReading* garrison = settlementReading_.overview && settlementReading_.overview->garrison ?
        &*settlementReading_.overview->garrison : nullptr;
    const Reading* sources = nullptr;
    if (!stockDisclosure_.empty() && settlementReading_.overview) {
        const auto& economy = settlementReading_.overview->economy;
        const auto found = std::ranges::find(economy, stockDisclosure_, &Reading::key);
        if (found != economy.end()) sources = &*found;
    }
    if (!sources) stockDisclosure_.clear();
    if (!garrison) garrisonChoosing_ = false;
    if (!site) {
        header = "<h2>Settlements</h2>";
        html = "<p class=\"empty-reading\">Select a region to view its settlement.</p>";
    } else {
        const auto holder = holderNames[static_cast<std::size_t>(site->holder)];
        const auto name = site->hasSite && !site->ruin ? site->settlement : site->name;
        header = "<h2 class=\"settlement-name\">" + escape(name) + "</h2><div class=\"settlement-location\">"
            "<span class=\"quiet\">" + (name != site->name ? escape(site->name) + " · " : "") + holder + "</span>";
        const auto homes = std::ranges::count_if(snapshot->regions, [](const Region& region) {
            return region.detailed && region.holder == Holder::player;
        });
        if (garrisonChoosing_ || sources) {
            header += button(sources ? "settlement-stock-back" : "settlement-garrison-cancel",
                {}, "‹ Overview", "settlement-back");
        } else if (homes > 1 || (homes == 1 && (!site->detailed || site->holder != Holder::player))) {
            header += "<div class=\"settlement-cycle\">" +
                button("settlement-cycle", "previous", "‹", "settlement-step", "Previous home settlement [") +
                button("settlement-cycle", "next", "›", "settlement-step", "Next home settlement ]") + "</div>";
        }
        header += "</div>";
        if (site->detailed && !garrisonChoosing_ && !sources) {
            header += "<div id=\"settlement-tabs\" class=\"settlement-tabs\" role=\"tablist\" aria-label=\"Settlement sections\">";
            for (std::size_t i = 0; i < tabNames.size(); ++i) {
                const auto index = std::to_string(i);
                header += "<button class=\"tab settlement-tab\" role=\"tab\" aria-controls=\"settlement-scroll\""
                    " id=\"settlement-tab-" + index + "\" data-op=\"settlement-tab\" data-id=\"" +
                    index + "\">" + tabNames[i] + "</button>";
            }
            header += "</div>";
        }
        const auto& read = settlementReading_;
        if (site->ruin) html = ruinLanding(*snapshot, *site, values);
        else if (read.storefront) html = storefrontLanding(*read.storefront, *site, values);
        else if (!site->detailed) html = "<p class=\"empty-reading\">No active settlement here.</p>";
        else if (sources) html = stockSources(*sources);
        else if (garrisonChoosing_) {
            html = garrisonPicker(*garrison);
            for (const auto& choice : garrison->choices)
                if (!choice.id.empty() && choice.reason.empty()) garrisonHighlights_.push_back(choice.region);
        }
        else switch (settlementTab_) {
        case SettlementTab::overview:
            if (read.overview) html = overviewLayout;
            break;
        case SettlementTab::moon:
            html = moonReport(read.moon ? &*read.moon : nullptr, values);
            break;
        case SettlementTab::structures:
            html = structureBoard(read.structures ? &*read.structures : nullptr);
            if (read.structures && !read.structures->buildings.empty()) {
                const auto found = building_ ? std::ranges::find(read.structures->buildings, *building_, &Building::origin) :
                    read.structures->buildings.end();
                if (found != read.structures->buildings.end()) {
                    const auto& building = *found;
                    html += "<div class=\"piece-inspection\" id=\"structure-inspector\"><h3>" + escape(building.name) +
                        "</h3><p class=\"quiet\">" + escape(building.status) + " · " + std::to_string(building.width) +
                        (building.width == 1 ? " cell" : " cells") + "</p><p class=\"rule\">" +
                        escape(building.rule) + "</p>" + rows(building.details, values, "building-") + "</div>";
                } else html += "<p class=\"quiet\">Select a building to inspect its effects.</p>";
            }
            break;
        case SettlementTab::practices:
            html = practiceBoard(*snapshot, *site, canStage(*snapshot, site));
            if (selection_.card && read.practice) {
                const auto& card = site->cards[*selection_.card];
                html += "<div id=\"inspector\" class=\"piece-inspection\"><h3>" + escape(card.name) +
                    "</h3><p class=\"quiet\">" + escape(card.quality + " · " + card.mode +
                        (read.practice->category.empty() ? "" : " · " + read.practice->category) +
                        (card.tags.empty() ? "" : " · " + card.tags)) + "</p>";
                if (read.practice->schedule != "") html += "<p class=\"quiet\">" + escape(read.practice->schedule) + "</p>";
                html += "<p class=\"rule\">" + escape(card.rule) + "</p>" + practiceDetails(&*read.practice, values) + "</div>";
            }
            break;
        }
    }
    const auto scroll = body.GetScrollTop();
    const bool tabChanged = renderedSettlementTab_ != settlementTab_;
    const bool headerChanged = settlementHeader_ != header;
    const bool remount = panelMarkup_ != html;
    const bool showOverview = settlementReading_.overview && !garrisonChoosing_ && !sources;
    const auto* focus = context_.GetFocusElement();
    const bool keyboard = focus && focus->IsPseudoClassSet("focus-visible");
    if (remount) {
        body.SetClass("overview-scroll", showOverview);
        for (auto& ledger : overviewRows_) ledger.clear();
        garrisonEntry_.clear();
    }
    replace(context_, head, settlementHeader_, std::move(header), !dialog_);
    if (headerChanged || tabChanged) {
        auto* tabs = document_->GetElementById("settlement-tabs");
        body.SetClass("has-settlement-tabs", tabs != nullptr);
        if (tabs) {
            for (int i = 0; i < tabs->GetNumChildren(); ++i) {
                auto& tab = *tabs->GetChild(i);
                const bool selected = static_cast<int>(settlementTab_) == i;
                tab.SetClass("on", selected);
                tab.SetAttribute("aria-selected", selected ? "true" : "false");
                if (selected) body.SetAttribute("aria-labelledby", tab.GetId());
            }
        } else body.RemoveAttribute("aria-labelledby");
    }
    replace(context_, body, panelMarkup_, std::move(html), !dialog_);
    const bool comparable = sameReading && before && settlementReadSecond_ != before;
    if (site && showOverview) {
        syncOverview(*site, *settlementReading_.overview, comparable);
        auto& entry = element("garrison-entry");
        const auto markup = !garrison ? "" : button("settlement-garrison", {},
            pendingAction_ == "garrison" && session_.busy() ? "Assigning garrison…" : "Garrison support · " + garrison->supported,
            "garrison-entry", canManage ? "Choose where this garrison serves." :
            session_.previewing() ? "Return to Live to assign support." : snapshot->terminal ? "This run has ended." :
            "A decision is being applied.", !canManage);
        replace(context_, entry, garrisonEntry_, markup, !dialog_);
    }
    if (wasChoosing != garrisonChoosing_ && keyboard && !dialog_) {
        Rml::Element* next = nullptr;
        if (garrisonChoosing_) {
            const auto choice = std::ranges::find_if(garrison->choices, [](const auto& row) {
                return !row.current && row.reason.empty();
            });
            if (choice != garrison->choices.end())
                next = body.QuerySelector("[data-op=settlement-garrison-target][data-id='" + choice->id + "']");
        } else next = body.QuerySelector("[data-op=settlement-garrison]");
        if (next && !next->HasAttribute("disabled")) next->Focus(true);
    }
    if (wasStock != (sources != nullptr) && keyboard && !dialog_) {
        auto* back = head.QuerySelector("[data-op=settlement-stock-back]");
        if (back) back->Focus(true);
        else body.Focus(true);
    }
    if (!sameRegion || tabChanged || wasChoosing != garrisonChoosing_) body.SetScrollTop(0);
    else if (wasStock && !sources) body.SetScrollTop(stockScroll_);
    else if (!wasStock && sources) body.SetScrollTop(0);
    else if (remount) body.SetScrollTop(scroll);
    if (comparable && !showOverview) {
        Rml::ElementList entries;
        body.QuerySelectorAll(entries, "[data-reading]");
        for (auto* row : entries) {
            const auto key = row->GetAttribute<Rml::String>("data-reading", "");
            const auto past = panelValues_.find(key);
            const auto next = values.find(key);
            const bool changed = past != panelValues_.end() && next != values.end() && past->second != next->second;
            row->SetClass("reading-changed", false);
            row->SetClass("reading-changed", changed);
        }
    }
    panelValues_ = std::move(values);
    renderedSettlementTab_ = settlementTab_;
    settlementDirty_ = false;
}

void View::refreshSettlementTime()
{
    const auto* snapshot = session_.displayed();
    std::string text;
    if (snapshot && document_->IsClassSet("settlement-selected")) {
        const char* mode = !session_.previewing() ? "Live" : !session_.previewReady() ? "Showing" :
            session_.previousPreview() ? "Previous" : "Preview";
        text = std::string(mode) + " · s " + std::to_string(snapshot->second);
    }
    auto& time = element("settlement-time");
    if (text != settlementTime_) time.SetInnerRML(settlementTime_ = std::move(text));
    time.SetClass("preview-time", session_.previewing());
}

void View::activateSettlement(std::string_view op, const std::string& id)
{
    if (op == "settlement-tab") {
        const auto next = static_cast<SettlementTab>(std::stoul(id));
        if (next != settlementTab_) {
            settlementTab_ = next;
            settlementDirty_ = true;
        }
    } else if (op == "settlement-building") {
        building_ = std::stoul(id);
        settlementDirty_ = true;
    } else if (op == "settlement-cycle") {
        cycleSettlement(id == "next");
    } else if (op == "settlement-stock") {
        stockScroll_ = element("settlement-scroll").GetScrollTop();
        stockDisclosure_ = id;
        settlementDirty_ = true;
    } else if (op == "settlement-stock-back") {
        stockDisclosure_.clear();
        settlementDirty_ = true;
    } else if (op == "settlement-garrison" && selectedRegion_ == selection_.region &&
               canManageGarrison(session_, session_.displayed())) {
        notify("");
        garrisonChoosing_ = true;
        settlementDirty_ = true;
        map_.overview();
    } else if (op == "settlement-garrison-target") {
        chooseGarrison(id);
    } else if (op == "settlement-garrison-cancel") {
        garrisonChoosing_ = false;
        settlementDirty_ = true;
    } else if (op == "settlement-help") {
        const auto text = id == "charge" ? "Charge builds on the listed trigger. It is private to this Practice." :
            id == "discharge" ? "Discharge runs the recipe automatically at threshold when its conditions are met." :
            id == "edible" ? "Edible Stock feeds residents during the Food phase." :
            "Stock lives on its producing Practice. Recipes match Stock traits.";
        notify(text);
    }
}

void View::cycleSettlement(bool next)
{
    const auto* snapshot = session_.displayed();
    const auto* site = selection_.selected(snapshot);
    if (!site) return;
    const auto count = snapshot->regions.size();
    auto index = static_cast<std::size_t>(site - snapshot->regions.data());
    const auto step = next ? 1 : count - 1;
    for (std::size_t offset = 1; offset < count; ++offset) {
        index = (index + step) % count;
        const auto& candidate = snapshot->regions[index];
        if (candidate.detailed && candidate.holder == Holder::player) {
            selectRegion(candidate.id);
            return;
        }
    }
}

bool View::chooseGarrison(const std::string& id)
{
    if (!garrisonChoosing_ || selectedRegion_ != selection_.region || !canManageGarrison(session_, session_.displayed()) ||
        !settlementReading_.overview || !settlementReading_.overview->garrison) return false;
    const auto& garrison = *settlementReading_.overview->garrison;
    const auto choice = std::ranges::find(garrison.choices, id, &GarrisonChoice::id);
    if (choice == garrison.choices.end()) return false;
    if (!choice->reason.empty()) {
        notify(choice->reason + ".", true);
        return true;
    }
    if (choice->current) return true;
    garrisonTarget_ = id;
    confirm(Confirmation::garrison, id.empty() ? "Restore local support" : "Assign garrison support",
        id.empty() ? "Return this garrison to local duty." : "Send this garrison to " + choice->name + ".",
        id.empty() ? qty(choice->defense) + " current local Defense" :
            qty(garrison.defense) + " local Defense · " + qty(choice->defense) + " at " + choice->name,
        id.empty() ? "Restore support" : "Assign support");
    return true;
}

void View::confirmGarrison()
{
    if (!garrisonTarget_) return;
    using core::json::Value;
    const auto target = std::move(*garrisonTarget_);
    garrisonTarget_.reset();
    if (!garrisonChoosing_ || !canManageGarrison(session_, session_.displayed()) ||
        !session_.submit({"settlementAssignGarrison", {{"regionId", Value(selection_.region)},
            {"targetRegionId", target.empty() ? Value(nullptr) : Value(target)}}})) {
        notify("Garrison assignment is unavailable in this view.", true);
        return;
    }
    notify("");
    pendingAction_ = "garrison";
    pendingGeneration_ = session_.generation();
    garrisonChoosing_ = false;
    settlementDirty_ = true;
}

bool View::backSettlement()
{
    if (!stockDisclosure_.empty()) stockDisclosure_.clear();
    else if (garrisonChoosing_) garrisonChoosing_ = false;
    else if (settlementTab_ == SettlementTab::practices && selection_.card) selection_.card.reset();
    else if (settlementTab_ == SettlementTab::structures && building_) building_.reset();
    else if (settlementTab_ != SettlementTab::overview) settlementTab_ = SettlementTab::overview;
    else return false;
    settlementDirty_ = true;
    return true;
}

bool View::keySettlement(SDL_Keycode key, Rml::Element* focus)
{
    if (lifeOpen_ || shell_.screen() != Screen::game) return false;
    if (key == SDLK_LEFTBRACKET || key == SDLK_RIGHTBRACKET) {
        cycleSettlement(key == SDLK_RIGHTBRACKET);
        return true;
    }
    if (!focus) return false;
    auto& head = element("settlement-head");
    auto& body = element("settlement-scroll");
    auto* ancestor = focus;
    while (ancestor && ancestor != &head && ancestor != &body) ancestor = ancestor->GetParentNode();
    if (!ancestor) return false;
    if ((key == SDLK_LEFT || key == SDLK_RIGHT) && focus->GetAttribute<Rml::String>("data-op", "") == "settlement-tab") {
        const auto offset = key == SDLK_RIGHT ? 1 : tabNames.size() - 1;
        const auto index = static_cast<std::size_t>(focus->GetAttribute<int>("data-id", 0));
        const auto next = (index + offset) % tabNames.size();
        const auto selector = "[data-op=settlement-tab][data-id='" + std::to_string(next) + "']";
        if (auto* tab = head.QuerySelector(selector)) {
            tab->Focus(true);
            activate(*tab);
        }
        return true;
    }
    const auto y = body.GetScrollTop();
    const auto page = body.GetClientHeight() * .85f;
    switch (key) {
        case SDLK_UP: body.SetScrollTop(y - 32 * density_); return true;
        case SDLK_DOWN: body.SetScrollTop(y + 32 * density_); return true;
        case SDLK_PAGEUP: body.SetScrollTop(y - page); return true;
        case SDLK_PAGEDOWN: body.SetScrollTop(y + page); return true;
        case SDLK_HOME: body.SetScrollTop(0); return true;
        case SDLK_END: body.SetScrollTop(body.GetScrollHeight()); return true;
        default: return false;
    }
}

}
