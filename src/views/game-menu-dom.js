export function createGameMenuDom({ session }) {
  const panel = document.createElement("main");
  panel.id = "game-menu";
  panel.style.setProperty('--chronicle-backdrop', `url("${new URL('images/dark-fantasy/chronicle-gate.png',document.baseURI).href}")`);
  panel.dataset.testid = "game-menu";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  const menuButton = document.createElement("button");
  menuButton.textContent = "Save & menu";
  menuButton.dataset.testid = "game-menu-open";
  const errorBanner = document.createElement("p");
  errorBanner.className = "game-save-error";
  errorBanner.setAttribute("role", "alert");
  errorBanner.hidden = true;
  let mode = "home";
  let overwriteSlot = null;
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
    panel.hidden = true;
    document.body.classList.remove("game-menu-open");
  }
  function start(slot) {
    if (session.newGame(slot).ok) hide();
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
    content.append(eyebrow, title, subtitle);
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
      if (session.getActiveSlot() !== null) content.append(button("Resume game", () => { session.resume(); hide(); }));
      if (latest) content.append(button(`Continue · Slot ${latest.slot}`, () => {
        if (session.continueGame(latest.slot).ok) hide();
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
          if (mode === "load") { if (session.continueGame(slot.slot).ok) hide(); }
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
  function returnToMenu() { if (session.openMenu()) show(); }
  menuButton.addEventListener("click", returnToMenu);
  document.querySelector('[data-testid="mobile-menu-return"]')?.addEventListener("click", returnToMenu);
  document.querySelector('[data-testid="utility-controls"]').prepend(menuButton);
  document.body.append(panel, errorBanner);
  show();
  return {
    show,
    hide,
    clearError() { message.textContent = ""; errorBanner.hidden = true; },
    showError(text) { message.textContent = text; errorBanner.textContent = text; errorBanner.hidden = false; },
  };
}
