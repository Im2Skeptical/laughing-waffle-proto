#pragma once

#include "connected_shell.hpp"
#include "connected_art.hpp"
#include "connected_map.hpp"
#include "ui/demo_probe.hpp"

#include <SDL3/SDL.h>
#include <map>

namespace Rml { class ElementText; }

namespace waffle::connected {

class View final : public Rml::EventListener {
public:
    View(Rml::Context& context, SDL_Renderer* renderer, Session& session, Selection& selection, Shell& shell,
         Artwork art);
    ~View() override;
    void prepareFrame();
    void drawFrame();
    bool input(SDL_Event event);
    bool scrubAt(float x);
    SDL_FRect plot() const;
    TimeWindow graphWindow() const { return graphWindow_; }
    double graphSampleMs() const { return graphSampleMs_; }
    void cancelInput();
    void releaseTerrain() { map_.invalidateTerrain(); }
    void syncWindow();
    void ProcessEvent(Rml::Event& event) override;
    double settlementModelMs() const { return settlementModelMs_; }

private:
    friend struct InteractionProbe;

    Rml::Element& element(const char* id) const { return *document_->GetElementById(id); }
    SDL_FRect bounds(const char* id) const;
    std::optional<std::string> hit(SDL_FPoint point) const;
    std::optional<std::size_t> cardAt(SDL_FPoint point) const;
    bool canStage(const Snapshot& snapshot, const Region* site) const;
    void refreshShell();
    void refresh();
    void refreshPanel(const Snapshot* snapshot);
    void refreshSettlementTime();
    bool backSettlement();
    bool keySettlement(SDL_Keycode key, Rml::Element* focus);
    void syncOverview(const Region& region, const SettlementOverview& reading, bool comparable);
    void activateSettlement(std::string_view op, const std::string& id);
    std::string practiceBoard(const Snapshot& snapshot, const Region& site, bool editable) const;
    std::string structureBoard(const StructureReading* structures);
    void refreshLife(const Snapshot& snapshot);
    void setLifeOpen(bool open);
    void activateLife(std::string_view op, const std::string& id);
    void submitLife(const LifeCommand& command);
    void drawLifePaths();
    const ShopItem* selectedOffer() const;
    const ShopSpan* selectedSpan(const ShopItem& offer) const;
    std::string shopOffers() const;
    std::string shopDetail(bool disabled) const;
    void refreshMarkers(const Snapshot* snapshot);
    void positionMarkers();
    void refreshHelp();
    void refreshReadout();
    void refreshGraph(bool loading);
    void drawGraph();
    void resetGraph();
    bool activateGraph(std::string_view op);
    void graphKey(SDL_Keycode key, SDL_Keymod modifiers);
    void zoomGraph(double factor, Second anchor);
    void panGraph(float x);
    void focusSecond(Second second);
    void jumpEvent(bool next);
    const ChronicleEvent* eventAt(SDL_FPoint point) const;
    void releaseGraph();
    void selectRegion(std::string region);
    void navigateMap(SDL_Keycode key);
    void reviewReform();
    enum class Confirmation { reform, overwrite, title, life };
    void confirm(Confirmation action, std::string_view title, std::string_view copy,
        std::string_view detail, std::string_view label);
    void closeConfirmation();
    void returnToTitle();
    void activate(Rml::Element& control);
    void notify(std::string text, bool error = false);
    void returnLive();
    bool back();
    bool key(SDL_Event event);
    Second secondAt(float x) const;
    float xAt(Second second) const;
    void startFromSeed();
    void pointer(const SDL_Event& event);
    void touch(const SDL_TouchFingerEvent& event);

    Rml::Context& context_;
    Rml::ElementDocument* document_{};
    Rml::DataModelHandle bindings_;
    SDL_Renderer* renderer_;
    Session& session_;
    Selection& selection_;
    Shell& shell_;
    std::map<std::string, std::string, std::less<>> sprites_;
    std::string currentClock_, currentStatus_, currentAxisStart_, currentAxisEnd_, currentProgress_ = "0%";
    std::string panelMarkup_, currentReadout_, currentHelp_;
    std::string notice_, lastError_, pendingAction_, hoveredRegion_;
    std::string settlementHeader_, settlementTime_;
    SettlementTab settlementTab_{SettlementTab::overview};
    SettlementTab renderedSettlementTab_{SettlementTab::overview};
    std::optional<std::size_t> building_;
    SettlementReading settlementReading_;
    struct LedgerRow {
        Rml::Element* node{};
        Rml::Element* meter{};
        std::array<Rml::ElementText*, 5> text{};
        std::array<int, 3> widths{-1, -1, -1};
        bool warning{}, highlighted{};
    };
    std::array<std::map<std::string, LedgerRow, std::less<>>, 5> overviewRows_;
    std::map<std::string, std::string, std::less<>> panelValues_;
    std::optional<Second> settlementReadSecond_;
    std::uint64_t settlementReadGeneration_{};
    std::uint64_t settlementReadRevision_{};
    double settlementModelMs_{};
    bool settlementDirty_{true};
    std::uint64_t revision_ = ~std::uint64_t{};
    std::uint64_t pendingGeneration_{};
    Uint64 now_{}, noticeUntil_{}, pressedAt_{}, hoveredAt_{}, dialogClosedAt_{};
    std::uint64_t shellRevision_ = ~std::uint64_t{};
    std::uint64_t runRevision_{};
    std::optional<Screen> shownScreen_;
    Confirmation confirmation_ = Confirmation::reform;
    Rml::ObserverPtr<Rml::Element> dialogOpener_;
    std::string selectedRegion_;
    std::optional<std::size_t> selectedCard_, staged_, dropTarget_;
    std::optional<Second> hoverSecond_;
    struct ExactPlot {
        timegraph::GenerationId generation{};
        std::size_t scope{}, count{};
        Second first{};
        std::array<SeriesValues, Chart::exactSeconds + 1> rows;
    };
    ExactPlot exactCurrent_, exactPrevious_;
    TimeWindow graphWindow_, graphBounds_;
    timegraph::GenerationId graphGeneration_{};
    Second graphLive_{}, graphOldLive_{};
    Uint64 graphChangedAt_{};
    std::optional<Second> graphPin_;
    std::optional<Second> readoutSecond_;
    std::size_t graphGroup_{}, graphScope_{}, readoutScope_{};
    std::size_t graphPresentedGroup_ = ~std::size_t{};
    timegraph::GenerationId readoutGeneration_{};
    SeriesValues readoutValues_{};
    bool readoutExact_{}, localGraph_{}, graphZoomed_{}, graphWorking_{}, comparisonVisible_{};
    std::string graphScopeLabel_, graphComparisonLabel_;
    std::array<std::vector<Column>, 4> graphColumns_;
    std::vector<Column> overviewColumns_;
    std::vector<std::size_t> eventPins_;
    std::vector<SDL_Vertex> graphInk_;
    double graphSampleMs_{};
    bool loadingVisible_{true}, loadingFailed_{};
    bool opening_{}, busy_{}, previewing_{}, markersDirty_{true};
    bool markerSizesDirty_{};
    std::vector<std::pair<SDL_FPoint, SDL_FPoint>> markerLeaders_;
    bool reduced_{}, dialog_{}, noticeError_{}, touch_{}, longPress_{}, pointerDown_{};
    SDL_Keycode keyDown_{};
    Rml::ObserverPtr<Rml::Element> keyControl_;
    bool lifeOpen_{}, lifeDirty_{true}, lifeReadOnly_{}, lifeBusy_{};
    std::uint64_t lifeRevision_ = ~std::uint64_t{};
    LifeReading life_;
    std::string lifeChartMarkup_, lifeInspectorMarkup_;
    std::string lifeNode_, lifeOffer_, lifeFeedback_, lifeActionKind_;
    std::optional<std::size_t> lifeOrigin_;
    bool lifeRoute_{};
    std::vector<std::size_t> heirloomPicks_;
    std::optional<LifeCommand> lifeConfirm_;
    RegionalMap map_;
    SDL_FPoint pointer_{}, last_{}, pressed_{};
    enum class Drag { none, map, graph, overview, card, panel, shell, lifePanel, lifeOffers, pinch };
    float density_ = 1;
    Drag drag_ = Drag::none;
    std::size_t draggedCard_{};
    bool moved_{};
    struct Finger { SDL_FingerID id; SDL_FPoint point; };
    std::optional<Finger> primary_, secondary_;
};

}
