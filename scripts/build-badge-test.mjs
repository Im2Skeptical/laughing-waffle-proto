import assert from 'node:assert/strict';
import { mountBuildBadge } from '../src/views/build-badge-dom.js';

// Drive the mounted badge and its real refresh callback without a game session.
const originalGlobals = Object.fromEntries(['document', 'MutationObserver', 'setInterval', 'fetch']
  .map(key => [key, globalThis[key]]));
const integrated = { version: '1.2.3', build: '123456abcdef', revision: 'fedcba654321',
  channel: 'local', branch: 'main', dirty: false, preview: false, previewLabel: null };
let current;
let refresh;
let badge;
let visibilityChange;
function mount(info) {
  current = info;
  globalThis.document = {
    hidden: false,
    getElementById: () => ({ textContent: JSON.stringify(info) }),
    createElement: () => ({ dataset: {}, setAttribute() {} }),
    querySelector: () => null,
    body: { classList: { contains: () => false }, append: element => { badge = element; } },
    addEventListener: (type, callback) => { if (type === 'visibilitychange') visibilityChange = callback; },
  };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.setInterval = callback => { refresh = callback; };
  globalThis.fetch = async () => ({ ok: true, json: async () => current });
  mountBuildBadge();
}

try {
  mount(integrated);
  assert.equal(badge.textContent, 'v1.2.3', 'Integrated builds have only a compact version');
  assert.ok(badge.title.includes(integrated.build), 'Full identity remains available on hover/focus');
  assert.equal(badge.tabIndex, 0, 'Build details can be focused from a keyboard');

  const preview = { ...integrated, preview: true, previewLabel: '5186', branch: 'task-a' };
  mount(preview);
  const loadedLabel = badge.textContent;
  assert.equal(loadedLabel, 'v1.2.3 · Preview 5186');
  assert.ok(!loadedLabel.includes(preview.build), 'Fingerprint stays off the visible badge');
  assert.ok(badge.title.includes('task-a'));
  assert.equal(badge.dataset.build, preview.build);
  current = { ...preview, build: '000000000000', version: '1.2.4' };
  await refresh();
  assert.equal(badge.dataset.stale, 'true');
  assert.ok(badge.textContent.startsWith(loadedLabel), 'An old loaded game keeps its original identity');
  assert.ok(badge.textContent.includes('save then reload'));
  assert.equal(badge.dataset.version, preview.version);
  assert.equal(badge.dataset.build, preview.build);
  current = preview;
  await visibilityChange();
  assert.equal(badge.textContent, loadedLabel, 'Reverted source clears the stale warning');

  mount(integrated);
  current = { ...integrated, preview: true, branch: 'task-b', previewLabel: '5186' };
  await refresh();
  assert.equal(badge.dataset.stale, 'true', 'Changing branch is detected even with identical source');
  mount({ ...integrated, channel: 'pages' });
  assert.equal(badge.textContent, 'v1.2.3', 'Published integrated builds stay compact');
  mount({ ...preview, channel: 'pages', previewLabel: null });
  assert.equal(badge.textContent, 'v1.2.3 · Preview', 'An unintegrated Pages artifact remains a preview');
  console.log('[build-badge] OK: compact labels, hidden identity, branch changes, loaded-build staleness');
} finally {
  for (const [key, value] of Object.entries(originalGlobals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
}
