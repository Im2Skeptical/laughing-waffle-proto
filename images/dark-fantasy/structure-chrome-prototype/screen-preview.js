import { settlementStructureDefs } from '../../../src/defs/gamepieces/detailed-settlement-defs.js';
import { getGamepieceFace } from '../../../src/model/gamepiece-presentation.js';
import { addSettlementPiece } from '../../../src/views/settlement-piece-pixi.js';
import { preloadChronicleArt } from '../../../src/views/chronicle-art.js';
import { getStoneTexture, paintRelicPanel, RELIC } from '../../../src/views/chronicle-skin.js';
import { createText } from '../../../src/views/settlement-view-primitives.js';
import { TEXT_STYLES } from '../../../src/views/settlement-theme.js';
import { addResourceIcon, addCostPanel } from '../../../src/views/resource-cost-pixi.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';

const ROOT = 'images/dark-fantasy/structure-chrome-prototype/';
const W = 2048, H = 903;
export const STRUCTURE_IDS = ['mudHouses', 'timberHouse', 'longhouse', 'granary', 'storehouse', 'archive', 'barracks'];
export const VARIANTS = { A: 'Capacity tray', B: 'Hanging medallion', C: 'Corner tray' };
const FLAVOUR = {
  mudHouses: 'A little earth between the hearth and the storm.', timberHouse: 'The forest becomes a roof; the roof becomes a home.',
  longhouse: 'Many fires, one roof. No neighbour winters alone.', granary: 'What summer leaves behind, winter will ask for.',
  storehouse: 'Every beam kept dry is a promise of tomorrow.', archive: 'A realm remembers only what someone chooses to keep.',
  barracks: 'Even in peace, the watch keeps its place.',
};
const fmt = value => String(Number(value.toFixed(2)));
const caps = value => value[0].toUpperCase() + value.slice(1);
const clear = root => { for (const node of root.removeChildren()) node.destroy({ children: true }); };
function text(root, value, x, y, width, size = 30, style = {}) {
  const node = createText(value, { ...TEXT_STYLES.body, fill: RELIC.bone, fontSize: size, lineHeight: size * 1.3,
    wordWrap: true, wordWrapWidth: width, ...style }, x, y);
  root.addChild(node); return node;
}
function panel(root, x, y, width, height, fill = RELIC.stone, line = RELIC.brass) {
  const g = new PIXI.Graphics(); paintRelicPanel(g, x, y, width, height, fill, line, 2); root.addChild(g); return g;
}
function control(root, label, rect, action, size = 26) {
  const button = new PIXI.Container(); button.position.set(rect.x, rect.y);
  panel(button, 0, 0, rect.width, rect.height, RELIC.raised);
  const copy = text(button, label, 0, 0, rect.width - 16, size, { ...TEXT_STYLES.header, fontSize: size, fill: RELIC.gold, wordWrap: false });
  copy.anchor.set(.5); copy.position.set(rect.width / 2, rect.height / 2);
  if (copy.width > rect.width - 12) copy.scale.set((rect.width - 12) / copy.width);
  button.eventMode = 'static'; button.cursor = 'pointer';
  const hitWidth = Math.max(96, rect.width), hitHeight = Math.max(80, rect.height);
  button.hitArea = new PIXI.Rectangle((rect.width - hitWidth) / 2, (rect.height - hitHeight) / 2, hitWidth, hitHeight);
  button.accessible = true; button.accessibleTitle = label; button.accessibleType = 'button';
  button.on('pointertap', event => { event.stopPropagation(); action(); }); root.addChild(button); return button;
}
export function describeStructure(id, state) {
  const def = settlementStructureDefs[id], factor = 1 + state.quality * .25, effects = [];
  if (def.housing) effects.push({ kind: 'housingCapacity', amount: Math.floor(def.housing * factor), label: 'Housing capacity',
    text: `Adds ${Math.floor(def.housing * factor)} Housing capacity to this settlement.` });
  for (const mod of (def.modifiers ?? []).filter(m => m.kind === 'capacity')) {
    const traits = mod.query?.traitsAny ?? [], tags = mod.query?.tagsAny ?? [];
    effects.push({ kind: 'stock', stockTraits: traits, amount: mod.amount * factor, label: 'Stock capacity', scope: traits.join(' / ') || tags.join(' / ') || 'all local Practices',
      text: traits.length ? `+${fmt(mod.amount * factor)} to ${traits.join(' / ')} Stock Capacity`
        : `+${fmt(mod.amount * factor)} to Stock Capacity on ${tags.length ? `${tags.join(' / ')} Practices` : 'all local Practices'}` });
  }
  for (const mod of (def.modifiers ?? []).filter(m => m.kind === 'support')) effects.push({ kind: 'population', amount: mod.amount * factor * 100,
    unit: '%', label: 'Martial Support', text: `Adds ${fmt(mod.amount * factor * 100)}% to the local Martial Support multiplier.` });
  const face = getGamepieceFace({ tSec: 0 }, 'structure', id, 'bronze', { slot: { qualityBonus: state.quality } });
  return { def, face, effects, tier: face.tier, active: !def.specialistGate || state.requirements === 'met' };
}
// Like the Practice Stock tray, the rim fits its contents instead of the art.
// Keep this proposed Structure treatment local to the workbench.
function effectSymbols(effect) {
  return effect.kind === 'stock' && effect.stockTraits.length
    ? effect.stockTraits.map(trait => `stock-${trait.toLowerCase()}`) : [effect.kind];
}
function stockBacking(parent, x, y, width, height) {
  // Only the crate's outer silhouette remains behind the capacity numeral.
  const crate = new PIXI.Graphics().lineStyle(1.25, 0xffffff, .95).beginFill(0x0b100d);
  crate.drawPolygon([2, 7, 19, 2, 30, 8, 30, 27, 13, 32, 2, 25]).endFill();
  const scale = Math.min((width - 2) / 32, (height - 2) / 32);
  crate.scale.set(scale);
  crate.position.set(x + (width - 32 * scale) / 2, y + (height - 32 * scale) / 2);
  crate.eventMode = 'none'; parent.addChild(crate);
}
function capacityTray(root, effects, w, h, corner = false) {
  const tray = new PIXI.Container(), contents = new PIXI.Container(), height = 34, inset = 4, iconSize = 26;
  let width = inset;
  for (const effect of effects) {
    const symbols = effectSymbols(effect), symbolsWidth = symbols.length * iconSize;
    const value = text(contents, `+${fmt(effect.amount)}${effect.unit ?? ''}`, width + symbolsWidth + 5, height / 2, 180, 23,
      { ...TEXT_STYLES.header, fontSize: 23, fill: RELIC.bone, stroke: 0x221b14, strokeThickness: 3, wordWrap: false, trim: true });
    value.anchor.y = .5;
    const cellWidth = symbolsWidth + 9 + Math.ceil(value.width);
    const recess = new PIXI.Graphics().lineStyle(.7, 0x686457).beginFill(0x111614, .95);
    recess.drawRoundedRect(width, inset, cellWidth, height - inset * 2, 3).endFill();
    contents.addChildAt(recess, 0);
    if (effect.kind === 'stock') {
      stockBacking(contents, value.x - 3, 1, value.width + 6, height - 2);
      // Keep the outlined Stock silhouette beneath the live capacity numeral.
      contents.setChildIndex(value, contents.children.length - 1);
    }
    symbols.forEach((symbol, i) => addResourceIcon(contents, symbol, width + (i + .5) * iconSize + 1, height / 2, iconSize - 3));
    width += cellWidth + inset;
  }
  const rim = new PIXI.Graphics();
  rim.beginFill(0x090b0c, .8).drawRoundedRect(0, 1, width, height, 5).endFill();
  rim.lineStyle(1, 0x8f7447).beginTextureFill({ texture: getStoneTexture(), color: 0x292c29 });
  rim.drawRoundedRect(.5, .5, width - 1, height - 1, 4).endFill();
  rim.lineStyle(1, 0xc2a774, .65).moveTo(5, 2).lineTo(width - 5, 2);
  rim.lineStyle(1, 0x080b0a, .9).moveTo(2, height - 3).lineTo(width - 3, height - 3).lineTo(width - 3, 5);
  tray.addChild(rim, contents);
  const scale = Math.min(1, (w - 8) / width); tray.scale.set(scale);
  tray.position.set(w - width * scale - 3, corner ? 4 : h - height * scale + 2);
  tray.eventMode = 'none'; root.addChild(tray);
}
function structureFace(root, id, rect, state, callbacks, interactive = true) {
  const data = describeStructure(id, state);
  const card = addSettlementPiece(root, rect, { face: data.face, reducedMotion: true,
    onHover: interactive ? () => callbacks.quick(id) : undefined,
    onOut: interactive ? callbacks.out : undefined,
    onInspect: interactive ? () => callbacks.quick(id, true) : undefined });
  const { width: w, height: h } = card.pieceGeometry;
  card.accessible = interactive; card.accessibleTitle = `${data.def.label}, quick read`; card.accessibleType = 'button';
  card.eventMode = interactive ? 'static' : 'none';
  if (!data.active) {
    const veil = new PIXI.Graphics().beginFill(RELIC.night, .55).drawRect(4, 4, w - 8, h - 8).endFill(); card.addChild(veil);
    text(card, 'Inactive', 7, 55, w - 14, 14, { fill: 0xe2ad8c, align: 'center' });
  }
  const effect = data.effects[0];
  if (state.variant === 'A') {
    capacityTray(card, data.effects, w, h);
  } else if (state.variant === 'B') {
    const circle = new PIXI.Graphics().lineStyle(2, RELIC.gold).beginFill(0x1c2823).drawCircle(36, h - 38, 34).endFill(); card.addChild(circle);
    const symbols = effectSymbols(effect), symbolSize = Math.min(27, 52 / symbols.length);
    symbols.forEach((symbol, i) => addResourceIcon(card, symbol, 36 + (i - (symbols.length - 1) / 2) * symbolSize, h - 49, symbolSize));
    if (effect.kind === 'stock') stockBacking(card, 6, h - 36, 60, 27);
    const value = text(card, `+${fmt(effect.amount)}${effect.unit ?? ''}`, 8, h - 33, 65, 22, { ...TEXT_STYLES.header, fontSize: 22, stroke: 0x221b14, strokeThickness: 3, wordWrap: false });
    value.anchor.x = .5; value.x = 36; if (value.width > 60) value.scale.set(60 / value.width);
  } else {
    capacityTray(card, data.effects, w, h, true);
  }
  return card;
}
function reading(id, width, state, onInspect) {
  const { def, effects, active } = describeStructure(id, state), root = new PIXI.Container(), pad = 24, size = width > 650 ? 34 : 31;
  let x = 0, y = 0, row = 0;
  for (const tag of [def.pool === 'common' ? 'Neutral' : caps(def.pool), 'Structure', ...(def.tags ?? [])]) {
    const label = text(root, tag.toUpperCase(), x + 10, y + 7, width - 20, size * .6, { fontWeight: 'bold' });
    const w = label.width + 20, h = label.height + 14;
    if (x + w > width && x > 0) { x = 0; y += row + 5; row = 0; label.position.set(x + 10, y + 7); }
    const bg = new PIXI.Graphics(); paintRelicPanel(bg, x, y, w, h, tag === 'Knowledge' ? 0x302c43 : 0x3b3020, RELIC.brass, 1);
    root.addChildAt(bg, 0); x += w + 7; row = Math.max(row, h);
  }
  y += row + 5; const titleY = y;
  const title = text(root, def.label, pad, y + 18, width - pad * 2 - 50, size * 1.45, { ...TEXT_STYLES.header, fontSize: size * 1.45 });
  const titleHeight = title.height + 36;
  const titleBg = new PIXI.Graphics(); paintRelicPanel(titleBg, 0, y, width, titleHeight, 0x302414, RELIC.brass, 2); root.addChildAt(titleBg, 0);
  if (onInspect) {
    const hit = new PIXI.Container(); hit.eventMode = 'static'; hit.cursor = 'pointer'; hit.hitArea = new PIXI.Rectangle(0, titleY, width, titleHeight);
    hit.accessible = true; hit.accessibleTitle = `Inspect ${def.label}`; hit.accessibleType = 'button';
    hit.on('pointertap', event => { event.stopPropagation(); onInspect(id); });
    text(hit, '↗', width - 46, titleY + 21, 40, size); root.addChild(hit);
  }
  y += titleHeight; const rulesY = y; y += 20;
  const lines = effects.map(e => e.text);
  if (def.pool !== 'common' && def.candidateBonus) lines.push(`+${def.candidateBonus} to future ${def.pool} candidates from this settlement, within the institutional bonus cap.`);
  for (const m of (def.modifiers ?? []).filter(m => m.kind === 'historyCandidate')) lines.push(`Additional candidate bonus from civilization age and stocked Record Practices, capped at +${m.cap}.`);
  for (const line of lines) {
    y += text(root, line, pad, y, width - pad * 2, size).height + 16;
  }
  y += 4;
  const rulesBg = new PIXI.Graphics(); paintRelicPanel(rulesBg, 0, rulesY, width, y - rulesY, 0x1b2017, RELIC.brass, 1); root.addChildAt(rulesBg, 0);
  if (def.specialistGate) {
    y += 18;
    y += text(root, `Requires ${def.specialistGate} local Scholar${def.specialistGate > 1 ? 's' : ''}.`, pad, y, width - pad * 2, size * .82, { fill: RELIC.gold }).height + 10;
    y += text(root, active ? 'Requirement met. Bonuses active.' : 'Inactive: not enough Scholars. Bonuses do not apply.', pad, y, width - pad * 2, size * .78, { fill: active ? RELIC.bone : 0xe2ad8c }).height + 16;
  }
  const flavourY = y + 6; y = flavourY + 16;
  y += text(root, FLAVOUR[id], pad, y, width - pad * 2, size * .8, { fontStyle: 'italic', fill: 0xbeb195 }).height + 18;
  const flavourBg = new PIXI.Graphics(); paintRelicPanel(flavourBg, 0, flavourY, width, y - flavourY, 0x28251c, RELIC.brass, 1); root.addChildAt(flavourBg, 0);
  const bg = new PIXI.Graphics(); paintRelicPanel(bg, 0, titleY, width, y - titleY, RELIC.night, RELIC.brass, 1); root.addChildAt(bg, 0);
  root.readingHeight = y; return root;
}
function glossary(id, width, state) {
  const { def, effects, tier } = describeStructure(id, state), root = new PIXI.Container(); let y = 24;
  y += text(root, 'THE SYMBOLS ON THIS CARD', 22, y, width - 44, 25, { fill: RELIC.gold, fontWeight: 'bold' }).height + 28;
  const entries = effects.map(e => ({ name: e.kind === 'stock' ? `${e.scope} Stock capacity` : e.label, icon: effectSymbols(e)[0], text: e.kind === 'housingCapacity'
    ? 'The roof marks room for population. The plus and numeral show added Housing capacity, not people arriving.'
    : e.kind === 'stock' ? `The tag identifies the Stock whose capacity increases: ${e.scope}. The outlined Stock box behind the plus and numeral marks added capacity on each matching Practice. This Structure does not hold or produce Stock.`
      : 'The population symbol identifies an ongoing increase to the local Martial Support multiplier.' }));
  entries.push({ name: 'Construction footprint', text: `${def.footprint} horizontal cell${def.footprint > 1 ? 's' : ''}. Structures use the regional strip, separate from the five Practice slots.` },
    { name: `${caps(tier)} quality`, text: state.quality ? `The jewel marks quality. This example has ${state.quality * 25}% uplift to numeric Housing, Stock capacity and Support bonuses. Housing rounds down per Structure; Stock capacity rounds down after summing host bonuses. Candidate base bonuses and history caps are unchanged.` : 'The jewel marks quality. These are the authored base bonuses.' },
    { name: 'Ongoing bonuses', text: 'Numeric bonuses from duplicate Structures add. Capacity applies while the Structure is active. There is no cycle wheel or Charge meter.' });
  for (const entry of entries) {
    if (entry.icon) addResourceIcon(root, entry.icon, 42, y + 22, 42);
    y += text(root, entry.name, entry.icon ? 76 : 22, y, width - (entry.icon ? 98 : 44), 31, { fill: RELIC.gold, fontWeight: 'bold' }).height + 10;
    y += text(root, entry.text, 22, y, width - 44, 28).height + 28;
  }
  const bg = new PIXI.Graphics(); paintRelicPanel(bg, 0, 0, width, y, 0x1e211c, RELIC.brass, 1); root.addChildAt(bg, 0);
  root.readingHeight = y; return root;
}
function viewport(root, content, rect, app) {
  const view = new PIXI.Container(); view.position.set(rect.x, rect.y); view.addChild(content); root.addChild(view);
  const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, 0, rect.width, rect.height).endFill(); view.addChild(mask); content.mask = mask;
  let scroll = 0, drag = null;
  const maximum = Math.max(0, content.readingHeight - rect.height);
  const move = value => { scroll = Math.max(0, Math.min(maximum, value)); content.y = -scroll; app.render(); };
  view.eventMode = 'static'; view.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  view.on('wheel', event => { event.stopPropagation(); event.nativeEvent?.preventDefault(); move(scroll + (event.deltaY ?? event.nativeEvent?.deltaY ?? 0)); });
  view.on('pointerdown', event => { event.stopPropagation(); drag = { y: view.toLocal(event.global).y, scroll }; });
  view.on('pointermove', event => { if (drag) move(drag.scroll + drag.y - view.toLocal(event.global).y); });
  for (const name of ['pointerup', 'pointerupoutside', 'pointercancel']) view.on(name, () => { drag = null; });
  if (maximum) text(root, 'Drag or scroll to read', rect.x, rect.y + rect.height + 7, rect.width, 20, { fill: RELIC.ash });
  return { get scroll() { return scroll; }, get maximum() { return maximum; } };
}

export async function createStructureScreen(host, callbacks) {
  await preloadChronicleArt({ includeSettlementPieces: true });
  const background = await PIXI.Assets.load(`${ROOT}settlement-reference.png`);
  const app = new PIXI.Application({ width: W, height: H, antialias: true, backgroundColor: RELIC.night, autoStart: false, preserveDrawingBuffer: true });
  app.renderer.plugins.accessibility.div.classList.add('prototype-accessibility');
  app.view.setAttribute('aria-label', 'Structure prototype in the game layout'); app.view.style.touchAction = 'none'; host.append(app.view);
  const backdrop = new PIXI.Sprite(background); backdrop.width = W; backdrop.height = H;
  backdrop.eventMode = 'static'; backdrop.on('pointertap', callbacks.close); app.stage.addChild(backdrop);
  const base = new PIXI.Container(), overlays = new PIXI.Container(); app.stage.addChild(base, overlays);
  // Render-only ticker keeps shared press feedback and Pixi accessibility live.
  // No runner, simulation clock or timeline is attached to this application.
  app.start();
  const display = attachDevPreviewDisplay(host, { onChange: () => app.render() });
  let scene = {}, views = {};
  function renderOverlay(state) {
    clear(overlays); views = {};
    if (state.inspectId) {
      const dim = new PIXI.Graphics().beginFill(0x050a08, .76).drawRect(0, 0, W, H).endFill();
      dim.eventMode = 'static'; dim.on('pointertap', callbacks.close); overlays.addChild(dim);
      const frame = new PIXI.Container(); frame.position.set(126, 72); overlays.addChild(frame);
      panel(frame, 0, 0, 1788, 714, RELIC.night); frame.eventMode = 'static'; frame.hitArea = new PIXI.Rectangle(0, 0, 1788, 714);
      frame.on('pointertap', event => event.stopPropagation());
      const data = describeStructure(state.inspectId, state);
      text(frame, `${data.tier.toUpperCase()} · STRUCTURE`, 24, 20, 700, 26, { ...TEXT_STYLES.header, fontSize: 26, fill: RELIC.gold });
      control(frame, '×', { x: 1728, y: 14, width: 44, height: 44 }, callbacks.close, 36);
      structureFace(frame, state.inspectId, { x: 28, y: 115, width: 325, height: 485 }, state, callbacks, false);
      text(frame, `${data.def.footprint} construction cell${data.def.footprint > 1 ? 's' : ''}`, 28, 620, 325, 22, { fill: RELIC.ash, align: 'center' });
      views.rules = viewport(frame, reading(state.inspectId, 798, state), { x: 424, y: 72, width: 798, height: 596 }, app);
      views.glossary = viewport(frame, glossary(state.inspectId, 512, state), { x: 1250, y: 72, width: 512, height: 596 }, app);
    } else if (state.quickId) {
      const quick = new PIXI.Container(); quick.position.set(236, 166); overlays.addChild(quick);
      const content = reading(state.quickId, 530, state, callbacks.inspect);
      panel(quick, -7, -7, 544, Math.min(500, content.readingHeight) + 14, RELIC.night);
      quick.eventMode = 'static'; quick.on('pointerover', callbacks.keep); quick.on('pointerout', callbacks.out);
      viewport(quick, content, { x: 0, y: 0, width: 530, height: Math.min(500, content.readingHeight) }, app);
    }
    host.dataset.reading = state.inspectId ? 'inspection' : state.quickId ? 'quick' : 'none'; app.render();
  }
  function render(state) {
    clear(base);
    // Hide only the old construction specimens/counter. The real map, Practice
    // tableau, graph, wheels and chrome remain the user's static game screenshot.
    panel(base, 944, 520, 910, 161, 0x17211c);
    panel(base, 1635, 112, 290, 31, 0x242b24);
    const constructionCount = text(base, '6 / 8 construction cells', 1645, 113, 275, 22, { ...TEXT_STYLES.header, fontSize: 22 });
    const ids = [...new Set([state.card, 'granary', 'mudHouses', 'longhouse', 'archive'])];
    let used = 0, count = 0;
    for (const id of ids) {
      const fp = settlementStructureDefs[id].footprint; if (used + fp > 8) continue;
      structureFace(base, id, { x: 947 + used * 113, y: 524, width: fp * 113 - 4, height: 153 }, state, callbacks);
      used += fp; count++;
    }
    for (let index = used; index < 8; index++) panel(base, 947 + index * 113, 524, 109, 153, 0x171f1a, 0x555641);
    constructionCount.text = `${used} / 8 construction cells`;
    // These controls stay inside the canvas when the HTML workbench is hidden
    // by fullscreen. They replace only the screenshot's small Chaos control.
    panel(base, 17, 80, 743, 56, RELIC.night);
    control(base, '‹', { x: 26, y: 87, width: 46, height: 40 }, () => callbacks.cycle(-1), 30);
    text(base, `${state.variant} · ${VARIANTS[state.variant]}`, 89, 94, 365, 22, { fill: RELIC.gold });
    control(base, '›', { x: 435, y: 87, width: 46, height: 40 }, () => callbacks.cycle(1), 30);
    control(base, 'Quick read', { x: 494, y: 87, width: 126, height: 40 }, () => callbacks.quick(state.card, true), 22);
    control(base, 'Inspect', { x: 631, y: 87, width: 110, height: 40 }, () => callbacks.inspect(state.card), 22);
    if (state.context === 'shop') {
      const shade = new PIXI.Graphics().beginFill(RELIC.night, .82).drawRect(800, 74, 1194, 610).endFill(); base.addChild(shade);
      text(base, 'BUILD A STRUCTURE', 830, 90, 1000, 32, { ...TEXT_STYLES.header, fontSize: 32, fill: RELIC.gold });
      const offers = [...new Set([state.card, 'longhouse', 'archive', 'granary'])].slice(0, 3);
      offers.forEach((id, i) => {
        const def = settlementStructureDefs[id], x = 824 + i * 383;
        panel(base, x, 155, 361, 500, 0x202822);
        text(base, def.label, x + 16, 171, 329, 32, { ...TEXT_STYLES.header, fontSize: 32 });
        if (state.staged === id) text(base, 'STAGED', x + 16, 207, 329, 20, { fill: 0xa4c3c3, fontWeight: 'bold' });
        structureFace(base, id, { x: x + 50, y: 235, width: 261, height: 265 }, state, callbacks);
        addCostPanel(base, { x: x + 16, y: 525, width: 329, height: 112 }, { phaseCost: def.vassalPhaseCost, prestigeCost: def.vassalPrestigeCost,
          staged: state.staged === id, disabled: !!state.staged, label: state.staged === id ? 'Staged' : 'Stage build', onActivate: () => callbacks.stage(id), fontSize: 32, iconSize: 42 });
      });
    }
    scene = { width: W, height: H, practiceSlots: 5, context: state.context, structureCount: count, usedCells: used,
      get rulesScroll() { return views.rules?.scroll ?? 0; }, get glossaryScroll() { return views.glossary?.scroll ?? 0; },
      get glossaryMaxScroll() { return views.glossary?.maximum ?? 0; } };
    host.dataset.context = state.context; host.dataset.cardCount = state.context === 'shop' ? '3' : String(count);
    app.view.setAttribute('aria-label', `${state.context === 'shop' ? 'Structure offers' : 'Regional settlement'} · ${VARIANTS[state.variant]} · select a Structure to read`);
    renderOverlay(state);
  }
  return { render, renderOverlay, display, get scene() { return scene; }, exportPng: () => { app.render(); return app.view.toDataURL('image/png'); },
    destroy() { display.destroy(); app.destroy(true, { children: true }); } };
}
