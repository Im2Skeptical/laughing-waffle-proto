// Human-authored world maps. Pure data only.

const region = (id, name, polygon, labelPoint, terrainId, deposits, sitePoint = null) => ({
  id,
  name,
  polygon,
  display: { labelPoint, sitePoint: sitePoint ?? labelPoint },
  terrainId,
  deposits,
});

const connection = (
  regionAId,
  regionBId,
  physicalRelation,
  routes,
  path
) => ({
  regionAId,
  regionBId,
  physicalRelation,
  routes,
  display: { path },
});

export const worldTerrainDefs = Object.freeze({
  floodplain: { id: "floodplain", name: "Floodplain", color: 0x93a85f },
  wetlands: { id: "wetlands", name: "Wetlands", color: 0x5f9684 },
  coast: { id: "coast", name: "Coast", color: 0x7db7b4 },
  islands: { id: "islands", name: "Islands", color: 0x8bc7bd },
  farmland: { id: "farmland", name: "Levee Farmland", color: 0xb9ad65 },
  forest: { id: "forest", name: "Forest", color: 0x477c58 },
  uplands: { id: "uplands", name: "Uplands", color: 0x917b63 },
  mountains: { id: "mountains", name: "Mountains", color: 0x777b80 },
  aridUplands: { id: "aridUplands", name: "Arid Uplands", color: 0xb8875e },
  grassland: { id: "grassland", name: "Grassland", color: 0x90aa68 },
  marsh: { id: "marsh", name: "Marsh", color: 0x657f6f },
  freshwater: { id: "freshwater", name: "Lake Country", color: 0x679fbd },
  savanna: { id: "savanna", name: "Savanna", color: 0xc4a85f },
  volcanic: { id: "volcanic", name: "Volcanic Uplands", color: 0x765c58 },
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

const regions = [
  region("west-levee", "West Levee", [[0.03,0.30],[0.19,0.27],[0.23,0.48],[0.18,0.66],[0.04,0.62]], {x:0.12,y:0.46}, "farmland", ["grain","clay"]),
  region("cedar-woods", "Cedar Woods", [[0.03,0.06],[0.20,0.05],[0.25,0.26],[0.19,0.27],[0.03,0.30]], {x:0.13,y:0.17}, "forest", ["timber","game"]),
  region("iron-hills", "Iron Hills", [[0.20,0.05],[0.37,0.08],[0.39,0.27],[0.25,0.26]], {x:0.30,y:0.16}, "uplands", ["iron","stone"]),
  region("high-pass", "High Pass", [[0.37,0.08],[0.55,0.04],[0.53,0.24],[0.39,0.27]], {x:0.46,y:0.14}, "mountains", ["stone"]),
  region("upper-floodplain", "Upper Floodplain", [[0.25,0.26],[0.39,0.27],[0.43,0.47],[0.23,0.48],[0.19,0.27]], {x:0.32,y:0.36}, "floodplain", ["grain","reeds"]),
  region("river-crown", "River Crown", [[0.23,0.48],[0.43,0.47],[0.49,0.64],[0.36,0.76],[0.18,0.66]], {x:0.34,y:0.58}, "floodplain", ["grain","clay"]),
  region("lake-country", "Lake Country", [[0.43,0.47],[0.57,0.39],[0.65,0.55],[0.49,0.64]], {x:0.54,y:0.52}, "freshwater", ["fish","reeds"]),
  region("east-steppe", "East Steppe", [[0.53,0.24],[0.72,0.22],[0.75,0.42],[0.65,0.55],[0.57,0.39]], {x:0.65,y:0.33}, "grassland", ["pasture","horses"]),
  region("copper-basin", "Copper Basin", [[0.55,0.04],[0.73,0.06],[0.72,0.22],[0.53,0.24]], {x:0.63,y:0.14}, "aridUplands", ["copper"]),
  region("black-marsh", "Black Marsh", [[0.65,0.55],[0.75,0.42],[0.88,0.48],[0.87,0.67],[0.73,0.72]], {x:0.77,y:0.58}, "marsh", ["peat","dye plants"]),
  region("reed-delta", "Reed Delta", [[0.49,0.64],[0.65,0.55],[0.73,0.72],[0.64,0.84],[0.45,0.83],[0.36,0.76]], {x:0.55,y:0.72}, "wetlands", ["fish","reeds"]),
  region("salt-coast", "Salt Coast", [[0.64,0.84],[0.73,0.72],[0.87,0.67],[0.94,0.79],[0.83,0.94],[0.66,0.94]], {x:0.79,y:0.82}, "coast", ["salt","fish"]),
  region("southern-savanna", "Southern Savanna", [[0.04,0.62],[0.18,0.66],[0.36,0.76],[0.45,0.83],[0.38,0.96],[0.16,0.94],[0.04,0.84]], {x:0.24,y:0.82}, "savanna", ["pasture","game"]),
  region("obsidian-ridge", "Obsidian Ridge", [[0.73,0.06],[0.91,0.12],[0.94,0.31],[0.88,0.48],[0.75,0.42],[0.72,0.22]], {x:0.83,y:0.27}, "volcanic", ["obsidian","stone"]),
  region("outer-isles", "Outer Isles", [[0.90,0.55],[0.97,0.57],[0.99,0.68],[0.95,0.73],[0.89,0.68]], {x:0.95,y:0.64}, "islands", ["fish","shells"]),
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

const connections = [
  connection("high-pass","upper-floodplain","separated",[{mode:"land",weight:2},{mode:"river",weight:2}],[{x:0.46,y:0.20},{x:0.37,y:0.31}]),
  connection("upper-floodplain","river-crown","border",[{mode:"land",weight:1},{mode:"river",weight:1}],[{x:0.36,y:0.40},{x:0.34,y:0.58}]),
  connection("river-crown","reed-delta","border",[{mode:"land",weight:1},{mode:"river",weight:1}],[{x:0.38,y:0.61},{x:0.55,y:0.72}]),
  connection("reed-delta","salt-coast","border",[{mode:"land",weight:1},{mode:"river",weight:1}],[{x:0.58,y:0.74},{x:0.75,y:0.82}]),
  connection("salt-coast","outer-isles","separated",[{mode:"sea",weight:2}],[{x:0.84,y:0.79},{x:0.94,y:0.65}]),
  connection("west-levee","cedar-woods","border",[{mode:"land",weight:1}],[{x:0.12,y:0.42},{x:0.13,y:0.20}]),
  connection("cedar-woods","iron-hills","border",[{mode:"land",weight:1}],[{x:0.18,y:0.17},{x:0.30,y:0.16}]),
  connection("iron-hills","high-pass","border",[{mode:"land",weight:2}],[{x:0.31,y:0.16},{x:0.46,y:0.14}]),
  connection("west-levee","southern-savanna","border",[{mode:"land",weight:1}],[{x:0.13,y:0.55},{x:0.24,y:0.82}]),
  connection("cedar-woods","upper-floodplain","border",[{mode:"land",weight:1}],[{x:0.20,y:0.23},{x:0.30,y:0.34}]),
  connection("iron-hills","upper-floodplain","border",[{mode:"land",weight:1}],[{x:0.31,y:0.22},{x:0.34,y:0.33}]),
  connection("upper-floodplain","west-levee","border",[{mode:"land",weight:1}],[{x:0.24,y:0.37},{x:0.16,y:0.42}]),
  connection("river-crown","west-levee","border",[{mode:"land",weight:1}],[{x:0.27,y:0.57},{x:0.13,y:0.48}]),
  connection("river-crown","lake-country","border",[{mode:"land",weight:1},{mode:"river",weight:1}],[{x:0.40,y:0.57},{x:0.54,y:0.52}]),
  connection("river-crown","southern-savanna","border",[{mode:"land",weight:1}],[{x:0.31,y:0.66},{x:0.24,y:0.82}]),
  connection("lake-country","reed-delta","border",[{mode:"land",weight:1},{mode:"river",weight:1}],[{x:0.55,y:0.55},{x:0.55,y:0.70}]),
  connection("lake-country","east-steppe","border",[{mode:"land",weight:1}],[{x:0.57,y:0.48},{x:0.65,y:0.34}]),
  connection("high-pass","copper-basin","border",[{mode:"land",weight:2}],[{x:0.53,y:0.15},{x:0.63,y:0.14}]),
  connection("east-steppe","copper-basin","border",[{mode:"land",weight:1}],[{x:0.66,y:0.30},{x:0.64,y:0.15}]),
  connection("east-steppe","black-marsh","border",[{mode:"land",weight:1}],[{x:0.69,y:0.40},{x:0.77,y:0.57}]),
  connection("east-steppe","obsidian-ridge","border",[{mode:"land",weight:1}],[{x:0.70,y:0.31},{x:0.82,y:0.28}]),
  connection("copper-basin","obsidian-ridge","border",[{mode:"land",weight:2}],[{x:0.69,y:0.16},{x:0.82,y:0.23}]),
  connection("black-marsh","reed-delta","border",[{mode:"land",weight:1}],[{x:0.74,y:0.62},{x:0.62,y:0.70}]),
  connection("black-marsh","salt-coast","border",[{mode:"land",weight:1}],[{x:0.82,y:0.65},{x:0.80,y:0.80}]),
  connection("black-marsh","obsidian-ridge","border",[{mode:"land",weight:2}],[{x:0.84,y:0.47},{x:0.83,y:0.34}]),
  connection("southern-savanna","reed-delta","border",[{mode:"land",weight:1}],[{x:0.34,y:0.80},{x:0.50,y:0.76}]),
];

export const worldMapDefs = Object.freeze({
  riverBasin01: Object.freeze({
    id: "riverBasin01",
    name: "River Basin",
    regions: Object.freeze(regions),
    sites: Object.freeze(sites),
    connections: Object.freeze(connections),
  }),
});
