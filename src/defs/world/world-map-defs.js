// Human-authored regional graphs. Pure data only.

import { milestone2BlankDraft } from "./milestone2-map-configs.js";

const vertex = (id, x, y) => ({ id, x, y });

const initialStateForRegion = (id) => {
  const entry = milestone2BlankDraft.regions.find((regionEntry) => regionEntry.id === id);
  return {
    colour: entry.colour,
    capacity: entry.capacity,
    controller: entry.controller,
    installedPracticeIds: [...entry.installedPracticeIds],
  };
};

const region = (
  id,
  name,
  polygonVertexIds,
  labelPoint,
  sitePoint
) => ({
  id,
  name,
  polygonVertexIds,
  display: { labelPoint, sitePoint: sitePoint ?? labelPoint },
  initialState: initialStateForRegion(id),
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

// Milestone 2 Substage 3 blank suitability configuration over immutable geometry.
const regions = [
  region("cedar-woods", "Region01", ["p0","p1","ct","p2"], {x:0.12,y:0.16}, {x:0.12,y:0.21}),
  region("iron-hills", "Region02", ["p1","w0","w1","ct"], {x:0.29,y:0.13}, {x:0.30,y:0.19}),
  region("west-levee", "Region03", ["p2","ct","w1","w2","w3","cm","p3"], {x:0.17,y:0.39}, {x:0.17,y:0.45}),
  region("southern-savanna", "Region04", ["p3","cm","w3","w4","w5","w6","p5","p4"], {x:0.22,y:0.76}, {x:0.24,y:0.83}),
  region("high-pass", "Region05", ["w0","r0","r1","w1"], {x:0.45,y:0.13}, {x:0.45,y:0.18}),
  region("upper-floodplain", "Region06", ["w1","r1","r2","r3","w3","w2"], {x:0.45,y:0.34}, {x:0.34,y:0.49}),
  region("river-crown", "Region07", ["w3","r3","r4","w4"], {x:0.44,y:0.56}, {x:0.45,y:0.60}),
  region("reed-delta", "Region08", ["w4","r4","r5","r6","w6","w5"], {x:0.52,y:0.75}, {x:0.54,y:0.83}),
  region("copper-basin", "Region09", ["r0","e0","e1","r1"], {x:0.63,y:0.13}, {x:0.63,y:0.18}),
  region("east-steppe", "Region10", ["r1","e1","e2","e3","r3","r2"], {x:0.65,y:0.34}, {x:0.66,y:0.40}),
  region("lake-country", "Region11", ["r3","e3","e4","r4"], {x:0.61,y:0.55}, {x:0.61,y:0.60}),
  region("black-marsh", "Region12", ["r4","e4","e5","r5"], {x:0.68,y:0.69}, {x:0.73,y:0.63}),
  region("salt-coast", "Region13", ["r5","e5","e6","r6"], {x:0.77,y:0.85}, {x:0.78,y:0.89}),
  region("obsidian-ridge", "Region14", ["e0","q0","q1","q2","e6","e5","e4","e3","e2","e1"], {x:0.84,y:0.42}, {x:0.84,y:0.49}),
  region("outer-isles", "Region15", ["i0","i1","i2","i3","i4"], {x:0.96,y:0.65}, {x:0.96,y:0.70}),
];

const connections = milestone2BlankDraft.connections;

const sites = [
  {
    id: "river-crown-settlement",
    regionId: "river-crown",
    simulationMode: "detailed",
    name: "Settlement07",
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
