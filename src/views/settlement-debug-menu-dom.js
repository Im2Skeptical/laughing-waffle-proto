import { createMapLabDom } from "./map-lab-dom.js";
import {
  GAMEPIECES_DRAFT_KIND,
  GAME_SETTINGS_DRAFT_KIND,
  createDebugConfigurationDom,
} from "./debug-configuration-dom.js";
import { createVassalDebugDom } from "./vassal-debug-dom.js";

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );
}

function requestFullscreen(target) {
  if (typeof target?.requestFullscreen === "function") return target.requestFullscreen();
  if (typeof target?.webkitRequestFullscreen === "function") {
    return target.webkitRequestFullscreen();
  }
  if (typeof target?.msRequestFullscreen === "function") {
    return target.msRequestFullscreen();
  }
  return Promise.reject(new Error("Fullscreen unavailable"));
}

async function lockLandscapeOrientation() {
  const orientation = globalThis.screen?.orientation;
  if (typeof orientation?.lock !== "function") return;
  try {
    await orientation.lock("landscape");
  } catch {
    // Browsers commonly allow this only in fullscreen; the portrait gate still
    // prevents the game from being rendered at an unusable scale.
  }
}

export function createSettlementDebugMenuDom({
  mapLabController,
  debugConfigurationController,
  vassalDebugPresetController,
  getState,
  replaceVassalCandidate,
} = {}) {
  const utilityControls = document.createElement("div");
  utilityControls.dataset.testid = "utility-controls";
  utilityControls.style.cssText = [
    "position:fixed", "right:12px", "top:10px", "z-index:1000",
    "display:flex", "gap:8px", "align-items:center",
  ].join(";");

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Debug";
  openButton.dataset.testid = "debug-open";
  openButton.style.cssText = [
    "min-height:34px", "padding:5px 12px", "border-radius:6px",
    "border:1px solid #d7b450", "background:#384755", "color:#f6efe3",
  ].join(";");

  const startNewRunButton = document.createElement("button");
  startNewRunButton.type = "button";
  startNewRunButton.textContent = "Start new run";
  startNewRunButton.title = "Start a fresh run with the current debug drafts";
  startNewRunButton.dataset.testid = "debug-start-new-run";
  startNewRunButton.style.cssText = [
    "display:none", "min-height:34px", "padding:5px 12px", "border-radius:6px",
    "border:1px solid #d7b450", "background:#59613b", "color:#f6efe3",
  ].join(";");
  utilityControls.append(openButton, startNewRunButton);
  const mobileLandscapeButton = document.querySelector(
    '[data-testid="mobile-landscape-request"]'
  );

  const panel = document.createElement("section");
  panel.className = "codex-debug-panel";
  panel.style.cssText = [
    "display:none", "position:fixed", "inset:8px", "z-index:999",
    "overflow:auto", "padding:12px", "border:1px solid #d7b450",
    "border-radius:8px", "background:#252c33",
  ].join(";");

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close debug";
  closeButton.title = "Close development tools";
  closeButton.dataset.testid = "debug-close";
  closeButton.style.cssText = [
    "display:none", "position:fixed", "left:12px", "top:10px", "z-index:1000",
    "min-height:34px", "padding:5px 12px", "border-radius:6px",
    "border:1px solid #d7b450", "background:#384755", "color:#f6efe3",
  ].join(";");

  const header = document.createElement("header");
  header.style.cssText = [
    "display:flex", "gap:8px", "align-items:center",
    "margin:0 112px 10px", "padding:0",
  ].join(";");
  const title = document.createElement("strong");
  title.textContent = "Development Tools";
  const mapLabTab = document.createElement("button");
  mapLabTab.type = "button";
  mapLabTab.textContent = "Map Lab";
  mapLabTab.dataset.testid = "debug-map-lab-tab";
  const gameSettingsTab = document.createElement("button");
  gameSettingsTab.type = "button";
  gameSettingsTab.textContent = "Game Settings";
  gameSettingsTab.dataset.testid = "debug-game-settings-tab";
  const gamepiecesTab = document.createElement("button");
  gamepiecesTab.type = "button";
  gamepiecesTab.textContent = "Gamepieces";
  gamepiecesTab.dataset.testid = "debug-gamepieces-tab";
  const vassalTab = document.createElement("button");
  vassalTab.type = "button";
  vassalTab.textContent = "Vassal Lab";
  vassalTab.dataset.testid = "debug-vassal-tab";
  header.append(title, mapLabTab, gameSettingsTab, gamepiecesTab, vassalTab);
  panel.append(header);

  const mapLab = createMapLabDom({ controller: mapLabController });
  const gameSettings = createDebugConfigurationDom({
    controller: debugConfigurationController,
    kind: GAME_SETTINGS_DRAFT_KIND,
    title: "Game Settings",
  });
  const gamepieces = createDebugConfigurationDom({
    controller: debugConfigurationController,
    kind: GAMEPIECES_DRAFT_KIND,
    title: "Gamepieces",
  });
  const vassalLab = createVassalDebugDom({
    getState,
    replaceVassalCandidate,
    presetController: vassalDebugPresetController,
  });
  const pages = {
    mapLab,
    gameSettings,
    gamepieces,
    vassalLab,
  };
  const pageContainer = document.createElement("div");
  pageContainer.append(
    mapLab.element,
    gameSettings.element,
    gamepieces.element,
    vassalLab.element
  );
  panel.append(pageContainer);
  let activePage = "mapLab";
  let initialized = false;

  function setActivePage(pageId) {
    activePage = pages[pageId] ? pageId : "mapLab";
    for (const [id, page] of Object.entries(pages)) {
      page.element.style.display = id === activePage ? "" : "none";
    }
    pages[activePage].render?.();
  }

  async function requestLandscapeFullscreen() {
    try {
      if (!getFullscreenElement()) await requestFullscreen(document.documentElement);
      await lockLandscapeOrientation();
    } catch {
      // The portrait gate remains available when fullscreen cannot be entered.
    }
  }

  function open() {
    panel.style.display = "block";
    openButton.style.display = "none";
    startNewRunButton.style.display = "";
    closeButton.style.display = "";
    setActivePage(activePage);
  }

  function close() {
    panel.style.display = "none";
    openButton.style.display = "";
    startNewRunButton.style.display = "none";
    closeButton.style.display = "none";
  }

  openButton.addEventListener("click", open);
  startNewRunButton.addEventListener("click", () => {
    const result = debugConfigurationController.applyToFreshRun();
    if (result?.ok) close();
  });
  mobileLandscapeButton?.addEventListener("click", () => {
    void requestLandscapeFullscreen();
  });
  mapLabTab.addEventListener("click", () => setActivePage("mapLab"));
  gameSettingsTab.addEventListener("click", () => setActivePage("gameSettings"));
  gamepiecesTab.addEventListener("click", () => setActivePage("gamepieces"));
  vassalTab.addEventListener("click", () => setActivePage("vassalLab"));
  closeButton.addEventListener("click", close);

  return {
    init() {
      if (initialized) return;
      initialized = true;
      document.body.append(utilityControls, panel, closeButton);
      mapLab.init();
      gameSettings.init();
      gamepieces.init();
      vassalLab.init();
      setActivePage(activePage);
    },
    update() {},
    refresh() {},
    close,
    destroy() {
      mapLab.destroy();
      gameSettings.destroy();
      gamepieces.destroy();
      vassalLab.destroy();
      utilityControls.remove();
      panel.remove();
      closeButton.remove();
    },
  };
}
