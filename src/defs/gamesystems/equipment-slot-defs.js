export const LEADER_EQUIPMENT_SLOT_ORDER = Object.freeze([
  "head",
  "chest",
  "mainHand",
  "offHand",
  "ring1",
  "ring2",
  "amulet",
]);

export const LEADER_EQUIPMENT_SLOT_LABELS = Object.freeze({
  head: "Head",
  chest: "Chest",
  mainHand: "Main Hand",
  offHand: "Off Hand",
  ring1: "Ring 1",
  ring2: "Ring 2",
  amulet: "Amulet",
});

export const LEADER_EQUIPMENT_SLOT_ALIAS_MAP = Object.freeze({
  head: Object.freeze(["head"]),
  chest: Object.freeze(["chest"]),
  mainHand: Object.freeze(["mainHand"]),
  "main-hand": Object.freeze(["mainHand"]),
  offHand: Object.freeze(["offHand"]),
  "off-hand": Object.freeze(["offHand"]),
  ring: Object.freeze(["ring1", "ring2"]),
  ring1: Object.freeze(["ring1"]),
  ring2: Object.freeze(["ring2"]),
  amulet: Object.freeze(["amulet"]),
});
