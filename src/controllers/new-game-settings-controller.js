import { createConfiguredNewGameState } from '../model/new-game.js';
import { createStarterBootProfile } from '../model/starter-boot-profile.js';
import { validateGamepiecesDraft } from '../model/game-config.js';
import {
  DEBUG_PROFILE_LIBRARY_STORAGE_KEY, REGULAR_GAME_PROFILE_ID, REGULAR_GAME_PROFILE_NAME,
  parseDebugProfileLibraryJson,
} from '../model/debug-profile-library.js';

export const NEW_GAME_DEV_SETTINGS_KEY = 'civsurvivor.newGame.devSettings';
function browserStorage() { try { return globalThis.localStorage; } catch { return null; } }

// Menu choices select initialization data; running games never read this storage.
export function createNewGameSettingsController({ storage = browserStorage(), cardReviews } = {}) {
  function preferences() {
    try {
      const value = JSON.parse(storage?.getItem(NEW_GAME_DEV_SETTINGS_KEY) ?? 'null');
      return { enabled: value?.enabled === true, profileId: typeof value?.profileId === 'string' ? value.profileId : REGULAR_GAME_PROFILE_ID };
    } catch { return { enabled: false, profileId: REGULAR_GAME_PROFILE_ID }; }
  }
  function selection() {
    const choice = preferences();
    let profiles = [], error = '';
    try {
      const text = storage?.getItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY);
      if (text) {
        const result = parseDebugProfileLibraryJson(text);
        if (result.ok) profiles = result.library.profiles;
        else error = `Saved dev profiles need attention: ${result.errors[0]}`;
      }
    } catch { error = 'Saved dev profiles could not be read on this device.'; }
    const entries = [{ id: REGULAR_GAME_PROFILE_ID, name: REGULAR_GAME_PROFILE_NAME, profile: createStarterBootProfile() }, ...profiles];
    const selected = entries.find(entry => entry.id === choice.profileId);
    if (!selected) error ||= 'The selected dev profile is unavailable. Choose another profile or turn off Use dev settings.';
    return { ...choice, entries, selected, error };
  }
  function selectedProfile() {
    const result = selection();
    if (!result.selected) throw new Error(result.error);
    return result.selected.profile;
  }
  function write(value) {
    if (!storage) throw new Error('New-game preferences could not be saved on this device.');
    storage.setItem(NEW_GAME_DEV_SETTINGS_KEY, JSON.stringify(value));
  }
  return {
    getSnapshot() {
      const { enabled, profileId, entries, selected, error } = selection();
      return { enabled, profileId, selectedName: selected?.name ?? null, error,
        profileOptions: entries.map(({ id, name }) => ({ id, name })) };
    },
    setEnabled(enabled) { write({ ...preferences(), enabled: Boolean(enabled) }); },
    selectProfile(profileId) {
      if (!selection().entries.some(entry => entry.id === profileId)) throw new Error('Choose an available dev profile.');
      write({ ...preferences(), profileId });
    },
    getLaunchKey() {
      if (!preferences().enabled) return cardReviews.getLaunchKey();
      // Include saved values so editing a named profile also invalidates preparation.
      const selected = selection();
      if (!selected.selected) return JSON.stringify(['unavailableProfile', selected.profileId, selected.error]);
      const { activePage: _activePage, ...profile } = selected.selected.profile;
      return JSON.stringify([profile, cardReviews.getLaunchKey()]);
    },
    createNewGame(seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0]) {
      if (!preferences().enabled) return cardReviews.createNewGame(seed);
      const profile = selectedProfile();
      if (cardReviews.useInNewGames()) {
        const result = cardReviews.applyTo(profile.gamepieces);
        result.issues.push(...validateGamepiecesDraft(result.gamepieces).errors);
        if (result.issues.length) throw new Error(`Edited cards need attention: ${result.issues.slice(0, 3).join('; ')}`);
        profile.gamepieces = result.gamepieces;
      }
      return createConfiguredNewGameState(seed, profile);
    },
  };
}
