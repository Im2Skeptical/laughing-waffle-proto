#include "connected_view.hpp"
#include "connected_markup.hpp"

#include <algorithm>

namespace waffle::connected {
namespace {

using namespace markup;
using core::json::Value;
using Colour = std::array<Uint8, 4>;

void line(SDL_Renderer* renderer, SDL_FPoint a, SDL_FPoint b, Colour ink)
{
    SDL_SetRenderDrawColor(renderer, ink[0], ink[1], ink[2], ink[3]);
    SDL_RenderLine(renderer, a.x, a.y, b.x, b.y);
}

}

void View::setLifeOpen(bool open)
{
    lifeOpen_ = open;
    lifeDirty_ = markersDirty_ = true;
    lifeNode_.clear();
    heirloomPicks_.clear();
    resetShopSelection();
    shopDraft_ = {};
    shopNode_.clear();
    lifeRoute_ = false;
    lifeConfirm_.reset();
    life_ = {};
    lifeRevision_ = ~std::uint64_t{};
    element("life-screen").SetProperty("display", open ? "block" : "none");
    element("map").SetProperty("display", open ? "none" : "block");
    element("panel").SetProperty("display", open ? "none" : "block");
    element("screen-title").SetInnerRML(open ? "Vassal Chronicle" : "Regional Map");
    element("life-toggle").SetAttribute("data-help", open ? "Return to the regional map." : "Open the Vassal Life Map.");
    element("life-toggle").SetClass("on", open);
    element("life-toggle").SetInnerRML(open ? "Atlas" : "Life Map");
    element("life-toggle").SetAttribute("aria-pressed", open ? "true" : "false");
    if (!open) element("life-toggle").Focus();
}

namespace {

constexpr std::array nodeClasses{"locked", "available", "current", "completed"};
constexpr std::array nodeInks{Colour{84, 83, 66, 255}, Colour{174, 188, 117, 255},
    Colour{239, 192, 108, 255}, Colour{115, 157, 173, 255}};

double nodeX(const LifeNode& node) { return 4 + 92 * node.x; }
double nodeY(const LifeNode& node) { return 20 + 60 * node.y; }

bool inventoryChoice(const LifeChoice& choice)
{
    return choice.command.kind == "vassalConfirmHeirloomLoadout" || choice.command.kind == "vassalResolveVaultOverflow";
}

std::string lifeControl(std::size_t index, const LifeChoice& choice, bool selected, bool disabled)
{
    std::string art;
    if (!choice.art.empty())
        art = "<div class=\"life-choice-art\" style=\"decorator:image(/images/dark-fantasy/heirlooms-v1/" +
            escape(choice.art) + ".png contain);\"></div>";
    return "<button class=\"button life-choice" + std::string(selected ? " chosen" : "") +
        (choice.reason.empty() ? "" : " blocked") + "\" data-op=\"life-choice\" data-id=\"" +
        std::to_string(index) + "\" data-help=\"" + escape(choice.reason.empty() ? choice.detail : choice.reason) +
        "\" aria-pressed=\"" + (selected ? "true" : "false") + (disabled ? "\" disabled=\"disabled" : "") +
        "\"><div>" + escape(choice.label) + "</div>" + art +
        (choice.detail.empty() ? "" : "<p class=\"quiet\">" + escape(choice.detail) + "</p>") +
        (choice.reason.empty() ? "" : "<p class=\"blocked-reason\">" + escape(choice.reason) + "</p>") + "</button>";
}

}

void View::refreshLife(const Snapshot& snapshot)
{
    const bool readOnly = session_.previewing();
    const bool busy = session_.busy();
    const bool rebuild = lifeRevision_ != session_.viewRevision() || lifeReadOnly_ != readOnly;
    if (!rebuild && !lifeDirty_ && lifeBusy_ == busy) return;
    if (rebuild) {
        const auto actor = life_.actor, current = life_.current, decision = life_.decision;
        const bool wasShop = life_.shop.has_value();
        life_ = session_.lifeMap(true);
        lifeRevision_ = session_.viewRevision();
        if (!readOnly && (life_.shop || life_.shopSpecialty)) {
            if (shopDraft_.empty() || shopNode_ != life_.current) {
                shopDraft_ = session_.shopDraft();
                shopNode_ = life_.current;
                shopError_.clear();
                shopConstruction_ = life_.shop && std::ranges::any_of(life_.shop->offers, [](const ShopItem& item) {
                    return item.kind == "structure";
                });
            } else life_ = shopDraft_.reading();
        }
        if (actor != life_.actor || current != life_.current || decision != life_.decision || wasShop != life_.shop.has_value()) {
            resetShopSelection();
            lifeRoute_ = false;
            heirloomPicks_.clear();
            if (!life_.current.empty()) lifeNode_ = life_.current;
            else if (actor != life_.actor) lifeNode_.clear();
            element("life-inspector").SetScrollTop(0);
        }
    }
    lifeReadOnly_ = readOnly;
    lifeBusy_ = busy;
    lifeDirty_ = false;
    const bool disabled = readOnly || busy || snapshot.terminal;
    const bool choosing = !life_.candidates.empty();
    if (lifeNode_.empty()) {
        const auto available = std::ranges::find(life_.nodes, NodeStatus::available, &LifeNode::status);
        if (available != life_.nodes.end()) lifeNode_ = available->id;
        else if (!life_.nodes.empty()) lifeNode_ = life_.nodes.front().id;
    }
    auto& chart = element("life-chart");
    auto& inspector = element("life-inspector");
    auto* focus = context_.GetFocusElement();
    const auto focusOp = focus ? focus->GetAttribute<Rml::String>("data-op", "") : "";
    const auto focusId = focus ? focus->GetAttribute<Rml::String>("data-id", "") : "";
    const bool restoreFocus = focusOp.starts_with("life-") && focus->IsPseudoClassSet("focus-visible") && !dialog_;

    const bool showShop = life_.shop && !lifeRoute_ && !choosing;
    chart.SetClass("candidates", choosing);
    chart.SetClass("shop-floor", showShop);
    std::string graph = "<h2 class=\"life-chart-title\">" + std::string(choosing ? "Choose a Vassal" : "Life Map") + "</h2>";
    if (showShop) graph = shopOffers(disabled);
    else if (choosing) {
        graph += "<div class=\"life-candidates\">";
        for (std::size_t i = 0; i < life_.candidates.size(); ++i) {
            const auto& candidate = life_.candidates[i];
            graph += "<button class=\"button life-candidate\" data-op=\"life-candidate\" data-id=\"" + std::to_string(i) +
                "\" data-help=\"Appoint " + escape(candidate.name) + "\"" +
                (disabled || life_.decision == "Heirloom vault overflow" ? " disabled=\"disabled\"" : "") + ">";
            graph += "<div class=\"life-portrait\" style=\"decorator:image(/images/dark-fantasy/vassal-class-v1/" +
                candidate.art + "-founder.png contain);\"></div><h2>" + escape(candidate.name) + "</h2>";
            graph += "<p class=\"gold\">Age " + number(candidate.age) + " · " + number(candidate.prestige) + " Prestige</p>";
            for (const auto& [label, value] : candidate.stats)
                graph += "<p class=\"quiet\">" + escape(label) + " " + number(value) + "</p>";
            graph += "</button>";
        }
        graph += "</div>";
    } else {
        for (const auto& node : life_.nodes) {
            graph += "<button class=\"button life-node " + std::string(nodeClasses[static_cast<std::size_t>(node.status)]) +
                (node.id == lifeNode_ ? " chosen" : "") + "\" data-op=\"life-node\" data-id=\"" + escape(node.id) +
                "\" data-help=\"" + escape(node.label + (node.detail.empty() ? "" : " · " + node.detail)) +
                "\" aria-label=\"" + escape(node.label) + "\" style=\"left:" + number(nodeX(node), 2) +
                "%;top:" + number(nodeY(node), 2) + "%;\">" + escape(node.glyph) + "</button>";
        }
        graph += "<p class=\"life-legend\"><span style=\"color:#c7d592;\">Available</span> · "
            "<span class=\"gold\">Current</span> · <span style=\"color:#9fbfcf;\">Completed</span> · Locked</p>";
    }
    if (graph != lifeChartMarkup_) {
        const auto scroll = chart.GetScrollTop();
        chart.SetInnerRML(lifeChartMarkup_ = std::move(graph));
        chart.SetScrollTop(scroll);
    }

    std::string html;
    if (readOnly) html += "<p class=\"life-brief quiet\">Preview · Return to Live to act.</p>";
    else if (busy) html += "<p class=\"life-brief pending\">Applying decision…</p>";
    if (!life_.succession.empty()) html += "<p class=\"life-brief gold\">" + escape(life_.succession) + "</p>";
    if (choosing) {
        html += "<div class=\"life-brief\"><h2>Succession</h2><p class=\"quiet\">" +
            number(life_.tenures) + " tenures remaining</p>";
        if (life_.canReroll) {
            html += button("life-reroll", {}, "Reroll candidates", "decision",
                "Generate a new pool. Free and unlimited.", disabled);
            html += "<p class=\"life-summary\">Free · " + number(life_.rerolls) + " used</p>";
        }
        html += "</div>";
    } else if (!showShop && !life_.name.empty()) {
        html += "<div class=\"life-brief\"><h2>" + escape(life_.name) + "</h2><p class=\"quiet\">" +
            escape(life_.location) + "</p><p class=\"life-summary\">" + escape(life_.summary) + "</p></div>";
    }
    const auto node = std::ranges::find(life_.nodes, lifeNode_, &LifeNode::id);
    if (showShop) html += shopDetail(disabled);
    else if (!choosing && node != life_.nodes.end() && node->status != NodeStatus::current) {
        html += "<h2>" + escape(node->label) + "</h2>";
        if (!node->detail.empty()) html += "<p class=\"quiet life-state\">" + escape(node->detail) + "</p>";
        if (node->status == NodeStatus::available)
            html += button("life-enter", node->id, "Enter " + node->label, "decision primary", "Open this node.", disabled);
        if (!life_.current.empty())
            html += button("life-current", {}, "Back to current node", "decision");
        else if (!life_.decision.empty())
            html += "<div class=\"life-brief\"></div>";
    }
    if (!showShop && (choosing || node == life_.nodes.end() || node->status == NodeStatus::current || life_.current.empty())) {
        if (!life_.decision.empty()) html += "<h2>" + escape(life_.decision) + "</h2>";
        if (life_.shop) html += button("life-route", {}, "Return to shop");
        if (!life_.decisionDetail.empty())
            html += "<p class=\"quiet life-state\">" + escape(life_.decisionDetail) + "</p>";
        if (life_.progress) {
            const auto [start, end] = *life_.progress;
            const auto shown = std::clamp(snapshot.second, start, end);
            const auto fraction = end > start ? double(shown - start) / double(end - start) : 1.;
            html += "<div class=\"progress life-progress\"><div class=\"progress-fill\" style=\"width:" +
                number(100 * fraction) + "%;\"></div></div><p class=\"life-summary\">" +
                std::to_string(start) +  " s to " + std::to_string(end) + " s · At " + std::to_string(snapshot.second) + " s</p>";
        }
        for (std::size_t i = 0; !life_.shop && i < life_.choices.size(); ++i) {
            const auto& choice = life_.choices[i];
            html += lifeControl(i, choice, choice.selected || std::ranges::find(heirloomPicks_, i) != heirloomPicks_.end(), disabled);
        }
        if (life_.decision == "Successor's Heirlooms" || life_.decision == "Heirloom vault overflow") {
            const bool overflow = life_.decision == "Heirloom vault overflow";
            html += button("life-inheritance", {}, "Confirm " + std::string(overflow ? "vault" : "loadout"),
                "decision primary", {}, disabled || (overflow && heirloomPicks_.size() != 6));
        }
    }
    if (!showShop && !life_.events.empty()) {
        html += "<div class=\"life-brief\"></div><p class=\"gold\">Life events</p>";
        for (const auto& [second, event] : life_.events)
            html += "<p class=\"quiet life-entry\">" + std::to_string(second) + " s · " + escape(event) + "</p>";
    }
    if (html != lifeInspectorMarkup_) {
        const auto scroll = inspector.GetScrollTop();
        inspector.SetInnerRML(lifeInspectorMarkup_ = std::move(html));
        inspector.SetScrollTop(scroll);
    }
    if (restoreFocus) {
        Rml::ElementList controls;
        element("life-screen").QuerySelectorAll(controls, "button");
        Rml::Element* next = nullptr;
        for (auto* control : controls) {
            if (control->HasAttribute("disabled")) continue;
            if (control->GetAttribute<Rml::String>("data-op", "") == focusOp &&
                control->GetAttribute<Rml::String>("data-id", "") == focusId) {
                next = control;
                break;
            }
        }
        if (next && context_.GetFocusElement() != next) next->Focus(true);
    }
    if (shopFocusBoard_ && !dialog_) {
        shopFocusBoard_ = false;
        if (auto* target = chart.QuerySelector(".valid-target:not(.chosen)")) {
            target->Focus(true);
            target->ScrollIntoView(Rml::ScrollAlignment::Nearest);
        }
    }
}

void View::drawLifePaths()
{
    if (!life_.candidates.empty() || (life_.shop && !lifeRoute_)) return;
    const auto area = bounds("life-chart");
    SDL_SetRenderDrawColor(renderer_, 28, 33, 25, 255);
    SDL_RenderFillRect(renderer_, &area);
    for (int row = 1; row < 6; ++row) {
        const auto y = area.y + area.h * (.05f + .15f * row);
        line(renderer_, {area.x + 1, y}, {area.x + area.w - 1, y}, {40, 47, 35, 255});
    }
    const auto point = [&](const LifeNode& node) {
        return SDL_FPoint{area.x + 1 + static_cast<float>((area.w - 2) * nodeX(node) / 100),
            area.y + 1 + static_cast<float>((area.h - 2) * nodeY(node) / 100)};
    };
    for (const auto& [from, to] : life_.paths) {
        const auto& source = life_.nodes[from];
        const auto& target = life_.nodes[to];
        const auto status = target.status == NodeStatus::completed && source.status != NodeStatus::completed
            ? NodeStatus::locked : target.status;
        const auto ink = nodeInks[static_cast<std::size_t>(status)];
        const auto a = point(source), b = point(target);
        const auto middle = (a.x + b.x) / 2;
        line(renderer_, a, {middle, a.y}, ink);
        line(renderer_, {middle, a.y}, {middle, b.y}, ink);
        line(renderer_, {middle, b.y}, b, ink);
    }
}

void View::submitLife(const LifeCommand& command)
{
    if (!session_.submit(command)) {
        notify(session_.previewing() ? "Return to Live to make decisions." : "This decision is unavailable.", true);
        return;
    }
    pendingAction_ = "life";
    pendingGeneration_ = session_.generation();
    lifeFeedback_ = command.feedback;
    notify("");
}

void View::activateLife(std::string_view op, const std::string& id)
{
    if (op == "life-toggle") {
        setLifeOpen(!lifeOpen_);
        return;
    }
    if (!lifeOpen_) return;
    if (op == "life-node" || op == "life-current") {
        lifeNode_ = op == "life-current" ? life_.current : id;
        lifeDirty_ = true;
        element("life-inspector").SetScrollTop(0);
        return;
    }
    if (activateShop(op, id)) return;
    if (op == "life-route") {
        lifeRoute_ = !lifeRoute_;
        if (life_.shop) lifeNode_ = life_.current;
        lifeDirty_ = true;
        element("life-inspector").SetScrollTop(0);
    } else if (op == "life-board") {
        if (const auto* view = session_.liveSnapshot(); view && !view->vassalRegion.empty()) selectRegion(view->vassalRegion);
        setLifeOpen(false);
    } else if (op == "life-reroll") {
        lifeConfirm_ = LifeCommand{"settlementRerollVassals", {}, "New candidates have arrived"};
        confirm(Confirmation::life, "Reroll candidates?", "The current candidates will leave.", "Free · unlimited", "Reroll");
    } else if (op == "life-candidate") {
        const auto index = std::stoul(id);
        if (index >= life_.candidates.size()) return;
        const auto& candidate = life_.candidates[index];
        lifeConfirm_ = candidate.command;
        confirm(Confirmation::life, "Appoint " + candidate.name + "?", "This Vassal will begin their tenure.",
            candidate.location, "Appoint");
    } else if (op == "life-enter") {
        const auto node = std::ranges::find(life_.nodes, id, &LifeNode::id);
        if (node == life_.nodes.end() || node->status != NodeStatus::available) return;
        lifeConfirm_ = LifeCommand{"vassalEnterLifeNode", {{"nodeId", Value(id)}}, "Entered " + node->label};
        confirm(Confirmation::life, "Enter " + node->label + "?", "This commits the next stop on your Life Map.", {}, "Enter node");
    } else if (op == "life-inheritance") {
        const bool overflow = life_.decision == "Heirloom vault overflow";
        Value::Array ids;
        for (const auto index : heirloomPicks_) ids.push_back(life_.choices.at(index).command.payload.front().value);
        lifeConfirm_ = LifeCommand{overflow ? "vassalResolveVaultOverflow" : "vassalConfirmHeirloomLoadout",
            {{overflow ? "keepInstanceIds" : "equippedInstanceIds", Value(std::move(ids))}}, "Inheritance recorded"};
        confirm(Confirmation::life, overflow ? "Confirm vault?" : "Confirm loadout?",
            overflow ? "Unselected Heirlooms will be lost." : "The chosen Heirlooms will be equipped for this tenure.",
            {}, "Confirm");
    } else if (op == "life-choice") {
        const auto index = std::stoul(id);
        if (index >= life_.choices.size()) return;
        const auto& choice = life_.choices[index];
        if (!choice.reason.empty()) {
            if (life_.shop) {
                shopError_ = choice.reason;
                lifeDirty_ = true;
            } else notify(choice.reason, true);
            return;
        }
        if (life_.shopSpecialty && choice.command.kind == "vassalSelectLifeOption") {
            const auto command = choice.command;
            stageShop(command);
        } else if (life_.shop && (choice.command.kind == "vassalConfirmLifeNode" || choice.command.kind == "vassalRerollShop")) {
            lifeConfirm_ = choice.command;
            const bool checkout = choice.command.kind == "vassalConfirmLifeNode";
            const auto& shop = *life_.shop;
            std::string summary = checkout ? "Apply the board shown in this draft." : "Refresh this shop's offers.";
            if (checkout && !shop.discarded.empty())
                summary += " Discard " + std::to_string(shop.discarded.size()) + (shop.discarded.size() == 1 ? " Practice." : " Practices.");
            if (checkout && !shop.demolished.empty())
                summary += " Demolish " + std::to_string(shop.demolished.size()) + (shop.demolished.size() == 1 ? " Structure." : " Structures.");
            confirm(Confirmation::shop, checkout ? "Confirm checkout?" : "Delve?", summary,
                choice.detail, checkout ? "Check out" : "Delve");
        } else if (inventoryChoice(choice)) {
            const auto found = std::ranges::find(heirloomPicks_, index);
            if (found != heirloomPicks_.end()) heirloomPicks_.erase(found);
            else if (heirloomPicks_.size() < (life_.decision == "Heirloom vault overflow" ? 6 : 3))
                heirloomPicks_.push_back(index);
            else notify("The selection is full. Deselect an Heirloom to make room.", true);
            lifeDirty_ = true;
        } else if (choice.command.kind == "vassalConfirmLifeNode" || choice.command.kind == "vassalRerollShop") {
            lifeConfirm_ = choice.command;
            confirm(Confirmation::life, choice.label + "?", "Commit this decision and update the forecast.",
                choice.detail, "Confirm");
        } else submitLife(choice.command);
    }
}

}
