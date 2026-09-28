import { serializeGameState, deserializeGameState } from '../model/state.js';

const PREFIX = 'civsurvivor.development-lab.handoff.';
export function openLabHandoff(state, destination = 'gym') {
  // Validation and serialization happen before opening a tab. Tokens are UI identities,
  // never simulation entropy. The originating runner and save slots remain untouched.
  const data = serializeGameState(deserializeGameState(serializeGameState(state)));
  const token = crypto.randomUUID();
  const key = PREFIX + token;
  localStorage.setItem(key,JSON.stringify(data));
  const url = new URL(location.href);
  url.hash = destination === 'play' ? `/dev/play?state=${token}` : `/dev/gym?state=${token}`;
  const opened = window.open(url.href,'_blank');
  if (!opened) { localStorage.removeItem(key); throw new Error('Allow this site to open a tab, then try again.'); }
  opened.opener = null;
}
export function readLabHandoff(hash = location.hash) {
  const token = new URLSearchParams(hash.split('?')[1] ?? '').get('state');
  if (!token) return null;
  if (!/^[a-f0-9-]{36}$/i.test(token)) throw new Error('Invalid Lab handoff token');
  const raw = localStorage.getItem(PREFIX + token);
  if (!raw) throw new Error('Lab handoff not found. Open a new copy from the source tab.');
  const state = deserializeGameState(raw);
  // Retain for refresh; no destructive consumption of the user's reproduction.
  return state;
}
