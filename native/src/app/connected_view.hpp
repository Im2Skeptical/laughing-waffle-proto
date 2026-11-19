#pragma once

#include "connected_session.hpp"
#include "connected_art.hpp"
#include "connected_map.hpp"
#include "ui/demo_probe.hpp"

#include <SDL3/SDL.h>
#include <map>

namespace waffle::connected {

class View final : public Rml::EventListener {
public:
    View(Rml::Context& context, SDL_Renderer* renderer, Session& session, Selection& selection, Launch launch,
         Artwork art);
    ~View() override;
    void frame();
    bool input(SDL_Event event);
    bool scrubAt(float x);
    SDL_FRect plot() const;
    void ProcessEvent(Rml::Event& event) override;

private:
    friend struct InteractionProbe;

    Rml::Element& element(const char* id) const { return *document_->GetElementById(id); }
    SDL_FRect bounds(const char* id) const;
    std::optional<std::string> hit(SDL_FPoint point) const;
    std::optional<std::size_t> cardAt(SDL_FPoint point) const;
    bool canStage(const Snapshot& snapshot, const Region* site) const;
    void resize();
    void refresh();
    void refreshPanel(const Snapshot* snapshot);
    void refreshMarkers(const Snapshot* snapshot);
    void positionMarkers();
    void refreshHelp();
    void refreshReadout();
    void drawGraph();
    void selectRegion(std::string region);
    void navigateMap(SDL_Keycode key);
    void reviewReform();
    void closeReform();
    void activate(Rml::Element& control);
    void notify(std::string text, bool error = false);
    void returnLive();
    bool back();
    bool key(SDL_Event event);
    Second secondAt(float x) const;
    float xAt(Second second) const;

    Rml::Context& context_;
    Rml::ElementDocument* document_{};
    Rml::DataModelHandle bindings_;
    SDL_Renderer* renderer_;
    Session& session_;
    Selection& selection_;
    Launch launch_;
    std::map<std::string, std::string, std::less<>> sprites_;
    std::string currentClock_, currentStatus_, currentAxisStart_, currentAxisEnd_, currentProgress_ = "0%";
    std::string panelMarkup_, markerMarkup_, currentReadout_, currentHelp_;
    std::string notice_, lastError_, pendingAction_, hoveredRegion_;
    std::string lastStats_, lastPracticeValues_;
    std::uint64_t revision_ = ~std::uint64_t{};
    std::uint64_t pendingGeneration_{};
    Uint64 now_{}, noticeUntil_{}, pressedAt_{}, hoveredAt_{}, dialogClosedAt_{};
    std::string selectedRegion_;
    std::optional<std::size_t> selectedCard_, staged_, dropTarget_;
    std::optional<Second> hoverSecond_;
    bool loadingVisible_{true}, loadingFailed_{};
    bool opening_{}, busy_{}, previewing_{}, markersDirty_{true};
    bool reduced_{}, dialog_{}, noticeError_{}, touch_{}, longPress_{}, pointerDown_{};
    SDL_Keycode keyDown_{};
    Rml::ObserverPtr<Rml::Element> keyControl_;
    RegionalMap map_;
    SDL_FPoint pointer_{}, last_{}, pressed_{};
    enum class Drag { none, map, graph, card, panel };
    Drag drag_ = Drag::none;
    std::size_t draggedCard_{};
    bool moved_{};
};

}
