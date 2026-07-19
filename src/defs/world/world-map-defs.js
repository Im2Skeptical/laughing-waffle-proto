// Human-authored regional graphs. Pure data only.

const vertex = (id, x, y) => ({ id, x, y });

const region = (
  id,
  name,
  polygonVertexIds,
  labelPoint,
  sitePoint,
  colour,
  capacity,
  controller
) => ({
  id,
  name,
  polygonVertexIds,
  display: { labelPoint, sitePoint: sitePoint ?? labelPoint },
  initialState: {
    colour,
    capacity,
    controller,
    installedPracticeIds: [],
  },
});

const connection = (regionAId, regionBId) => ({ regionAId, regionBId });

const vertices = [
  vertex("p0", 0.04, 0.08), vertex("p1", 0.21, 0.06), vertex("w0", 0.38, 0.06),
  vertex("r0", 0.54, 0.06), vertex("e0", 0.70, 0.08), vertex("q0", 0.86, 0.11),
  vertex("q1", 0.91, 0.34), vertex("q2", 0.89, 0.60), vertex("e6", 0.85, 0.82),
  vertex("r6", 0.76, 0.94), vertex("w6", 0.38, 0.94), vertex("p5", 0.17, 0.94),
  vertex("p4", 0.06, 0.82), vertex("p3", 0.04, 0.62), vertex("p2", 0.03, 0.31),
  vertex("ct", 0.20, 0.23), vertex("cm", 0.19, 0.53),
  vertex("w1", 0.36, 0.22), vertex("w2", 0.38, 0.36), vertex("w3", 0.34, 0.49),
  vertex("w4", 0.39, 0.64), vertex("w5", 0.44, 0.79),
  vertex("r1", 0.52, 0.20), vertex("r2", 0.58, 0.35), vertex("r3", 0.47, 0.49),
  vertex("r4", 0.55, 0.64), vertex("r5", 0.66, 0.79),
  vertex("e1", 0.72, 0.22), vertex("e2", 0.77, 0.36), vertex("e3", 0.69, 0.49),
  vertex("e4", 0.73, 0.63), vertex("e5", 0.82, 0.75),
  vertex("i0", 0.94, 0.54), vertex("i1", 0.985, 0.58), vertex("i2", 0.99, 0.68),
  vertex("i3", 0.965, 0.75), vertex("i4", 0.925, 0.67),
];

// This is an intentionally unbalanced demonstration fixture for the scoring experiment.
const regions = [
  region("cedar-woods", "Cedar Woods", ["p0","p1","ct","p2"], {x:0.12,y:0.16}, {x:0.12,y:0.21}, "green", 2, "frontier"),
  region("iron-hills", "Iron Hills", ["p1","w0","w1","ct"], {x:0.29,y:0.13}, {x:0.30,y:0.19}, "black", 3, "external-a"),
  region("west-levee", "West Levee", ["p2","ct","w1","w2","w3","cm","p3"], {x:0.17,y:0.39}, {x:0.17,y:0.45}, "blue", 2, "player"),
  region("southern-savanna", "Southern Savanna", ["p3","cm","w3","w4","w5","w6","p5","p4"], {x:0.22,y:0.76}, {x:0.24,y:0.83}, "green", 3, "player"),
  region("high-pass", "High Pass", ["w0","r0","r1","w1"], {x:0.45,y:0.13}, {x:0.45,y:0.18}, "black", 2, "frontier"),
  region("upper-floodplain", "Upper Floodplain", ["w1","r1","r2","r3","w3","w2"], {x:0.45,y:0.34}, {x:0.34,y:0.49}, "red", 3, "player"),
  region("river-crown", "River Crown", ["w3","r3","r4","w4"], {x:0.44,y:0.56}, {x:0.45,y:0.60}, "red", 4, "player"),
  region("reed-delta", "Reed Delta", ["w4","r4","r5","r6","w6","w5"], {x:0.52,y:0.75}, {x:0.54,y:0.83}, "blue", 2, "player"),
  region("copper-basin", "Copper Basin", ["r0","e0","e1","r1"], {x:0.63,y:0.13}, {x:0.63,y:0.18}, "red", 3, "external-a"),
  region("east-steppe", "East Steppe", ["r1","e1","e2","e3","r3","r2"], {x:0.65,y:0.34}, {x:0.66,y:0.40}, "blue", 3, "external-a"),
  region("lake-country", "Lake Country", ["r3","e3","e4","r4"], {x:0.61,y:0.55}, {x:0.61,y:0.60}, "red", 3, "player"),
  region("black-marsh", "Black Marsh", ["r4","e4","e5","r5"], {x:0.68,y:0.69}, {x:0.73,y:0.63}, "black", 2, "frontier"),
  region("salt-coast", "Salt Coast", ["r5","e5","e6","r6"], {x:0.77,y:0.85}, {x:0.78,y:0.89}, "green", 3, "external-b"),
  region("obsidian-ridge", "Obsidian Ridge", ["e0","q0","q1","q2","e6","e5","e4","e3","e2","e1"], {x:0.84,y:0.42}, {x:0.84,y:0.49}, "black", 3, "external-b"),
  region("outer-isles", "Outer Isles", ["i0","i1","i2","i3","i4"], {x:0.96,y:0.65}, {x:0.96,y:0.70}, "blue", 2, "frontier"),
];

const connections = [
  connection("cedar-woods", "iron-hills"),
  connection("cedar-woods", "west-levee"),
  connection("iron-hills", "high-pass"),
  connection("iron-hills", "west-levee"),
  connection("high-pass", "copper-basin"),
  connection("high-pass", "upper-floodplain"),
  connection("west-levee", "upper-floodplain"),
  connection("west-levee", "southern-savanna"),
  connection("upper-floodplain", "east-steppe"),
  connection("upper-floodplain", "river-crown"),
  connection("river-crown", "lake-country"),
  connection("river-crown", "southern-savanna"),
  connection("river-crown", "reed-delta"),
  connection("southern-savanna", "reed-delta"),
  connection("reed-delta", "black-marsh"),
  connection("reed-delta", "salt-coast"),
  connection("copper-basin", "east-steppe"),
  connection("copper-basin", "obsidian-ridge"),
  connection("east-steppe", "obsidian-ridge"),
  connection("east-steppe", "lake-country"),
  connection("lake-country", "obsidian-ridge"),
  connection("lake-country", "black-marsh"),
  connection("black-marsh", "obsidian-ridge"),
  connection("black-marsh", "salt-coast"),
  connection("salt-coast", "obsidian-ridge"),
  connection("salt-coast", "outer-isles"),
];

const sites = [
  {
    id: "river-crown-settlement",
    regionId: "river-crown",
    simulationMode: "detailed",
    name: "River Crown",
  },
];

export const worldMapDefs = Object.freeze({
  riverBasin01: Object.freeze({
    id: "riverBasin01",
    name: "River Basin",
    geometry: {
      vertices: Object.freeze(vertices),
    },
    regions: Object.freeze(regions),
    connections: Object.freeze(connections),
    sites: Object.freeze(sites),
    mapContext: Object.freeze({
      landColor: 0x70766a,
      oceanColor: 0x4f7784,
      coastlineColor: 0xd7c99d,
      coastlineVertexIds: ["q0","q1","q2","e6","r6"],
      oceanBoundaryPoints: [{x:0.76,y:1},{x:1,y:1},{x:1,y:0}],
    }),
  }),
});
