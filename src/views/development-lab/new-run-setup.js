import { createMapLabController } from '../../controllers/map-lab-controller.js';
import { createLifeMapLabController } from '../../controllers/life-map-lab-controller.js';
import { createDebugConfigurationController } from '../../controllers/debug-configuration-controller.js';
import { createDebugProfileController } from '../../controllers/debug-profile-controller.js';
import { openLabHandoff } from '../../controllers/development-lab-bridge.js';
import { createMapLabDom } from '../map-lab-dom.js';
import { createLifeMapLabDom } from '../life-map-lab-dom.js';
import { createDebugConfigurationDom } from '../debug-configuration-dom.js';
import { el, button, confirmButton, select, input, field, section, info, group } from './elements.js';

export function createNewRunSetupView({ getGymState, openInGym, review }) {
  const map = createMapLabController({ runner: { getState: getGymState } });
  const lifeMap = createLifeMapLabController();
  const config = createDebugConfigurationController({ lifeMapLabController: lifeMap });
  const profiles = createDebugProfileController({ mapLabController: map, lifeMapLabController: lifeMap, debugConfigurationController: config });
  profiles.openWorkspace();
  const root = el('section', '', 'lab-run-setup'); root.dataset.testid = 'lab-run-setup';
  const pages = {
    mapLab: createMapLabDom({ controller: map, readOnly: () => profiles.getSnapshot().readOnly }),
    gameSettings: createDebugConfigurationDom({ controller: config, readOnly: () => profiles.getSnapshot().readOnly }),
    lifeMapLab: createLifeMapLabDom({ controller: lifeMap, readOnly: () => profiles.getSnapshot().readOnly }),
  };
  for (const page of Object.values(pages)) page.init();
  const seed = input('New run seed', 42); seed.min = '-2147483648'; seed.max = '2147483647';
  let profileName = '', jsonText = '', jsonOpen = false, error = '', activePage = profiles.getSnapshot().activePage;
  const status = el('p', '', 'lab-status'), dirty = el('strong');
  status.setAttribute('role', 'status'); status.dataset.testid = 'debug-profile-status';
  function syncStatus() {
    const snapshot = profiles.getSnapshot();
    status.textContent = error || snapshot.status.message;
    status.classList.toggle('lab-warning', !!error || snapshot.status.tone === 'warning');
    dirty.textContent = snapshot.readOnly ? 'Read-only baseline' : snapshot.dirty ? 'Unsaved edits · launch uses them' : 'Saved profile';
    dirty.className = `lab-badge ${snapshot.readOnly ? '' : snapshot.dirty ? 'lab-badge-warn' : 'lab-badge-ok'}`;
  }
  function act(action) {
    try {
      const result = action();
      error = result?.ok === false ? result.errors?.[0] ?? result.reason : '';
    } catch (e) { error = e.message; }
    render();
  }
  const unsubscribers = [map.subscribe(syncStatus), lifeMap.subscribe(syncStatus), config.subscribe(syncStatus)];
  function render() {
    const snapshot = profiles.getSnapshot();
    root.replaceChildren();
    if (!pages[activePage]) { activePage = 'mapLab'; profiles.setActivePage(activePage); }
    root.append(info('new-run-setup', [
      'One combined profile saves Map Lab, Game Settings, Life Map Lab, reviewed cards and launch options together. Start from Regular game, copy it, tune the draft, then launch. Museum exhibits are saved game states, not recipes.',
      snapshot.readOnly ? 'Regular game follows this build’s New Game setup, including two starting settlements and four neutrals. It updates with the game and cannot be overwritten.' : 'All three editor tabs edit this combined profile. Save profile captures every section and the reviewed cards applied to this draft.',
    ], { label: 'How profiles work' }));
    const toolbar = el('div', '', 'lab-controls'); toolbar.dataset.testid = 'debug-profile-toolbar';
    const chosen = select('New run profile', snapshot.profileOptions.map(entry => [entry.id, `${entry.name}${entry.readOnly ? ' · live baseline' : ''}${entry.id === snapshot.defaultProfileId ? ' · default' : ''}`]), snapshot.selectedProfileId ?? '');
    if (!snapshot.selectedProfileId) { const custom = el('option', 'Current editable draft'); custom.value = ''; chosen.prepend(custom); chosen.value = ''; }
    chosen.dataset.testid = 'debug-profile-select';
    chosen.addEventListener('change', () => act(() => {
      const result = profiles.loadProfile(chosen.value);
      if (result.ok) { profileName = snapshot.profileOptions.find(entry => entry.id === chosen.value)?.readOnly ? '' : result.entry.name; activePage = result.entry.profile.activePage; }
      return result;
    }));
    const name = input('New run profile name', profileName, 'text'); name.placeholder = 'Name your edited profile'; name.dataset.testid = 'debug-profile-name';
    name.disabled = snapshot.readOnly; name.addEventListener('input', () => { profileName = name.value; });
    const save = button('Save profile', () => act(() => profiles.saveProfile(profileName)), 'debug-profile-save'); save.disabled = snapshot.readOnly;
    const remove = confirmButton('Delete profile', 'Delete this profile?', () => act(() => profiles.deleteProfile(snapshot.selectedProfileId)), 'debug-profile-delete'); remove.disabled = snapshot.readOnly || !snapshot.selectedProfileId;
    const defaultButton = button('Default in workshop', () => act(() => profiles.setDefaultProfile(snapshot.selectedProfileId)), 'debug-profile-default'); defaultButton.disabled = !snapshot.selectedProfileId;
    save.classList.add('lab-primary');
    const pick = el('div', '', 'lab-controls');
    pick.append(field('Combined profile', chosen), button('Copy to edit', () => act(() => { profileName = ''; return profiles.copyProfile(); }), 'debug-profile-copy', snapshot.readOnly ? 'primary' : ''), dirty);
    toolbar.append(field('Save as', name), save, defaultButton,
      button('Import / Export', () => act(() => { jsonOpen = !jsonOpen; const result = profiles.exportProfile(profileName); if (result.ok) jsonText = result.text; return result; }), 'debug-profile-json-toggle', 'quiet'), remove);
    root.append(section('Profile', pick, toolbar), status);
    const launchControls = el('div', '', 'lab-controls');
    const placement = select('Starting settlement placement', [['randomRoad', 'Regular game · random connected pair'], ['authoredMap', 'Exact Map Lab placement']], snapshot.launch.startMode);
    placement.disabled = snapshot.readOnly;
    placement.addEventListener('change', () => act(() => profiles.setLaunch({ ...snapshot.launch, startMode: placement.value })));
    const neutrals = input('Seed neutral settlements', '', 'checkbox'); neutrals.checked = snapshot.launch.neutralSettlements; neutrals.disabled = snapshot.readOnly;
    neutrals.addEventListener('change', () => act(() => profiles.setLaunch({ ...snapshot.launch, neutralSettlements: neutrals.checked })));
    const layoutHelp = snapshot.launch.startMode === 'randomRoad' ? 'The first detailed settlement in Map Lab supplies the shared starting tableau; placement is rolled from the roads. Exact Map Lab placement uses per-region assignments.' : 'Each region uses its Map Lab controller and tableau. Neutral seeding fills available frontier regions when enabled.';
    launchControls.append(field('Starting layout', placement, { help: layoutHelp }), field('Seed neutral settlements', neutrals), field('Seed', seed, { help: 'The launch seed makes runs reproducible. Life Map’s preview seed only changes its preview.' }));
    const launchActions = el('div', '', 'lab-controls');
    launchActions.append(button('Start new run', () => act(() => openLabHandoff(profiles.createRun(Number(seed.value)), 'play', { sameTab: true })), 'debug-start-new-run', 'primary'),
      button('Open in settlement sandbox', () => act(() => openInGym(profiles.createRun(Number(seed.value)))), 'lab-setup-to-gym'));
    const applyReviews = button('Apply reviewed cards to draft', () => act(() => {
      const profile = profiles.getCurrentProfile(), result = review.applyTo(profile.gamepieces);
      if (result.issues.length) throw new Error(result.issues[0]);
      return config.replaceDraftsFromProfile({ ...profile, gamepieces: result.gamepieces });
    }), 'lab-setup-reviewed-cards'); applyReviews.disabled = snapshot.readOnly;
    const cards = el('div', '', 'lab-controls');
    const reviewer = el('a', 'Open card reviewer', 'lab-quiet-link'); reviewer.href = '#/dev/reviewer';
    cards.append(applyReviews, reviewer);
    root.append(section('Launch', launchControls, launchActions, group('Reviewed cards', cards)));
    if (jsonOpen) {
      const area = el('textarea'); area.setAttribute('aria-label', 'New run profile JSON'); area.value = jsonText; area.rows = 12;
      area.addEventListener('input', () => { jsonText = area.value; });
      const io = section('Share a profile', area, el('p', 'To import an exported Regular game baseline, give it an editable profile name.'));
      const importName = input('Imported profile name', '', 'text'); importName.placeholder = 'Optional new name';
      const actions = el('div', '', 'lab-controls');
      actions.append(field('Import as', importName), button('Import profile', () => act(() => {
        const result = profiles.importProfile(jsonText, importName.value);
        if (result.ok) { profileName = result.entry.name; activePage = result.entry.profile.activePage; jsonOpen = false; }
        return result;
      }), 'debug-profile-json-import'), button('Refresh export', () => act(() => { const result = profiles.exportProfile(profileName); if (result.ok) jsonText = result.text; return result; })),
      button('Copy JSON', async () => { try { await navigator.clipboard.writeText(jsonText); status.textContent = 'Profile JSON copied.'; } catch (_) { area.focus(); area.select(); status.textContent = 'JSON selected; copy it from this field.'; } }));
      io.append(actions); root.append(io);
    }
    const tabs = el('div', '', 'lab-segmented'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Profile editor');
    for (const [id, label] of [['mapLab', 'Map Lab'], ['gameSettings', 'Game Settings'], ['lifeMapLab', 'Life Map Lab']]) {
      const tab = button(label, () => { activePage = id; profiles.setActivePage(id); render(); }, `debug-${id}-tab`);
      tab.dataset.value = id; tab.setAttribute('aria-pressed', String(activePage === id)); tabs.append(tab);
    }
    root.append(el('h3', 'Edit the recipe', 'lab-section-title'));
    const editor = el('fieldset', '', 'lab-run-editor'); editor.classList.toggle('is-readonly', snapshot.readOnly);
    const surface = el('div');
    pages[activePage].render(); surface.append(pages[activePage].element); editor.append(surface);
    root.append(tabs, editor); syncStatus();
  }
  render();
  return {
    render(parent) { parent.append(root); },
    getSnapshot: () => profiles.getSnapshot(),
    destroy() { profiles.destroy(); unsubscribers.forEach(unsubscribe => unsubscribe()); Object.values(pages).forEach(page => page.destroy()); root.remove(); },
  };
}
