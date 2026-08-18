import { getRegionPolygon } from "../model/world-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLOURS = Object.freeze({
  black: "#343943",
  green: "#54764f",
  blue: "#4b7191",
  red: "#8e504a",
});

function svgElement(name) {
  return document.createElementNS(SVG_NS, name);
}

function point(definition, regionId) {
  const region = definition.regions.find((entry) => entry.id === regionId);
  return region?.display?.labelPoint ?? { x: 0.5, y: 0.5 };
}

export function createDebugWorldMapDom({
  definition,
  regions = [],
  connections = [],
  connectionCandidates = [],
  selectedRegionId = null,
  validRegionIds = null,
  pendingRegionIds = [],
  onRegionClick,
  testid = "debug-world-map",
} = {}) {
  const svg = svgElement("svg");
  svg.dataset.testid = testid;
  svg.setAttribute("viewBox", "0 0 1000 720");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Interactive world map");
  svg.style.cssText = "width:100%;max-width:660px;min-width:280px;background:#17212a;border:1px solid #8fa0ae;border-radius:8px";
  const regionById = new Map(regions.map((entry) => [entry.id, entry]));
  const activeKeys = new Set(connections.map((entry) =>
    [entry.regionAId, entry.regionBId].sort().join("|")
  ));
  const candidateKeys = new Set(connectionCandidates.map((entry) =>
    [entry.regionAId, entry.regionBId].sort().join("|")
  ));
  const valid = validRegionIds instanceof Set ? validRegionIds : null;
  const pending = new Set(pendingRegionIds);

  for (const candidateKey of candidateKeys) {
    const [a, b] = candidateKey.split("|");
    const from = point(definition, a);
    const to = point(definition, b);
    const line = svgElement("line");
    line.setAttribute("x1", String(from.x * 1000));
    line.setAttribute("y1", String(from.y * 720));
    line.setAttribute("x2", String(to.x * 1000));
    line.setAttribute("y2", String(to.y * 720));
    line.setAttribute("stroke", activeKeys.has(candidateKey) ? "#f5cf74" : "#a0b3c2");
    line.setAttribute("stroke-width", activeKeys.has(candidateKey) ? "5" : "2");
    line.setAttribute("stroke-dasharray", activeKeys.has(candidateKey) ? "" : "7 6");
    line.setAttribute("opacity", activeKeys.has(candidateKey) ? "0.92" : "0.35");
    line.style.pointerEvents = "none";
    svg.append(line);
  }

  definition.regions.forEach((regionDef, index) => {
    const region = regionById.get(regionDef.id) ?? {};
    const polygon = getRegionPolygon(definition, regionDef);
    const shape = svgElement("polygon");
    shape.dataset.testid = testid + "-region-" + regionDef.id;
    shape.setAttribute("points", polygon.map((entry) =>
      Math.round(entry.x * 1000) + "," + Math.round(entry.y * 720)
    ).join(" "));
    const isValid = !valid || valid.has(regionDef.id);
    shape.setAttribute("fill", COLOURS[region.colour] ?? "#4a5763");
    shape.setAttribute("fill-opacity", isValid ? "0.92" : "0.25");
    shape.setAttribute("stroke", regionDef.id === selectedRegionId ? "#fff1a6"
      : pending.has(regionDef.id) ? "#6de1df" : "#d9e4ec");
    shape.setAttribute("stroke-width", regionDef.id === selectedRegionId || pending.has(regionDef.id) ? "6" : "2");
    shape.style.cursor = isValid ? "pointer" : "not-allowed";
    shape.addEventListener("click", () => onRegionClick?.(regionDef.id, isValid));
    const title = svgElement("title");
    title.textContent = "R" + String(index + 1).padStart(2, "0") + " · " + regionDef.name;
    shape.append(title);
    svg.append(shape);

    const label = svgElement("text");
    const labelPoint = regionDef.display.labelPoint;
    label.setAttribute("x", String(labelPoint.x * 1000));
    label.setAttribute("y", String(labelPoint.y * 720));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "25");
    label.setAttribute("font-weight", "700");
    label.setAttribute("fill", "#fff9e9");
    label.style.pointerEvents = "none";
    label.textContent = "R" + String(index + 1).padStart(2, "0") + (region.detailedSettlementEnabled ? " •" : "");
    svg.append(label);
  });
  return svg;
}
