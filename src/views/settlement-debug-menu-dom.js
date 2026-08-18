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
  debugProfileController,
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

  const profileToolbar = document.createElement("div");
  profileToolbar.dataset.testid = "debug-profile-toolbar";
  profileToolbar.style.cssText = [
    "display:flex", "flex-wrap:wrap", "gap:7px", "align-items:center",
    "margin:0 112px 10px", "padding:8px", "border:1px solid #586876",
    "border-radius:6px", "background:#1d252c",
  ].join(";");
  const profileSelect = document.createElement("select");
  profileSelect.dataset.testid = "debug-profile-select";
  profileSelect.style.minHeight = "32px";
  const profileName = document.createElement("input");
  profileName.type = "text";
  profileName.placeholder = "Combined profile name";
  profileName.dataset.testid = "debug-profile-name";
  profileName.style.cssText = "min-height:32px;padding:4px 7px;box-sizing:border-box";
  const profileButton = (label, testid) => {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = label;
    node.dataset.testid = testid;
    node.style.minHeight = "32px";
    return node;
  };
  const loadProfileButton = profileButton("Load", "debug-profile-load");
  const newProfileButton = profileButton("New", "debug-profile-new");
  const saveProfileButton = profileButton("Save all", "debug-profile-save");
  const exportProfileButton = profileButton("Import / Export", "debug-profile-json-toggle");
  const deleteProfileButton = profileButton("Delete", "debug-profile-delete");
  const bootProfileButton = profileButton("Use on boot", "debug-profile-boot");
  const profileStatus = document.createElement("span");
  profileStatus.dataset.testid = "debug-profile-status";
  profileStatus.style.fontSize = "12px";
  profileToolbar.append(
    profileSelect,
    profileName,
    loadProfileButton,
    newProfileButton,
    saveProfileButton,
    exportProfileButton,
    deleteProfileButton,
    bootProfileButton,
    profileStatus
  );
  panel.append(profileToolbar);

  const profileJsonBox = document.createElement("div");
  profileJsonBox.dataset.testid = "debug-profile-json";
  profileJsonBox.style.cssText = [
    "display:none", "margin:0 112px 10px", "padding:8px",
    "border:1px solid #586876", "border-radius:6px", "background:#1d252c",
  ].join(";");
  const profileJsonArea = document.createElement("textarea");
  profileJsonArea.setAttribute("aria-label", "Combined debug profile JSON");
  profileJsonArea.style.cssText = "display:block;width:100%;height:220px;box-sizing:border-box;font-family:monospace";
  const profileJsonActions = document.createElement("div");
  profileJsonActions.style.cssText = "display:flex;flex-wrap:wrap;gap:7px;margin-top:7px";
  const copyProfileJsonButton = profileButton("Copy JSON", "debug-profile-json-copy");
  const refreshProfileJsonButton = profileButton("Refresh export", "debug-profile-json-refresh");
  const importProfileJsonButton = profileButton("Import profile", "debug-profile-json-import");
  const closeProfileJsonButton = profileButton("Close", "debug-profile-json-close");
  profileJsonActions.append(
    copyProfileJsonButton,
    refreshProfileJsonButton,
    importProfileJsonButton,
    closeProfileJsonButton
  );
  profileJsonBox.append(profileJsonArea, profileJsonActions);
  panel.append(profileJsonBox);

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
  let activePage = debugProfileController?.getSnapshot?.().activePage ?? "mapLab";
  let initialized = false;

  function exportCurrentProfile() {
    const result = debugProfileController?.exportProfile?.(profileName.value);
    if (!result?.ok) {
      syncProfileToolbar();
      return result;
    }
    profileName.value = result.name;
    profileJsonArea.value = result.text;
    profileJsonBox.style.display = "block";
    profileJsonArea.focus();
    profileJsonArea.select();
    syncProfileToolbar();
    return result;
  }

  function setActivePage(pageId) {
    activePage = pages[pageId] ? pageId : "mapLab";
    for (const [id, page] of Object.entries(pages)) {
      page.element.style.display = id === activePage ? "" : "none";
    }
    pages[activePage].render?.();
    debugProfileController?.setActivePage?.(activePage);
  }

  function syncProfileToolbar() {
    const snapshot = debugProfileController?.getSnapshot?.() ?? {
      profileOptions: [],
      selectedProfileId: null,
      bootProfileId: null,
      status: { message: "", tone: "info" },
    };
    profileSelect.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Combined debug profile";
    profileSelect.append(empty);
    for (const entry of snapshot.profileOptions) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = `${entry.id === snapshot.bootProfileId ? "Boot — " : ""}${entry.name}`;
      profileSelect.append(option);
    }
    profileSelect.value = snapshot.profileOptions.some(
      (entry) => entry.id === snapshot.selectedProfileId
    ) ? snapshot.selectedProfileId : "";
    const selected = snapshot.profileOptions.find((entry) => entry.id === profileSelect.value);
    if (selected && !profileName.value) profileName.value = selected.name;
    loadProfileButton.disabled = !selected;
    deleteProfileButton.disabled = !selected;
    bootProfileButton.disabled = !selected;
    bootProfileButton.textContent = selected?.id === snapshot.bootProfileId
      ? "Clear boot"
      : "Use on boot";
    profileStatus.textContent = snapshot.status?.message ?? "";
    profileStatus.style.color = snapshot.status?.tone === "warning" ? "#ffd98a" : "#b9f5c7";
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
  profileSelect.addEventListener("change", () => {
    debugProfileController?.selectProfile?.(profileSelect.value || null);
    const selected = debugProfileController?.getSnapshot?.().profileOptions
      ?.find((entry) => entry.id === profileSelect.value);
    profileName.value = selected?.name ?? "";
    syncProfileToolbar();
  });
  loadProfileButton.addEventListener("click", () => {
    const result = debugProfileController?.loadProfile?.(profileSelect.value);
    if (result?.ok) setActivePage(result.entry.profile.activePage);
    syncProfileToolbar();
  });
  newProfileButton.addEventListener("click", () => {
    debugProfileController?.selectProfile?.(null);
    profileName.value = "";
    syncProfileToolbar();
  });
  saveProfileButton.addEventListener("click", () => {
    const result = debugProfileController?.saveProfile?.(profileName.value);
    if (result?.ok) profileSelect.value = result.entry.id;
    syncProfileToolbar();
  });
  exportProfileButton.addEventListener("click", exportCurrentProfile);
  refreshProfileJsonButton.addEventListener("click", exportCurrentProfile);
  copyProfileJsonButton.addEventListener("click", async () => {
    profileJsonArea.focus();
    profileJsonArea.select();
    try {
      await globalThis.navigator?.clipboard?.writeText(profileJsonArea.value);
      profileStatus.textContent = "Profile JSON copied.";
    } catch (_) {
      document.execCommand?.("copy");
      profileStatus.textContent = "Profile JSON selected; copy it from this field.";
    }
  });
  importProfileJsonButton.addEventListener("click", () => {
    const result = debugProfileController?.importProfile?.(
      profileJsonArea.value,
      profileName.value
    );
    if (result?.ok) {
      profileName.value = result.entry.name;
      profileJsonBox.style.display = "none";
      setActivePage(result.entry.profile.activePage);
    }
    syncProfileToolbar();
  });
  closeProfileJsonButton.addEventListener("click", () => {
    profileJsonBox.style.display = "none";
  });
  deleteProfileButton.addEventListener("click", () => {
    debugProfileController?.deleteProfile?.(profileSelect.value);
    profileName.value = "";
    syncProfileToolbar();
  });
  bootProfileButton.addEventListener("click", () => {
    const snapshot = debugProfileController?.getSnapshot?.();
    if (profileSelect.value === snapshot?.bootProfileId) {
      debugProfileController.clearBootProfile();
    } else {
      debugProfileController?.setBootProfile?.(profileSelect.value);
    }
    syncProfileToolbar();
  });

  return {
    init() {
      if (initialized) return;
      initialized = true;
      activePage = debugProfileController?.getSnapshot?.().activePage ?? activePage;
      document.body.append(utilityControls, panel, closeButton);
      mapLab.init();
      gameSettings.init();
      gamepieces.init();
      vassalLab.init();
      syncProfileToolbar();
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
