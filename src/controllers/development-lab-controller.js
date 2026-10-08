import { createLabFixture } from '../model/dev-lab/fixtures.js';
import { cloneLabState, editLabState, advanceLabState, getLabObservation, compareLabProjection, previewLabShop, previewLabInstitutions } from '../model/dev-lab/sandbox.js';
import { serializeGameState, deserializeGameState } from '../model/state.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../model/timeline/index.js';
import { createTimeGraphController } from '../model/timegraph/controller-core.js';
import { createProjectionCache } from '../model/timegraph/projection-cache.js';
import { GRAPH_METRICS } from '../model/graph-metrics.js';

const LIBRARY_KEY = 'civsurvivor.development-lab.fixtures.v1';
const UNDO_LIMIT = 20;
export function createDevelopmentLabController({ initialState = null, storage = globalThis.localStorage } = {}) {
  let state = initialState ? cloneLabState(initialState) : createLabFixture();
  let baseline = serializeGameState(state), regionId = state.civilization.capitalRegionId;
  let previous = null, message = '', detail = null, exhibitId = initialState?'custom':'stock';
  let timeline = createTimelineFromInitialState(state), horizonSec = 60;
  // Serialized snapshots taken before destructive Lab changes (edits, resets,
  // fixture loads). Undo restores one and starts a fresh branch from it.
  let undoStack = [];
  function remember(label) {
    undoStack.push({label, state:serializeGameState(state), regionId, exhibitId, baseline});
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }
  const graph = createTimeGraphController({getTimeline:()=>timeline, getCursorState:()=>state,
    metric:GRAPH_METRICS.settlement, projectionCache:createProjectionCache(), horizonSec, forecastStepSec:1});
  graph.setHorizonSecOverride(horizonSec);
  function branch() {
    timeline = createTimelineFromInitialState(state);
    graph.handleInvalidate('lab-branch');
  }
  function seek(second) {
    const target = Math.max(timeline.baseStateData.tSec, Math.min(timeline.baseStateData.tSec+horizonSec, Math.floor(Number(second))));
    if (!Number.isFinite(target)) throw new Error('Choose a valid second');
    if (target === state.tSec) return;
    const result = rebuildStateAtSecond(timeline,target);
    if (!result.ok) throw new Error(result.reason);
    commit(result.state,`Viewing t=${result.state.tSec}s`);
    timeline.cursorSec = state.tSec;
  }
  const library = () => JSON.parse(storage.getItem(LIBRARY_KEY) ?? '{}');
  function commit(next, label) {
    previous = getLabObservation(state,regionId); state = next; detail = null; message = label;
    if (!state.world.regions.some(r=>r.id === regionId)) regionId = state.civilization.capitalRegionId;
  }
  return {
    getSnapshot: () => ({ state, regionId, previous, message, detail, exhibitId, baselineSec:baseline.tSec,
      undoLabel:undoStack.at(-1)?.label ?? null, undoCount:undoStack.length,
      branchSec:timeline.baseStateData.tSec, horizonSec, endSec:timeline.baseStateData.tSec+horizonSec }),
    getTimeline:()=>timeline,
    getGraphController:()=>graph,
    seek,
    setHorizon(value) {
      const next=Number(value);
      if (!Number.isInteger(next)||next<1||next>3600) throw new Error('Forecast span must be 1–3600 seconds');
      horizonSec=next; graph.setHorizonSecOverride(next);
      if(state.tSec>timeline.baseStateData.tSec+next) seek(timeline.baseStateData.tSec+next);
      message=`Forecast limited to ${next} seconds from branch start`;
    },
    selectRegion(id) { regionId = id; previous = null; },
    fixture(id,seed) { const next = createLabFixture(id,seed); remember(`load ${id}`); commit(next,`Loaded ${id}, seed ${seed}`); baseline = serializeGameState(state); regionId = state.civilization.capitalRegionId; exhibitId = id; previous = null; branch(); },
    edit(kind,payload) { const next = editLabState(state,regionId,{kind,payload}); remember(kind); commit(next,`Applied ${kind} · new branch at t=${state.tSec}s · Undo restores the previous state`); branch(); },
    undo() {
      const entry = undoStack.pop();
      if (!entry) throw new Error('Nothing to undo');
      commit(deserializeGameState(entry.state),`Undid ${entry.label} · new branch at t=${entry.state.tSec}s`);
      regionId = state.world.regions.some(r=>r.id===entry.regionId) ? entry.regionId : state.civilization.capitalRegionId;
      exhibitId = entry.exhibitId; baseline = entry.baseline; previous = null; branch();
    },
    advance(mode,phase) {
      const next=advanceLabState(state,mode,phase);
      const required=next.tSec-timeline.baseStateData.tSec;
      if(required>horizonSec) this.setHorizon(required);
      seek(next.tSec);
    },
    reset() { remember('reset'); commit(deserializeGameState(baseline),'Reset to the exact saved RNG and state'); previous = null; branch(); },
    setBaseline() { remember('set reset point'); baseline = serializeGameState(state); branch(); message = 'Current state is now the reset fixture'; },
    exists: name => !!name?.trim() && Object.hasOwn(library(), name.trim()),
    save(name, {overwrite = false} = {}) {
      if (!name?.trim()) throw new Error('Enter a fixture name');
      const data = library(); if (overwrite !== true && Object.hasOwn(data,name.trim())) throw new Error(`A Museum exhibit named “${name.trim()}” already exists`);
      Object.defineProperty(data,name.trim(),{value:serializeGameState(state),enumerable:true,configurable:true}); storage.setItem(LIBRARY_KEY,JSON.stringify(data)); baseline = serializeGameState(state); message = `Saved ${name} to Museum in this browser`;
    },
    names() { return Object.keys(library()); },
    load(name) { const data = library()[name]; if (!data) throw new Error('Choose a saved fixture'); this.importState(JSON.stringify(data)); exhibitId=`saved:${name}`; message = `Loaded ${name}`; },
    importState(text) { const next = deserializeGameState(text); remember('import'); commit(next,'Imported validated GameState'); baseline = serializeGameState(state); regionId = state.civilization.capitalRegionId; previous = null; exhibitId='custom'; branch(); },
    exportState: () => JSON.stringify(serializeGameState(state),null,2),
    compare(seconds) { detail = {kind:'projection',...compareLabProjection(state,seconds)}; message = detail.equal ? `Exact state match at t=${detail.endSec}` : 'Projection differs: inspect the field diff'; },
    shop() { detail = {kind:'shop',node:previewLabShop(state)}; message = 'Seeded shop preview on a clone; fixture RNG is unchanged'; },
    institutions() { detail = {kind:'institutions',rows:previewLabInstitutions(state)}; message = 'Identical candidate RNG, with and without current institutions; fixture unchanged'; },
  };
}
