// View-only trade trend for the region map (Option A + ghost decay).
// While a scrub is moving, goods packets are skipped (no previous-second
// restore), so the map draws coarse net-flow corridors instead. Corridors come
// from batches the map already saw (settled packet batches) plus the stock
// transfer journal on the viewed state, which needs no extra restore.
// Nothing here reads or mutates time-travel data.

export const TRADE_CORRIDOR_HISTORY_MAX = 96;
// Trend = the last N trade boundaries at or before the viewed second.
export const TRADE_CORRIDOR_ANCHORS = 6;

function amountOf(transfer) {
  const n = Number(transfer?.survivors ?? transfer?.amount ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function createTradeFlowHistory({ maxEntries = TRADE_CORRIDOR_HISTORY_MAX } = {}) {
  const bySec = new Map();
  function record(boundarySec, transfers) {
    const sec = Math.floor(Number(boundarySec));
    if (!Number.isFinite(sec) || sec <= 0 || !Array.isArray(transfers)) return;
    const flows = [];
    for (const t of transfers) {
      if (!t?.sourceRegionId || !t?.destinationRegionId || t.sourceRegionId === t.destinationRegionId) continue;
      flows.push({ from: t.sourceRegionId, to: t.destinationRegionId, amount: amountOf(t), resourceId: t.resourceId ?? null });
    }
    bySec.delete(sec);
    bySec.set(sec, flows);
    while (bySec.size > maxEntries) bySec.delete(bySec.keys().next().value);
  }
  // Net flow per unordered region pair over the last `anchors` recorded trade
  // boundaries in (viewedSec - windowSec, viewedSec].
  function netFlows(viewedSec, windowSec, anchors = TRADE_CORRIDOR_ANCHORS) {
    const end = Math.floor(Number(viewedSec));
    if (!Number.isFinite(end)) return [];
    const start = end - Math.max(1, windowSec);
    const secs = [...bySec.keys()].filter((sec) => sec > start && sec <= end && bySec.get(sec).length)
      .sort((a, b) => b - a).slice(0, Math.max(1, anchors));
    const pairs = new Map();
    secs.forEach((sec, rank) => {
      const flows = bySec.get(sec);
      // Older anchors count less so the trend leans toward "now".
      const weight = 1 - 0.6 * (rank / Math.max(1, secs.length));
      for (const f of flows) {
        const [a, b] = f.from < f.to ? [f.from, f.to] : [f.to, f.from];
        const key = a + '|' + b;
        const pair = pairs.get(key) ?? { a, b, net: 0, gross: 0 };
        const signed = f.from === a ? f.amount : -f.amount;
        pair.net += signed * weight;
        pair.gross += f.amount * weight;
        pairs.set(key, pair);
      }
    });
    const out = [];
    for (const p of pairs.values()) {
      if (p.gross <= 0) continue;
      const forward = p.net >= 0;
      out.push({ from: forward ? p.a : p.b, to: forward ? p.b : p.a, net: Math.abs(p.net), gross: p.gross });
    }
    const max = out.reduce((m, f) => Math.max(m, f.gross), 0) || 1;
    for (const f of out) f.intensity = Math.min(1, f.gross / max);
    return out.sort((x, y) => x.intensity - y.intensity);
  }
  return { record, netFlows, clear: () => bySec.clear(), get size() { return bySec.size; } };
}

// Width in screen px for a corridor of the given 0..1 intensity.
export function getTradeCorridorWidth(intensity, dragging) {
  const i = Math.max(0, Math.min(1, Number(intensity) || 0));
  return dragging ? Math.round(5 + i * 11) : Math.round(3 + i * 5);
}

// Ghost alpha for a packet whose route finished `ageSec` ago; fades out over `fadeSec`.
export function getGhostPacketAlpha(ageSec, fadeSec, peak = 0.28) {
  if (!Number.isFinite(ageSec) || ageSec < 0 || !(fadeSec > 0) || ageSec >= fadeSec) return 0;
  return peak * (1 - ageSec / fadeSec);
}

// Trail dots behind a packet: up to 40% of the route, each dot ~72% of the one ahead.
export function getPacketTrailSteps(progress, { span = 0.4, count = 5, step = 0.72 } = {}) {
  const p = Math.max(0, Math.min(1, Number(progress) || 0));
  const out = [];
  let alpha = 1;
  for (let i = 1; i <= count; i++) {
    const back = p - (span * i) / count;
    if (back < 0) break;
    alpha *= step;
    out.push({ progress: back, alpha, scale: 1 - i / (count + 1) });
  }
  return out;
}
