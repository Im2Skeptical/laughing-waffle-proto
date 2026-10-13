import { button } from '../../../src/views/vassal-node-decision/cards.js';
import { clearChildren, createText, roundedRect } from '../../../src/views/settlement-view-primitives.js';
import { PALETTE, TEXT_STYLES } from '../../../src/views/settlement-theme.js';

export function createOpeningNoteScreen({ app, layer, onConfirm }) {
  let spec = null, key = '', body = null, confirm = null, scrollY = 0, maxScroll = 0, heldY = null;
  const root = new PIXI.Container(); layer.addChild(root); root.visible = false;
  app.view.addEventListener('wheel', event => { if (root.visible) event.preventDefault(); }, { passive: false });
  function scroll(delta) { scrollY = Math.max(0, Math.min(maxScroll, scrollY + delta)); if (body) body.y = 350 - scrollY; }
  function refresh(note) {
    spec = note; root.visible = !!note;
    if (!note) { key = ''; heldY = null; return; }
    const next = JSON.stringify([note.id, note.title, note.description]); if (next === key) return; key = next;
    clearChildren(root); scrollY = 0;
    const backdrop = new PIXI.Graphics(); backdrop.beginFill(0x071011, .92).drawRect(0, 0, 2424, 1080); backdrop.eventMode = 'static'; root.addChild(backdrop);
    const panel = new PIXI.Graphics(); roundedRect(panel, 420, 140, 1584, 790, 18, PALETTE.panel, PALETTE.accent, 3); root.addChild(panel);
    root.addChild(createText('CUSTOM NOTE', { ...TEXT_STYLES.title, fontSize: 24, fill: PALETTE.accent }, 480, 180));
    root.addChild(createText(note.title, { ...TEXT_STYLES.header, fontSize: 38, wordWrap: true, wordWrapWidth: 1460 }, 480, 222));
    const viewport = new PIXI.Container(); viewport.eventMode = 'static'; viewport.hitArea = new PIXI.Rectangle(480, 350, 1460, 390); root.addChild(viewport);
    body = createText(note.description || 'No intention written yet.', { ...TEXT_STYLES.body, fontSize: 32, lineHeight: 42, wordWrap: true, wordWrapWidth: 1420 }, 480, 350);
    viewport.addChild(body); maxScroll = Math.max(0, body.height - 390);
    const mask = new PIXI.Graphics(); mask.beginFill(0xffffff).drawRect(480, 350, 1460, 390); root.addChild(mask); viewport.mask = mask;
    viewport.on('wheel', event => { scroll(event.deltaY); });
    viewport.on('pointerdown', event => { heldY = event.global.y; });
    viewport.on('pointermove', event => { if (heldY != null) { scroll(heldY - event.global.y); heldY = event.global.y; } });
    for (const type of ['pointerup', 'pointerupoutside', 'pointercancel']) viewport.on(type, () => { heldY = null; });
    root.addChild(createText(maxScroll ? 'Scroll or drag to read. Confirm leaves this note without changing the world.' : 'Confirm leaves this note without changing the world.', { ...TEXT_STYLES.body, fontSize: 25, fill: PALETTE.textMuted }, 480, 780));
    confirm = button(root, { x: 1570, y: 840, width: 360, height: 66 }, 'CONFIRM', true, () => { void onConfirm(); }, false, { fontSize: 28 });
  }
  return { refresh, isOpen: () => root.visible, getConfirmPoint: () => {
    if (!root.visible || !confirm) return null; const r = confirm.getBounds(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, getSnapshot: () => ({ open: root.visible, title: spec?.title, text: spec?.description.slice(0, 512), textLength: spec?.description.length, scrollY, maxScroll }) };
}
