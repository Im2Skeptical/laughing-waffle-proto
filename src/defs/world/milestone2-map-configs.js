// Authored Milestone 2 test configurations. Mechanical Map Lab data only.

const region = (id, colour, capacity, controller, installedPracticeIds = []) => ({
  id,
  colour,
  capacity,
  controller,
  installedPracticeIds,
});

const connection = (regionAId, regionBId) => ({ regionAId, regionBId });

const blankRegions = [
  region("cedar-woods", "green", 2, "frontier"),
  region("iron-hills", "black", 3, "external-a"),
  region("west-levee", "red", 3, "player"),
  region("southern-savanna", "green", 2, "external-b"),
  region("high-pass", "black", 2, "frontier"),
  region("upper-floodplain", "red", 4, "player"),
  region("river-crown", "red", 2, "player"),
  region("reed-delta", "green", 3, "external-b"),
  region("copper-basin", "red", 3, "external-a"),
  region("east-steppe", "green", 3, "external-a"),
  region("lake-country", "blue", 3, "player"),
  region("black-marsh", "blue", 2, "frontier"),
  region("salt-coast", "green", 3, "external-b"),
  region("obsidian-ridge", "black", 4, "external-a"),
  region("outer-isles", "blue", 2, "external-b"),
];

const finalConnections = [
  connection("cedar-woods", "west-levee"),
  connection("iron-hills", "west-levee"),
  connection("iron-hills", "high-pass"),
  connection("west-levee", "southern-savanna"),
  connection("west-levee", "upper-floodplain"),
  connection("southern-savanna", "reed-delta"),
  connection("high-pass", "copper-basin"),
  connection("upper-floodplain", "river-crown"),
  connection("river-crown", "reed-delta"),
  connection("river-crown", "lake-country"),
  connection("copper-basin", "east-steppe"),
  connection("copper-basin", "obsidian-ridge"),
  connection("east-steppe", "lake-country"),
  connection("east-steppe", "obsidian-ridge"),
  connection("lake-country", "black-marsh"),
  connection("lake-country", "obsidian-ridge"),
  connection("black-marsh", "salt-coast"),
];

const sparsePracticesByRegionId = Object.freeze({
  "west-levee": ["store", "store"],
  "upper-floodplain": ["study", "cultivate", "administer"],
  "river-crown": ["administer"],
  "lake-country": ["store", "cultivate"],
});

function makeDraft(regions) {
  return Object.freeze({
    schemaVersion: 1,
    worldDefinitionId: "riverBasin01",
    regions: Object.freeze(regions.map((entry) => Object.freeze({
      ...entry,
      installedPracticeIds: Object.freeze([...entry.installedPracticeIds]),
    }))),
    connections: Object.freeze(finalConnections.map((entry) => Object.freeze({ ...entry }))),
  });
}

export const milestone2BlankDraft = makeDraft(
  blankRegions.map((entry) => ({ ...entry, installedPracticeIds: [] }))
);

export const milestone2SparseDraft = makeDraft(
  blankRegions.map((entry) => ({
    ...entry,
    installedPracticeIds: [...(sparsePracticesByRegionId[entry.id] ?? [])],
  }))
);

export const milestone2MapConfigDefs = Object.freeze({
  milestone2Blank01: Object.freeze({
    id: "milestone2Blank01",
    name: "Milestone 2 — Blank Suitability",
    draft: milestone2BlankDraft,
  }),
  milestone2Sparse01: Object.freeze({
    id: "milestone2Sparse01",
    name: "Milestone 2 — Sparse Interactions",
    draft: milestone2SparseDraft,
  }),
});
