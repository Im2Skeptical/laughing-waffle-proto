import { regionalPracticeDefs } from "../defs/gamepieces/regional-practice-defs.js";
import { worldMapDefs } from "../defs/world/world-map-defs.js";
import {
  REGION_COLOURS,
  REGION_CONTROLLERS,
  getRegionPolygon,
  getWorldConnectionKey,
} from "../model/world-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const FILL = { red: "#a95047", blue: "#527b9a", green: "#628a61", black: "#4a4a49" };
const CONTROL = { player: "P", frontier: "F", "external-a": "A", "external-b": "B" };
const SCORE_CLASS = (score) => score >= 4 ? "diamond" : score === 3 ? "gold" : score === 2 ? "silver" : "bronze";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, testId, onClick) {
  const node = el("button", "map-lab-button", text);
  node.type = "button";
  if (testId) node.dataset.testid = testId;
  node.addEventListener("click", onClick);
  return node;
}

function select(options, value, testId, onChange) {
  const node = el("select", "map-lab-input");
  if (testId) node.dataset.testid = testId;
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.id;
    item.textContent = option.label;
    node.appendChild(item);
  }
  node.value = value;
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

function regionName(definition, id) {
  return definition.regions.find((entry) => entry.id === id)?.name ?? id;
}

function downloadJson(text) {
  const blob = new Blob([text], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "map-lab-draft.json";
  anchor.click();
  URL.revokeObjectURL(href);
}

export function createMapLabDom({ controller, onRequestClose } = {}) {
  const root = el("div", "map-lab-root");
  root.dataset.testid = "map-lab";
  let connectionMode = false;
  let jsonOpen = false;
  let jsonText = "";
  let unsubscribe = null;

  const style = document.createElement("style");
  style.textContent = `
    .codex-debug-panel.map-lab-active { inset:8px; width:auto; max-width:none; max-height:none; }
    .codex-debug-panel.map-lab-active .codex-debug-body { flex:1; min-height:0; }
    .map-lab-root { display:grid; gap:12px; color:#f6efe3; }
    .map-lab-toolbar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
    .map-lab-button,.map-lab-input { min-height:32px; border:1px solid rgba(224,199,137,.65); border-radius:5px; padding:5px 9px; }
    .map-lab-button { background:#455463; color:#f8ead0; cursor:pointer; }
    .map-lab-button.active { background:#7a5f32; box-shadow:inset 0 0 0 1px #f4cf69; }
    .map-lab-button:disabled { opacity:.42; cursor:not-allowed; }
    .map-lab-input { background:#f8f0df; color:#1d2430; min-width:0; }
    .map-lab-status { min-height:18px; font-size:12px; color:#d8e2ef; }
    .map-lab-status.error { color:#ffb4a8; } .map-lab-status.ok { color:#b9f5c7; } .map-lab-status.warning { color:#ffd18d; }
    .map-lab-layout { display:grid; grid-template-columns:minmax(500px,1.6fr) minmax(360px,1fr); gap:12px; align-items:start; }
    .map-lab-card { background:rgba(14,18,23,.34); border:1px solid rgba(248,234,208,.2); border-radius:7px; padding:10px; min-width:0; }
    .map-lab-title { margin:0 0 8px; color:#e0c789; font-size:13px; font-weight:800; text-transform:uppercase; }
    .map-lab-map { width:100%; height:auto; display:block; background:#637067; border-radius:5px; touch-action:manipulation; }
    .map-lab-edge-halo { stroke:#17232b; stroke-width:8; opacity:.72; pointer-events:none; }
    .map-lab-edge { stroke:#f4e4b2; stroke-width:3.2; opacity:.88; pointer-events:none; }
    .map-lab-candidate-edge { stroke:#d3dde3; stroke-width:2.2; stroke-dasharray:7 7; opacity:.55; pointer-events:none; }
    .map-lab-map.connection-editing .map-lab-edge-halo { stroke:#102b34; stroke-width:10; opacity:.9; }
    .map-lab-map.connection-editing .map-lab-edge { stroke:#72e5f2; stroke-width:4.2; opacity:1; }
    .map-lab-region { stroke:#ddd3b8; stroke-width:1.5; cursor:pointer; }
    .map-lab-region.selected { stroke:#f4cf69; stroke-width:5; }
    .map-lab-region.pending { stroke:#7bdff2; stroke-width:5; }
    .map-lab-map.connection-editing .map-lab-region.connection-candidate { stroke:#b9f4fa; stroke-width:3; }
    .map-lab-map.connection-editing .map-lab-region.connection-unavailable { opacity:.58; }
    .map-lab-label { fill:#fff8e9; font:700 12px Arial,sans-serif; text-anchor:middle; pointer-events:none; paint-order:stroke; stroke:#1d2327; stroke-width:3px; }
    .map-lab-marker { fill:#f4cf69; stroke:#20252a; stroke-width:2; pointer-events:none; }
    .map-lab-marker-text { fill:#20252a; font:800 11px Arial,sans-serif; text-anchor:middle; dominant-baseline:central; pointer-events:none; }
    .map-lab-score { stroke:#20252a; stroke-width:2; pointer-events:none; }
    .map-lab-score.bronze { fill:#b6794c; } .map-lab-score.silver { fill:#c5ccd4; } .map-lab-score.gold { fill:#e0b641; } .map-lab-score.diamond { fill:#83dce9; }
    .map-lab-score-text { fill:#172028; font:800 13px Arial,sans-serif; text-anchor:middle; dominant-baseline:central; pointer-events:none; }
    .map-lab-practices { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
    .map-lab-field-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
    .map-lab-field { display:grid; gap:4px; font-size:11px; color:#e0c789; }
    .map-lab-capacity { font-size:12px; margin:8px 0; color:#cbd5e1; }
    .map-lab-installed { display:grid; gap:5px; }
    .map-lab-installed-row { display:grid; grid-template-columns:26px 1fr repeat(3,32px); gap:5px; align-items:center; font-size:12px; }
    .map-lab-installed-row button { min-height:28px; padding:2px; }
    .map-lab-breakdown { margin:8px 0 0; padding-left:18px; font-size:12px; color:#d8e2ef; }
    .map-lab-eligible { color:#b9f5c7; font-size:12px; } .map-lab-ineligible { color:#ffb4a8; font-size:12px; }
    .map-lab-diagnostics { width:100%; border-collapse:collapse; font-size:11px; }
    .map-lab-diagnostics th,.map-lab-diagnostics td { border-bottom:1px solid rgba(248,234,208,.14); padding:5px 4px; text-align:left; vertical-align:top; }
    .map-lab-diagnostics th { color:#e0c789; }
    .map-lab-note { font-size:11px; color:#cbd5e1; margin-top:7px; }
    .map-lab-warning { color:#ffd18d; }
    .map-lab-json { display:grid; gap:7px; }
    .map-lab-json textarea { min-height:180px; resize:vertical; width:100%; box-sizing:border-box; font:11px/1.35 Consolas,monospace; }
    @media(max-width:820px) {
      .codex-debug-panel.map-lab-active { inset:4px; width:auto; max-width:none; max-height:none; }
      .codex-debug-header { flex-wrap:wrap; }
      .map-lab-layout { grid-template-columns:1fr; }
      .map-lab-field-grid { grid-template-columns:1fr; }
    }
  `;

  function renderMap(snapshot, definition) {
    const wrap = el("div", "map-lab-card");
    wrap.appendChild(el("div", "map-lab-title", connectionMode ? "Connection editing" : "Draft geography"));
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 600");
    svg.classList.add("map-lab-map");
    svg.classList.toggle("connection-editing", connectionMode);
    svg.dataset.testid = "map-lab-map";
    const evaluationByRegion = new Map(snapshot.evaluations.map((entry) => [entry.regionId, entry]));
    const labelPoint = (id) => definition.regions.find((entry) => entry.id === id)?.display?.labelPoint;
    const activeKeys = new Set(snapshot.draft.connections.map((edge) =>
      getWorldConnectionKey(edge.regionAId, edge.regionBId)
    ));
    const candidateRegionIds = new Set((snapshot.connectionCandidates ?? []).flatMap((edge) => {
      if (edge.regionAId === snapshot.connectionStartRegionId) return [edge.regionBId];
      if (edge.regionBId === snapshot.connectionStartRegionId) return [edge.regionAId];
      return [];
    }));
    for (const regionDef of definition.regions) {
      const region = snapshot.draft.regions.find((entry) => entry.id === regionDef.id);
      const polygon = document.createElementNS(SVG_NS, "polygon");
      polygon.setAttribute("points", getRegionPolygon(definition, regionDef)
        .map((point) => `${point.x * 1000},${point.y * 600}`).join(" "));
      polygon.setAttribute("fill", FILL[region.colour] ?? "#666");
      const candidateClass = connectionMode && snapshot.connectionStartRegionId
        ? candidateRegionIds.has(region.id)
          ? " connection-candidate"
          : region.id === snapshot.connectionStartRegionId ? "" : " connection-unavailable"
        : "";
      polygon.setAttribute("class", `map-lab-region${snapshot.selectedRegionId === region.id ? " selected" : ""}${snapshot.connectionStartRegionId === region.id ? " pending" : ""}${candidateClass}`);
      polygon.dataset.regionId = region.id;
      polygon.dataset.testid = `map-lab-region-${region.id}`;
      polygon.setAttribute("role", "button");
      polygon.setAttribute("aria-label", `${regionDef.name} region`);
      polygon.addEventListener("click", () => connectionMode
        ? controller.beginOrToggleConnection(region.id)
        : controller.selectRegion(region.id));
      svg.appendChild(polygon);
    }
    if (connectionMode) {
      for (const edge of snapshot.connectionCandidates ?? []) {
        if (activeKeys.has(getWorldConnectionKey(edge.regionAId, edge.regionBId))) continue;
        const a = labelPoint(edge.regionAId);
        const b = labelPoint(edge.regionBId);
        if (!a || !b) continue;
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", a.x * 1000); line.setAttribute("y1", a.y * 600);
        line.setAttribute("x2", b.x * 1000); line.setAttribute("y2", b.y * 600);
        line.setAttribute("class", "map-lab-candidate-edge");
        line.dataset.connectionCandidate = `${edge.regionAId}|${edge.regionBId}`;
        svg.appendChild(line);
      }
    }
    for (const edge of snapshot.draft.connections) {
      const a = labelPoint(edge.regionAId);
      const b = labelPoint(edge.regionBId);
      if (!a || !b) continue;
      for (const className of ["map-lab-edge-halo", "map-lab-edge"]) {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", a.x * 1000); line.setAttribute("y1", a.y * 600);
        line.setAttribute("x2", b.x * 1000); line.setAttribute("y2", b.y * 600);
        line.setAttribute("class", className);
        line.dataset.connection = `${edge.regionAId}|${edge.regionBId}`;
        svg.appendChild(line);
      }
    }
    for (const regionDef of definition.regions) {
      const region = snapshot.draft.regions.find((entry) => entry.id === regionDef.id);
      const point = regionDef.display.labelPoint;
      const x = point.x * 1000;
      const y = point.y * 600;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.setAttribute("cx", x); marker.setAttribute("cy", y - 13); marker.setAttribute("r", 10);
      marker.setAttribute("class", "map-lab-marker");
      svg.appendChild(marker);
      const markerText = document.createElementNS(SVG_NS, "text");
      markerText.setAttribute("x", x); markerText.setAttribute("y", y - 13);
      markerText.setAttribute("class", "map-lab-marker-text"); markerText.textContent = CONTROL[region.controller];
      svg.appendChild(markerText);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", x); label.setAttribute("y", y + 13); label.setAttribute("class", "map-lab-label");
      label.textContent = regionDef.name;
      svg.appendChild(label);
      const scoreEntry = evaluationByRegion.get(region.id);
      if (scoreEntry?.eligible && scoreEntry.evaluation.ok) {
        const score = scoreEntry.evaluation.score;
        const badge = document.createElementNS(SVG_NS, "circle");
        badge.setAttribute("cx", x + 24); badge.setAttribute("cy", y - 13); badge.setAttribute("r", 11);
        badge.setAttribute("class", `map-lab-score ${SCORE_CLASS(score)}`);
        svg.appendChild(badge);
        const scoreText = document.createElementNS(SVG_NS, "text");
        scoreText.setAttribute("x", x + 24); scoreText.setAttribute("y", y - 13);
        scoreText.setAttribute("class", "map-lab-score-text"); scoreText.textContent = score;
        svg.appendChild(scoreText);
      }
    }
    wrap.appendChild(svg);
    wrap.appendChild(el("div", "map-lab-note", connectionMode
      ? (snapshot.connectionStartRegionId ? `Cyan lines are active; dashed lines are available shared-edge connections. First region: ${regionName(definition, snapshot.connectionStartRegionId)}. Choose a highlighted neighbour.` : "Cyan lines are active; dashed lines are available shared-edge connections. Choose the first region, then an adjacent region.")
      : "Scores appear only on eligible player regions with spare capacity."));
    return wrap;
  }

  function renderInspector(snapshot, definition) {
    const card = el("div", "map-lab-card");
    const region = snapshot.draft.regions.find((entry) => entry.id === snapshot.selectedRegionId);
    card.appendChild(el("div", "map-lab-title", regionName(definition, region.id)));
    const fields = el("div", "map-lab-field-grid");
    const colourField = el("label", "map-lab-field", "Colour");
    colourField.appendChild(select(REGION_COLOURS.map((id) => ({ id, label: id })), region.colour, "map-lab-colour", (colour) => controller.updateRegion(region.id, { colour })));
    const controlField = el("label", "map-lab-field", "Controller");
    controlField.appendChild(select(REGION_CONTROLLERS.map((id) => ({ id, label: id })), region.controller, "map-lab-controller", (controllerId) => controller.updateRegion(region.id, { controller: controllerId })));
    const capacityField = el("label", "map-lab-field", "Capacity");
    const capacity = el("input", "map-lab-input");
    capacity.type = "number"; capacity.min = "0"; capacity.step = "1"; capacity.value = String(region.capacity);
    capacity.dataset.testid = "map-lab-capacity";
    capacity.addEventListener("input", () => {
      const nextCapacity = Number(capacity.value);
      if (Number.isInteger(nextCapacity) && nextCapacity >= 0) {
        controller.updateRegion(region.id, { capacity: nextCapacity });
      }
    });
    capacityField.appendChild(capacity);
    fields.append(colourField, controlField, capacityField);
    card.appendChild(fields);
    const full = region.installedPracticeIds.length >= region.capacity;
    card.appendChild(el("div", `map-lab-capacity${full ? " map-lab-warning" : ""}`, `${region.installedPracticeIds.length} / ${region.capacity} practice slots used${full ? " — capacity full" : ""}`));
    const installed = el("div", "map-lab-installed");
    region.installedPracticeIds.forEach((practiceId, index) => {
      const row = el("div", "map-lab-installed-row");
      row.dataset.testid = `map-lab-installed-${index}`;
      row.appendChild(el("span", "", String(index + 1)), el("span", "", regionalPracticeDefs[practiceId]?.name ?? practiceId));
      const up = button("↑", null, () => controller.movePractice(region.id, index, index - 1));
      up.disabled = index === 0;
      const down = button("↓", null, () => controller.movePractice(region.id, index, index + 1));
      down.disabled = index === region.installedPracticeIds.length - 1;
      const remove = button("×", null, () => controller.removePractice(region.id, index));
      row.append(up, down, remove); installed.appendChild(row);
    });
    const addRow = el("div", "map-lab-toolbar");
    const addSelect = select(Object.values(regionalPracticeDefs).map((entry) => ({ id: entry.id, label: entry.name })), "cultivate", "map-lab-add-practice", () => {});
    const add = button("Add practice", "map-lab-add-practice-button", () => controller.addPractice(region.id, addSelect.value));
    add.disabled = full;
    addRow.append(addSelect, add); installed.appendChild(addRow); card.appendChild(installed);

    const scoreEntry = snapshot.evaluations.find((entry) => entry.regionId === region.id);
    const eligibleText = scoreEntry?.eligible ? "Eligible for hypothetical placement" : `Ineligible: ${scoreEntry?.eligibility?.reason ?? "unknown"}`;
    card.appendChild(el("div", scoreEntry?.eligible ? "map-lab-eligible" : "map-lab-ineligible", eligibleText));
    if (scoreEntry?.evaluation?.ok) {
      card.appendChild(el("div", "map-lab-title", `${regionalPracticeDefs[snapshot.selectedPracticeId].name} score: ${scoreEntry.evaluation.score}`));
      const list = el("ul", "map-lab-breakdown");
      for (const part of scoreEntry.evaluation.breakdown) list.appendChild(el("li", "", part.text));
      card.appendChild(list);
    }
    return card;
  }

  function renderDiagnostics(snapshot, definition) {
    const card = el("div", "map-lab-card");
    card.appendChild(el("div", "map-lab-title", "All-practice diagnostics"));
    const table = el("table", "map-lab-diagnostics");
    const head = document.createElement("thead");
    head.innerHTML = "<tr><th>Practice</th><th>Best region(s)</th><th>Range</th><th>Eligible</th></tr>";
    table.appendChild(head);
    const body = document.createElement("tbody");
    for (const item of snapshot.diagnostics.practices) {
      const row = document.createElement("tr");
      const best = item.bestRegionIds.length ? item.bestRegionIds.map((id) => regionName(definition, id)).join(", ") : "—";
      const range = item.comparisonStatus === "insufficient" ? "insufficient" : `${item.minScore}–${item.maxScore}${item.flat ? " (flat)" : ""}`;
      for (const text of [regionalPracticeDefs[item.practiceId].name, best, range, item.eligibleRegionCount]) row.appendChild(el("td", "", String(text)));
      body.appendChild(row);
    }
    table.appendChild(body); card.appendChild(table);
    const flat = snapshot.diagnostics.practices.filter((entry) => entry.flat).map((entry) => regionalPracticeDefs[entry.practiceId].name);
    card.appendChild(el("div", "map-lab-note", `Flat evaluators: ${flat.join(", ") || "none"}`));
    const shared = snapshot.diagnostics.sharedSoleBestRegions.map((entry) => `${regionName(definition, entry.regionId)} (${entry.practiceIds.map((id) => regionalPracticeDefs[id].name).join(", ")})`);
    card.appendChild(el("div", "map-lab-note", `Shared sole best: ${shared.join("; ") || "none"}`));
    const dominant = snapshot.diagnostics.dominantRegions.map((entry) => `${regionName(definition, entry.regionId)} ×${entry.evaluatorCount}`);
    card.appendChild(el("div", "map-lab-note", `Multi-evaluator leaders: ${dominant.join(", ") || "none"}`));
    if (snapshot.diagnostics.disconnected) card.appendChild(el("div", "map-lab-note map-lab-warning", `Warning: graph has ${snapshot.diagnostics.components.length} disconnected components.`));
    else card.appendChild(el("div", "map-lab-note", "Graph is connected."));
    return card;
  }

  function render() {
    const snapshot = controller.getSnapshot();
    const definition = worldMapDefs[snapshot.draft.worldDefinitionId];
    root.replaceChildren();
    const toolbar = el("div", "map-lab-toolbar");
    const presetSelect = select(
      [
        { id: "", label: "Custom / local draft" },
        ...snapshot.presetOptions.map((entry) => ({ id: entry.id, label: entry.name })),
      ],
      snapshot.selectedPresetId ?? "",
      "map-lab-preset",
      () => {}
    );
    const connectionButton = button(connectionMode ? "Finish connections" : "Edit connections", "map-lab-connections", () => {
      connectionMode = !connectionMode;
      if (!connectionMode) controller.cancelConnection(); else render();
    });
    connectionButton.classList.toggle("active", connectionMode);
    const loadPresetButton = button("Load scenario", "map-lab-load-preset", () => {
      if (!presetSelect.value) return;
        if (globalThis.confirm("Replace the current Map Lab draft with this authored scenario?")) {
          controller.loadPreset(presetSelect.value);
        }
    });
    loadPresetButton.disabled = !presetSelect.value;
    presetSelect.addEventListener("change", () => {
      loadPresetButton.disabled = !presetSelect.value;
    });
    toolbar.append(presetSelect,
      loadPresetButton,
      connectionButton,
      button("Reset default", "map-lab-reset", () => { if (globalThis.confirm("Reset the Map Lab draft to the authored default?")) controller.reset(); }),
      button(jsonOpen ? "Hide JSON" : "Import / Export", "map-lab-json-toggle", () => { jsonOpen = !jsonOpen; if (jsonOpen) jsonText = controller.exportJson(); render(); }),
      button("Start fresh test run", "map-lab-apply", () => {
        if (globalThis.confirm("Discard the active run and start a fresh t=0 test scenario from this draft?")) {
          const result = controller.applyToFreshRun();
          if (result.ok) onRequestClose?.();
        }
      })
    );
    root.appendChild(toolbar);
    const practices = el("div", "map-lab-practices");
    for (const def of Object.values(regionalPracticeDefs)) {
      const practiceButton = button(def.name, `map-lab-score-${def.id}`, () => controller.selectPractice(def.id));
      practiceButton.classList.toggle("active", snapshot.selectedPracticeId === def.id);
      practices.appendChild(practiceButton);
    }
    root.appendChild(practices);
    const status = el("div", `map-lab-status ${snapshot.status.tone}`, snapshot.status.message);
    status.dataset.testid = "map-lab-status";
    root.appendChild(status);
    if (jsonOpen) {
      const card = el("div", "map-lab-card map-lab-json");
      const textarea = el("textarea", "map-lab-input");
      textarea.dataset.testid = "map-lab-json"; textarea.value = jsonText;
      textarea.addEventListener("input", () => { jsonText = textarea.value; });
      const actions = el("div", "map-lab-toolbar");
      actions.append(
        button("Import JSON", "map-lab-import", () => controller.importJson(jsonText)),
        button("Refresh export", "map-lab-export", () => { jsonText = controller.exportJson(); render(); }),
        button("Download", "map-lab-download", () => downloadJson(controller.exportJson()))
      );
      const file = el("input", "map-lab-input"); file.type = "file"; file.accept = "application/json,.json";
      file.addEventListener("change", async () => {
        const selected = file.files?.[0];
        if (!selected) return;
        jsonText = await selected.text(); controller.importJson(jsonText);
      });
      card.append(textarea, actions, file); root.appendChild(card);
    }
    const layout = el("div", "map-lab-layout");
    layout.appendChild(renderMap(snapshot, definition));
    const side = el("div", "map-lab-root");
    side.append(renderInspector(snapshot, definition), renderDiagnostics(snapshot, definition));
    layout.appendChild(side); root.appendChild(layout);
  }

  return {
    element: root,
    init() {
      document.head.appendChild(style);
      unsubscribe = controller.subscribe(render);
      render();
    },
    render,
    destroy() {
      unsubscribe?.(); style.remove(); root.remove();
    },
  };
}
