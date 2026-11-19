import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { serializeGameState } from "../../../src/model/state.js";
import { prepareActionExhibit } from "../../reference/action-exhibit.mjs";
import { createStart, loadScenario } from "../../reference/trace.mjs";

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
const directory = process.argv[2];
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, "shop.json"), JSON.stringify(serializeGameState(shop.state)));
const succession = createStart({ start: { kind: "newGame", seed: 1 } }, 0);
prepareActionExhibit(succession, "legacy-successor");
writeFileSync(join(directory, "retirement.json"), JSON.stringify(serializeGameState(succession)));
