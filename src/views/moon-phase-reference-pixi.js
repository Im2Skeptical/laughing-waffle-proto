import { MOON_PHASE_DEFS } from '../defs/gamesettings/moon-phase-defs.js';
import { getMoonPhaseAtSecond } from '../model/moon-phases.js';
import { getArtRevision } from './chronicle-art.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { clearChildren, createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

function sumRegionValues(turn, phaseId, read) {
  return Object.values(turn?.regions ?? {}).reduce(
    (sum, region) => sum + (Number(read(region?.[phaseId])) || 0),
    0
  );
}

export function buildPhaseTooltipSpec(state, phaseDef) {
  const current = state?.civilization?.currentMoonTurn ?? null;
  const fallback = state?.civilization?.lastMoonTurn ?? null;
  const hasCurrentResult = Object.values(current?.regions ?? {})
    .some((region) => region?.[phaseDef.id] != null);
  const turn = hasCurrentResult ? current : fallback;
  const rows = [];
  if (phaseDef.id === "birth") {
    rows.push(
      { label: "Births", value: sumRegionValues(turn, "birth", (v) =>
        Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.births ?? 0), 0)) },
      { label: "Became adults", value: sumRegionValues(turn, "birth", (v) =>
        Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.matured ?? 0), 0)) },
      { label: "Became elders", value: sumRegionValues(turn, "birth", (v) =>
        Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.newElders ?? 0), 0)) }
    );
  } else if (phaseDef.id === "food") {
    rows.push(
      { label: "Meal demand", value: sumRegionValues(turn, "food", (v) => v?.demand) },
      { label: "Food eaten", value: sumRegionValues(turn, "food", (v) => v?.consumed) },
      { label: "Food migrants", value: sumRegionValues(turn, "food", (v) =>
        Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.migrants ?? 0), 0)) }
    );
  } else if (phaseDef.id === "housing") {
    rows.push(
      { label: "Population assessed", value: sumRegionValues(turn, "housing", (v) => v?.population) },
      { label: "Housing capacity", value: sumRegionValues(turn, "housing", (v) => v?.capacity) },
      { label: "Housing migrants", value: sumRegionValues(turn, "housing", (v) => v?.migrants) }
    );
  } else if (phaseDef.id === "faith") {
    rows.push(
      { label: "Faith shifts", value: sumRegionValues(turn, "faith", (v) =>
        Object.values(v?.byClass ?? {}).filter((c) => c?.faithShifted).length) },
      { label: "Faith migrants", value: sumRegionValues(turn, "faith", (v) =>
        Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.displaced ?? 0), 0)) },
      { label: "Chaos this moon", value: state?.civilization?.chaos?.lastMoonIncome?.totalIncome ?? 0 }
    );
  } else if (phaseDef.id === "migration") {
    rows.push(
      { label: "Requested", value: (turn?.migrationIntentSummaries ?? [])
        .reduce((n, intent) => n + (intent?.requested ?? 0), 0) },
      { label: "Moved", value: (turn?.movements ?? [])
        .reduce((n, move) => n + (move?.amount ?? 0), 0) },
      { label: "Unplaced", value: (turn?.unresolved ?? [])
        .reduce((n, entry) => n + (entry?.count ?? 0), 0) }
    );
  } else if (phaseDef.id === "death") {
    rows.push(
      { label: "Arrival deaths", value: sumRegionValues(turn, "death", (v) => v?.arrivalDeaths) },
      { label: "Hardship deaths", value: sumRegionValues(turn, "death", (v) => v?.hardshipDeaths) },
      { label: "Natural deaths", value: sumRegionValues(turn, "death", (v) =>
        Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.naturalDeaths ?? 0), 0)) },
      { label: "Food rotted", value: Math.round(100 * (
        sumRegionValues(turn, "death", (v) => v?.storedFoodRot)
        + sumRegionValues(turn, "death", (v) => v?.looseFoodRot)
      )) / 100 }
    );
  }
  return {
    title: `${phaseDef.label} phase`,
    subtitle: hasCurrentResult ? "Current moon" : turn ? "Previous moon" : "Not yet resolved",
    sections: [
      { type: "paragraph", text: phaseDef.summary },
      { type: "table", title: "Civilization", rows },
    ],
    maxWidth: 310,
  };
}


export function createMoonPhaseReferenceView({ app, layer, getState }) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 250;
  layer.addChild(root);
  let selectedId = 'birth';
  let signature = '';
  let tabs = [];
  let closeButton = null;
  let report = null;
  const rect = { x: (app.screen.width - 1780) / 2, y: (app.screen.height - 700) / 2, width: 1780, height: 700 };
  const close = () => { root.visible = false; signature = ''; };
  function render() {
    if (!root.visible) return;
    const state = getState();
    const phase = MOON_PHASE_DEFS.find(p => p.id === selectedId) ?? MOON_PHASE_DEFS[0];
    report = buildPhaseTooltipSpec(state, phase);
    const next = getArtRevision() + JSON.stringify(report);
    if (next === signature) return;
    signature = next;
    clearChildren(root);
    const blocker = new PIXI.Graphics().beginFill(0x020809, .76)
      .drawRect(0, 0, app.screen.width, app.screen.height).endFill();
    blocker.eventMode = 'static';
    blocker.on('pointertap', event => { event.stopPropagation(); close(); });
    root.addChild(blocker);
    const panel = new PIXI.Container();
    panel.position.set(rect.x, rect.y);
    panel.eventMode = 'static';
    panel.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
    panel.on('pointertap', event => event.stopPropagation());
    const frame = new PIXI.Graphics();
    paintRelicPanel(frame, 0, 0, rect.width, rect.height, RELIC.night, RELIC.brass, 3);
    panel.addChild(frame,
      createText('SIX PHASES OF A MOON', { ...TEXT_STYLES.header, fontSize: 46 }, 40, 28),
      createText(report.subtitle + ' · Civilization totals', { ...TEXT_STYLES.body, fontSize: 28, fill: RELIC.ash }, 40, 89));
    function control(x, y, width, height, title, onClick, selected = false) {
      const target = new PIXI.Container();
      target.position.set(x, y);
      target.hitArea = new PIXI.Rectangle(0, 0, width, height);
      const g = new PIXI.Graphics();
      paintRelicPanel(g, 0, 0, width, height, selected ? 0x35483c : 0x182b28, selected ? RELIC.bone : RELIC.brass, selected ? 3 : 1);
      target.addChild(g);
      target.eventMode = 'static'; target.cursor = 'pointer';
      target.accessible = true; target.accessibleType = 'button'; target.accessibleTitle = title;
      target.on('pointertap', event => { event.stopPropagation(); onClick(); });
      panel.addChild(target);
      return target;
    }
    closeButton = control(rect.width - 166, 20, 128, 128, 'Close phase reference', close);
    closeButton.addChild(createText('×', { ...TEXT_STYLES.header, fontSize: 64 }, 64, 64, .5, .5));
    const tabWidth = (rect.width - 80 - 5 * 12) / 6;
    tabs = MOON_PHASE_DEFS.map((entry, index) => {
      const tab = control(40 + index * (tabWidth + 12), 154, tabWidth, 132, entry.label + ' phase',
        () => { selectedId = entry.id; signature = ''; render(); }, entry.id === selectedId);
      addResourceIcon(tab, entry.id, tabWidth / 2, 43, 68);
      tab.addChild(createText(entry.label, { ...TEXT_STYLES.body, fontSize: 33 }, tabWidth / 2, 103, .5, .5));
      return tab;
    });
    addResourceIcon(panel, 'lunar-bezel', 119, 390, 148);
    addResourceIcon(panel, phase.id, 119, 390, 94);
    panel.addChild(
      createText(phase.label, { ...TEXT_STYLES.header, fontSize: 48 }, 222, 329),
      createText(phase.summary, { ...TEXT_STYLES.body, fontSize: 34, lineHeight: 44,
        wordWrap: true, wordWrapWidth: 740 }, 222, 403));
    const table = report.sections.find(section => section.type === 'table');
    table.rows.forEach((row, index) => {
      const y = 338 + index * 65;
      panel.addChild(
        createText(row.label, { ...TEXT_STYLES.body, fontSize: 30, fill: RELIC.ash }, 1050, y),
        createText(String(row.value), { ...TEXT_STYLES.body, fontSize: 34, fill: RELIC.bone }, rect.width - 54, y, 1, 0));
    });
    panel.addChild(createText('Select any phase to read its rules and the latest available results.', {
      ...TEXT_STYLES.body, fontSize: 27, fill: RELIC.ash,
    }, 40, rect.height - 60));
    root.addChild(panel);
  }
  function keydown(event) {
    if (!root.visible) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = MOON_PHASE_DEFS.findIndex(p => p.id === selectedId);
    selectedId = MOON_PHASE_DEFS[event.key === 'Home' ? 0 : event.key === 'End' ? 5
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + 6) % 6].id;
    signature = ''; render();
  }
  document.addEventListener('keydown', keydown, true);
  return {
    open: () => { selectedId = getMoonPhaseAtSecond(getState()).id; signature = ''; root.visible = true; render(); },
    close, update: render,
    getSnapshot: () => ({ open: root.visible, phaseId: selectedId, report: root.visible ? report : null, rect }),
    getClickPoint: id => {
      const target = id === 'close' ? closeButton : tabs[MOON_PHASE_DEFS.findIndex(p => p.id === id)];
      return root.visible && target ? target.toGlobal(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2)) : null;
    },
    destroy: () => { document.removeEventListener('keydown', keydown, true); root.destroy({ children: true }); },
  };
}
