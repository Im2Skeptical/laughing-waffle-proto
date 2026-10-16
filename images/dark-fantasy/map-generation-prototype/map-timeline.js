// Presentation-only fixture. The live runner remains the owner of simulation time.
// Renderers sample seconds absolutely; they never integrate their own phase.
import { STUDY_YEAR_SECONDS } from './water-style.js';
export function createMapTimeline({ currentSec = 60, forecastSeconds = 60, playing = true } = {}) {
  let cursor = currentSec, frontier = currentSec, following = true;
  let rate = 1, running = playing, scrubbing = false, last = null, spanYears = 0;
  const finite = value => { if (!Number.isFinite(value)) throw new Error('Timeline time must be finite'); return value; };
  finite(currentSec); finite(forecastSeconds);
  if (currentSec < 0 || forecastSeconds < 0) throw new Error('Timeline bounds must be nonnegative');
  const cap = () => frontier + (spanYears ? STUDY_YEAR_SECONDS * spanYears : forecastSeconds);
  const clamp = value => Math.max(0, Math.min(cap(), finite(value)));
  const reset = () => { last = null; };
  return {
    get snapshot() {
      const minSec = spanYears ? 0 : Math.max(0, Math.floor(Math.min(frontier - 60, cursor) / 60) * 60);
      const maxSec = Math.max(minSec + 180, Math.ceil((cap() + 30) / 60) * 60);
      return { displaySec: cursor, currentSec: frontier, revealCapSec: cap(), minSec, maxSec, spanYears,
        followingNow: following, playing: running, rate, scrubbing,
        mode: following ? 'Now' : cursor > frontier ? 'Forecast preview' : 'History preview',
        // Discrete state is restored at tSec. Fraction belongs only to continuous visuals.
        sample: { tSec: Math.floor(cursor), fraction: cursor - Math.floor(cursor), seconds: cursor } };
    },
    reset,
    setSpanYears(value) {
      if(![0,50,300].includes(value))throw new Error('Unsupported study span');
      spanYears=value;cursor=clamp(cursor);reset();
    },
    seek(seconds) { cursor = clamp(seconds); following = false; running = false; reset(); },
    beginScrub() { scrubbing = true; running = false; following = false; reset(); },
    endScrub() { scrubbing = false; reset(); },
    play(value = true) { running = !!value; reset(); },
    setRate(value) {
      if (![.25, 1, 4, -1].includes(value)) throw new Error('Unsupported playback rate');
      rate = value; if (rate < 0) following = false; reset();
    },
    returnToNow() { cursor = frontier; following = true; rate = Math.abs(rate); reset(); },
    step(now) {
      finite(now);
      if (!running || scrubbing) { reset(); return false; }
      if (last === null) { last = now; return false; }
      const elapsed = now - last;
      if (elapsed < 1000 / 30 - .5) return false;
      last = now;
      // This fixture suspends during hidden tabs and long bakes. This is NOT a sim tick loop.
      const next = cursor + Math.min(elapsed, 100) / 1000 * rate;
      if (following) { frontier = Math.max(frontier, next); cursor = frontier; }
      else { cursor = clamp(next); if (next <= 0 || next >= cap()) running = false; }
      return true;
    },
  };
}
