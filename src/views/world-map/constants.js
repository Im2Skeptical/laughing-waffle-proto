import { SETTLEMENT_RESOURCE_COLOURS } from "../../model/graph-metrics.js";

export const MAP_RECT = Object.freeze({ x: 58, y: 88, width: 1640, height: 720 });
export const CIVILIZATION_HEADER_RECT = Object.freeze({
  x: 58,
  y: 16,
  width: 520,
  height: 54,
});
export const CIVILIZATION_RECT = Object.freeze({
  x: 1734,
  y: 88,
  width: 626,
  height: 136,
});
export const DETAIL_RECT = Object.freeze({
  x: 1734,
  y: 240,
  width: 626,
  height: 568,
});
export const REGION_COLOURS = Object.freeze({
  red: 0xb9574d, blue: 0x527da3, green: 0x638c62, black: 0x4d4d52,
});
export const CONTROLLER_COLOURS = Object.freeze({
  player: 0xe8c96c, frontier: 0x8f936e, "external-a": 0xc17a57, "external-b": 0x8b72b1,
});
export const MAX_RENDERED_WORKER_PAWNS = 5;
export const EDGE_TRANSFER_PACKET_MAX_ACTIVE = 36;
export const REGION_DOUBLE_TAP_WINDOW_MS = 350;
export const REGION_FLAG_DOUBLE_TAP_RADIUS = 48;
export const EDGE_TRANSFER_RESOURCE_COLOURS = Object.freeze({
  food: SETTLEMENT_RESOURCE_COLOURS.food,
  population: SETTLEMENT_RESOURCE_COLOURS.totalPopulation,
});
export const PRESSURE_COLOURS = Object.freeze({
  starvation: 0xd9554d,
  overcrowding: 0xe2a83b,
});
export const CURRENCY_COLOURS = Object.freeze({
  spending: 0xe2a83b,
  empty: 0xd9554d,
});
