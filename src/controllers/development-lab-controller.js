import { createLabFixture } from '../model/dev-lab/fixtures.js';
import { cloneLabState, editLabState, advanceLabState, getLabObservation, compareLabProjection, previewLabShop, previewLabInstitutions } from '../model/dev-lab/sandbox.js';
import { serializeGameState, deserializeGameState } from '../model/state.js';

const LIBRARY_KEY = 'civsurvivor.development-lab.fixtures.v1';
export function createDevelopmentLabController({ initialState = null, storage = globalThis.localStorage } = {}) {
  let state = initialState ? cloneLabState(initialState) : createLabFixture();
  let baseline = serializeGameState(state), regionId = state.civilization.capitalRegionId;
  let previous = null, message = '', detail = null, exhibitId = 'stock';
  const library = () => JSON.parse(storage.getItem(LIBRARY_KEY) ?? '{}');
  function commit(next, label) {
    previous = getLabObservation(state,regionId); state = next; detail = null; message = label;
    if (!state.world.sites.some(s=>s.regionId === regionId)) regionId = state.civilization.capitalRegionId;
  }
  return {
    getSnapshot: () => ({ state, regionId, previous, message, detail, exhibitId, baselineSec:baseline.tSec }),
    selectRegion(id) { regionId = id; previous = null; },
    fixture(id,seed) { const next = createLabFixture(id,seed); commit(next,`Loaded ${id}, seed ${seed}`); baseline = serializeGameState(state); regionId = state.civilization.capitalRegionId; exhibitId = id; previous = null; },
    edit(kind,payload) { commit(editLabState(state,regionId,{kind,payload}),`Applied ${kind}`); },
    advance(mode,phase) { commit(advanceLabState(state,mode,phase),'Advanced through authoritative ticks'); },
    reset() { commit(deserializeGameState(baseline),'Reset to the exact saved RNG and state'); previous = null; },
    setBaseline() { baseline = serializeGameState(state); message = 'Current state is now the reset fixture'; },
    save(name) {
      if (!name?.trim()) throw new Error('Enter a fixture name');
      const data = library(); data[name.trim()] = serializeGameState(state); storage.setItem(LIBRARY_KEY,JSON.stringify(data)); baseline = serializeGameState(state); message = `Saved ${name}`;
    },
    names() { return Object.keys(library()); },
    load(name) { const data = library()[name]; if (!data) throw new Error('Choose a saved fixture'); this.importState(JSON.stringify(data)); message = `Loaded ${name}`; },
    importState(text) { const next = deserializeGameState(text); commit(next,'Imported validated GameState'); baseline = serializeGameState(state); regionId = state.civilization.capitalRegionId; previous = null; },
    exportState: () => JSON.stringify(serializeGameState(state),null,2),
    compare(seconds) { detail = {kind:'projection',...compareLabProjection(state,seconds)}; message = detail.equal ? `Exact state match at t=${detail.endSec}` : 'Projection differs: inspect the field diff'; },
    shop() { detail = {kind:'shop',node:previewLabShop(state)}; message = 'Seeded shop preview on a clone; fixture RNG is unchanged'; },
    institutions() { detail = {kind:'institutions',rows:previewLabInstitutions(state)}; message = 'Identical candidate RNG, with and without current institutions; fixture unchanged'; },
  };
}
