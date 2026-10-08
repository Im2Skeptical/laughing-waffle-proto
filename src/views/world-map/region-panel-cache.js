import { addRegionPanelContent } from '../chronicle-world-panels.js';
import { roundedRect } from '../settlement-view-primitives.js';
import { PALETTE } from '../settlement-theme.js';

// Retained presentation only. Exact input signatures invalidate cards when
// time, content, ownership or art changes; no state or navigation is modified.
export function createRegionPanelCache({ rect, addCloseButton, onClose, maxEntries = 8 }) {
  const entries = new Map();
  let builds = 0;
  let hits = 0;
  function get(regionId, input, { settlementScope, artRevision }) {
    const key = JSON.stringify({ ...input, tooltipView: undefined, settlementScope, artRevision });
    const previous = entries.get(regionId);
    if (previous?.key === key) {
      entries.delete(regionId);
      entries.set(regionId, previous);
      hits++;
      return previous.root;
    }
    previous?.root.destroy({ children: true });
    const root = new PIXI.Container();
    const panel = new PIXI.Graphics();
    roundedRect(panel, rect.x, rect.y, rect.width, rect.height, 7,
      input.vm?.neutral ? 0x132b29 : PALETTE.panelSoft,
      input.vm?.neutral ? 0x8ed7cf : settlementScope ? PALETTE.accent : PALETTE.stroke, settlementScope ? 5 : 3);
    panel.eventMode = 'static';
    panel.cursor = input.vm ? 'pointer' : 'default';
    panel.hitArea = new PIXI.Rectangle(rect.x, rect.y, rect.width, rect.height);
    root.addChild(panel);
    addRegionPanelContent(root, rect, input);
    addCloseButton(root, { x: rect.x + rect.width - 62, y: rect.y + 14, width: 48, height: 48 }, 'X', onClose);
    entries.set(regionId, { key, root });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      entries.get(oldest).root.destroy({ children: true });
      entries.delete(oldest);
    }
    builds++;
    return root;
  }
  return {
    get,
    clear() {
      for (const entry of entries.values()) entry.root.destroy({ children: true });
      entries.clear();
    },
    snapshot: () => ({ count: entries.size, builds, hits }),
  };
}
