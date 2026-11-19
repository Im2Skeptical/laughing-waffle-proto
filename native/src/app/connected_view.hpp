#pragma once

#include "connected_session.hpp"
#include "connected_art.hpp"
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
    Rml::Element& element(const char* id) const { return *document_->GetElementById(id); }
    SDL_FRect bounds(const char* id) const;
    SDL_FPoint project(Point point, SDL_FRect map) const;
    std::optional<std::string> hit(SDL_FPoint point) const;
    std::optional<std::size_t> cardAt(SDL_FPoint point) const;
    bool canStage(const Snapshot& snapshot, const Region* site) const;
    void resize();
    void refresh();
    void refreshPanel(const Snapshot* snapshot);
    void refreshMarkers(const Snapshot* snapshot);
    void drawMap(const Snapshot& snapshot);
    void drawGraph();

    Rml::Context& context_;
    Rml::ElementDocument* document_{};
    SDL_Renderer* renderer_;
    Session& session_;
    Selection& selection_;
    Launch launch_;
    std::map<std::string, std::string, std::less<>> sprites_;
    std::string currentStatus_, currentAxisStart_, currentAxisEnd_;
    std::uint64_t revision_ = ~std::uint64_t{};
    std::string selectedRegion_;
    std::optional<std::size_t> selectedCard_, staged_;
    bool loadingVisible_{true}, loadingFailed_{};
    bool opening_{}, busy_{}, previewing_{}, markersDirty_{true};
    float zoom_ = 1;
    SDL_FPoint pan_{}, last_{}, pressed_{};
    enum class Drag { none, map, graph, card };
    Drag drag_ = Drag::none;
    std::size_t draggedCard_{};
    bool moved_{};
};

}
