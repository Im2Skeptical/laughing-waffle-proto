import { PHONE_PORTRAIT_QUERY, getGameFullscreenElement, requestGameDisplayMode, usesTouchGameDisplay } from './game-display-mode.js';
import { createSaveRecoveryDom, downloadSaveText } from './save-recovery-dom.js';
import { buildSaveDiagnosticReport, createSaveDiagnosticsDom } from './save-diagnostics-dom.js';

export function createGameMenuDom({ session, onResume, onPause }) {
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
      await requestGameDisplayMode({ forceFullscreen: event?.pointerType === 'touch' });
      // Fullscreen/orientation steal window focus on phones; visibility is the
      // signal that the player actually left during the request.
      if (version !== entryVersion || document.hidden) return;
      if (portrait.matches) {
        displayHint.textContent = 'Turn your device sideways, then continue your chronicle.';
        displayHint.hidden = false;
        displayHint.scrollIntoView({ block: 'nearest' });
        return;
      }
      displayHint.hidden = true;
      if (slot !== null) { loadingSlot = slot; loadingAction = action; loadingFailed = false; render(); }
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
    } catch (_error) {
      if (version === entryVersion) {
        loadingFailed = true;
        message.textContent = "Could not open your chronicle. Retry or return to the menu.";
        render();
      }
    } finally { if (version === entryVersion) entering = false; }
  }
  function start(slot, event) {
    void enter(isCurrent => session.newGame(slot, { isCurrent }), slot, event);
  }
  function render() {
    panel.replaceChildren();
    const content = document.createElement("div");
    content.className = "game-menu-content";
    const eyebrow = document.createElement("p");
    eyebrow.className = "game-menu-eyebrow";
    eyebrow.textContent = "A chronicle of lives & lost futures";
    const title = document.createElement("h1");
    title.textContent = "Civilization Survivor";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Guide a fragile realm. Turn back the years. Rewrite its fate.";
    content.append(eyebrow, title, subtitle, displayHint);
    const slots = session.slots();
    const slotStatus = session.getSlotStatus();
    const canReplace = session.getSaveStatus().canReplaceLiveGame && slotStatus.phase === 'ready';
    renderedSlotPhase = slotStatus.phase; renderedCanReplace = canReplace;
    const saveFailed = session.getSaveStatus().phase === 'failed';
    renderedSavePhase = session.getSaveStatus().phase;
    if (saveFailed && mode !== 'diagnostics') { recovery.sync(); content.append(recovery.element); }
    if (loadingSlot !== null) {
      const heading = document.createElement("h2");
      heading.textContent = loadingFailed ? "Your chronicle could not be prepared" : "Preparing your chronicle…";
      content.append(heading);
      if (!loadingFailed) {
        const progress = document.createElement("progress");
        progress.setAttribute("aria-label", "Preparing your chronicle");
        progress.dataset.testid = "game-loading-progress";
        content.append(progress);
      } else {
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
      content.append(heading);
      if (mode === 'load') {
        const importButton = button('Import save file', () => importInput.click(), 'game-save-import');
        importButton.disabled = !canReplace; content.append(importButton);
      }
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
        content.append(card);
      }
      content.append(button("Back", () => { importVersion++; session.cancelImport(); importMeta = null; mode = "home"; render(); }));
    }
    if (mode !== 'diagnostics') {
      if (!saveFailed) { recovery.sync(); content.append(recovery.element); }
      if (saveFailed) {
        const warning = document.createElement('p');
        warning.textContent = 'Retry saving before starting or loading another game. Export your current game as a backup.';
        content.append(warning);
      }
      const dev = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = 'Developer tools';
      dev.append(summary, button('Save diagnostics', () => { mode = 'diagnostics'; render(); }, 'game-save-diagnostics'));
      content.append(dev);
    }
    const note = document.createElement("p");
    note.className = "game-menu-note";
    note.textContent = "Three saves on this browser. Progress saves automatically during play. Gameplay uses landscape on phones.";
    content.append(message, note);
    panel.append(content);
    panel.querySelector("button")?.focus();
  }
  function returnToMenu({ force = false } = {}) {
    if (session.openMenu({ force })) { onPause?.(); show(); }
  }
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
