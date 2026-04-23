import { processSecondChangeForItems } from "./effects/index.js";
import { stepEnvSecond } from "./env-exec.js";
import { stepHubSecond } from "./hub-exec.js";
import { stepPawnSecond } from "./pawn-exec.js";
import { enforcePrestigeFollowerCap, enforceWorkerPopulationCap } from "./prestige-system.js";
import { stepSettlementSecond } from "./settlement-exec.js";

function isSettlementPrototypeEnabled(state) {
  return state?.variantFlags?.settlementPrototypeEnabled === true;
}

const LIVE_SECOND_STAGES = [
  {
    id: "items",
    applies: (state) => !isSettlementPrototypeEnabled(state),
    run: (state) => {
      processSecondChangeForItems(state);
    },
  },
  {
    id: "pawns",
    applies: (state) => !isSettlementPrototypeEnabled(state),
    run: (state, tSec, options) => {
      stepPawnSecond(state, tSec, { placePawn: options?.placePawn });
    },
  },
  {
    id: "env",
    applies: () => true,
    run: (state, tSec) => {
      stepEnvSecond(state, tSec);
    },
  },
  {
    id: "hub",
    applies: (state) => !isSettlementPrototypeEnabled(state),
    run: (state, tSec) => {
      stepHubSecond(state, tSec);
    },
  },
  {
    id: "settlement",
    applies: (state) => isSettlementPrototypeEnabled(state),
    run: (state, tSec) => {
      stepSettlementSecond(state, tSec);
    },
  },
  {
    id: "workerCap",
    applies: (state) => !isSettlementPrototypeEnabled(state),
    run: (state) => {
      enforceWorkerPopulationCap(state);
    },
  },
  {
    id: "prestigeCap",
    applies: (state) => !isSettlementPrototypeEnabled(state),
    run: (state) => {
      enforcePrestigeFollowerCap(state);
    },
  },
];

export function getLiveSecondStages() {
  return LIVE_SECOND_STAGES.slice();
}

export function runLiveSecondStages(state, tSec, options = {}) {
  for (const stage of LIVE_SECOND_STAGES) {
    if (!stage?.run) continue;
    if (typeof stage.applies === "function" && !stage.applies(state, options)) continue;
    stage.run(state, tSec, options);
  }
  return { ok: true };
}
