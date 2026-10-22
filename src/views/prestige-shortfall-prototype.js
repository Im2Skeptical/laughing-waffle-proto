// THROWAWAY: three shortfall hierarchies inside the existing Pixi app route.
// ?prototype=prestige-shortfall&variant=A|B|C. Fixtures only; no runner or storage.
import { preloadChronicleArt, addIllustration } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { addResourceAmount, addCostPanel } from './resource-cost-pixi.js';
import { createText, clearChildren } from './settlement-view-primitives.js';

const NAMES = { A: 'Signal at the bank', B: 'Explain at the choice', C: 'Open the receipt' };
const SCREENS = {
  shop: { title: 'Market · reserve a purchase', item: 'Granary', art: 'granary', action: 'Reserve', context: 'Hearth · 5 Practice slots', note: 'Reserve first; confirm the whole purchase together.' },
  life: { title: 'Life Map · choose an opportunity', item: 'Develop', art: 'study', action: 'Choose', context: 'Aren · Scholar · age 24', note: 'Inspect the opportunity before confirming your choice.' },
  routes: { title: 'Crossroads · establish a route', item: 'Create route', art: 'exchange', action: 'Choose route', context: 'Hearth → Riverwatch', note: 'The selected connection stays visible while you compare.' },
  settlement: { title: 'Crossroads · found a settlement', item: 'Found settlement', art: 'raiseHouses', action: 'Choose site', context: 'Frontier · selected site', note: 'Keep the selected site visible before committing.' },
  campaign: { title: 'Campaign · choose an attack', item: 'Attack', art: 'vigil', action: 'Attack', context: 'Warrior · selected target', note: 'Prestige is one requirement. Food and defeat risk still apply.' },
};

export async function mountPrestigeShortfallPrototype() {
  document.body.classList.remove('game-menu-open');
  document.body.style.background = '#101314';
  document.title = 'Prestige shortfall · throwaway prototype';
  const params = new URLSearchParams(location.search);
  const state = { variant: NAMES[params.get('variant')] ? params.get('variant') : 'A', screen: SCREENS[params.get('screen')] ? params.get('screen') : 'shop', bank: 18, reserved: 6, price: 20, attempted: false, hold: false, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, receipt: false, selected: true, result: '' };
  const app = new PIXI.Application({ width: 2424, height: 1080, backgroundColor: RELIC.night, antialias: true, resolution: 1 });
  const host = document.getElementById('app');
  host.replaceChildren(app.view);
  app.view.style.cssText = 'position:fixed;inset:0;margin:auto;width:min(100vw,224.4444vh);height:auto;max-height:100vh;';
  await preloadChronicleArt({ includeSettlementPieces: true });
  const scene = new PIXI.Container(); app.stage.addChild(scene);
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'position:fixed;bottom:3px;left:50%;transform:translateX(-50%);display:flex;gap:5px;align-items:center;background:#101718ed;border:1px solid #b69c63;border-radius:20px;padding:4px 10px;color:#e6dcc4;font:12px Arial;z-index:100;white-space:nowrap';
  toolbar.innerHTML = '<b>PROTOTYPE</b><button data-act="prev" aria-label="Previous variant">←</button><span id="ps-name"></span><button data-act="next" aria-label="Next variant">→</button><select aria-label="Screen">' + Object.entries(SCREENS).map(([key, spec]) => `<option value="${key}">${spec.title.split(' · ')[0]}${key === 'settlement' ? ' site' : key === 'routes' ? ' route' : ''}</option>`).join('') + '</select><button data-act="attempt">Try action</button><button data-act="exact">Exact funds</button><button data-act="reset">Reset</button><label><input type="checkbox" data-act="hold">Hold feedback</label><label><input type="checkbox" data-act="reduced">Still</label>';
  document.body.append(toolbar);
  toolbar.querySelector('select').value = state.screen;
  toolbar.querySelector('[data-act="reduced"]').checked = state.reduced;
  const available = () => state.bank - (state.screen === 'shop' ? state.reserved : 0);
  const short = () => Math.max(0, state.price - available());
  let expiry, pulseStart = 0, bankOutline;

  function text(label, x, y, size = 32, fill = 0xe6dcc4, width = 0) {
    const node = createText(label, { fontFamily: 'Arial', fontSize: size, fill, ...(width ? { wordWrap: true, wordWrapWidth: width, lineHeight: size * 1.25 } : {}) }, x, y);
    scene.addChild(node); return node;
  }
  function panel(x, y, w, h, fill = RELIC.stone, stroke = RELIC.brass) {
    const g = new PIXI.Graphics(); paintRelicPanel(g, x, y, w, h, fill, stroke, 2); scene.addChild(g); return g;
  }
  function button(label, x, y, w, action, blocked = false) {
    const box = panel(x, y, w, 112, blocked ? 0x332b29 : 0x34453b, blocked ? 0xa76b59 : RELIC.brass);
    const t = text(label, x + 22, y + 35, 34, blocked ? 0xf0ad97 : 0xe6dcc4);
    t.eventMode = 'none'; box.eventMode = 'static'; box.cursor = 'pointer';
    box.on('pointertap', action); return box;
  }
  function sync() {
    const url = new URL(location.href); url.searchParams.set('variant', state.variant); url.searchParams.set('screen', state.screen); history.replaceState(null, '', url);
    toolbar.querySelector('#ps-name').textContent = `${state.variant} · ${NAMES[state.variant]}`;
    console.info('[prestige prototype]', JSON.stringify({ ...state, available: available(), shortfall: short() }));
  }
  function attempt() {
    clearTimeout(expiry);
    state.attempted = short() > 0;
    state.receipt = state.variant === 'C' && state.attempted;
    state.result = short() ? '' : 'Affordable · fixture accepted. No game transaction.';
    pulseStart = performance.now();
    draw();
    if (state.attempted && !state.hold) expiry = setTimeout(() => {
      state.attempted = false; draw();
    }, 1800);
  }
  function draw() {
    clearChildren(scene); sync();
    const spec = SCREENS[state.screen], gap = short(), warning = state.attempted;
    panel(12, 12, 2400, 1056, RELIC.night);
    panel(28, 24, 2368, 130);
    text('AREN', 65, 43, 34, 0xc5a366); text(spec.context, 65, 91, 30);
    text('Year 4 · Waxing moon · Paused', 1020, 71, 30, 0xa9b0a2);
    panel(1700, 36, 665, 100, warning ? 0x4c2b29 : 0x17211f, warning ? 0xf0ad97 : RELIC.brass);
    addResourceAmount(scene, 'prestige', state.bank, { x: 1720, y: 45, iconSize: 76, fontSize: 57 });
    text('Prestige', 1880, 53, 31);
    text(state.screen === 'shop' ? `${state.reserved} reserved · ${available()} available` : `${available()} available`, 1880, 95, 26, 0xc5b99c);
    bankOutline = new PIXI.Graphics(); bankOutline.lineStyle(5, 0xf0ad97).drawRect(1700, 36, 665, 100); bankOutline.visible = warning; scene.addChild(bankOutline);
    text(spec.title, 66, 182, 43, 0xe0d4b4);
    text('Illustrative prices and state · no balance proposal', 67, 241, 25, 0xa9b0a2);

    // Context remains exposed: selected offer, another offer and staged choice.
    panel(58, 300, 530, 472);
    addIllustration(scene, spec.art, { x: 74, y: 316, width: 498, height: 230 });
    text(spec.item, 86, 555, 39);
    text('Selected · cost below', 86, 605, 25, 0xc5a366);
    addCostPanel(scene, { x: 82, y: 638, width: 482, height: 126 }, { prestigeCost: state.price, unaffordable: gap > 0, fontSize: 60, iconSize: 64, interactive: true, disabled: gap > 0, onUnavailable: attempt, onActivate: attempt });
    panel(615, 300, 428, 472);
    addIllustration(scene, 'forage', { x: 631, y: 316, width: 396, height: 260 }, { alpha: .7 });
    text('Other opportunity', 642, 596, 32); text('Continue comparing', 642, 649, 27, 0xa9b0a2);
    text('No selection changed', 642, 712, 26, 0xa9b0a2);
    panel(1070, 300, 1280, 472, 0x1b2321);
    text(state.screen === 'shop' ? 'Purchase draft' : 'Selected action', 1110, 330, 34, 0xc5a366);
    if (state.screen === 'shop') {
      text('Forage · already reserved', 1110, 396, 34);
      addResourceAmount(scene, 'prestige', state.reserved, { x: 1880, y: 385, iconSize: 48, fontSize: 36 });
      button('Undo reservation', 1110, 482, 400, () => { state.reserved = 0; state.attempted = false; state.receipt = false; draw(); });
    } else {
      text(spec.note, 1110, 397, 34, 0xe6dcc4, 1110);
      text('Other costs and requirements are unchanged.', 1110, 540, 28, 0xa9b0a2);
    }
    text('Inspecting and comparing remain available.', 1110, 705, 28, 0xa9b0a2);

    if (state.variant === 'A' && warning) {
      panel(1710, 164, 640, 110, 0x452b28, 0xdb967f);
      text('Not enough Prestige', 1740, 185, 39, 0xf0ad97);
      text('The action was not applied.', 1740, 234, 26);
    }
    if (state.variant === 'B' && gap) {
      // Persistent explanation belongs to the choice, before any failed press.
      panel(1080, 613, 1258, 144, 0x382b28, 0xdb967f);
      text(`${available()} available  /  ${state.price} needed`, 1110, 635, 40, 0xf0ad97);
      text(`Short ${gap} Prestige${state.screen === 'shop' && state.reserved ? ` · ${state.reserved} held by your draft` : ''}`, 1110, 694, 31);
    }
    if (state.variant === 'C' && state.receipt) {
      panel(1550, 155, 800, 478, 0x232c29, 0xdb967f);
      text('Prestige for this action', 1585, 181, 39, 0xc5a366);
      const rows = [['Bank', state.bank], ['Reserved in this draft', state.screen === 'shop' ? state.reserved : 0], ['Available', available()], [spec.item, state.price], ['Shortfall', gap]];
      rows.forEach(([label, amount], i) => { text(label, 1585, 247 + i * 61, 31, i === 4 ? 0xf0ad97 : 0xe6dcc4); text(String(amount), 2250, 247 + i * 61, 36, i === 4 ? 0xf0ad97 : 0xe6dcc4); });
      button('Close receipt', 1875, 660, 440, () => { state.receipt = false; draw(); });
    }
    // The graph is a static context fixture, not a forecast or new projection.
    panel(58, 796, 1420, 237, 0x19201e);
    text('Chronicle · paused context', 85, 812, 26, 0xa9b0a2);
    const graph = new PIXI.Graphics(); graph.lineStyle(2, 0x617264, .4);
    for (let y = 875; y < 1000; y += 40) graph.moveTo(85, y).lineTo(1440, y);
    graph.lineStyle(4, 0xa5b886).moveTo(95, 978).lineTo(320, 959).lineTo(470, 959).lineTo(730, 911).lineTo(955, 911).lineTo(1200, 878).lineTo(1440, 878);
    scene.addChild(graph);
    button(`${spec.action} · ${state.price} Prestige`, 1530, 830, 790, attempt, gap > 0);
    text(state.result || (warning ? 'No Prestige reserved or spent.' : 'Review costs before confirming.'), 1530, 972, 28, warning ? 0xf0ad97 : 0xa9b0a2);
    app.renderer.render(app.stage);
  }
  function cycle(delta) {
    const keys = Object.keys(NAMES); state.variant = keys[(keys.indexOf(state.variant) + delta + 3) % 3];
    state.attempted = false; state.receipt = false; state.result = ''; clearTimeout(expiry); draw();
  }
  toolbar.addEventListener('click', event => {
    const act = event.target.dataset.act;
    if (act === 'prev') cycle(-1);
    if (act === 'next') cycle(1);
    if (act === 'attempt') attempt();
    if (act === 'exact') { state.bank = state.price + (state.screen === 'shop' ? state.reserved : 0); state.attempted = false; state.receipt = false; state.result = ''; draw(); }
    if (act === 'reset') { state.bank = state.screen === 'shop' ? 18 : 12; state.reserved = 6; state.attempted = false; state.receipt = false; state.result = ''; clearTimeout(expiry); draw(); }
  });
  toolbar.addEventListener('change', event => {
    if (event.target.tagName === 'SELECT') { state.screen = event.target.value; state.bank = state.screen === 'shop' ? 18 : 12; state.reserved = 6; state.attempted = false; state.receipt = false; state.result = ''; clearTimeout(expiry); }
    if (event.target.dataset.act === 'hold') { state.hold = event.target.checked; clearTimeout(expiry); if (!state.hold && state.attempted) attempt(); }
    if (event.target.dataset.act === 'reduced') state.reduced = event.target.checked;
    draw();
  });
  window.addEventListener('keydown', event => {
    if (event.target.closest('input,select,textarea,[contenteditable]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
    if (event.key === 'Escape') { state.receipt = false; draw(); }
  });
  app.ticker.add(() => {
    if (bankOutline?.visible) bankOutline.alpha = state.reduced || state.hold ? 1 : .65 + .35 * Math.cos((performance.now() - pulseStart) / 160);
  });
  // Deliberately exposed fixture diagnostics; never points at a live GameState.
  window.prestigePrototype = { snapshot: () => ({ ...state, available: available(), shortfall: short() }), attempt };
  draw();
}
