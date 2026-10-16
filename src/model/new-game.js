import { seedNeutralSettlements, seedOpeningMonster } from "./detailed-settlements/external-world.js";
import { createInitialState } from "./init.js";
import { createRegionalBootProfile } from './regional-map/boot-profile.js';
import { getRegionalMap, regionalMapId, regionalMapSeed } from './regional-map/definition.js';
import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";

export function createNewGameState(seed, {gamepieces} = {}) {
  const profile = createRegionalBootProfile(seed);
  if (gamepieces) profile.gamepieces = gamepieces;
  return createConfiguredNewGameState(seed, profile);
}

// Both player New Game and the Gym workshop use this initialization path.
// Profiles are launch recipes; the resulting state captures all runtime data.
export function createConfiguredNewGameState(seed, profile) {
  let mapLab=profile.mapLab;
  // Generated random-road recipes follow the launch seed. Exact Map Lab
  // placement keeps the explicitly captured geography and connections.
  if(profile.launch.startMode==='randomRoad'&&regionalMapSeed(mapLab.worldDefinitionId)!==null){
    const id=regionalMapId(seed);
    const previous=getRegionalMap(mapLab.worldDefinitionId).definition,next=getRegionalMap(id).definition;
    mapLab={...mapLab,worldDefinitionId:id,connections:next.connections,
      regions:mapLab.regions.map(r=>({...r,colour:r.colour===previous.regions.find(p=>p.id===r.id).initialState.colour
        ? next.regions.find(p=>p.id===r.id).initialState.colour:r.colour}))};
  }
  const state = createInitialState({
    ...setupDefs.devPlaytesting01,
    civilization: {},
    worldDefinitionId: mapLab.worldDefinitionId,
    worldDraft: {
      ...mapLab,
      ...(profile.launch.startMode === "randomRoad"
        ? { starterRandomization: { kind: "twoRegionStarter" } } : {}),
    },
    gameConfig: {
      settings: profile.gameSettings,
      gamepieces: profile.gamepieces,
      lifeMapGenerator: profile.lifeMapLab.generatorConfig,
    },
  }, seed);
  if (profile.launch.neutralSettlements) seedNeutralSettlements(state);
  seedOpeningMonster(state);
  return state;
}
