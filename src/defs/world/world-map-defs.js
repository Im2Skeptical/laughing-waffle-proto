// Human-authored world maps. Pure data only.

const vertex = (id, x, y) => ({ id, x, y });

const region = (
  id,
  name,
  polygonVertexIds,
  labelPoint,
  sitePoint,
  terrainId,
  deposits,
  forestCoverage = 0
) => ({
  id,
  name,
  polygonVertexIds,
  display: { labelPoint, sitePoint: sitePoint ?? labelPoint },
  terrainId,
  landCover: { forest: forestCoverage },
  deposits,
});

const border = (id, regionAId, regionBId, vertexIds, crossingKind = "open") => ({
  id,
  regionAId,
  regionBId,
  vertexIds,
  crossingKind,
});

const featureSegment = (borderId, fromVertexId, toVertexId) => ({
  borderId,
  fromVertexId,
  toVertexId,
});

export const worldTerrainDefs = Object.freeze({
  floodplain: { id: "floodplain", name: "Floodplain", color: 0x93a85f, landSpeedKmPerDay: 28 },
  wetlands: { id: "wetlands", name: "Wetlands", color: 0x5f9684, landSpeedKmPerDay: 14 },
  coast: { id: "coast", name: "Coast", color: 0x7db7b4, landSpeedKmPerDay: 24 },
  islands: { id: "islands", name: "Islands", color: 0x8bc7bd, landSpeedKmPerDay: 18 },
  farmland: { id: "farmland", name: "Levee Farmland", color: 0xb9ad65, landSpeedKmPerDay: 28 },
  forest: { id: "forest", name: "Forest", color: 0x477c58, landSpeedKmPerDay: 18 },
  uplands: { id: "uplands", name: "Uplands", color: 0x917b63, landSpeedKmPerDay: 20 },
  mountains: { id: "mountains", name: "Mountains", color: 0x777b80, landSpeedKmPerDay: 12 },
  aridUplands: { id: "aridUplands", name: "Arid Uplands", color: 0xb8875e, landSpeedKmPerDay: 20 },
  grassland: { id: "grassland", name: "Grassland", color: 0x90aa68, landSpeedKmPerDay: 30 },
  marsh: { id: "marsh", name: "Marsh", color: 0x657f6f, landSpeedKmPerDay: 12 },
  freshwater: { id: "freshwater", name: "Lake Country", color: 0x679fbd, landSpeedKmPerDay: 18 },
  savanna: { id: "savanna", name: "Savanna", color: 0xc4a85f, landSpeedKmPerDay: 28 },
  volcanic: { id: "volcanic", name: "Volcanic Uplands", color: 0x765c58, landSpeedKmPerDay: 16 },
});

export const worldFacilityDefs = Object.freeze({
  fishery: { id: "fishery", name: "Fishery" },
  harbor: { id: "harbor", name: "Harbor" },
  saltworks: { id: "saltworks", name: "Saltworks" },
  farmstead: { id: "farmstead", name: "Farmstead" },
  loggingCamp: { id: "loggingCamp", name: "Logging Camp" },
  ironMine: { id: "ironMine", name: "Iron Mine" },
  waystation: { id: "waystation", name: "Waystation" },
  copperMine: { id: "copperMine", name: "Copper Mine" },
  pasture: { id: "pasture", name: "Pasture" },
  lakesideDocks: { id: "lakesideDocks", name: "Lakeside Docks" },
  village: { id: "village", name: "Village" },
  quarry: { id: "quarry", name: "Quarry" },
});

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

const regions = [
  region("cedar-woods", "Cedar Woods", ["p0","p1","ct","p2"], {x:0.12,y:0.16}, {x:0.12,y:0.16}, "forest", ["timber","game"], 0.88),
  region("iron-hills", "Iron Hills", ["p1","w0","w1","ct"], {x:0.29,y:0.13}, {x:0.36,y:0.22}, "uplands", ["iron","stone"], 0.20),
  region("west-levee", "West Levee", ["p2","ct","w1","w2","w3","cm","p3"], {x:0.17,y:0.39}, {x:0.15,y:0.40}, "farmland", ["grain","clay"], 0.18),
  region("southern-savanna", "Southern Savanna", ["p3","cm","w3","w4","w5","w6","p5","p4"], {x:0.22,y:0.76}, {x:0.22,y:0.76}, "savanna", ["pasture","game"], 0.08),
  region("high-pass", "High Pass", ["w0","r0","r1","w1"], {x:0.45,y:0.13}, {x:0.54,y:0.06}, "mountains", ["stone"], 0.05),
  region("upper-floodplain", "Upper Floodplain", ["w1","r1","r2","r3","w3","w2"], {x:0.45,y:0.34}, {x:0.34,y:0.49}, "floodplain", ["grain","reeds"], 0.12),
  region("river-crown", "River Crown", ["w3","r3","r4","w4"], {x:0.44,y:0.56}, {x:0.47,y:0.49}, "floodplain", ["grain","clay"], 0.10),
  region("reed-delta", "Reed Delta", ["w4","r4","r5","r6","w6","w5"], {x:0.52,y:0.75}, {x:0.66,y:0.79}, "wetlands", ["fish","reeds"], 0.22),
  region("copper-basin", "Copper Basin", ["r0","e0","e1","r1"], {x:0.63,y:0.13}, {x:0.63,y:0.13}, "aridUplands", ["copper"], 0.02),
  region("east-steppe", "East Steppe", ["r1","e1","e2","e3","r3","r2"], {x:0.65,y:0.34}, {x:0.58,y:0.35}, "grassland", ["pasture","horses"], 0.06),
  region("lake-country", "Lake Country", ["r3","e3","e4","r4"], {x:0.61,y:0.55}, {x:0.55,y:0.64}, "freshwater", ["fish","reeds"], 0.16),
  region("black-marsh", "Black Marsh", ["r4","e4","e5","r5"], {x:0.68,y:0.69}, {x:0.73,y:0.63}, "marsh", ["peat","dye plants"], 0.28),
  region("salt-coast", "Salt Coast", ["r5","e5","e6","r6"], {x:0.77,y:0.85}, {x:0.76,y:0.94}, "coast", ["salt","fish"], 0.04),
  region("obsidian-ridge", "Obsidian Ridge", ["e0","q0","q1","q2","e6","e5","e4","e3","e2","e1"], {x:0.84,y:0.42}, {x:0.72,y:0.22}, "volcanic", ["obsidian","stone"], 0.08),
  region("outer-isles", "Outer Isles", ["i0","i1","i2","i3","i4"], {x:0.96,y:0.65}, {x:0.96,y:0.65}, "islands", ["fish","shells"], 0.12),
];

const sites = [
  { id:"river-crown-settlement", regionId:"river-crown", siteType:"settlement", simulationMode:"detailed", name:"River Crown", facilityDefIds:[] },
  { id:"reed-delta-hamlet", regionId:"reed-delta", siteType:"hamlet", simulationMode:"summary", name:"Reed Delta Hamlet", facilityDefIds:["fishery"] },
  { id:"salt-coast-port", regionId:"salt-coast", siteType:"port", simulationMode:"summary", name:"Salt Coast Port", facilityDefIds:["harbor","saltworks"] },
  { id:"outer-isles-outpost", regionId:"outer-isles", siteType:"outpost", simulationMode:"summary", name:"Outer Isles Outpost", facilityDefIds:["fishery"] },
  { id:"west-levee-farmstead", regionId:"west-levee", siteType:"farmstead", simulationMode:"summary", name:"West Levee Farmstead", facilityDefIds:["farmstead"] },
  { id:"cedar-woods-camp", regionId:"cedar-woods", siteType:"camp", simulationMode:"summary", name:"Cedar Logging Camp", facilityDefIds:["loggingCamp"] },
  { id:"iron-hills-town", regionId:"iron-hills", siteType:"miningTown", simulationMode:"summary", name:"Iron Hills", facilityDefIds:["ironMine"] },
  { id:"high-pass-waystation", regionId:"high-pass", siteType:"waystation", simulationMode:"summary", name:"High Pass", facilityDefIds:["waystation"] },
  { id:"copper-basin-camp", regionId:"copper-basin", siteType:"miningCamp", simulationMode:"summary", name:"Copper Basin Camp", facilityDefIds:["copperMine"] },
  { id:"east-steppe-village", regionId:"east-steppe", siteType:"village", simulationMode:"summary", name:"East Steppe Village", facilityDefIds:["pasture"] },
  { id:"lake-country-village", regionId:"lake-country", siteType:"village", simulationMode:"summary", name:"Lake Country", facilityDefIds:["lakesideDocks"] },
  { id:"southern-savanna-village", regionId:"southern-savanna", siteType:"village", simulationMode:"summary", name:"Southern Savanna", facilityDefIds:["village"] },
  { id:"obsidian-ridge-quarry", regionId:"obsidian-ridge", siteType:"quarry", simulationMode:"summary", name:"Obsidian Quarry", facilityDefIds:["quarry"] },
];

const borders = [
  border("cedar-iron","cedar-woods","iron-hills",["p1","ct"],"blocked"),
  border("cedar-west","cedar-woods","west-levee",["p2","ct"],"open"),
  border("iron-high","iron-hills","high-pass",["w0","w1"],"pass"),
  border("iron-west","iron-hills","west-levee",["ct","w1"],"pass"),
  border("high-copper","high-pass","copper-basin",["r0","r1"],"ford"),
  border("high-upper","high-pass","upper-floodplain",["w1","r1"],"open"),
  border("west-upper","west-levee","upper-floodplain",["w1","w2","w3"],"ford"),
  border("west-south","west-levee","southern-savanna",["p3","cm","w3"],"open"),
  border("upper-east","upper-floodplain","east-steppe",["r1","r2","r3"],"ford"),
  border("upper-river","upper-floodplain","river-crown",["w3","r3"],"bridge"),
  border("river-lake","river-crown","lake-country",["r3","r4"],"bridge"),
  border("river-south","river-crown","southern-savanna",["w3","w4"],"open"),
  border("river-reed","river-crown","reed-delta",["w4","r4"],"open"),
  border("south-reed","southern-savanna","reed-delta",["w4","w5","w6"],"open"),
  border("reed-black","reed-delta","black-marsh",["r4","r5"],"ferry"),
  border("reed-salt","reed-delta","salt-coast",["r5","r6"],"ferry"),
  border("copper-east","copper-basin","east-steppe",["r1","e1"],"open"),
  border("copper-obsidian","copper-basin","obsidian-ridge",["e0","e1"],"pass"),
  border("east-obsidian","east-steppe","obsidian-ridge",["e1","e2","e3"],"ford"),
  border("east-lake","east-steppe","lake-country",["r3","e3"],"open"),
  border("lake-obsidian","lake-country","obsidian-ridge",["e3","e4"],"ferry"),
  border("lake-black","lake-country","black-marsh",["r4","e4"],"ford"),
  border("black-obsidian","black-marsh","obsidian-ridge",["e4","e5"],"blocked"),
  border("black-salt","black-marsh","salt-coast",["r5","e5"],"open"),
  border("salt-obsidian","salt-coast","obsidian-ridge",["e5","e6"],"blocked"),
];

const geographicFeatures = [
  {
    id: "crown-river",
    type: "river",
    name: "Crown River",
    segments: [
      featureSegment("high-copper","r0","r1"),
      featureSegment("upper-east","r1","r3"),
      featureSegment("river-lake","r3","r4"),
      featureSegment("reed-black","r4","r5"),
      featureSegment("reed-salt","r5","r6"),
    ],
  },
  {
    id: "westwater",
    type: "river",
    name: "Westwater",
    outflow: { featureId: "crown-river", vertexId: "r3" },
    segments: [
      featureSegment("west-upper","w1","w3"),
      featureSegment("upper-river","w3","r3"),
    ],
  },
  {
    id: "ridge-run",
    type: "river",
    name: "Ridge Run",
    outflow: { featureId: "crown-river", vertexId: "r4" },
    segments: [
      featureSegment("east-obsidian","e1","e3"),
      featureSegment("lake-obsidian","e3","e4"),
      featureSegment("lake-black","e4","r4"),
    ],
  },
  {
    id: "western-spine",
    type: "mountainRange",
    name: "Western Spine",
    segments: [
      featureSegment("cedar-iron","p1","ct"),
      featureSegment("iron-west","ct","w1"),
      featureSegment("iron-high","w1","w0"),
    ],
  },
  {
    id: "obsidian-rim",
    type: "mountainRange",
    name: "Obsidian Rim",
    segments: [
      featureSegment("black-obsidian","e4","e5"),
      featureSegment("salt-obsidian","e5","e6"),
    ],
  },
  {
    id: "cedar-fringe",
    type: "forestBelt",
    name: "Cedar Fringe",
    segments: [featureSegment("cedar-west","p2","ct")],
  },
];

const transportNodes = regions.map((entry) => {
  const site = sites.find((candidate) => candidate.regionId === entry.id) ?? null;
  return {
    id: `node-${entry.id}`,
    regionId: entry.id,
    siteId: site?.id ?? null,
    point: entry.display.sitePoint,
  };
});

const vertexById = Object.fromEntries(vertices.map((entry) => [entry.id, entry]));
const nodeByRegionId = Object.fromEntries(transportNodes.map((entry) => [entry.regionId, entry]));

function borderMidpoint(entry) {
  const points = entry.vertexIds.map((id) => vertexById[id]);
  const middle = points[Math.floor((points.length - 1) / 2)];
  const next = points[Math.min(points.length - 1, Math.floor((points.length - 1) / 2) + 1)];
  return { x: (middle.x + next.x) / 2, y: (middle.y + next.y) / 2 };
}

const landLinks = borders
  .filter((entry) => entry.crossingKind !== "blocked")
  .map((entry) => ({
    id: `land-${entry.id}`,
    nodeAId: nodeByRegionId[entry.regionAId].id,
    nodeBId: nodeByRegionId[entry.regionBId].id,
    mode: "land",
    bidirectional: true,
    borderId: entry.id,
    path: [nodeByRegionId[entry.regionAId].point, borderMidpoint(entry), nodeByRegionId[entry.regionBId].point],
  }));

const riverLinks = [
  { id:"river-main-high-east", nodeAId:"node-high-pass", nodeBId:"node-east-steppe", mode:"river", featureId:"crown-river", fromVertexId:"r0", toVertexId:"r2" },
  { id:"river-main-east-crown", nodeAId:"node-east-steppe", nodeBId:"node-river-crown", mode:"river", featureId:"crown-river", fromVertexId:"r2", toVertexId:"r3" },
  { id:"river-main-crown-lake", nodeAId:"node-river-crown", nodeBId:"node-lake-country", mode:"river", featureId:"crown-river", fromVertexId:"r3", toVertexId:"r4" },
  { id:"river-main-lake-reed", nodeAId:"node-lake-country", nodeBId:"node-reed-delta", mode:"river", featureId:"crown-river", fromVertexId:"r4", toVertexId:"r5" },
  { id:"river-main-reed-salt", nodeAId:"node-reed-delta", nodeBId:"node-salt-coast", mode:"river", featureId:"crown-river", fromVertexId:"r5", toVertexId:"r6" },
  { id:"river-west-iron-upper", nodeAId:"node-iron-hills", nodeBId:"node-upper-floodplain", mode:"river", featureId:"westwater", fromVertexId:"w1", toVertexId:"w3" },
  { id:"river-west-upper-crown", nodeAId:"node-upper-floodplain", nodeBId:"node-river-crown", mode:"river", featureId:"westwater", fromVertexId:"w3", toVertexId:"r3" },
  { id:"river-ridge-obsidian-black", nodeAId:"node-obsidian-ridge", nodeBId:"node-black-marsh", mode:"river", featureId:"ridge-run", fromVertexId:"e1", toVertexId:"e4" },
  { id:"river-ridge-black-lake", nodeAId:"node-black-marsh", nodeBId:"node-lake-country", mode:"river", featureId:"ridge-run", fromVertexId:"e4", toVertexId:"r4" },
].map((entry) => ({ ...entry, bidirectional: true }));

const seaLinks = [{
  id: "sea-salt-outer-isles",
  nodeAId: "node-salt-coast",
  nodeBId: "node-outer-isles",
  mode: "sea",
  bidirectional: true,
  path: [{x:0.76,y:0.94},{x:0.86,y:0.82},{x:0.96,y:0.65}],
}];

export const worldMapDefs = Object.freeze({
  riverBasin01: Object.freeze({
    id: "riverBasin01",
    name: "River Basin",
    geometry: {
      extentKm: { width: 900, height: 500 },
      vertices: Object.freeze(vertices),
    },
    travelRules: {
      riverDownstreamKmPerDay: 70,
      riverUpstreamKmPerDay: 35,
      seaKmPerDay: 80,
      forestSlowdown: 0.35,
      crossingPenaltyDays: { open:0, ford:1, bridge:0, ferry:1, pass:2, blocked:0 },
      forestBeltPenaltyDays: 1,
    },
    regions: Object.freeze(regions),
    sites: Object.freeze(sites),
    borders: Object.freeze(borders),
    geographicFeatures: Object.freeze(geographicFeatures),
    transportNodes: Object.freeze(transportNodes),
    transportLinks: Object.freeze([...landLinks, ...riverLinks, ...seaLinks]),
  }),
});
