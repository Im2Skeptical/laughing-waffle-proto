import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { serializeGameState } from "../../../src/model/state.js";
import { prepareActionExhibit } from "../../reference/action-exhibit.mjs";
import { advance, applyActions, createStart, loadScenario } from "../../reference/trace.mjs";

const directory = process.argv[2];
mkdirSync(directory, { recursive: true });
const save = (name, data) => writeFileSync(join(directory, name + ".json"), JSON.stringify(data));

function checkout(id, { prefix = 0, count, at = 1 } = {}) {
  const { scenario, startSec } = loadScenario(id);
  const state = createStart(scenario, startSec);
  const prior = scenario.actions.slice(0, prefix);
  const batch = scenario.actions.slice(prefix, count === undefined ? undefined : prefix + count)
    .map(action => ({ ...action, tSec: at }));
  // The native UI holds one live boundary for the entire draft. Preserve the
  // captured browser payloads and validate them together at that boundary.
  for (let second = startSec; second <= at; second++) {
    if (second > startSec) advance(state, second, id);
    applyActions(state, prior.filter(action => action.tSec === second), second, id);
  }
  save(id, serializeGameState(state));
  applyActions(state, batch, at, id);
  save(id + "-checked-out", serializeGameState(state));
  save(id + "-journal", batch);
}

function exhibit(id) {
  const { scenario, startSec } = loadScenario(id);
  const state = createStart(scenario, startSec);
  const lineage = state.civilization.vassalLineage;
  const map = lineage.vassalsById[lineage.currentVassalId].lifeMap;
  return { state, inventory: map.nodeStates[map.currentNodeId].inventory };
}

const shop = exhibit("action-shop-currency");
const routes = exhibit("action-shop-connections");
shop.inventory.push(routes.inventory[0]);
save("shop", serializeGameState(shop.state));
const succession = createStart({ start: { kind: "newGame", seed: 1 } }, 0);
prepareActionExhibit(succession, "legacy-successor");
save("retirement", serializeGameState(succession));

checkout("seed-42-shops", { prefix: 2, count: 3, at: 12 });
checkout("action-structure-shop");
checkout("action-shop-unlocks");
checkout("action-shop-currency");
