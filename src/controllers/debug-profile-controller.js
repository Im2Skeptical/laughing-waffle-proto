import {
  GAMEPIECES_DRAFT_KIND,
  GAME_SETTINGS_DRAFT_KIND,
} from "../model/game-config.js";
import {
  DEBUG_PROFILE_BOOT_STORAGE_KEY,
  DEBUG_PROFILE_LIBRARY_STORAGE_KEY,
  DEBUG_PROFILE_PAGE_IDS,
  createEmptyDebugProfileLibrary,
  deleteDebugProfile,
  findDebugProfileByName,
  parseDebugProfileLibraryJson,
  saveDebugProfile,
  serializeDebugProfileLibrary,
  validateDebugProfile,
} from "../model/debug-profile-library.js";

function safeStorage() {
  try {
    return globalThis?.localStorage ?? null;
  } catch (_) {
    return null;
  }
}

export function createDebugProfileController({
  mapLabController,
  debugConfigurationController,
  vassalDebugPresetController,
} = {}) {
  let library = createEmptyDebugProfileLibrary();
  let selectedProfileId = null;
  let bootProfileId = null;
  let activePage = "mapLab";
  let status = { message: "", tone: "info" };

  const storage = safeStorage();
  if (storage) {
    try {
      const libraryText = storage.getItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY);
      if (libraryText) {
        const parsed = parseDebugProfileLibraryJson(libraryText);
        if (parsed.ok) library = parsed.library;
        else status = { message: `Stored profiles ignored: ${parsed.errors[0]}`, tone: "warning" };
      }
      const storedBootId = storage.getItem(DEBUG_PROFILE_BOOT_STORAGE_KEY);
      if (storedBootId) bootProfileId = storedBootId;
    } catch (_) {
      status = { message: "Debug profiles could not be read.", tone: "warning" };
    }
  }

  function persistLibrary() {
    try {
      storage?.setItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, serializeDebugProfileLibrary(library));
      return !!storage;
    } catch (_) {
      return false;
    }
  }

  function currentProfile() {
    return {
      mapLab: mapLabController.getSnapshot().draft,
      gameSettings: debugConfigurationController.getSnapshot(GAME_SETTINGS_DRAFT_KIND).draft,
      gamepieces: debugConfigurationController.getSnapshot(GAMEPIECES_DRAFT_KIND).draft,
      vassalLab: vassalDebugPresetController.getSnapshot().currentDraft,
      activePage,
    };
  }

  function applyEntry(entry) {
    const validation = validateDebugProfile(entry?.profile);
    if (!validation.ok) return { ok: false, reason: "invalidProfile", errors: validation.errors };
    const mapResult = mapLabController.replaceDraftFromProfile(entry.profile.mapLab);
    if (!mapResult.ok) return mapResult;
    const configResult = debugConfigurationController.replaceDraftsFromProfile(entry.profile);
    if (!configResult.ok) return configResult;
    const vassalResult = vassalDebugPresetController.setCurrentDraft(entry.profile.vassalLab);
    if (!vassalResult.ok) return vassalResult;
    activePage = entry.profile.activePage;
    selectedProfileId = entry.id;
    status = { message: `Loaded “${entry.name}”.`, tone: "ok" };
    return { ok: true, entry };
  }

  return {
    getSnapshot() {
      return {
        selectedProfileId,
        bootProfileId,
        activePage,
        status,
        profileOptions: library.profiles.map(({ id, name }) => ({ id, name })),
      };
    },
    setActivePage(pageId) {
      if (DEBUG_PROFILE_PAGE_IDS.includes(pageId)) activePage = pageId;
    },
    selectProfile(profileId = null) {
      if (profileId == null || profileId === "") {
        selectedProfileId = null;
        return { ok: true, selectedProfileId: null };
      }
      if (!library.profiles.some((entry) => entry.id === profileId)) {
        return { ok: false, reason: "invalidProfileId" };
      }
      selectedProfileId = profileId;
      return { ok: true, selectedProfileId };
    },
    loadProfile(profileId) {
      const entry = library.profiles.find((item) => item.id === profileId);
      return entry ? applyEntry(entry) : { ok: false, reason: "invalidProfileId" };
    },
    saveProfile(name) {
      // Profile names define save identity. A new name must always create a
      // new profile even when another profile happens to be selected.
      const overwriteId = findDebugProfileByName(library, name)?.id ?? null;
      const result = saveDebugProfile(library, name, currentProfile(), overwriteId);
      if (!result.ok) return result;
      library = result.library;
      selectedProfileId = result.entry.id;
      const stored = persistLibrary();
      status = {
        message: stored ? `Saved “${result.entry.name}”.` : "Profile could not be stored.",
        tone: stored ? "ok" : "warning",
      };
      return { ...result, stored };
    },
    deleteProfile(profileId) {
      const result = deleteDebugProfile(library, profileId);
      if (!result.ok) return result;
      library = result.library;
      if (selectedProfileId === profileId) selectedProfileId = null;
      if (bootProfileId === profileId) {
        bootProfileId = null;
        storage?.removeItem(DEBUG_PROFILE_BOOT_STORAGE_KEY);
      }
      persistLibrary();
      status = { message: `Deleted “${result.entry.name}”.`, tone: "ok" };
      return result;
    },
    setBootProfile(profileId) {
      if (!library.profiles.some((entry) => entry.id === profileId)) {
        return { ok: false, reason: "invalidProfileId" };
      }
      bootProfileId = profileId;
      storage?.setItem(DEBUG_PROFILE_BOOT_STORAGE_KEY, profileId);
      status = { message: "Boot profile updated.", tone: "ok" };
      return { ok: true };
    },
    clearBootProfile() {
      bootProfileId = null;
      storage?.removeItem(DEBUG_PROFILE_BOOT_STORAGE_KEY);
      status = { message: "Boot profile cleared.", tone: "ok" };
      return { ok: true };
    },
    loadBootProfile() {
      if (!bootProfileId) return { ok: true, applied: false };
      const entry = library.profiles.find((item) => item.id === bootProfileId);
      if (!entry) {
        status = { message: "Boot profile is missing; using authored setup.", tone: "warning" };
        return { ok: false, reason: "missingBootProfile" };
      }
      const loaded = applyEntry(entry);
      return loaded.ok ? { ...loaded, applied: true } : loaded;
    },
  };
}
