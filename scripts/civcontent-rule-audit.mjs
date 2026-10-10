// Documentation-consistency audit. Runtime definitions are the comparison source.
// Exit 0 when the audit completes. Exit 1 when parsing, the Foraging fixture,
// or label mapping fails. Content mismatches are findings, not a parse failure.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../src/defs/gamepieces/detailed-settlement-defs.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const implPath = join(root, "docs/civcontent-2.6-implementation.md");
const implText = readFileSync(implPath, "utf8");
const implLines = implText.split(/\n/);
const defText = readFileSync(join(root, "src/defs/gamepieces/detailed-settlement-defs.js"), "utf8");
const defLines = defText.split(/\n/);

const lineByLabel = new Map();
for (let i = 0; i < defLines.length; i++) {
  const match = defLines[i].match(/"label":"((?:\\.|[^"\\])*)"/);
  if (match) lineByLabel.set(JSON.parse(`"${match[1]}"`), i + 1);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
const canon = (value) => JSON.stringify(stable(value));

function splitRow(line) {
  const cells = [];
  let current = "";
  let depth = 0;
  for (const ch of line) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (ch === "|" && depth === 0) {
      cells.push(current.trim());
      current = "";
    } else current += ch;
  }
  cells.push(current.trim());
  return cells.filter((cell, index) => !(index === 0 && cell === "") && !(index === cells.length - 1 && cell === ""));
}

function parseTables() {
  const tables = [];
  let headers = null;
  let rows = [];
  let headerLine = 0;
  const flush = () => {
    if (headers) tables.push({ headerLine, headers, rows });
    headers = null;
    rows = [];
  };
  implLines.forEach((line, index) => {
    if (!line.startsWith("|")) {
      flush();
      return;
    }
    const cells = splitRow(line);
    if (cells.every((cell) => /^-+$/.test(cell.replace(/ /g, "")))) return;
    if (!headers) {
      headers = cells;
      headerLine = index + 1;
      return;
    }
    rows.push({ line: index + 1, cells });
  });
  flush();
  return tables;
}

const tables = parseTables();
const practiceTable = tables.find((table) => table.headers[0] === "Practice");
const structureTable = tables.find((table) => table.headers[0] === "Structure");
if (!practiceTable || !structureTable) {
  console.error("AUDIT_PARSE_FAIL missing practice or structure table");
  process.exit(1);
}

function indexDefs(record) {
  const byLabel = new Map();
  for (const def of Object.values(record)) {
    const key = def.label;
    if (byLabel.has(key)) byLabel.get(key).push(def);
    else byLabel.set(key, [def]);
  }
  return byLabel;
}
const practices = indexDefs(detailedSettlementPracticeDefs);
const structures = indexDefs(settlementStructureDefs);

function poolOf(title) {
  const match = title.match(/\((common|scholar|warrior)\)\s*$/i);
  return match ? match[1].toLowerCase() : null;
}
function bareLabel(title) {
  return title.replace(/\s*\((common|scholar|warrior)\)\s*$/i, "").trim();
}

function runtimePracticeSlice(def, documented) {
  const slice = {};
  for (const key of Object.keys(documented)) {
    if (key === "supportMultiplier") slice[key] = def.supportMultiplier ?? null;
    else if (key === "activation") slice[key] = activationSlice(def.activation, documented.activation);
    else slice[key] = def[key];
  }
  return slice;
}
// Keep activation keys the table omitted when they change timing. Ignore nothing else.
function activationSlice(runtime, documented) {
  const slice = { ...(runtime ?? {}) };
  const docKeys = new Set(Object.keys(documented ?? {}));
  for (const key of Object.keys(slice)) {
    if (docKeys.has(key)) continue;
    const value = slice[key];
    const meaningful = value != null && value !== false && !(Array.isArray(value) && value.length === 0);
    if (!meaningful) delete slice[key];
  }
  return slice;
}
function runtimeStructureSlice(def) {
  return {
    gate: def.specialistGate ?? 0,
    housing: def.housing ?? 0,
    modifiers: def.modifiers ?? [],
    candidateBonus: def.candidateBonus ?? 0,
  };
}

function diffPaths(documented, runtime, path = "") {
  const out = [];
  if (canon(documented) === canon(runtime)) return out;
  if (Array.isArray(documented) || Array.isArray(runtime) || typeof documented !== "object" || documented == null || typeof runtime !== "object" || runtime == null) {
    out.push({ path: path || "(root)", documented, runtime });
    return out;
  }
  for (const key of new Set([...Object.keys(documented), ...Object.keys(runtime)])) {
    out.push(...diffPaths(documented[key], runtime[key], path ? `${path}.${key}` : key));
  }
  return out;
}

const findings = [];
const mapped = { practice: [], structure: [] };
const unmapped = { practice: [], structure: [] };
const ambiguous = [];

function takeDef(tableName, title, index) {
  const label = bareLabel(title);
  const pool = poolOf(title);
  const hits = (index.get(label) ?? []).filter((def) => !pool || def.pool === pool);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) unmapped[tableName].push({ title, line: null, label, pool });
  else ambiguous.push({ tableName, title, ids: hits.map((def) => def.id) });
  return null;
}

// Fixture before the full scan. Foraging's executable cell must parse and match.
const forageRow = practiceTable.rows.find((row) => row.cells[0].startsWith("Foraging "));
let forageDoc;
try {
  forageDoc = JSON.parse(forageRow.cells[3]);
} catch (error) {
  console.error(`AUDIT_FIXTURE_FAIL Foraging JSON ${error.message}`);
  process.exit(1);
}
const forage = practices.get("Foraging")?.[0];
if (!forage || canon(runtimePracticeSlice(forage, forageDoc)) !== canon(forageDoc)) {
  console.error("AUDIT_FIXTURE_FAIL Foraging runtime slice");
  process.exit(1);
}

function auditPracticeRow(row) {
  const [title, mode, authored, executable] = row.cells;
  let documented;
  try {
    documented = JSON.parse(executable);
  } catch (error) {
    console.error(`AUDIT_PARSE_FAIL practice line ${row.line}: ${error.message}`);
    process.exit(1);
  }
  const def = takeDef("practice", title, practices);
  if (!def) {
    unmapped.practice.at(-1).line = row.line;
    return;
  }
  mapped.practice.push(def.id);
  const runtime = runtimePracticeSlice(def, documented);
  for (const item of diffPaths(documented, runtime)) {
    findings.push({
      kind: "table-vs-runtime",
      id: def.id,
      label: def.label,
      field: item.path,
      documented: item.documented,
      runtime: item.runtime,
      source: "src/defs/gamepieces/detailed-settlement-defs.js",
      sourceLine: lineByLabel.get(def.label) ?? null,
      table: `docs/civcontent-2.6-implementation.md:${row.line} Practice`,
      modeDocumented: mode,
      modeRuntime: def.mode,
    });
  }
  if (mode && def.mode && mode.trim() !== def.mode) {
    findings.push({
      kind: "table-vs-runtime",
      id: def.id,
      label: def.label,
      field: "mode",
      documented: mode.trim(),
      runtime: def.mode,
      source: "src/defs/gamepieces/detailed-settlement-defs.js",
      sourceLine: lineByLabel.get(def.label) ?? null,
      table: `docs/civcontent-2.6-implementation.md:${row.line} Mode`,
    });
  }
  auditCardQuantities(def, "practice", row.line, authored);
}

function auditStructureRow(row) {
  const [title, authored, executable] = row.cells;
  let documented;
  try {
    documented = JSON.parse(executable);
  } catch (error) {
    console.error(`AUDIT_PARSE_FAIL structure line ${row.line}: ${error.message}`);
    process.exit(1);
  }
  const def = takeDef("structure", title, structures);
  if (!def) {
    unmapped.structure.at(-1).line = row.line;
    return;
  }
  mapped.structure.push(def.id);
  const runtime = runtimeStructureSlice(def);
  for (const item of diffPaths(documented, runtime)) {
    findings.push({
      kind: "table-vs-runtime",
      id: def.id,
      label: def.label,
      field: item.path,
      documented: item.documented,
      runtime: item.runtime,
      source: "src/defs/gamepieces/detailed-settlement-defs.js",
      sourceLine: lineByLabel.get(def.label) ?? null,
      table: `docs/civcontent-2.6-implementation.md:${row.line} Structure`,
    });
  }
  auditCardQuantities(def, "structure", row.line, authored);
}

function amounts(def, kind) {
  return (def.modifiers ?? []).filter((mod) => mod.kind === kind).map((mod) => mod.amount);
}
function effectAmounts(def, op) {
  return (def.effects ?? []).filter((effect) => effect.op === op).map((effect) => effect.amount);
}

function auditCardQuantities(def, tableName, tableLine, authored) {
  const rule = def.ui?.rule ?? "";
  const housing = [...rule.matchAll(/\+\s*(\d+)\s*Housing/gi)].map((match) => Number(match[1]));
  if (housing.length === 1 && housing[0] !== (def.housing ?? 0) && (def.housing != null || housing[0] !== 0)) {
    if (def.housing != null && housing[0] !== def.housing) {
      findings.push(cardFinding(def, tableName, tableLine, "ui.rule housing", `${housing[0]}`, def.housing));
    }
  }
  const capacityClaims = [...rule.matchAll(/\+\s*(\d+)\s*(?:Stock )?capacity/gi)].map((match) => Number(match[1]));
  const capacityRuntime = amounts(def, "capacity");
  for (const claim of capacityClaims) {
    if (capacityRuntime.length && !capacityRuntime.includes(claim)) {
      findings.push(cardFinding(def, tableName, tableLine, "ui.rule capacity", claim, capacityRuntime));
    }
  }
  const extraCapacity = [...rule.matchAll(/\+\s*(\d+)\s+additional capacity/gi)].map((match) => Number(match[1]));
  for (const claim of extraCapacity) {
    if (!capacityRuntime.includes(claim)) {
      findings.push(cardFinding(def, tableName, tableLine, "ui.rule additional capacity", claim, capacityRuntime));
    }
  }
  if (/Choose one Stock Trait when built/i.test(rule)) {
    const pinned = (def.modifiers ?? []).flatMap((mod) => mod.query?.traitsAny ?? []);
    if (pinned.length) {
      findings.push(cardFinding(def, tableName, tableLine, "ui.rule chosen trait", "player chooses one trait", pinned));
    }
  }
  if (/accumulated Chaos is unchanged/i.test(rule)) {
    const chaos = effectAmounts(def, "addChaos");
    if (chaos.length) findings.push(cardFinding(def, tableName, tableLine, "ui.rule chaos unchanged", "accumulated Chaos is unchanged", chaos));
  }
  if (/grants Research/i.test(rule) && !effectAmounts(def, "research").length) {
    findings.push(cardFinding(def, tableName, tableLine, "ui.rule grants Research", "grants Research", effectAmounts(def, "research")));
  }
  const stockBonus = [...`${rule}`.matchAll(/generate(?:s)? \+(\d+) Stock/gi)].map((match) => Number(match[1]));
  const outputRuntime = amounts(def, "output");
  for (const claim of stockBonus) {
    if (!outputRuntime.includes(claim)) {
      findings.push(cardFinding(def, tableName, tableLine, "ui.rule output bonus", claim, outputRuntime));
    }
  }
  const chargeGain = rule.match(/Gain (\d+) base Charge/);
  if (chargeGain && def.charge && Number(chargeGain[1]) !== def.charge.gain) {
    findings.push(cardFinding(def, tableName, tableLine, "ui.rule charge.gain", Number(chargeGain[1]), def.charge.gain));
  }
  const chargeAt = rule.match(/At (\d+) Charge/);
  if (chargeAt && def.charge && Number(chargeAt[1]) !== def.charge.threshold) {
    findings.push(cardFinding(def, tableName, tableLine, "ui.rule charge.threshold", Number(chargeAt[1]), def.charge.threshold));
  }
  const researchClaims = [...rule.matchAll(/(\d+) Research/g)].map((match) => Number(match[1]));
  const researchRuntime = effectAmounts(def, "research");
  for (const claim of researchClaims) {
    if (researchRuntime.length && !researchRuntime.includes(claim)) {
      findings.push(cardFinding(def, tableName, tableLine, "ui.rule research", claim, researchRuntime));
    }
  }
  const seasonClaims = [...rule.matchAll(/(Spring|Summer|Autumn|Winter)\s+\+(\d+)/g)];
  if (seasonClaims.length && def.effects?.some((effect) => effect.seasonAmounts)) {
    const season = def.effects.find((effect) => effect.seasonAmounts).seasonAmounts;
    for (const match of seasonClaims) {
      const key = match[1].toLowerCase();
      if (season[key] != null && season[key] !== Number(match[2])) {
        findings.push(cardFinding(def, tableName, tableLine, `ui.rule season.${key}`, Number(match[2]), season[key]));
      }
    }
  }
  if (authored && authored !== rule && authored !== def.authoredRule) {
    // Authored column is allowed to be the workbook sentence. No finding here.
  }
}

function cardFinding(def, tableName, tableLine, field, documented, runtime) {
  return {
    kind: "card-vs-runtime",
    id: def.id,
    label: def.label,
    field,
    documented,
    runtime,
    source: "src/defs/gamepieces/detailed-settlement-defs.js",
    sourceLine: lineByLabel.get(def.label) ?? null,
    table: `docs/civcontent-2.6-implementation.md:${tableLine} ${tableName} / ui.rule`,
    card: def.ui?.rule ?? "",
  };
}

for (const row of practiceTable.rows) auditPracticeRow(row);
for (const row of structureTable.rows) auditStructureRow(row);

const practiceIds = new Set(Object.keys(detailedSettlementPracticeDefs));
const structureIds = new Set(Object.keys(settlementStructureDefs));
const practiceMissingFromTable = [...practiceIds].filter((id) => !mapped.practice.includes(id));
const structureMissingFromTable = [...structureIds].filter((id) => !mapped.structure.includes(id));

const bronzeClaims = [
  { id: "quarrying", field: "stockCapacity", expect: 3, source: "docs/minimal-bronze-test-set.md:20" },
  { id: "brewing", field: "stockCapacity", expect: 8, source: "docs/minimal-bronze-test-set.md:20" },
  { id: "saltCuring", field: "stockCapacity", expect: 20, source: "docs/minimal-bronze-test-set.md:20" },
  { id: "milling", field: "stockCapacity", expect: 16, source: "docs/minimal-bronze-test-set.md:20" },
  { id: "recordKeeping", field: "stockCapacity", expect: 8, source: "docs/minimal-bronze-test-set.md:21" },
  { id: "raidingParties", field: "stockCapacity", expect: 20, source: "docs/minimal-bronze-test-set.md:21" },
  { id: "forage", field: "workerCapacity", expect: 1, source: "docs/minimal-bronze-test-set.md:15" },
  { id: "logging", field: "workerCapacity", expect: 1, source: "docs/minimal-bronze-test-set.md:15" },
  { id: "quarrying", field: "workerCapacity", expect: 1, source: "docs/minimal-bronze-test-set.md:15" },
  { id: "masonry", field: "workerCapacity", expect: 1, source: "docs/minimal-bronze-test-set.md:15" },
  { id: "saltGathering", field: "workerCapacity", expect: 1, source: "docs/minimal-bronze-test-set.md:15" },
  { id: "timberHouse", field: "construction.cycles", expect: 8, source: "docs/minimal-bronze-test-set.md:28" },
  { id: "sheepfold", field: "construction.cycles", expect: 4, source: "docs/minimal-bronze-test-set.md:29" },
  { id: "storehouse", field: "construction.cycles", expect: 4, source: "docs/minimal-bronze-test-set.md:29" },
  { id: "granary", field: "modifiers.0.amount", expect: 5, source: "docs/minimal-bronze-test-set.md:28" },
];
const milestoneHousing = [
  ["mudHouses", 30], ["timberHouse", 60], ["stoneHouse", 90],
  ["longhouse", 210], ["tenement", 360], ["greatDwelling", 630],
];
const bronzeMismatches = [];
const allDefs = { ...detailedSettlementPracticeDefs, ...settlementStructureDefs };
for (const claim of bronzeClaims) {
  const def = allDefs[claim.id];
  const actual = claim.field.split(".").reduce((value, key) => value?.[key], def);
  if (actual !== claim.expect) {
    bronzeMismatches.push({ ...claim, runtime: actual, sourceLine: lineByLabel.get(def?.label) ?? null });
  }
}
const milestoneMismatches = milestoneHousing.flatMap(([id, expect]) => {
  const def = settlementStructureDefs[id];
  return def.housing === expect ? [] : [{ id, field: "housing", documented: expect, runtime: def.housing, source: "docs/civilization-milestone.md:92" }];
});

const constructionChecks = [
  ["scriptorium", 3, ["Construction"]],
  ["weighHouse", 3, ["Construction"]],
  ["schoolhouse", 3, ["Construction"]],
];
const constructionMismatches = [];
for (const [id, cycles, traits] of constructionChecks) {
  const construction = settlementStructureDefs[id].construction;
  const got = (construction.consume ?? []).map((item) => item.traits.join("+")).join(",");
  if (construction.cycles !== cycles || got !== traits.join(",")) {
    constructionMismatches.push({
      id, field: "construction", documented: { cycles, traits }, runtime: construction,
      source: "docs/minimal-bronze-test-set.md:32", sourceLine: lineByLabel.get(settlementStructureDefs[id].label),
    });
  }
}

const recipeChecks = [];
function noteRecipe(id, field, expect, source) {
  const def = detailedSettlementPracticeDefs[id];
  const actual = def[field];
  if (canon(actual) !== canon(expect)) {
    recipeChecks.push({ id, label: def.label, field, documented: expect, runtime: actual, source, sourceLine: lineByLabel.get(def.label) });
  }
}
noteRecipe("masonry", "require", [], "docs/minimal-bronze-test-set.md:22");
noteRecipe("weaving", "require", [], "docs/minimal-bronze-test-set.md:22");
noteRecipe("brickmaking", "consume", [], "docs/minimal-bronze-test-set.md:22");
noteRecipe("brickmaking", "require", [{ traits: ["Water"], amount: 1 }, { traits: ["Ore"], amount: 1 }], "docs/minimal-bronze-test-set.md:23");
noteRecipe("brewing", "consume", [{ traits: ["Edible"], amount: 1 }, { traits: ["Storage"], amount: 1 }], "docs/minimal-bronze-test-set.md:23");

const cadenceRows = [];
for (const def of Object.values(detailedSettlementPracticeDefs)) {
  const cadence = def.cadenceMoons ?? def.activation?.cadenceMoons ?? def.source?.cadenceMoons;
  if (cadence == null) continue;
  const row = practiceTable.rows.find((item) => bareLabel(item.cells[0]) === def.label);
  let documented = null;
  if (row) {
    try { documented = JSON.parse(row.cells[3]); } catch { documented = "unparsed"; }
  }
  const mentioned = row ? row.cells[3].includes("cadenceMoons") : false;
  cadenceRows.push({
    id: def.id,
    label: def.label,
    cadenceMoons: def.cadenceMoons ?? null,
    activationCadenceMoons: def.activation?.cadenceMoons ?? null,
    sourceCadence: def.source?.cadence ?? null,
    sourceLine: lineByLabel.get(def.label) ?? null,
    tableLine: row?.line ?? null,
    tableMentionsCadenceMoons: mentioned,
    documentedActivation: documented?.activation ?? null,
  });
  if (row && !mentioned && (def.cadenceMoons != null || def.activation?.cadenceMoons != null)) {
    findings.push({
      kind: "table-vs-runtime",
      id: def.id,
      label: def.label,
      field: "cadenceMoons",
      documented: "omitted from executable cell",
      runtime: def.cadenceMoons ?? def.activation?.cadenceMoons,
      source: "src/defs/gamepieces/detailed-settlement-defs.js",
      sourceLine: lineByLabel.get(def.label) ?? null,
      table: `docs/civcontent-2.6-implementation.md:${row.line} Practice`,
    });
  }
}
const tableIds = new Set([...mapped.practice, ...mapped.structure]);
const summary = {
  practiceTableRows: practiceTable.rows.length,
  structureTableRows: structureTable.rows.length,
  practiceDefs: practiceIds.size,
  structureDefs: structureIds.size,
  mappedPractices: mapped.practice.length,
  mappedStructures: mapped.structure.length,
  unmappedTableRows: unmapped.practice.length + unmapped.structure.length,
  defsAbsentFromTables: practiceMissingFromTable.length + structureMissingFromTable.length,
  tableVsRuntime: findings.filter((item) => item.kind === "table-vs-runtime").length,
  cardVsRuntime: findings.filter((item) => item.kind === "card-vs-runtime").length,
  ambiguous: ambiguous.length,
  bronzeClaimMismatches: bronzeMismatches.length + constructionMismatches.length + recipeChecks.length,
  milestoneHousingMismatches: milestoneMismatches.length,
  practiceMissingFromTable,
  structureMissingFromTable,
  unmapped,
  ambiguous,
};

const artifact = {
  summary,
  findings,
  bronzeMismatches,
  constructionMismatches,
  recipeChecks,
  milestoneMismatches,
  cadenceRows,
  limits: [
    "Executable cells compared field-for-field, key order ignored, array order kept.",
    "Structure slice is gate, housing, modifiers, candidateBonus. Missing gate/housing/candidateBonus compare as 0; missing modifiers as [].",
    "Charge trigger objects are compared only when the executable cell contains them.",
    "cadenceMoons is flagged when present on the definition and absent from the executable cell. Goat Herding is the only such definition.",
    "Card scan covers Housing, capacity, additional capacity, generate +N Stock, chosen trait, Chaos-unchanged, grants Research, base Charge, threshold, N Research, and season +N.",
    "Bronze and milestone numeric claims checked only for the sentences encoded in this script.",
    "Historical workbook civcontent-2.6-source.json is not a mismatch source.",
    "No gameplay values were changed.",
  ],
};
const outPath = join(root, "artifacts", "civcontent-rule-audit.json");
mkdirSync(join(root, "artifacts"), { recursive: true });
writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(`[content-rule-audit] ${summary.mappedPractices} Practices + ${summary.mappedStructures} Structures; table mismatches=${summary.tableVsRuntime}, card mismatches=${summary.cardVsRuntime}; artifact=artifacts/civcontent-rule-audit.json`);
if (ambiguous.length || unmapped.practice.length || unmapped.structure.length) process.exit(1);
