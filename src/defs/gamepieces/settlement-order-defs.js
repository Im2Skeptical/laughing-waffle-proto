import { ensureTooltipCardUi } from "../tooltip-ui-utils.js";

export const settlementOrderDefs = {
  elders: {
    id: "elders",
    kind: "settlementOrder",
    name: "Elders",
    ui: {
      title: "Elders",
      lines: [
        "Placeholder order card",
        "Future leadership logic will populate Practice",
      ],
      description: "The first slice only renders this as a visible placeholder.",
    },
  },
};

ensureTooltipCardUi(settlementOrderDefs);
