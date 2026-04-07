import { settlementOrderDefs } from "./settlement-order-defs.js";

export const SETTLEMENT_VASSAL_CANDIDATE_COUNT = 3;
export const SETTLEMENT_VASSAL_MAJOR_DEVELOPMENT_CHANCE = .5;
export const SETTLEMENT_VASSAL_STARTING_AGE_MIN = 6;
export const SETTLEMENT_VASSAL_STARTING_AGE_MAX = 12;
export const SETTLEMENT_VASSAL_VILLAGER_AGE_YEARS = 18;
export const SETTLEMENT_VASSAL_ELDER_AGE_YEARS = 45;
export const SETTLEMENT_VASSAL_PROFESSION_AGE_RANGE = Object.freeze({
  min: 14,
  max: 18,
});
export const SETTLEMENT_VASSAL_TRAIT_AGE_RANGE = Object.freeze({
  min: 26,
  max: 30,
});

export const settlementVassalProfessionDefs = Object.freeze({
  fisher: { id: "fisher", label: "Fisher" },
  farmer: { id: "farmer", label: "Farmer" },
  potter: { id: "potter", label: "Potter" },
  builder: { id: "builder", label: "Builder" },
  herder: { id: "herder", label: "Herder" },
  scribe: { id: "scribe", label: "Scribe" },
});

const councilTraits = settlementOrderDefs?.elderCouncil?.prestigeModifiers ?? {};

export const settlementVassalTraitDefs = Object.freeze(
  Object.fromEntries(
    Object.entries(councilTraits).map(([traitId, traitDef]) => [
      traitId,
      {
        id: traitId,
        label: typeof traitDef?.label === "string" ? traitDef.label : traitId,
        prestigeDelta: Number.isFinite(traitDef?.prestigeDelta)
          ? Math.floor(traitDef.prestigeDelta)
          : 0,
      },
    ])
  )
);

export const settlementVassalProfessionIds = Object.freeze(
  Object.keys(settlementVassalProfessionDefs).sort((a, b) => a.localeCompare(b))
);

export const settlementVassalTraitIds = Object.freeze(
  Object.keys(settlementVassalTraitDefs).sort((a, b) => a.localeCompare(b))
);
