import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contiguousBiomeRegions } from "../../src/model/detailed-settlements/biome-multipliers.js";
import { adjacentRegionIds } from "../../src/model/detailed-settlements/external-world.js";
import { getRegionalMap } from "../../src/model/regional-map/definition.js";
import { generateRegionNames } from "../../src/model/regional-map/names.js";
import { getWorldDefinitionById } from "../../src/model/world-definitions.js";
import { getAdjacentRegionIds, getWorldConnectionCandidates } from "../../src/model/world-state.js";
import { createStart, loadScenario } from "./trace.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const checkedInDir = join(here, "topology");
const formatVersion = 1;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function* jsonFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(path);
    else if (entry.isFile() && entry.name.endsWith(".json")) yield path;
  }
}

function addState(ids, state, label) {
  const id = state?.world?.definitionId;
  assert.equal(typeof id, "string", label + ": expected world.definitionId");
  const definition = getWorldDefinitionById(id);
  assert.ok(definition, label + ": unknown world definition " + id);
  assert.deepEqual(state.world.regions.map(region => region.id),
    definition.regions.map(region => region.id), label + ": world.regions differs from authored order");
  ids.add(id);
}

function referenceIds() {
  const ids = new Set();
  for (const dir of [join(here, "fixtures"), join(here, "../src/tests/vectors")]) {
    for (const path of jsonFiles(dir)) {
      const data = readJson(path);
      const state = data.state ?? data;
      if (state.world) addState(ids, state, path);
    }
  }
  for (const path of jsonFiles(join(here, "corpus"))) {
    const id = readJson(path).config?.worldDefinitionId;
    if (id) ids.add(id);
  }
  // Stage probes and step windows use the trace scenarios. Start at the
  // opening for performance anchors, where the immutable definition is set.
  for (const path of jsonFiles(join(here, "scenarios"))) {
    const id = basename(path, ".json");
    const { scenario } = loadScenario(id);
    const { start } = scenario;
    const opening = start.kind === "performanceAnchor" ? { ...start, kind: "newGame" } : start;
    addState(ids, createStart({ start: opening }, 0), id);
  }
  return ids;
}

function capture(definitionId) {
  const definition = getWorldDefinitionById(definitionId);
  assert.ok(definition, "Unknown world definition " + definitionId);
  const regional = getRegionalMap(definitionId);
  const generatorRevision = regional ? Number(/^regional-v(\d+):/u.exec(definitionId)[1]) : null;
  const neutralNames = generatorRevision === 2
    ? generateRegionNames(regional.map.seed, regional.map.regions, { settlement: true }) : [];
  const state = { world: { definitionId } };
  const biomeComponents = new Set();
  const regions = definition.regions.map(({ id, name, biome }, index) => {
    const neighbors = getAdjacentRegionIds(state, id);
    assert.deepEqual(neighbors, adjacentRegionIds(state, id), definitionId + "/" + id + ": spatial neighbor order");
    for (const neighbor of neighbors) {
      assert.ok(getAdjacentRegionIds(state, neighbor).includes(id), definitionId + "/" + id + ": asymmetric adjacency");
    }
    biomeComponents.add(contiguousBiomeRegions(state, id));
    return { id, name, neutralSettlementName: neutralNames[index] ?? null, biome: biome ?? null, neighbors };
  });
  const order = new Map(regions.map(({ id }, index) => [id, index]));
  const edges = regions.flatMap(({ id, neighbors }) => neighbors
    .filter(next => order.get(next) > order.get(id))
    .map(next => ({ regionAId: id, regionBId: next })));
  assert.deepEqual(edges, getWorldConnectionCandidates(definition), definitionId + ": candidate road order");
  const reachable = new Set([regions[0].id]);
  for (const id of reachable) for (const next of regions[order.get(id)].neighbors) reachable.add(next);
  // Campaign falls back to label-point distance between disconnected regions.
  if (reachable.size !== regions.length) for (const [index, region] of regions.entries()) {
    const point = definition.regions[index].display?.labelPoint;
    if (point) region.labelPoint = point;
  }
  return { formatVersion, definitionId, generatorRevision, regions, biomeComponents: [...biomeComponents] };
}

function main(args) {
  const usage = "Usage: node native/reference/export-topology.mjs [--check] [--out-dir <dir>] [<definition-id|state.json> ...]";
  let check = false;
  let outDir;
  const inputs = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--check" && !check) check = true;
    else if (arg === "--out-dir" && !outDir && args[index + 1] && !args[index + 1].startsWith("-")) {
      outDir = resolve(args[++index]);
    } else {
      assert.ok(!arg.startsWith("-"), usage);
      inputs.push(arg);
    }
  }
  outDir ??= checkedInDir;
  const ids = outDir === checkedInDir || inputs.length === 0 ? referenceIds() : new Set();
  for (const input of inputs) {
    if (existsSync(input) || input.endsWith(".json")) {
      const data = readJson(input);
      addState(ids, data.state ?? data, input);
    } else ids.add(input);
  }

  const files = new Map();
  const manifest = { formatVersion, topologies: [] };
  for (const id of [...ids].sort()) {
    const topology = capture(id);
    const file = id.replace(/[^A-Za-z0-9_-]/gu, "_") + ".json";
    assert.ok(!files.has(file.toLowerCase()) && file.toLowerCase() !== "manifest.json",
      "Topology filename collision for " + id);
    files.set(file.toLowerCase(), { file, data: topology });
    manifest.topologies.push({ definitionId: id, generatorRevision: topology.generatorRevision, file });
  }
  files.set("manifest.json", { file: "manifest.json", data: manifest });
  if (!check) mkdirSync(outDir, { recursive: true });
  for (const { file, data } of files.values()) {
    const path = join(outDir, file);
    const expected = JSON.stringify(data, null, 2) + "\n";
    if (check) {
      assert.ok(existsSync(path) && readFileSync(path, "utf8").replaceAll("\r\n", "\n") === expected,
        path + ": missing or differs from the browser export");
    } else writeFileSync(path, expected);
  }
  if (check) {
    for (const file of readdirSync(outDir)) {
      assert.equal(files.get(file.toLowerCase())?.file, file, join(outDir, file) + ": unexpected file");
    }
  }
  console.log((check ? "Checked " : "Exported ") + ids.size + " world topologies.");
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
