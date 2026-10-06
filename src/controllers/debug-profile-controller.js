import { GAMEPIECES_DRAFT_KIND, GAME_SETTINGS_DRAFT_KIND } from '../model/game-config.js';
import {
  DEBUG_PROFILE_DEFAULT_STORAGE_KEY, DEBUG_PROFILE_LIBRARY_STORAGE_KEY, DEBUG_PROFILE_PAGE_IDS,
  REGULAR_GAME_PROFILE_ID, REGULAR_GAME_PROFILE_NAME,
  createEmptyDebugProfileLibrary, deleteDebugProfile, findDebugProfileByName,
  parseDebugProfileExportJson, parseDebugProfileLibraryJson, saveDebugProfile,
  serializeDebugProfileExport, serializeDebugProfileLibrary, validateDebugProfile,
} from '../model/debug-profile-library.js';
import { createStarterBootProfile } from '../model/starter-boot-profile.js';
import { createConfiguredNewGameState } from '../model/new-game.js';

const clone = value => JSON.parse(JSON.stringify(value));
const WORKSPACE_STORAGE_KEY = 'civsurvivor.debugProfiles.workspace.v3';
function safeStorage() { try { return globalThis.localStorage ?? null; } catch (_) { return null; } }

export function createDebugProfileController({ mapLabController, debugConfigurationController, lifeMapLabController } = {}) {
  const storage = safeStorage();
  let library = createEmptyDebugProfileLibrary(), selectedProfileId = REGULAR_GAME_PROFILE_ID;
  let defaultProfileId = REGULAR_GAME_PROFILE_ID, activePage = 'mapLab', readOnly = true;
  let launch = clone(createStarterBootProfile().launch), status = { message: '', tone: 'info' };
  let loading = false;
  const builtIn = () => ({ id: REGULAR_GAME_PROFILE_ID, name: REGULAR_GAME_PROFILE_NAME, profile: createStarterBootProfile(), readOnly: true });
  const entryFor = id => id === REGULAR_GAME_PROFILE_ID ? builtIn() : library.profiles.find(entry => entry.id === id);
  try {
    const text = storage?.getItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY);
    if (text) {
      const parsed = parseDebugProfileLibraryJson(text);
      if (parsed.ok) library = parsed.library;
      else status = { message: `Stored profiles ignored: ${parsed.errors[0]}`, tone: 'warning' };
    }
    const savedDefault = storage?.getItem(DEBUG_PROFILE_DEFAULT_STORAGE_KEY);
    if (savedDefault && entryFor(savedDefault)) defaultProfileId = savedDefault;
  } catch (_) { status = { message: 'Profile storage is unavailable.', tone: 'warning' }; }
  function persistLibrary() {
    try { storage?.setItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, serializeDebugProfileLibrary(library)); return !!storage; }
    catch (_) { return false; }
  }
  function currentProfile() {
    if (readOnly) return createStarterBootProfile();
    return {
      mapLab: mapLabController.getSnapshot().draft,
      gameSettings: debugConfigurationController.getSnapshot(GAME_SETTINGS_DRAFT_KIND).draft,
      gamepieces: debugConfigurationController.getSnapshot(GAMEPIECES_DRAFT_KIND).draft,
      lifeMapLab: lifeMapLabController.getSnapshot().draft,
      launch: clone(launch), activePage,
    };
  }
  function persistWorkspace() {
    if (loading) return;
    try { storage?.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ selectedProfileId, profile: readOnly ? null : currentProfile() })); }
    catch (_) { status = { message: 'Draft changed, but browser storage is unavailable.', tone: 'warning' }; }
  }
  const subscriptions = [mapLabController, lifeMapLabController, debugConfigurationController]
    .map(controller => controller.subscribe(persistWorkspace));
  function applyEntry(entry) {
    const validation = validateDebugProfile(entry?.profile);
    if (!validation.ok) return { ok: false, reason: 'invalidProfile', errors: validation.errors };
    // Validate the complete recipe before replacing any editor draft.
    loading = true;
    mapLabController.replaceDraftFromProfile(entry.profile.mapLab);
    debugConfigurationController.replaceDraftsFromProfile(entry.profile);
    lifeMapLabController.replaceDraftFromProfile(entry.profile.lifeMapLab);
    launch = clone(entry.profile.launch); activePage = entry.profile.activePage;
    selectedProfileId = entry.id; readOnly = !!entry.readOnly;
    status = { message: readOnly ? 'Regular game baseline. Copy to make edits.' : `Loaded ${entry.name}.`, tone: 'ok' };
    loading = false; persistWorkspace();
    return { ok: true, entry };
  }
  function save(name, profile) {
    const overwriteId = findDebugProfileByName(library, name)?.id ?? null;
    const result = saveDebugProfile(library, name, profile, overwriteId);
    if (!result.ok) {
      status = { message: result.reason === 'emptyName' ? 'Enter a profile name before saving.' : `Profile could not be saved: ${result.errors?.[0] ?? result.reason}`, tone: 'warning' };
      return result;
    }
    library = result.library; selectedProfileId = result.entry.id; readOnly = false;
    persistWorkspace();
    const stored = persistLibrary();
    status = { message: stored ? `Saved ${result.entry.name}.` : 'Profile changed, but browser storage is unavailable.', tone: stored ? 'ok' : 'warning' };
    return { ...result, stored };
  }
  return {
    getSnapshot() {
      const selected = entryFor(selectedProfileId);
      return { selectedProfileId, defaultProfileId, activePage, readOnly, launch: clone(launch), status,
        dirty: !readOnly && (!selected || JSON.stringify({ ...selected.profile, activePage }) !== JSON.stringify(currentProfile())),
        profileOptions: [builtIn(), ...library.profiles].map(({ id, name, readOnly = false }) => ({ id, name, readOnly })),
      };
    },
    getCurrentProfile: () => clone(currentProfile()),
    setActivePage(id) { if (DEBUG_PROFILE_PAGE_IDS.includes(id)) { activePage = id; persistWorkspace(); } },
    loadProfile(id) { const entry = entryFor(id); return entry ? applyEntry(entry) : { ok: false, reason: 'invalidProfileId' }; },
    loadDefaultProfile() { return applyEntry(entryFor(defaultProfileId) ?? builtIn()); },
    openWorkspace() {
      try {
        const saved = JSON.parse(storage?.getItem(WORKSPACE_STORAGE_KEY) ?? 'null');
        if (saved?.profile && validateDebugProfile(saved.profile).ok) {
          const entry = entryFor(saved.selectedProfileId);
          return applyEntry({ id: entry?.readOnly ? null : entry?.id ?? null, name: entry?.name ?? 'saved draft', profile: saved.profile });
        }
        if (saved?.selectedProfileId === REGULAR_GAME_PROFILE_ID) return applyEntry(builtIn());
      } catch (_) { /* An invalid workspace never replaces a validated profile. */ }
      return this.loadDefaultProfile();
    },
    copyProfile() {
      const result = applyEntry({ id: null, name: 'editable copy', profile: currentProfile() });
      status = { message: 'Editable copy. Save a named profile or launch the draft directly.', tone: 'ok' };
      return result;
    },
    setLaunch(value) {
      if (readOnly) return { ok: false, reason: 'readOnlyProfile' };
      const validation = validateDebugProfile({ ...currentProfile(), launch: value });
      if (!validation.ok) return validation;
      launch = clone(value); persistWorkspace(); return { ok: true };
    },
    saveProfile(name) { return readOnly ? { ok: false, reason: 'readOnlyProfile' } : save(name, currentProfile()); },
    exportProfile(name = '') {
      try {
        const profileName = String(name).trim() || entryFor(selectedProfileId)?.name || 'New run profile';
        return { ok: true, name: profileName, text: serializeDebugProfileExport(profileName, currentProfile()) };
      } catch (error) { return { ok: false, reason: 'invalidProfile', error }; }
    },
    importProfile(text, name = '') {
      const parsed = parseDebugProfileExportJson(text);
      if (!parsed.ok) { status = { message: `Import failed: ${parsed.errors[0]}`, tone: 'warning' }; return parsed; }
      const result = save(name.trim() || parsed.value.name, parsed.value.profile);
      if (!result.ok) return result;
      applyEntry(result.entry);
      if (!result.stored) status = { message: 'Imported profile is available in this session, but could not be stored.', tone: 'warning' };
      return result;
    },
    deleteProfile(id) {
      if (id === REGULAR_GAME_PROFILE_ID) return { ok: false, reason: 'readOnlyProfile' };
      const result = deleteDebugProfile(library, id);
      if (!result.ok) return result;
      library = result.library; persistLibrary();
      if (defaultProfileId === id) this.setDefaultProfile(REGULAR_GAME_PROFILE_ID);
      if (selectedProfileId === id) selectedProfileId = null;
      persistWorkspace();
      status = { message: `Deleted ${result.entry.name}. Current draft remains open.`, tone: 'ok' };
      return result;
    },
    setDefaultProfile(id) {
      if (!entryFor(id)) return { ok: false, reason: 'invalidProfileId' };
      if (!storage) return { ok: false, reason: 'storageUnavailable' };
      try {
        storage?.setItem(DEBUG_PROFILE_DEFAULT_STORAGE_KEY, id); defaultProfileId = id;
        storage?.removeItem(WORKSPACE_STORAGE_KEY);
        status = { message: 'Default workshop profile updated. Main-menu new-game settings are selected separately.', tone: 'ok' };
        return { ok: true };
      } catch (_) { return { ok: false, reason: 'storageUnavailable' }; }
    },
    createRun(seed) {
      const profile = currentProfile(), validation = validateDebugProfile(profile);
      if (!validation.ok) throw new Error(validation.errors[0]);
      if (!Number.isInteger(seed) || seed < -2147483648 || seed > 2147483647) throw new Error('Seed must be a signed 32-bit integer.');
      return createConfiguredNewGameState(seed, profile);
    },
    destroy() { subscriptions.forEach(unsubscribe => unsubscribe()); },
  };
}
