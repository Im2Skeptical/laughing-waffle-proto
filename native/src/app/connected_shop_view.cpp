#include "connected_view.hpp"
#include "connected_markup.hpp"

#include <algorithm>
#include <span>

namespace waffle::connected {
namespace {

using namespace markup;
using core::json::Value;

}

const ShopItem* View::selectedOffer() const
{
    if (!life_.shop || shopSource_.first != "life-offer") return nullptr;
    const auto& offers = life_.shop->offers;
    const auto found = std::ranges::find(offers, shopSource_.second, &ShopItem::id);
    return found == offers.end() ? nullptr : &*found;
}

std::string View::shopArt(std::string_view id) const
{
    if (const auto art = sprites_.find(std::string(id)); art != sprites_.end())
        return "<div class=\"shop-art\" style=\"decorator:image(" + art->second + " fill);\"></div>";
    return {};
}

const View::ShopTarget* View::shopTarget(const ShopControl& key) const
{
    const auto found = std::ranges::find(shopTargets_, key, &ShopTarget::control);
    return found == shopTargets_.end() ? nullptr : &*found;
}

std::string View::shopPieceControl(std::string_view op, std::string id, std::string caption,
    const ShopPiece* piece, bool locked, bool disabled, bool continuation) const
{
    const auto* target = shopTarget({std::string(op), id});
    const auto selected = piece && shopSource_.second == piece->id;
    const auto state = selected ? " chosen" : target ? (target->reason.empty() ? " valid-target" : " invalid-target") :
        locked ? " locked" : piece ? " occupied" : "";
    const auto pending = piece && (!piece->receipt.empty() || piece->moved);
    const auto help = target ? (target->reason.empty() ? target->consequence : target->reason) :
        (piece ? caption + " · " + piece->label : caption);
    return "<button class=\"button shop-cell" + std::string(state) + (pending ? " staged" : "") +
        "\" data-op=\"" + std::string(op) + "\" data-id=\"" + escape(id) + "\" data-help=\"" + escape(help) +
        "\" aria-label=\"" + escape(help) + "\"" +
        (piece ? " data-piece=\"" + escape(piece->id) + "\"" : "") +
        (disabled || (!piece && !target) ? " disabled=\"disabled\"" : "") + "><div class=\"shop-cell-caption\">" +
        escape(caption) + "</div>" + (continuation ? "<span class=\"shop-link\">↳</span>" :
        piece ? shopArt(piece->art) + "<p>" + escape(piece->label) + "</p>" : "") +
        (pending && !continuation ? "<span class=\"shop-pending-mark\">Staged</span>" : "") + "</button>";
}

std::string View::shopOffers(bool disabled) const
{
    const auto& shop = *life_.shop;
    std::string html = "<div class=\"shop-heading\"><h2>" + escape(life_.decision) +
        "</h2><p class=\"quiet\">" + escape(shop.region) + "</p></div>";
    html += "<div class=\"shop-tabs\">" +
        button("life-tableau", "practice", "Practices", shopConstruction_ ? "decision" : "decision chosen") +
        button("life-tableau", "structure", "Construction", shopConstruction_ ? "decision chosen" : "decision") + "</div>";
    if (const auto* offer = selectedOffer(); offer && offer->kind == "practice" && offer->mode == "learn" && offer->reason.empty()) {
        html += "<div class=\"shop-tabs shop-placement-mode\">" +
            button("life-insert-mode", "replace", "Replace", shopInsert_ ? "decision" : "decision chosen",
                "Replace the Practice in the chosen slot.", disabled) +
            button("life-insert-mode", "insert", "Insert", shopInsert_ ? "decision chosen" : "decision",
                "Shift the board order. The last Practice is discarded if the board is full.", disabled) + "</div>";
    }
    html += shopBoard(shopConstruction_ ? "life-origin" : "life-slot", disabled);
    html += "<p id=\"shop-target-preview\" class=\"shop-target-preview\"></p>";
    html += "<div class=\"shop-market-label\"><span class=\"gold\">Offers</span>";
    if (!shopSource_.first.empty()) html += button("life-clear-selection", {}, "Clear selection");
    html += "</div>";
    if (shop.offers.empty()) return html + "<p class=\"quiet\">No offers remain.</p>";
    html += "<div class=\"shop-grid\">";
    for (const auto& item : shop.offers) {
        const bool chosen = shopSource_ == ShopControl{"life-offer", item.id};
        const bool drag = !disabled && item.reason.empty() &&
            (item.kind == "structure" || (item.kind == "practice" && item.mode != "remove"));
        html += "<button class=\"button shop-offer" + std::string(chosen ? " chosen" : "") +
            (item.reason.empty() ? "" : " blocked") + "\" data-op=\"life-offer\" data-id=\"" + escape(item.id) +
            "\" data-help=\"" + escape(item.reason.empty() ? item.label : item.reason) +
            "\" aria-pressed=\"" + (chosen ? "true" : "false") + "\"" +
            (drag ? " data-shop-drag=\"true\"" : "") + ">" + shopArt(item.art);
        html += "<div class=\"shop-offer-text\"><div>" + escape(item.label) + "</div><p class=\"life-summary\">" +
            escape(item.cost) + "</p>";
        if (!item.reason.empty()) html += "<p class=\"blocked-reason\">" + escape(item.reason) + "</p>";
        html += "</div></button>";
    }
    return html + "</div>";
}

std::string View::shopBoard(std::string_view op, bool disabled) const
{
    const auto& shop = *life_.shop;
    std::string html = "<div class=\"shop-strip\">";
    if (op == "life-slot") {
        for (std::size_t i = 0; i < shop.practices.size(); ++i) {
            const auto& piece = shop.practices[i];
            html += shopPieceControl(op, std::to_string(i), "Slot " + std::to_string(i + 1) +
                (i >= shop.capacity ? " · Locked" : piece.id.empty() ? " · Empty" : ""),
                piece.id.empty() ? nullptr : &piece, i >= shop.capacity, disabled);
        }
    } else {
        for (std::size_t i = 0; i < shop.cells.size(); ++i) {
            const auto piece = std::ranges::find_if(shop.structures, [i](const auto& card) {
                return i >= card.origin && i < card.origin + card.width;
            });
            const auto occupied = piece != shop.structures.end();
            html += shopPieceControl(op, std::to_string(i), "Space " + std::to_string(i + 1),
                occupied ? &*piece : nullptr, false, disabled, occupied && i > piece->origin);
        }
    }
    html += "</div>";
    if (const auto* discard = shopTarget({"life-scrap", {}}))
        html += button("life-scrap", {}, discard->consequence,
            discard->reason.empty() ? "decision valid-target" : "decision invalid-target",
            discard->reason, disabled);
    const auto& removed = shopConstruction_ ? shop.demolished : shop.discarded;
    if (!removed.empty()) {
        html += "<div class=\"shop-discard\"><p class=\"quiet\">" +
            std::string(shopConstruction_ ? "Demolition at checkout" : "Discard at checkout") + "</p>";
        for (const auto& piece : removed)
            html += button("life-recover", piece.id, "Recover " + piece.label,
                "decision " + std::string(shopSource_.second == piece.id ? "chosen" : ""), {}, disabled);
        html += "</div>";
    }
    return html;
}

std::string View::shopDetail(bool disabled) const
{
    const auto& shop = *life_.shop;
    std::string html = "<div class=\"life-brief\"><p class=\"quiet\">Available · " + escape(shop.funds) + "</p>" +
        "<p class=\"shop-total\">Checkout · " + escape(shop.total) + "</p>";
    for (std::size_t i = 0; i < life_.choices.size(); ++i) {
        const auto& choice = life_.choices[i];
        const bool checkout = choice.command.kind == "vassalConfirmLifeNode";
        html += button("life-choice", std::to_string(i), checkout
            ? (!shopDraft_.empty() || shop.changed ? "Review checkout" : "Leave shop") : choice.label,
            checkout ? "decision primary" : "decision", choice.reason.empty() ? choice.detail : choice.reason, disabled);
        if (!choice.reason.empty()) html += "<p class=\"blocked-reason\">" + escape(choice.reason) + "</p>";
        else if (!checkout) html += "<p class=\"quiet\">" + escape(choice.detail) + "</p>";
    }
    if (!shopDraft_.empty()) {
        html += "<div class=\"shop-draft-tools\">" + button("life-revert", {}, "Undo last edit", "decision", {}, disabled) +
            button("life-cancel-draft", {}, "Clear draft", "decision", {}, disabled) + "</div>";
    }
    if (!shopError_.empty()) html += "<p class=\"blocked-reason\">" + escape(shopError_) + "</p>";
    html += "</div>";
    if (const auto* offer = selectedOffer()) {
        html += "<h2>" + escape(offer->label) + "</h2><p class=\"life-summary\">" + escape(offer->cost) + "</p>";
        if (!offer->description.empty()) html += "<p class=\"quiet\">" + escape(offer->description) + "</p>";
        if (!offer->reason.empty()) html += "<p class=\"blocked-reason\">" + escape(offer->reason) + "</p>";
        else if (!shopTargets_.empty() && (offer->kind == "structure" || (offer->kind == "practice" && offer->mode != "remove")))
            html += "<p class=\"quiet\">Choose a destination on the board.</p>";
        if (const auto* target = shopTarget({"life-purchase", {}}))
            html += button("life-purchase", {}, target->consequence, "decision",
                target->reason, disabled);
        html += "<div class=\"life-brief\"></div>";
    } else if (!shopSource_.first.empty()) {
        html += "<p class=\"quiet\">Choose a destination on the board.</p>";
    }
    if (!shop.staged.empty()) {
        html += "<p class=\"gold\">Staged orders</p>";
        for (const auto& item : shop.staged) {
            html += "<div class=\"shop-receipt\"><div>" + escape(item.label) + "<p class=\"life-summary\">" +
                escape(item.cost) + (item.description.empty() ? "" : " · " + escape(item.description)) + "</p></div><div>";
            if (item.kind == "practice" && item.mode != "remove")
                html += button("life-receipt", item.id, "Order", "decision", "Reorder " + item.label, disabled);
            html += button("life-undo-purchase", item.id, "Undo", "decision", "Return " + item.label, disabled) + "</div></div>";
        }
    }
    html += "<div class=\"life-brief\"></div>" + button("life-route", {}, "Life route") +
        button("life-board", {}, "Settlement");
    return html;
}


void View::resetShopSelection()
{
    shopSource_ = {};
    shopTargets_.clear();
    shopPressed_.reset();
    shopHoveredTarget_.reset();
    shopDragStarted_ = false;
    shopInsert_ = false;
    shopFocusBoard_ = false;
}

void View::selectShopSource(ShopControl source)
{
    if (!life_.shop || session_.previewing() || session_.busy()) return;
    const auto& shop = *life_.shop;
    shopSource_ = std::move(source);
    shopTargets_.clear();
    shopError_.clear();
    lifeDirty_ = true;

    const auto command = [&](std::string kind, const std::string& id) {
        return LifeCommand{std::move(kind), {{"nodeId", Value(life_.current)}, {"offerId", Value(id)}}, {}};
    };
    const auto add = [&](std::string_view op, std::string id, LifeCommand action, std::string consequence,
                         std::string reason = {}) {
        if (reason.empty()) reason = shopDraft_.check(action);
        shopTargets_.push_back({{std::string(op), std::move(id)}, std::move(action),
            std::move(consequence), std::move(reason)});
    };

    const auto* offer = selectedOffer();
    const auto& [op, id] = shopSource_;
    if (offer && !offer->reason.empty()) return;
    if (offer && offer->kind != "structure" && (offer->kind != "practice" || offer->mode == "remove")) {
        add("life-purchase", {}, offer->command, "Stage offer");
        return;
    }

    const bool structure = offer ? offer->kind == "structure" : id.starts_with("structure:");
    shopConstruction_ = structure;
    if (structure) {
        const ShopPiece* piece = nullptr;
        if (!offer) {
            for (const auto* list : {&shop.structures, &shop.demolished}) {
                const auto found = std::ranges::find(*list, id, &ShopPiece::id);
                if (found != list->end()) piece = &*found;
            }
            if (!piece) return;
        }
        if (offer && !offer->spans.empty()) {
            const auto& span = offer->spans.front();
            const auto label = "Stage at space " + std::to_string(span.origin + 1);
            add("life-purchase", {}, offer->command,
                span.replacement.empty() ? label : label + " · Replaces " + span.replacement);
        }
        for (std::size_t i = 0; i < shop.cells.size(); ++i) {
            auto place = offer ? offer->command : command("vassalMoveShopStructure",
                piece->receipt.empty() ? piece->id : piece->receipt);
            place.payload.emplace_back("origin", Value(double(i)));
            const auto span = offer ? std::ranges::find(offer->spans, i, &ShopSpan::origin) :
                std::vector<ShopSpan>::const_iterator{};
            const auto width = piece ? piece->width : span == offer->spans.end() ? 1 : span->width;
            auto consequence = std::string(offer ? "Build " : "Move ") + (offer ? offer->label : piece->label) +
                " to " + (width == 1 ? "space " : "spaces ") + std::to_string(i + 1);
            if (width > 1) consequence += "–" + std::to_string(i + width);
            for (const auto& other : shop.structures) {
                if (piece && other.id == piece->id) continue;
                if (other.origin < i + width && i < other.origin + other.width)
                    consequence += " · Replaces " + other.label;
            }
            const auto same = piece && op != "life-recover" && i == piece->origin;
            add("life-origin", std::to_string(i), std::move(place), std::move(consequence),
                same ? "Already at this origin." : "");
        }
        if (piece && op != "life-recover") {
            if (!piece->receipt.empty()) {
                add("life-scrap", {}, command("vassalUndoShopPurchase", piece->receipt), "Return " + piece->label);
            } else {
                auto demolish = command("vassalMoveShopStructure", piece->id);
                demolish.payload.emplace_back("origin", Value());
                add("life-scrap", {}, std::move(demolish), "Demolish " + piece->label);
            }
        }
        return;
    }

    const bool receipt = op == "life-receipt";
    const auto card = std::ranges::find_if(shop.practices, [&](const auto& piece) {
        return receipt ? piece.receipt == id : piece.id == id;
    });
    const auto removed = std::ranges::find(shop.discarded, id, &ShopPiece::id);
    const auto order = std::ranges::find(shop.staged, id, &ShopItem::id);
    if (!offer && card == shop.practices.end() && removed == shop.discarded.end() && order == shop.staged.end()) return;
    const auto& label = offer ? offer->label : card != shop.practices.end() ? card->label :
        removed != shop.discarded.end() ? removed->label : order->label;
    for (std::size_t i = 0; i < shop.practices.size(); ++i) {
        auto move = offer ? offer->command : command("vassalReorderShopPurchase", id);
        move.payload.emplace_back("toIndex", Value(double(i)));
        const auto& victim = shop.practices[i];
        auto consequence = std::string(offer ? "Stage " : "Move ") + label + " to slot " + std::to_string(i + 1);
        if (offer && offer->mode == "learn" && !shopInsert_ && !victim.id.empty()) {
            move.payload.emplace_back("replacePracticeId", Value(victim.art));
            consequence += " · Discards " + victim.label;
        } else if (offer && offer->mode == "learn" && shopInsert_ && shop.capacity && i < shop.capacity &&
            std::ranges::all_of(std::span(shop.practices).first(shop.capacity), [](const auto& item) { return !item.id.empty(); })) {
            consequence += " · Discards " + shop.practices[shop.capacity - 1].label;
        } else if (removed != shop.discarded.end() && !victim.id.empty()) {
            consequence += " · Shifts the Practice order";
        }
        const auto same = !receipt && card != shop.practices.end() && i == card->origin;
        add("life-slot", std::to_string(i), std::move(move), std::move(consequence),
            same ? "Already in this slot." : "");
    }
    if (!offer && !receipt && card != shop.practices.end()) {
        if (!card->receipt.empty()) {
            add("life-scrap", {}, command("vassalUndoShopPurchase", card->receipt), "Return " + label);
        } else {
            auto discard = command("vassalReorderShopPurchase", id);
            discard.payload.emplace_back("toIndex", Value(5.0));
            add("life-scrap", {}, std::move(discard), "Discard " + label);
        }
    }
}

void View::stageShop(const LifeCommand& command)
{
    if (session_.previewing() || session_.busy()) return;
    shopError_ = shopDraft_.stage(command);
    lifeDirty_ = true;
    if (!shopError_.empty()) return;
    resetShopSelection();
    life_ = shopDraft_.reading();
    if (command.kind == "vassalSelectLifeOption" && life_.shop)
        shopConstruction_ = std::ranges::any_of(life_.shop->offers, [](const ShopItem& item) {
            return item.kind == "structure";
        });
}

void View::submitShop(const LifeCommand& command)
{
    shopError_ = session_.checkout(shopDraft_, command);
    lifeDirty_ = true;
    if (!shopError_.empty()) return;
    lastError_.clear();
    pendingAction_ = "shop";
    pendingGeneration_ = session_.generation();
    lifeFeedback_ = command.feedback;
    notify("");
}

bool View::activateShop(std::string_view op, const std::string& id)
{
    if (!life_.shop) return false;
    if (op == "life-tableau") {
        resetShopSelection();
        shopConstruction_ = id == "structure";
    } else if (op == "life-clear-selection") {
        resetShopSelection();
        shopError_.clear();
    } else if (session_.previewing() || session_.busy()) {
        return false;
    } else if (op == "life-insert-mode") {
        shopInsert_ = id == "insert";
        selectShopSource(shopSource_);
    } else if (op == "life-cancel-draft" || op == "life-revert") {
        if (op == "life-cancel-draft") shopDraft_ = session_.shopDraft();
        else shopDraft_.undo();
        resetShopSelection();
        shopError_.clear();
        life_ = shopDraft_.reading();
    } else if (const auto* target = shopTarget({std::string(op), id})) {
        if (!target->reason.empty()) shopError_ = target->reason;
        else {
            const auto command = target->command;
            stageShop(command);
        }
    } else if (op == "life-offer" || op == "life-receipt" || op == "life-recover") {
        shopInsert_ = false;
        selectShopSource({std::string(op), id});
        if (op != "life-recover" && !shopTargets_.empty()) {
            element("life-chart").SetScrollTop(0);
            element("life-inspector").SetScrollTop(0);
        }
        if (const auto* focus = context_.GetFocusElement())
            shopFocusBoard_ = focus->IsPseudoClassSet("focus-visible");
    } else if (op == "life-slot" || op == "life-origin") {
        const auto index = std::stoul(id);
        if (op == "life-slot" && index < life_.shop->practices.size()) {
            const auto& card = life_.shop->practices[index];
            if (!card.id.empty()) selectShopSource({"life-piece", card.id});
        } else if (op == "life-origin") {
            const auto found = std::ranges::find_if(life_.shop->structures, [&](const auto& card) {
                return index >= card.origin && index < card.origin + card.width;
            });
            if (found != life_.shop->structures.end()) selectShopSource({"life-piece", found->id});
        }
    } else if (op == "life-undo-purchase") {
        const auto item = std::ranges::find(life_.shop->staged, id, &ShopItem::id);
        if (item != life_.shop->staged.end()) {
            const auto command = item->command;
            stageShop(command);
        }
    } else return false;
    lifeDirty_ = true;
    return true;
}

std::optional<View::ShopControl> View::shopControlAtPointer() const
{
    for (auto* el = context_.GetHoverElement(); el; el = el->GetParentNode()) {
        if (el->HasAttribute("data-op"))
            return ShopControl{el->GetAttribute<Rml::String>("data-op", ""), el->GetAttribute<Rml::String>("data-id", "")};
    }
    return {};
}

bool View::beginShopDrag()
{
    if (!lifeOpen_ || !life_.shop || lifeRoute_ || dialog_ || session_.busy() || session_.previewing()) return false;
    for (auto* el = context_.GetHoverElement(); el; el = el->GetParentNode()) {
        const auto op = el->GetAttribute<Rml::String>("data-op", "");
        if (op.empty()) continue;
        if (el->HasAttribute("data-piece"))
            shopPressed_ = ShopControl{"life-piece", el->GetAttribute<Rml::String>("data-piece", "")};
        else if (el->HasAttribute("data-shop-drag") || op == "life-recover" || op == "life-receipt")
            shopPressed_ = ShopControl{op, el->GetAttribute<Rml::String>("data-id", "")};
        return shopPressed_.has_value();
    }
    return false;
}

void View::updateShopDrag()
{
    if (!shopPressed_ || !moved_) return;
    if (!shopDragStarted_) {
        shopDragStarted_ = true;
        if (shopSource_ != *shopPressed_) shopInsert_ = false;
        selectShopSource(*shopPressed_);
        element("life-chart").SetScrollTop(0);
    }
    auto* hover = context_.GetHoverElement();
    while (hover && !hover->HasAttribute("data-op")) hover = hover->GetParentNode();
    const auto key = shopControlAtPointer();
    const auto* target = key ? shopTarget(*key) : nullptr;
    if (auto* previous = shopHoveredTarget_.get(); previous && previous != hover)
        previous->SetClass("drop-hover", false);
    shopHoveredTarget_ = target && hover ? hover->GetObserverPtr() : Rml::ObserverPtr<Rml::Element>{};
    if (target && hover) hover->SetClass("drop-hover", true);
    if (auto* readout = document_->GetElementById("shop-target-preview"))
        readout->SetInnerRML(target ? escape(target->reason.empty() ? target->consequence : target->reason) : "");
}

void View::finishShopDrag(std::optional<ShopControl> key)
{
    if (auto* hover = shopHoveredTarget_.get()) hover->SetClass("drop-hover", false);
    shopHoveredTarget_.reset();
    shopPressed_.reset();
    if (shopDragStarted_ && key && shopTarget(*key)) activateShop(key->first, key->second);
    shopDragStarted_ = false;
    lifeDirty_ = true;
}



}
