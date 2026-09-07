import { createNewGameState } from "../model/new-game.js";

export function createGameSessionController({ runner, onEnter, onError, onSaved }) {
  let activeSlot = null;
  let inMenu = true;
  function save() {
    if (activeSlot === null) return { ok: true };
    const result = runner.saveToSlot(activeSlot);
    if (!result.ok) onError?.("Could not save. Browser storage may be full or unavailable. Keep this page open and try again.");
    if (result.ok) onSaved?.();
    return result;
  }
  function enter(slot) {
    activeSlot = slot;
    inMenu = false;
    onSaved?.();
    onEnter?.();
    return { ok: true };
  }
  return {
    isInMenu: () => inMenu,
    getActiveSlot: () => activeSlot,
    slots: () => [1, 2, 3].map((slot) => {
      const result = runner.inspectSaveSlot(slot);
      return { slot, available: result.ok, empty: result.reason === "emptySlot", meta: result.meta };
    }),
    newGame(slot) {
      // Entropy only chooses the seed; every world roll uses serialized state.rng.
      const seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
      activeSlot = null;
      const result = runner.resetToState(createNewGameState(seed), "twoRegionStarter01");
      if (!result.ok) return result;
      const saved = runner.saveToSlot(slot);
      if (!saved.ok) {
        onError?.("Could not create a save. Free some browser storage and try again.");
        return saved;
      }
      return enter(slot);
    },
    continueGame(slot) {
      const result = runner.loadFromSlot(slot);
      if (!result.ok) { onError?.("This save could not be loaded."); return result; }
      return enter(slot);
    },
    openMenu() {
      if (!save().ok) return false;
      inMenu = true;
      return true;
    },
    resume() { inMenu = false; },
    save,
  };
}
