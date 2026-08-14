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

function exitFullscreen() {
  if (typeof document.exitFullscreen === "function") return document.exitFullscreen();
  if (typeof document.webkitExitFullscreen === "function") {
    return document.webkitExitFullscreen();
  }
  if (typeof document.msExitFullscreen === "function") {
    return document.msExitFullscreen();
  }
  return Promise.reject(new Error("Fullscreen exit unavailable"));
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
  getState,
  selectCheatVassal,
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

  const fullscreenButton = document.createElement("button");
  fullscreenButton.type = "button";
  fullscreenButton.textContent = "Full";
  fullscreenButton.title = "Enter fullscreen";
  fullscreenButton.dataset.testid = "fullscreen-toggle";
  fullscreenButton.style.cssText = [
    "min-width:64px", "min-height:34px", "padding:5px 12px", "border-radius:6px",
    "border:1px solid #d7b450", "background:#384755", "color:#f6efe3",
  ].join(";");
  utilityControls.append(fullscreenButton, openButton);
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

  const header = document.createElement("header");
  header.style.cssText = [
    "display:flex", "gap:8px", "align-items:center",
    "margin-bottom:10px", "padding-right:100px",
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
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.style.marginLeft = "auto";
  header.append(title, mapLabTab, gameSettingsTab, gamepiecesTab, vassalTab, closeButton);
  panel.append(header);

  const mapLab = createMapLabDom({
    controller: mapLabController,
    onRequestClose: () => close(),
  });
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
  const vassalLab = createVassalDebugDom({ getState, selectCheatVassal });
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

  function syncFullscreenButton() {
    const fullscreen = !!getFullscreenElement();
    fullscreenButton.textContent = fullscreen ? "Exit" : "Full";
    fullscreenButton.title = fullscreen ? "Exit fullscreen" : "Enter fullscreen";
  }

  async function toggleFullscreen() {
    try {
      if (getFullscreenElement()) {
        await exitFullscreen();
      } else {
        await requestFullscreen(document.documentElement);
        await lockLandscapeOrientation();
      }
    } catch (error) {
      fullscreenButton.title = `Fullscreen unavailable: ${error?.message ?? "unknown error"}`;
    } finally {
      syncFullscreenButton();
    }
  }

  function open() {
    panel.style.display = "block";
    openButton.style.display = "none";
    setActivePage(activePage);
  }

  function close() {
    panel.style.display = "none";
    openButton.style.display = "";
  }

  openButton.addEventListener("click", open);
  fullscreenButton.addEventListener("click", () => {
    void toggleFullscreen();
  });
  mobileLandscapeButton?.addEventListener("click", () => {
    void toggleFullscreen();
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
      document.body.append(utilityControls, panel);
      document.addEventListener("fullscreenchange", syncFullscreenButton);
      document.addEventListener("webkitfullscreenchange", syncFullscreenButton);
      document.addEventListener("MSFullscreenChange", syncFullscreenButton);
      syncFullscreenButton();
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
      document.removeEventListener("fullscreenchange", syncFullscreenButton);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenButton);
      document.removeEventListener("MSFullscreenChange", syncFullscreenButton);
      utilityControls.remove();
      panel.remove();
    },
  };
}
