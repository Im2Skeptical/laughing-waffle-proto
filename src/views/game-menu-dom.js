import { PHONE_PORTRAIT_QUERY, getGameFullscreenElement, requestGameDisplayMode, usesTouchGameDisplay } from './game-display-mode.js';
import { createSaveRecoveryDom, downloadSaveText } from './save-recovery-dom.js';
import { buildSaveDiagnosticReport, createSaveDiagnosticsDom } from './save-diagnostics-dom.js';
import { createGameLoadingDom } from './game-loading-dom.js';
import { NEW_GAME_DEV_SETTINGS_KEY } from '../controllers/new-game-settings-controller.js';
import { DEBUG_PROFILE_LIBRARY_STORAGE_KEY } from '../model/debug-profile-library.js';
import { CARD_REVIEW_STORAGE_KEY, CARD_REVIEW_GAME_MODE_KEY } from '../controllers/card-review-controller.js';

export function createGameMenuDom({ session, onResume, onPause, cardReviews, newGameSettings }) {
  const portrait = window.matchMedia(PHONE_PORTRAIT_QUERY);
  const panel = document.createElement("main");
  panel.id = "game-menu";
  panel.style.setProperty('--chronicle-backdrop', `url("${new URL('images/sprite-sheets/chronicle-gate.png',document.baseURI).href}")`);
  panel.dataset.testid = "game-menu";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  const displayHint = document.createElement('p');
  displayHint.className = 'game-display-hint';
  displayHint.dataset.testid = 'game-display-hint';
  displayHint.hidden = true;
  const menuButton = document.createElement("button");
  menuButton.textContent = "Save & menu";
  menuButton.dataset.testid = "game-menu-open";
  const recovery = createSaveRecoveryDom({ session,
    onOpenMenu: () => returnToMenu(),
    onRetry: async () => { await session.save(); if (!panel.hidden) render(); },
    onExport: () => {
      const result = session.exportCurrentGame();
      if (!result.ok) return;
      try {
        downloadSaveText(result.text, `civilization-save-slot${session.getActiveSlot() ?? 'live'}-t${result.meta.tSec}.json`);
        message.textContent = 'Game export download started. This does not change your browser save.';
      } catch { message.textContent = 'The download could not start. Keep this page open and try exporting again.'; }
    },
  });
  const diagnostics = createSaveDiagnosticsDom({ getReport: () => buildSaveDiagnosticReport(session) });
  const importInput = document.createElement('input');
  importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.hidden = true;
  importInput.dataset.testid = 'game-save-import-file';
  let importMeta = null;
  let importVersion = 0;
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0]; importInput.value = '';
    if (!file) return;
    const version = ++importVersion;
    try {
      const text = await file.text();
      if (version !== importVersion) return;
      const result = session.prepareImport(text);
      if (!result.ok) return;
      importMeta = result.meta; mode = 'import'; render();
    } catch { message.textContent = 'Could not read this save file. Your existing saves are unchanged.'; }
  });
  let mode = "home";
  let overwriteSlot = null;
  let entering = false;
  let entryVersion = 0;
  let loadingSlot = null;
  let loadingAction = null;
  let loadingFailed = false;
  let loadingStarted = false;
  const loading = createGameLoadingDom();
  let renderedSlotPhase = null;
  let renderedCanReplace = null;
  let renderedSavePhase = null;
  function button(label, action, testid) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (testid) element.dataset.testid = testid;
    element.addEventListener("click", action);
    return element;
  }
  function show() {
    document.body.classList.add("game-menu-open");
    panel.hidden = false;
    mode = "home";
    overwriteSlot = null;
    importVersion++; session.cancelImport(); importMeta = null;
    render();
    recovery.sync();
    if (session.getSaveStatus().phase !== 'failed' && session.getPreparationStatus?.()?.phase !== "revealing") void session.prepareNewGame?.();
  }
  function hide() {
    importVersion++; session.cancelImport(); importMeta = null;
    onResume?.();
    panel.hidden = true;
    document.body.classList.remove("game-menu-open");
    recovery.sync();
  }
  async function enter(action, slot = null, event = null) {
    if (entering) return;
    entering = true;
    const version = ++entryVersion;
    try {
      if (slot !== null) { message.textContent = ''; loadingSlot = slot; loadingAction = action; loadingFailed = false; loadingStarted = false; loading.reset(); render(); }
      await requestGameDisplayMode({ forceFullscreen: event?.pointerType === 'touch' });
      // Fullscreen/orientation steal window focus on phones; visibility is the
      // signal that the player actually left during the request.
      if (version !== entryVersion || document.hidden) return;
      if (portrait.matches) {
        loadingSlot = null;
        render();
        displayHint.textContent = 'Turn your device sideways, then continue your chronicle.';
        displayHint.hidden = false;
        displayHint.scrollIntoView({ block: 'nearest' });
        return;
      }
      displayHint.hidden = true;
      // Commit the loading screen after rotation and before any synchronous
      // entry work. A task after the frame gives the browser a paint opportunity.
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (version !== entryVersion || document.hidden) return;
      loadingStarted = true;
      const result = await action(() => version === entryVersion && !document.hidden && !portrait.matches);
      if (version !== entryVersion) return;
      if (result.ok) {
        loadingSlot = null;
        if (!document.hidden && !portrait.matches) hide();
        else { session.openMenu({ force: true }); onPause?.(); show(); }
      } else if (slot !== null) {
        loadingFailed = true;
        render();
      }
    } catch (error) {
      if (version === entryVersion) {
        loadingFailed = true;
        message.textContent = error.code === 'artworkLoadFailed'
          ? "Artwork couldn’t be loaded. Retry or return to the menu."
          : "Could not open your chronicle. Retry or return to the menu.";
        render();
      }
    } finally { if (version === entryVersion) entering = false; }
  }
  function start(slot, event) {
    void enter(isCurrent => session.newGame(slot, { isCurrent }), slot, event);
  }
  function render() {
    const devExpanded = panel.querySelector('[data-testid="game-developer-tools"]')?.open ?? false;
    panel.replaceChildren();
    const layout = document.createElement("div");
    layout.className = "game-menu-content";
    const intro = document.createElement("header");
    intro.className = "game-menu-intro";
    const content = document.createElement("div");
    content.className = "game-menu-actions";
    const eyebrow = document.createElement("p");
    eyebrow.className = "game-menu-eyebrow";
    eyebrow.textContent = "A chronicle of lives & lost futures";
    const title = document.createElement("h1");
    title.textContent = "Civilization Survivor";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Guide a fragile realm. Turn back the years. Rewrite its fate.";
    intro.append(eyebrow, title, subtitle);
    content.append(displayHint);
    const slots = session.slots();
    const slotStatus = session.getSlotStatus();
    const canReplace = session.getSaveStatus().canReplaceLiveGame && slotStatus.phase === 'ready';
    renderedSlotPhase = slotStatus.phase; renderedCanReplace = canReplace;
    const saveFailed = session.getSaveStatus().phase === 'failed';
    renderedSavePhase = session.getSaveStatus().phase;
    if (saveFailed && mode !== 'diagnostics') { recovery.sync(); content.append(recovery.element); }
    if (loadingSlot !== null) {
      const heading = document.createElement("h2");
      heading.textContent = loadingFailed
        ? session.getLoadingStatus?.()?.stages.at(-1)?.stage === 'artwork'
          ? "Artwork couldn’t be loaded" : "Your chronicle could not be prepared"
        : "Preparing your chronicle…";
      content.append(heading);
      loading.update(loadingStarted ? session.getLoadingStatus?.() : null, loadingFailed);
      content.append(loading.element);
      if (loadingFailed) {
        content.append(button("Retry", event => {
          if (session.canResume() && session.getActiveSlot() === loadingSlot && session.getSaveStatus().phase === 'failed') {
            void enter(async () => { const result = await session.save(); if (result.ok) { loadingSlot = null; return session.resume(); } return result; }, null, event);
          } else { session.cancelPreparation?.(); void enter(loadingAction, loadingSlot, event); }
        }, "game-loading-retry"));
      }
      content.append(button("Back", () => {
        entryVersion++; entering = false; loadingSlot = null; loadingFailed = false;
        session.cancelPreparation?.(); show();
      }, "game-loading-back"));
    } else if (mode === 'diagnostics') {
      diagnostics.render(); content.append(diagnostics.element,
        button('Back', () => { mode = 'home'; render(); }, 'save-diagnostic-back'));
    } else if (overwriteSlot !== null) {
      const warning = document.createElement("p");
      warning.textContent = `Replace Slot ${overwriteSlot}? Its current game will be permanently lost.`;
      content.append(warning,
        button(mode === 'import' ? 'Replace and import game' : 'Replace and start new game',
          event => { if (mode === 'import') void enter(isCurrent => session.importGame(overwriteSlot, { isCurrent }), overwriteSlot, event); else start(overwriteSlot, event); }, "game-replace-confirm"),
        button("Cancel", () => { entryVersion++; entering = false; overwriteSlot = null; render(); }));
    } else if (mode === "home") {
      const latest = slots.filter((slot) => slot.available)
        .sort((a, b) => String(b.meta?.savedAt).localeCompare(String(a.meta?.savedAt)))[0];
      if (session.canResume()) {
        content.append(button('Continue', event => enter(() => session.resume(), null, event), 'game-continue'));
      } else if (latest) content.append(button(`Continue · Slot ${latest.slot}`, event => {
        void enter(isCurrent => session.continueGame(latest.slot, { isCurrent }), latest.slot, event);
      }, "game-continue"));
      const newButton = button("New game", () => { mode = "new"; render(); }, "game-new");
      newButton.disabled = !canReplace; content.append(newButton);
      const loadButton = button("Load game", () => { mode = "load"; render(); }, "game-load");
      loadButton.disabled = !canReplace; content.append(loadButton);
      if (slotStatus.phase !== 'ready') {
        const storageStatus = document.createElement('p'); storageStatus.setAttribute('role', 'status');
        storageStatus.dataset.testid = 'game-storage-status';
        storageStatus.textContent = slotStatus.phase === 'loading' ? 'Opening your browser saves…'
          : 'Could not open your browser saves. Keep any open game on this page and retry.';
        content.append(storageStatus);
        if (slotStatus.phase === 'failed') content.append(button('Retry opening saves', () => { void session.refreshSlots(); }, 'game-storage-retry'));
      }
    } else {
      const heading = document.createElement("h2");
      heading.textContent = mode === 'import' ? `Import Year ${importMeta.year} · choose a destination slot`
        : mode === "new" ? "Choose a slot for your new game" : "Choose a game to continue";
      const sectionHeading = document.createElement("div");
      sectionHeading.className = "game-menu-section-heading";
      sectionHeading.append(heading);
      content.append(sectionHeading);
      if (mode === 'load') {
        const importButton = button('Import save file', () => importInput.click(), 'game-save-import');
        importButton.disabled = !canReplace; sectionHeading.append(importButton);
      }
      const slotList = document.createElement("div");
      slotList.className = "game-save-slots";
      for (const slot of slots) {
        const card = document.createElement("section");
        card.className = "game-save-slot";
        const label = document.createElement("h3");
        label.textContent = `Slot ${slot.slot}`;
        const details = document.createElement("p");
        details.textContent = slot.empty ? "Empty slot" : slot.available
          ? `Year ${slot.meta.year} · ${slot.meta.seasonKey} · ${new Date(slot.meta.savedAt).toLocaleString()}`
          : "Unavailable save · incompatible or damaged";
        const action = button(mode === 'import' ? (slot.empty ? 'Import here' : 'Replace game') : mode === "new" ? (slot.empty ? "Start here" : "Replace game") : "Continue", event => {
          if (mode === 'import') {
            if (slot.empty) void enter(isCurrent => session.importGame(slot.slot, { isCurrent }), slot.slot, event);
            else { overwriteSlot = slot.slot; render(); }
          }
          else if (mode === "load") { void enter(isCurrent => session.continueGame(slot.slot, { isCurrent }), slot.slot, event); }
          else if (slot.empty) start(slot.slot, event);
          else { overwriteSlot = slot.slot; render(); }
        }, `game-slot-${slot.slot}`);
        action.disabled = !canReplace || (mode === "load" && !slot.available);
        card.append(label, details, action);
        slotList.append(card);
      }
      content.append(slotList);
      content.append(button("Back", () => { importVersion++; session.cancelImport(); importMeta = null; mode = "home"; render(); }));
    }
    const footer = document.createElement("footer");
    footer.className = "game-menu-footer";
    if (mode !== 'diagnostics') {
      if (!saveFailed) { recovery.sync(); content.append(recovery.element); }
      if (saveFailed) {
        const warning = document.createElement('p');
        warning.textContent = 'Retry saving before starting or loading another game. Export your current game as a backup.';
        content.append(warning);
      }
      const dev = document.createElement('details');
      dev.dataset.testid = 'game-developer-tools'; dev.open = devExpanded;
      const summary = document.createElement('summary'); summary.textContent = 'Developer tools';
      dev.append(summary);
      if (newGameSettings) {
        const settings = document.createElement('div'); settings.className = 'game-dev-settings';
        const label = document.createElement('label'); label.className = 'game-edited-cards-toggle';
        const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.dataset.testid = 'game-use-dev-settings';
        label.append(toggle, document.createTextNode('Use dev settings'));
        const profileLabel = document.createElement('label'); profileLabel.className = 'game-dev-profile-label';
        profileLabel.append(document.createTextNode('Dev profile'));
        const picker = document.createElement('select'); picker.dataset.testid = 'game-dev-profile'; picker.setAttribute('aria-label', 'Dev profile');
        profileLabel.append(picker);
        const edit = document.createElement('a'); edit.textContent = 'Edit profiles in Gym'; edit.href = new URL('#/dev/gym?workspace=setup', location.href).href;
        edit.target = '_blank'; edit.rel = 'noopener'; edit.dataset.testid = 'game-edit-dev-profiles';
        const info = document.createElement('p'); info.className = 'game-menu-note game-dev-settings-status'; info.dataset.testid = 'game-dev-settings-status'; info.setAttribute('role', 'status');
        const update = () => {
          const snapshot = newGameSettings.getSnapshot();
          toggle.checked = snapshot.enabled; picker.disabled = !snapshot.enabled;
          picker.replaceChildren();
          for (const entry of snapshot.profileOptions) {
            const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name; picker.append(option);
          }
          if (!snapshot.selectedName) { const missing = document.createElement('option'); missing.value = snapshot.profileId; missing.textContent = 'Unavailable profile'; picker.append(missing); }
          picker.value = snapshot.profileId;
          info.textContent = snapshot.enabled
            ? snapshot.error || `New Game will use ${snapshot.selectedName}. Choose a save slot to start. Continue and Load Game keep their saved settings.`
            : 'New Game uses Regular game. To use a custom setup, save a combined profile in Gym, tick Use dev settings and choose it here.';
        };
        const changed = action => {
          try { action(); update(); session.cancelPreparation?.(); void session.prepareNewGame?.(); }
          catch (error) { update(); info.textContent = error.message; }
        };
        toggle.addEventListener('change', () => changed(() => newGameSettings.setEnabled(toggle.checked)));
        picker.addEventListener('change', () => changed(() => newGameSettings.selectProfile(picker.value)));
        update(); settings.append(label, profileLabel, edit, info); dev.append(settings);
      }
      dev.append(button('Save diagnostics', () => { mode = 'diagnostics'; render(); }, 'game-save-diagnostics'));
      if(cardReviews) {
        const label=document.createElement('label');label.className='game-edited-cards-toggle';
        const toggle=document.createElement('input');toggle.type='checkbox';toggle.dataset.testid='game-use-edited-cards';toggle.checked=cardReviews.useInNewGames();
        label.append(toggle,document.createTextNode('Use edited cards in new games'));
        const info=document.createElement('p');info.className='game-menu-note game-edited-cards-status';info.dataset.testid='game-edited-cards-status';info.setAttribute('role','status');
        const update=()=>{
          try{const status=cardReviews.getLaunchStatus();info.textContent=`${status.count} edited ${status.count===1?'card':'cards'} saved on this device. ${status.issues.length?`Fix these before starting: ${status.issues.slice(0,3).join('; ')}.`:'When ticked, these edits apply on top of the selected new-game setup. Continue keeps that game’s saved card values.'}`;}
          catch(error){info.textContent=`Card edits unavailable: ${error.message}`;}
        };
        toggle.addEventListener('change',()=>{
          try{cardReviews.setUseInNewGames(toggle.checked);session.cancelPreparation?.();void session.prepareNewGame?.();update();}
          catch(error){toggle.checked=cardReviews.useInNewGames();info.textContent=error.message;}
        });
        update();dev.append(label,info);
      }
      footer.append(dev);
    }
    const note = document.createElement("p");
    note.className = "game-menu-note";
    note.textContent = "Three saves on this browser. Progress saves automatically during play. Gameplay uses landscape on phones.";
    footer.append(message, note);
    layout.append(intro, content, footer);
    panel.append(layout);
    panel.querySelector("button")?.focus({ preventScroll: true });
  }
  function returnToMenu({ force = false } = {}) {
    if (session.openMenu({ force })) { onPause?.(); show(); }
  }
  window.addEventListener('storage', event => {
    if (panel.hidden || ![null, NEW_GAME_DEV_SETTINGS_KEY, DEBUG_PROFILE_LIBRARY_STORAGE_KEY, CARD_REVIEW_STORAGE_KEY, CARD_REVIEW_GAME_MODE_KEY].includes(event.key)) return;
    render(); session.cancelPreparation?.(); void session.prepareNewGame?.();
  });
  function pauseForFocusLoss() {
    if (!usesTouchGameDisplay()) {
      if (!session.isInMenu()) session.save();
      return;
    }
    if (entering) return;
    entryVersion++;
    if (!session.isInMenu()) returnToMenu({ force: true });
  }
  window.addEventListener('blur', pauseForFocusLoss);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForFocusLoss(); });
  window.addEventListener('pagehide', pauseForFocusLoss);
  portrait.addEventListener('change', () => {
    displayHint.hidden = !portrait.matches;
    displayHint.textContent = 'Turn your device sideways, then continue your chronicle.';
    if (portrait.matches && !session.isInMenu()) returnToMenu({ force: true });
  });
  const fullscreenChanged = () => {
    if (usesTouchGameDisplay() && !getGameFullscreenElement() && !session.isInMenu()) returnToMenu({ force: true });
  };
  document.addEventListener('fullscreenchange', fullscreenChanged);
  document.addEventListener('webkitfullscreenchange', fullscreenChanged);
  menuButton.addEventListener("click", returnToMenu);
  document.querySelector('[data-testid="utility-controls"]').prepend(menuButton, recovery.statusButton);
  document.body.append(panel, recovery.banner, importInput);
  setInterval(() => {
    if (!panel.hidden && loadingSlot !== null) loading.update(loadingStarted ? session.getLoadingStatus?.() : null, loadingFailed);
  }, 250);
  show();
  void session.refreshSlots();
  return {
    show,
    hide,
    openNewGame() {
      if (!session.openMenu()) return false;
      onPause?.();
      show();
      mode = "new";
      render();
      return true;
    },
    requiresLandscape: () => portrait.matches,
    syncSaveStatus() {
      recovery.sync();
      const canReplace = session.getSaveStatus().canReplaceLiveGame && session.getSlotStatus().phase === 'ready';
      if (!panel.hidden && (renderedSlotPhase !== session.getSlotStatus().phase || renderedCanReplace !== canReplace
        || renderedSavePhase !== session.getSaveStatus().phase)) render();
      for (const target of panel.querySelectorAll('[data-testid="game-new"], [data-testid="game-load"], [data-testid="game-save-import"]')) target.disabled = !canReplace;
    },
    clearError() { message.textContent = ""; recovery.clearError(); },
    showError(text) { message.textContent = text; recovery.showError(text); },
  };
}
