import { createVassalLifeMapView } from '../../../src/views/vassal-life-map-pixi.js';
import { createVassalNodeDecisionModalView } from '../../../src/views/vassal-node-decision-modal-pixi.js';
import { createVassalLevelUpModalView } from '../../../src/views/vassal-level-up-modal-pixi.js';
import { createVassalHeirloomFlowView } from '../../../src/views/vassal-heirloom-flow-pixi.js';
import { createVassalLifeHudView } from '../../../src/views/vassal-life-hud-pixi.js';
import { createWorldMapView } from '../../../src/views/world-map-pixi.js';
import { createSettlementPrototypeView } from '../../../src/views/settlement-prototype-view.js';
import { createSettlementNavigationView, getNavigationVassalPortrait } from '../../../src/views/settlement-navigation-pixi.js';
import { createTooltipView } from '../../../src/views/tooltip-pixi.js';
import { prepareChronicleArt } from '../../../src/views/chronicle-art.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';
import { button } from '../../../src/views/vassal-node-decision/cards.js';
import { clearChildren, createText, roundedRect } from '../../../src/views/settlement-view-primitives.js';
import { PALETTE, TEXT_STYLES } from '../../../src/views/settlement-theme.js';
import { getVassalLifeMapNodeFamily } from '../../../src/defs/gamepieces/vassal-life-map-defs.js';
import { getEntryConsequences } from '../../../src/views/life-map-entry-confirm-pixi.js';
import { getOpeningGraphPresentation, openingVassal } from './model.js';
import { createOpeningNoteScreen } from './note-screen.js';

// A mock game shell around the exact views used by the game. All input goes
// through the disposable controller; this module owns no simulation rules.
export async function createOpeningGameScreen({ host, controller, onEdit, onError }) {
  const app = new PIXI.Application({ width: 2424, height: 1080, backgroundColor: PALETTE.background, antialias: true, resolution: 1 });
  app.stage.eventMode = 'static'; app.stage.hitArea = app.screen;
  app.view.tabIndex = 0; app.view.dataset.testid = 'opening-game-screen';
  app.view.setAttribute('aria-label', 'Playable opening: Life Map, world map, settlement and node decisions');
  host.replaceChildren(app.view);
  const screenLabel = document.createElement('span'); screenLabel.className = 'game-screen-label'; screenLabel.textContent = 'Opening playthrough'; host.prepend(screenLabel);
  const display = attachDevPreviewDisplay(host);
  const rotated = () => display.active && matchMedia('(orientation:portrait) and (pointer:coarse)').matches;
  const mapPosition = app.renderer.events.mapPositionToPoint.bind(app.renderer.events);
  app.renderer.events.mapPositionToPoint = (point, x, y) => {
    if (!rotated()) return mapPosition(point, x, y);
    const rect = app.view.getBoundingClientRect();
    point.x = (y - rect.top) / rect.height * app.screen.width;
    point.y = (rect.right - x) / rect.width * app.screen.height;
  };
  const accessibility = app.renderer.plugins.accessibility;
  if (accessibility?.div) accessibility.div.style.pointerEvents = 'none';
  host.addEventListener('pointerdown', event => { if (event.target === app.view) app.view.focus({ preventScroll: true }); }, { capture: true });
  let snapshot = controller.getSnapshot(), mode = 'life', selectedRegion = openingVassal(snapshot.session).locationRegionId;
  let previousRuntimeId = null, lastActiveId = null, outcomeId = null, message = '', footerKey = '', controlKey = '', outcomeKey = '';
  const decisionCache = new Map();
  const layers = Object.fromEntries(['world', 'settlement', 'life', 'hud', 'navigation', 'footer', 'controls', 'modal', 'level', 'bag', 'note', 'outcome', 'tooltip'].map(name => [name, new PIXI.Container()]));
  app.stage.addChild(...Object.values(layers));
  const state = () => snapshot.session.state;
  const presentation = () => ({ state: state(), vassal: openingVassal(snapshot.session), readOnly: snapshot.busy,
    viewedSec: state().tSec, frontierSec: state().tSec, profileSec: state().tSec });
  const tooltip = createTooltipView({ app, layer: layers.tooltip });
  const family = node => {
    if (!node) return null;
    const def = getVassalLifeMapNodeFamily(node);
    const spec = snapshot.experiment.nodes.find(n => n.id === (node.experimentId ?? node.id));
    if (!spec) return def;
    const danger = Math.max(spec.kind === 'specialRelic' && !spec.relics?.length ? .35 : 0,
      ...[...(spec.options ?? []), ...(spec.relics ?? [])].map(o => o.immediateDeathChance ?? (spec.kind === 'specialRelic' ? .35 : 0)), 0);
    const chaos = Math.max(0, ...[...(spec.options ?? []), ...(spec.relics ?? [])].map(o => o.chaos ?? 0));
    const label = spec.displayLabel?.trim() || ({ world: 'World Decision', martial: 'Martial', specialRelic: 'Special Relic', customNote: 'Custom Note' })[spec.kind] || def.label;
    return { ...def, label, description: `${spec.title}\n${spec.kind === 'customNote' ? 'Read this design note, then Confirm to continue. No time or rewards are applied.' : spec.description}`
      + (danger ? ` Direct death risk up to ${Math.round(danger * 100)}%.` : '')
      + (chaos ? ` Optional Chaos cost up to ${chaos}.` : ''), ...(spec.kind === 'specialRelic' ? { color: PALETTE.red } : {}) };
  };
  function invoke(action) {
    try { action(); message = ''; return { ok: true }; }
    catch (error) { message = error.message; onError?.(message); drawChrome(); return { ok: false, reason: message }; }
  }
  function navigate(destination) {
    modal.close({ immediate: true }); tooltip.hide({ force: true }); outcomeId = null;
    mode = destination; refresh(snapshot);
  }
  const world = createWorldMapView({ layer: layers.world, getState: state,
    getSelectedRegionId: () => selectedRegion, getRegionSelectionActive: () => true, getGraphScope: () => 'settlement',
    setSelectedRegionId: id => { selectedRegion = id; world.refresh(); },
    onOpenDetailedSite: (_site, id) => { selectedRegion = id; navigate('settlement'); }, tooltipView: tooltip });
  const settlement = createSettlementPrototypeView({ layer: layers.settlement, getState: state,
    getSelectedRegionId: () => selectedRegion, tooltipView: tooltip });
  const life = createVassalLifeMapView({ app, layer: layers.life, confirmLayer: layers.modal, tooltipView: tooltip,
    getDisplayScale: () => app.view.clientWidth / app.screen.width,
    describeEntryConsequences: context => {
      const spec = snapshot.experiment.nodes.find(n => n.id === context.node.id);
      const rows = getEntryConsequences(context);
      return spec?.kind === 'relic' ? rows.filter(row => row.id !== 'risk') : rows;
    },
    getNodeFamily: family, getPresentation: () => ({ ...presentation(), vassal: getOpeningGraphPresentation(snapshot.session),
      committedNodeIds: snapshot.session.visitedIds, playheadNodeId: snapshot.session.activeId ?? snapshot.session.visitedIds.at(-1) }),
    isVisible: () => mode === 'life',
    onEnterNode: id => invoke(() => controller.enter(id)),
    onOpenDecision: (id, point) => {
      if (id === snapshot.session.activeId && snapshot.decision?.nodeState.contentMode === 'note') note.refresh(snapshot.decision.node);
      else if (id === snapshot.session.activeId) modal.open(snapshot.session.runtimeNodeId, point);
      else if (snapshot.session.visitedIds.includes(id)) { outcomeId = id; drawChrome(); }
    },
  });
  const modal = createVassalNodeDecisionModalView({ app, layer: layers.modal, tooltipView: tooltip,
    getState: state, getPresentation: presentation, getNodeFamily: family,
    showShopReroll: () => !snapshot.experiment.nodes.find(n => n.id === snapshot.session.activeId)?.cards,
    getDecisionPresentation: (id, preview = {}) => {
      if (!snapshot.session.activeId || id !== snapshot.session.runtimeNodeId) return null;
      const key = JSON.stringify(preview);
      if (!decisionCache.has(key)) decisionCache.set(key, controller.getDecision(preview));
      return decisionCache.get(key);
    },
    onSelectOption: (_id, optionId) => invoke(() => controller.select(optionId)),
    onPurchaseOffer: (_id, ...args) => invoke(() => controller.stage(...args)),
    onUndoPurchase: (_id, id) => invoke(() => controller.undo(id)),
    onReorderPurchase: (_id, ...args) => invoke(() => controller.reorder(...args)),
    onMoveStructure: (_id, ...args) => invoke(() => controller.move(...args)),
    onRerollShop: () => invoke(() => controller.reroll()),
    onConfirmNode: (_id, acquire = {}) => {
      const decision = snapshot.decision;
      const spec = snapshot.experiment.nodes.find(n => n.id === snapshot.session.activeId);
      const pass = decision?.nodeState.contentMode === 'shop' && !decision.purchases.length && !!spec.pass;
      void controller.commit(decision?.nodeState.selectedOptionId, acquire.destination ?? 'equip', pass).catch(error => {
        message = error.message; onError?.(message);
        if (snapshot.session.activeId) modal.open(snapshot.session.runtimeNodeId);
        drawChrome();
      });
      return { ok: true };
    },
    onWorldMap: () => navigate('map'), onOpenHeirlooms: tab => bag.openInventory(tab),
  });
  const level = createVassalLevelUpModalView({ app, layer: layers.level, getPresentation: presentation,
    isLifegraphVisible: () => mode === 'life', onChoose: (_choice, stat) => invoke(() => controller.develop(stat)) });
  const bag = createVassalHeirloomFlowView({ app, layer: layers.bag, getState: state, getPresentation: presentation, tooltipView: tooltip });
  const note = createOpeningNoteScreen({ app, layer: layers.note, onConfirm: () => controller.commit().catch(error => { message = error.message; onError?.(message); }) });
  const hud = createVassalLifeHudView({ layer: layers.hud, getPresentation: presentation,
    isVisible: () => mode === 'life' || modal.isOpen(), getDeltas: () => level.getHudDeltas() ?? modal.getHudDeltas(),
    tooltipView: tooltip, onOpenHeirlooms: tab => bag.openInventory(tab) });
  const navigation = createSettlementNavigationView({ app, layer: layers.navigation, tooltipView: tooltip,
    getState: () => ({ time: { mode: 'present' }, portrait: getNavigationVassalPortrait(state()),
      destinations: ['life', 'settlement', 'map'].filter(id => id !== mode).map(id => ({ id, label: { life: 'Life Map', settlement: 'Settlement', map: 'World Map' }[id], enabled: !snapshot.busy })) }),
    onNavigate: navigate, onLocateVassal: () => { selectedRegion = openingVassal(snapshot.session).locationRegionId; navigate('map'); },
    onOpenVassalSettlement: () => { selectedRegion = openingVassal(snapshot.session).locationRegionId; navigate('settlement'); },
  });

  function drawChrome() {
    const s = snapshot.summary, active = snapshot.experiment.nodes.find(n => n.id === snapshot.session.activeId);
    const footerSignature = JSON.stringify([s, snapshot.busy, snapshot.progress, active?.id, snapshot.decision?.purchases.length, modal.isOpen(), note.isOpen(), life.isEntryConfirmationOpen(), message, mode]);
    if (footerKey !== footerSignature) {
      footerKey = footerSignature; clearChildren(layers.footer);
      const bg = new PIXI.Graphics(); roundedRect(bg, 390, 852, 1480, 196, 14, PALETTE.panel, PALETTE.stroke, 2); layers.footer.addChild(bg);
      const title = active ? active.title : snapshot.session.availableIds.length ? 'Choose the next opportunity' : s.dead || s.complete ? 'This run ended · Rewind or Restart' : 'Authored opening complete';
      layers.footer.addChild(createText(title, { ...TEXT_STYLES.header, fontSize: 30, fill: PALETTE.accent }, 414, 868));
      layers.footer.addChild(createText(`Age ${s.age}    Prestige ${s.prestige}    Force ${s.force}    Retinue ${s.retinue}/${s.retinueCap}    Chaos ${s.chaos}`, { ...TEXT_STYLES.title, fontSize: 27 }, 414, 916));
      let detail = message || (snapshot.busy ? `Resolving real simulation ticks · ${snapshot.progress}%` : active?.description ?? `At ${s.location} · ${s.tSec}s elapsed · use the game navigation to inspect the world and settlement.`);
      if (active?.pass && !snapshot.decision?.purchases.length) detail += ` Confirm without a purchase: ${active.pass.label}, ${active.pass.phaseCost ?? 0} phases, +${active.pass.prestigeDelta ?? 0} Prestige.`;
      layers.footer.addChild(createText(detail, { ...TEXT_STYLES.body, fontSize: 23, wordWrap: true, wordWrapWidth: 1400, fill: message ? PALETTE.red : PALETTE.textMuted }, 414, 960));
      layers.footer.visible = !modal.isOpen() && !note.isOpen() && !life.isEntryConfirmationOpen();
    }
    const controlSignature = JSON.stringify([snapshot.busy, snapshot.canRewind, snapshot.session.activeId]);
    if (controlKey !== controlSignature) {
      controlKey = controlSignature; clearChildren(layers.controls);
      button(layers.controls, { x: 1950, y: 16, width: 145, height: 54 }, 'REWIND', !snapshot.busy && snapshot.canRewind, () => invoke(() => controller.rewind()), false, { fontSize: 20 });
      button(layers.controls, { x: 2102, y: 16, width: 145, height: 54 }, 'RESTART', !snapshot.busy, () => invoke(() => controller.restart()), false, { fontSize: 20 });
      button(layers.controls, { x: 2254, y: 16, width: 145, height: 54 }, 'EDIT', !snapshot.busy, () => { void display.exit().then(() => onEdit?.(snapshot.session.activeId ?? life.getCandidateNodeId())); }, false, { fontSize: 20 });
    }
    const nextOutcomeKey = JSON.stringify([outcomeId, snapshot.session.outcomes]);
    if (nextOutcomeKey === outcomeKey) return;
    outcomeKey = nextOutcomeKey; clearChildren(layers.outcome);
    if (outcomeId) {
      const result = snapshot.session.outcomes.find(o => o.id === outcomeId);
      if (!result) { outcomeId = null; return; }
      const bg = new PIXI.Graphics(); bg.beginFill(0x111718, .88).drawRect(0, 0, 2424, 1080); bg.eventMode = 'static'; layers.outcome.addChild(bg);
      const panel = new PIXI.Graphics(); roundedRect(panel, 480, 230, 1464, 600, 18, PALETTE.panel, PALETTE.accent, 3); layers.outcome.addChild(panel);
      layers.outcome.addChild(createText(result.title, { ...TEXT_STYLES.header, fontSize: 38 }, 530, 270));
      const lines = [['age', 'Age'], ['prestige', 'Prestige'], ['force', 'Force'], ['chaos', 'Chaos'], ['research', 'Research'], ['tSec', 'Elapsed time']];
      lines.forEach(([key, label], index) => layers.outcome.addChild(createText(`${label}: ${result.before[key]} → ${result.after[key]}`, { ...TEXT_STYLES.title, fontSize: 28 }, 530, 345 + index * 52)));
      button(layers.outcome, { x: 1540, y: 720, width: 320, height: 64 }, 'CLOSE OUTCOME', true, () => { outcomeId = null; drawChrome(); });
    }
  }
  function refresh(next = controller.getSnapshot()) {
    snapshot = next; decisionCache.clear();
    note.refresh(mode === 'life' && next.decision?.nodeState.contentMode === 'note' ? next.decision.node : null);
    if (snapshot.session.activeId !== lastActiveId) { selectedRegion = openingVassal(snapshot.session).locationRegionId; lastActiveId = snapshot.session.activeId; }
    world.setVisible(mode === 'map'); settlement.setVisible(mode === 'settlement'); life.setVisible(mode === 'life');
    for (const name of ['world', 'settlement', 'life', 'modal', 'navigation']) layers[name].interactiveChildren = !snapshot.busy;
    life.refresh(); world.refresh(); settlement.refresh(); hud.refresh(); level.refresh(); bag.refresh(); navigation.update();
    if (snapshot.session.runtimeNodeId !== previousRuntimeId) {
      previousRuntimeId = snapshot.session.runtimeNodeId;
      if (previousRuntimeId) { mode = 'life'; world.setVisible(false); settlement.setVisible(false); life.setVisible(true); modal.open(previousRuntimeId); }
      else modal.close({ immediate: true });
    } else if (previousRuntimeId && modal.isOpen()) modal.refresh();
    drawChrome();
  }
  app.view.addEventListener('keydown', event => {
    if (modal.handleInspectionKey(event) || life.handleKeyDown(event)) { event.preventDefault(); return; }
    if (event.key === 'Escape') { modal.close(); outcomeId = null; drawChrome(); }
  });
  app.ticker.add(() => {
    life.update(); if (mode === 'map') world.update(); if (mode === 'settlement') settlement.update();
    modal.update(); level.update(); bag.update(); hud.update(); navigation.update(app.ticker.deltaMS / 1000);
    drawChrome();
  });
  await prepareChronicleArt(app.renderer);
  refresh();
  const point = (kind, index = 0) => ({
    node: () => life.getNodeClickPoint(index), enter: () => life.getEnterNodeClickPoint(),
    option: () => modal.getOptionClickPoint(index), offer: () => modal.getOfferClickPoint(index), face: () => modal.getOfferFacePoint(index),
    confirm: () => note.isOpen() ? note.getConfirmPoint() : modal.getConfirmClickPoint(), undo: () => modal.getUndoClickPoint(index), tableau: () => modal.getTableauClickPoint(index),
    acquire: () => modal.getAcquireClickPoint(index),
    inspectClose: () => modal.getInspectionClosePoint(), level: () => level.getChoiceClickPoint(index), levelConfirm: () => level.getConfirmClickPoint(),
    nav: () => navigation.getClickPoint(index),
  })[kind]?.();
  return { refresh, getPoint: point, getClientPoint: (kind, index) => {
    const target = point(kind, index); if (!target) return null;
    const rect = app.view.getBoundingClientRect();
    return rotated() ? { x: rect.right - target.y / 1080 * rect.width, y: rect.top + target.x / 2424 * rect.height }
      : { x: rect.left + target.x / 2424 * rect.width, y: rect.top + target.y / 1080 * rect.height };
  }, getSnapshot: () => {
    const modalState = modal.getSemanticSnapshot();
    return { mode, ready: true, graph: { ...life.getPreparationSnapshot(), candidateId: life.getCandidateNodeId(), entryConfirmation: life.isEntryConfirmationOpen(), entryAnimation: life.getEntryConfirmationSnapshot().phase },
      note: note.getSnapshot(), modal: { open: note.isOpen() || modalState.open, animation: note.isOpen() ? 'open' : modalState.animation.phase, family: note.isOpen() ? 'customNote' : modalState.family, selectedOptionId: modalState.selectedOptionId,
        inspectedCardId: modalState.inspectedCardId, purchaseOrder: modalState.purchaseOrder, offers: modalState.offers, replacementOfferId: modalState.replacementOfferId,
        contextKind: modalState.contextKind, projectedPrestige: modalState.projectedPrestige, visibleOfferIds: modalState.visibleOfferIds }, level: level.getSemanticSnapshot() };
  }, destroy: () => { display.destroy(); app.destroy(true, { children: true }); } };
}
