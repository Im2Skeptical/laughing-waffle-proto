import { addPracticeReading } from '../practice-reading-pixi.js';
import { addChronicleInspection } from '../chronicle-inspection.js';
import { el, button } from './elements.js';

// One interactive canvas serves every Zoo specimen, alongside the shared
// image renderer. Rules, symbols and recursive references come from the game.
export function createLabCardReading({onReview} = {}) {
  const quick = el('div', '', 'lab-card-quick-read');
  quick.hidden = true;
  quick.setAttribute('role', 'dialog');
  const dialog = el('dialog', '', 'lab-card-inspection');
  const toolbar = el('div', '', 'lab-controls');
  const heading = el('strong');
  toolbar.append(heading, button('Close inspection', close));
  if(onReview)toolbar.insertBefore(button('Dev',()=>{const selected=face;close();onReview(selected);}),toolbar.lastChild);
  dialog.append(toolbar);
  let app = null, face = null, anchor = null, mode = null, surface = null, timer = null, pinned = false;
  let closing = false;

  function init() {
    if (app) return;
    document.body.append(quick, dialog);
    app = new PIXI.Application({width:560, height:800, backgroundAlpha:0, antialias:true});
    app.view.dataset.testid = 'lab-card-reading';
    app.view.tabIndex = 0;
    const accessibility = app.renderer.plugins.accessibility;
    if (accessibility?.div) accessibility.div.style.pointerEvents = 'none';
  }
  function clear() {
    surface?.releaseKeywordFocus?.();
    for (const child of app.stage.removeChildren()) child.destroy({children:true});
    surface = null;
  }
  function position() {
    if (mode !== 'quick' || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect(), margin = 12;
    if (rect.bottom < 0 || rect.top > innerHeight) { close(); return; }
    const width = Math.min(420, innerWidth - margin * 2);
    quick.style.width = `${width}px`;
    const right = rect.right + margin;
    quick.style.left = `${Math.max(margin, Math.min(right + width <= innerWidth - margin ? right : rect.left - width - margin, innerWidth - width - margin))}px`;
    quick.style.top = `${Math.max(margin, Math.min(rect.top, innerHeight - Math.min(quick.scrollHeight, innerHeight - margin * 2) - margin))}px`;
  }
  function draw(retain = false) {
    const referenceState = retain ? surface?.getReferenceState?.() : null;
    const rulesScroll = retain ? surface?.getScroll?.() ?? 0 : 0;
    const glossaryScroll = retain ? surface?.getGlossaryScroll?.() ?? 0 : 0;
    clear();
    app.view.setAttribute('aria-label', `${face.label}, ${face.tier}, ${mode === 'quick' ? 'quick read' : 'full inspection'}`);
    app.view.textContent = [face.label, ...face.reading.effects.map(effect => `${effect.timing ?? ''} ${effect.text}`), face.reading.trigger, ...face.reading.requirements].filter(Boolean).join('\n');
    if (mode === 'quick') {
      surface = addPracticeReading(app.stage, 560, face, {onInspect:() => inspect(face, anchor)});
      app.renderer.resize(560, Math.ceil(surface.readingHeight));
      quick.append(app.view);
      quick.setAttribute('aria-label', `${face.label} quick read`);
      quick.hidden = false;
      position();
    } else {
      app.renderer.resize(2200, 880);
      surface = addChronicleInspection(app.stage, {x:0, y:0, width:2200, height:880}, {face, onClose:close, referenceState, onReview:onReview?()=>{const selected=face;close();onReview(selected);}:null});
      surface.setScroll(rulesScroll); surface.setGlossaryScroll(glossaryScroll);
      dialog.append(app.view);
      heading.textContent = `${face.label} · ${face.tier}`;
      dialog.setAttribute('aria-label', `${face.label} inspection`);
    }
    // Pixi's keyboard overlay follows the canvas between quick read and modal.
    const accessibility = app.renderer.plugins.accessibility?.div;
    if (accessibility?.isConnected) app.view.parentElement.append(accessibility);
    app.render();
  }
  function show(nextFace, source, pin = false) {
    if (dialog.open || closing) return;
    clearTimeout(timer);
    init(); face = nextFace; anchor = source; mode = 'quick'; pinned = pin;
    app.start();
    draw();
  }
  function inspect(nextFace, source) {
    clearTimeout(timer);
    init(); face = nextFace; anchor = source; mode = 'inspect';
    app.start();
    quick.hidden = true;
    draw();
    if (!dialog.open) dialog.showModal();
    app.view.focus({preventScroll:true});
  }
  function close() {
    closing = true;
    clearTimeout(timer);
    const source = anchor, wasInspecting = dialog.open;
    quick.hidden = true;
    if (wasInspecting) dialog.close();
    if (app) { clear(); app.stop(); }
    face = anchor = mode = null; pinned = false;
    if (wasInspecting && source?.isConnected) source.focus({preventScroll:true});
    closing = false;
  }
  function leave() { timer = setTimeout(() => { if (mode === 'quick' && !pinned) close(); }, 180); }
  quick.addEventListener('pointerenter', () => clearTimeout(timer));
  quick.addEventListener('pointerleave', leave);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!surface?.dismissReference?.()) close();
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  function keydown(event) {
    if (!mode) return;
    if (mode === 'inspect' && surface?.handleReferenceKey?.(event)) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }
  document.addEventListener('keydown', keydown);
  window.addEventListener('resize', position);
  const outside = event => { if (mode === 'quick' && !quick.contains(event.target) && !anchor?.contains(event.target)) close(); };
  document.addEventListener('pointerdown', outside);
  const scroll = event => { if (mode === 'quick' && !quick.contains(event.target)) position(); };
  document.addEventListener('scroll', scroll, true);

  return {
    attach(source, nextFace) {
      source.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') show(nextFace, source); });
      source.addEventListener('pointerleave', leave);
      source.addEventListener('focus', () => show(nextFace, source, true));
      source.addEventListener('blur', () => { pinned = false; leave(); });
      source.addEventListener('click', () => show(nextFace, source, true));
    },
    inspect, close,
    refresh() { if (mode && face) draw(true); },
    getSnapshot:() => mode ? {
      mode, title:face.label, kind:face.kind, tier:face.tier, reading:face.reading,
      width:app.screen.width, height:app.screen.height,
      titlePoint:surface.titleControl?.toGlobal(new PIXI.Point(280, surface.titleControl.hitArea.height / 2)),
      devPoint:surface.devControl?.toGlobal(new PIXI.Point(60,27)),
      glossary:surface.glossary?.entries?.map(entry => entry.name) ?? [],
      keywords:surface.getKeywordDebugState?.() ?? null,
    } : null,
    destroy() {
      close(); quick.remove(); dialog.remove(); app?.destroy(true, {children:true});
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('scroll', scroll, true);
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', position);
    },
  };
}
