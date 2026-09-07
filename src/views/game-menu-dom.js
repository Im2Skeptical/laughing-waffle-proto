import { PHONE_PORTRAIT_QUERY, getGameFullscreenElement, requestGameDisplayMode } from './game-display-mode.js';

export function createGameMenuDom({ session, onResume, onPause }) {
  const portrait = window.matchMedia(PHONE_PORTRAIT_QUERY);
  const panel = document.createElement("main");
  panel.id = "game-menu";
  panel.style.setProperty('--chronicle-backdrop', `url("${new URL('images/dark-fantasy/chronicle-gate.png',document.baseURI).href}")`);
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
  const errorBanner = document.createElement("p");
  errorBanner.className = "game-save-error";
  errorBanner.setAttribute("role", "alert");
  errorBanner.hidden = true;
  let mode = "home";
  let overwriteSlot = null;
  let entering = false;
  let entryVersion = 0;
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
    render();
  }
  function hide() {
    onResume?.();
    panel.hidden = true;
    document.body.classList.remove("game-menu-open");
  }
  async function enter(action) {
    if (entering) return;
    entering = true;
    const version = ++entryVersion;
    try {
      await requestGameDisplayMode();
      if (version !== entryVersion || document.hidden || !document.hasFocus()) return;
      if (portrait.matches) {
        displayHint.textContent = 'Turn your device sideways, then continue your chronicle.';
        displayHint.hidden = false;
        displayHint.scrollIntoView({ block: 'nearest' });
        return;
      }
      displayHint.hidden = true;
      if (action().ok) hide();
    } finally { entering = false; }
  }
  function start(slot) {
    void enter(() => session.newGame(slot));
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
    if (overwriteSlot !== null) {
      const warning = document.createElement("p");
      warning.textContent = `Replace Slot ${overwriteSlot}? Its current game will be permanently lost.`;
      content.append(warning,
        button("Replace and start new game", () => start(overwriteSlot), "game-replace-confirm"),
        button("Cancel", () => { overwriteSlot = null; render(); }));
    } else if (mode === "home") {
      const latest = slots.filter((slot) => slot.available)
        .sort((a, b) => String(b.meta?.savedAt).localeCompare(String(a.meta?.savedAt)))[0];
      if (session.canResume()) {
        content.append(button('Continue', () => enter(() => session.resume()), 'game-continue'));
      } else if (latest) content.append(button(`Continue · Slot ${latest.slot}`, () => {
        void enter(() => session.continueGame(latest.slot));
      }, "game-continue"));
      content.append(button("New game", () => { mode = "new"; render(); }, "game-new"));
      if (slots.some((slot) => !slot.empty)) content.append(button("Load game", () => { mode = "load"; render(); }, "game-load"));
    } else {
      const heading = document.createElement("h2");
      heading.textContent = mode === "new" ? "Choose a slot for your new game" : "Choose a game to continue";
      content.append(heading);
      for (const slot of slots) {
        const card = document.createElement("section");
        card.className = "game-save-slot";
        const label = document.createElement("h3");
        label.textContent = `Slot ${slot.slot}`;
        const details = document.createElement("p");
        details.textContent = slot.empty ? "Empty slot" : slot.available
          ? `Year ${slot.meta.year} · ${slot.meta.seasonKey} · ${new Date(slot.meta.savedAt).toLocaleString()}`
          : "Unavailable save · incompatible or damaged";
        const action = button(mode === "new" ? (slot.empty ? "Start here" : "Replace game") : "Continue", () => {
          if (mode === "load") { void enter(() => session.continueGame(slot.slot)); }
          else if (slot.empty) start(slot.slot);
          else { overwriteSlot = slot.slot; render(); }
        }, `game-slot-${slot.slot}`);
        action.disabled = mode === "load" && !slot.available;
        card.append(label, details, action);
        content.append(card);
      }
      content.append(button("Back", () => { mode = "home"; render(); }));
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
    if (entering && !document.hidden) return;
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
    if (!getGameFullscreenElement() && !session.isInMenu()) returnToMenu({ force: true });
  };
  document.addEventListener('fullscreenchange', fullscreenChanged);
  document.addEventListener('webkitfullscreenchange', fullscreenChanged);
  menuButton.addEventListener("click", returnToMenu);
  document.querySelector('[data-testid="utility-controls"]').prepend(menuButton);
  document.body.append(panel, errorBanner);
  show();
  return {
    show,
    hide,
    requiresLandscape: () => portrait.matches,
    clearError() { message.textContent = ""; errorBanner.hidden = true; },
    showError(text) { message.textContent = text; errorBanner.textContent = text; errorBanner.hidden = false; },
  };
}
