import { stepSettlementSecond } from "./settlement-exec.js";

function isSettlementPrototypeEnabled(state) {
  return state?.variantFlags?.settlementPrototypeEnabled === true;
}

const LIVE_SECOND_STAGES = [
  {
    id: "settlement",
    applies: (state) => isSettlementPrototypeEnabled(state),
    run: (state, tSec) => {
      stepSettlementSecond(state, tSec);
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
