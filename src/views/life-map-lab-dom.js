import {
  VASSAL_NODE_FAMILIES,
  VASSAL_NORMAL_NODE_FAMILY_IDS,
} from "../defs/gamepieces/vassal-life-map-defs.js";

function element(tag, className = "", text = null) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, testId, handler) {
  const node = element("button", "life-map-lab-button", label);
  node.type = "button";
  node.dataset.testid = testId;
  node.addEventListener("click", handler);
  return node;
}

function numberInput(value, testId, handler, { min = null, max = null, step = 1 } = {}) {
  const input = element("input", "life-map-lab-input");
  input.type = "number";
  input.value = String(value);
  if (min != null) input.min = String(min);
  if (max != null) input.max = String(max);
  input.step = String(step);
  input.dataset.testid = testId;
  input.addEventListener("change", () => handler(Number(input.value)));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
  return input;
}

function field(label, input) {
  const root = element("label", "life-map-lab-field");
  root.append(element("span", "", label), input);
  return root;
}

function svgNode(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function colorHex(value) {
  return `#${Math.max(0, Number(value) || 0).toString(16).padStart(6, "0")}`;
}

export function createLifeMapLabDom({ controller } = {}) {
  const root = element("div", "life-map-lab-root");
  root.dataset.testid = "life-map-lab";
  const style = document.createElement("style");
  style.textContent = `
    .life-map-lab-root{display:grid;gap:10px;color:#f6efe3}
    .life-map-lab-toolbar,.life-map-lab-actions{display:flex;flex-wrap:wrap;gap:7px;align-items:end}
    .life-map-lab-workspace{display:grid;grid-template-columns:minmax(420px,.85fr) minmax(600px,1.15fr);gap:10px;align-items:start}
    .life-map-lab-card{background:rgba(14,18,23,.38);border:1px solid rgba(248,234,208,.22);border-radius:7px;padding:10px;min-width:0}
    .life-map-lab-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .life-map-lab-weight-grid{display:grid;grid-template-columns:minmax(130px,1.5fr) repeat(3,minmax(70px,1fr));gap:5px;align-items:center}
    .life-map-lab-button,.life-map-lab-input{min-height:30px;border:1px solid rgba(224,199,137,.65);border-radius:5px;padding:4px 8px;box-sizing:border-box}
    .life-map-lab-button{background:#455463;color:#f8ead0;cursor:pointer}.life-map-lab-input{background:#f8f0df;color:#1d2430;width:100%}
    .life-map-lab-toolbar>.life-map-lab-input{width:auto;min-width:170px}
    .life-map-lab-preview{display:block;width:100%;height:auto;min-height:410px;background:#1c242b;border:1px solid #586876;border-radius:6px}
    .life-map-lab-json{width:100%;min-height:220px;font-family:monospace;box-sizing:border-box}
    .life-map-lab-status{font-size:12px;color:#b9f5c7}.life-map-lab-error{font-size:12px;color:#ffb4a8}
    @media(max-width:1100px){.life-map-lab-workspace{grid-template-columns:1fr}.life-map-lab-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  let unsubscribe = null;
  let presetName = "";
  let jsonVisible = false;
  let jsonText = "";
  let selectedNodeId = null;

  function renderPreview(parent, graph) {
    const svg = svgNode("svg", { viewBox: "0 0 1000 480", class: "life-map-lab-preview" });
    svg.dataset.testid = "life-map-lab-preview";
    if (!graph) { parent.append(svg); return; }
    const point = (node) => ({ x: 55 + 890 * node.position.x, y: 45 + 390 * node.position.y });
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const edge of graph.edges) {
      const from = byId.get(edge.fromNodeId);
      const to = byId.get(edge.toNodeId);
      if (!from || !to) continue;
      const a = point(from); const b = point(to);
      svg.append(svgNode("line", {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: "#697783", "stroke-width": 2.2, "stroke-linecap": "round",
      }));
    }
    for (const node of graph.nodes) {
      const p = point(node);
      const group = svgNode("g", { role: "button", tabindex: 0 });
      group.style.cursor = "pointer";
      group.dataset.nodeId = node.id;
      group.addEventListener("click", () => { selectedNodeId = node.id; render(); });
      group.append(svgNode("circle", {
        cx: p.x, cy: p.y, r: node.family === "legacy" ? 20 : 15,
        fill: colorHex(VASSAL_NODE_FAMILIES[node.family]?.color),
        stroke: selectedNodeId === node.id ? "#fff2bd" : "#d7b450",
        "stroke-width": selectedNodeId === node.id ? 4 : 2,
      }));
      const text = svgNode("text", {
        x: p.x, y: p.y + 4, "text-anchor": "middle", fill: "#ffffff",
        "font-size": node.family === "legacy" ? 13 : 10, "font-family": "sans-serif",
      });
      text.textContent = VASSAL_NODE_FAMILIES[node.family]?.glyph ?? "?";
      group.append(text);
      svg.append(group);
    }
    parent.append(svg);
  }

  function render() {
    const snapshot = controller.getSnapshot();
    const draft = snapshot.draft;
    const config = draft.generatorConfig;
    root.replaceChildren(style);
    root.append(element("h3", "", "Life Map Lab"));
    root.append(element("p", "", "Tune deterministic Vassal map generation. Changes are inert until Start new run."));

    const toolbar = element("div", "life-map-lab-toolbar");
    const preset = element("select", "life-map-lab-input");
    preset.dataset.testid = "life-map-lab-preset";
    const options = [{ id: "authored", name: "Authored default" }, ...snapshot.presetOptions];
    for (const entry of options) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = `${entry.name}${entry.id === snapshot.selectedPresetId && snapshot.selectedPresetDirty ? " *" : ""}`;
      preset.append(option);
    }
    preset.value = options.some((entry) => entry.id === snapshot.selectedPresetId)
      ? snapshot.selectedPresetId : "";
    const nameInput = element("input", "life-map-lab-input");
    nameInput.placeholder = "Preset name";
    nameInput.value = presetName;
    nameInput.dataset.testid = "life-map-lab-preset-name";
    nameInput.addEventListener("input", () => { presetName = nameInput.value; });
    toolbar.append(
      preset,
      button("Load", "life-map-lab-load-preset", () => controller.loadPreset(preset.value)),
      nameInput,
      button("Save", "life-map-lab-save-preset", () => controller.savePreset(nameInput.value)),
      button("Delete", "life-map-lab-delete-preset", () => {
        if (preset.value !== "authored") controller.deletePreset(preset.value);
      }),
      button("Reset authored", "life-map-lab-reset", () => controller.reset()),
      button("Import / Export", "life-map-lab-json-toggle", () => {
        jsonVisible = !jsonVisible;
        if (jsonVisible) jsonText = controller.exportJson();
        render();
      })
    );
    root.append(toolbar);
    if (jsonVisible) {
      const card = element("div", "life-map-lab-card");
      const area = element("textarea", "life-map-lab-json");
      area.dataset.testid = "life-map-lab-json";
      area.value = jsonText;
      area.addEventListener("input", () => { jsonText = area.value; });
      card.append(area, button("Import JSON", "life-map-lab-json-import", () => controller.importJson(area.value)));
      root.append(card);
    }

    const workspace = element("div", "life-map-lab-workspace");
    workspace.dataset.testid = "life-map-lab-workspace";
    const settings = element("section", "life-map-lab-card");
    settings.append(element("h4", "", "Topology and layout"));
    const grid = element("div", "life-map-lab-grid");
    const numeric = [
      ["Lanes", "laneCount", 2, 12, 1], ["Normal depths", "normalDepthCount", 3, 20, 1],
      ["Route traces", "routeCount", 2, 24, 1], ["Early depths", "earlyDepthCount", 1, 18, 1],
      ["Mid depths", "midDepthCount", 1, 18, 1], ["Layout smoothing", "layoutSmoothing", 0, 1, 0.05],
      ["Minimum node gap", "minimumNodeGap", 0.02, 0.3, 0.01],
    ];
    for (const [label, key, min, max, step] of numeric) {
      grid.append(field(label, numberInput(config[key], `life-map-lab-${key}`, (value) =>
        controller.updateValue(["generatorConfig", key], value), { min, max, step })));
    }
    settings.append(grid, element("h4", "", "Sequential repeats"));
    const repeats = element("div", "life-map-lab-actions");
    for (const familyId of VASSAL_NORMAL_NODE_FAMILY_IDS) {
      const label = element("label", "life-map-lab-field");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = config.nonRepeatFamilyIds.includes(familyId);
      checkbox.dataset.testid = `life-map-lab-no-repeat-${familyId}`;
      checkbox.addEventListener("change", () => {
        const next = checkbox.checked
          ? [...new Set([...config.nonRepeatFamilyIds, familyId])]
          : config.nonRepeatFamilyIds.filter((id) => id !== familyId);
        controller.updateValue(["generatorConfig", "nonRepeatFamilyIds"], next);
      });
      label.append(checkbox, document.createTextNode(` Block ${VASSAL_NODE_FAMILIES[familyId].label}`));
      repeats.append(label);
    }
    settings.append(repeats, element("h4", "", "Room-family weights"));
    const weights = element("div", "life-map-lab-weight-grid");
    weights.append(element("strong", "", "Family"), element("strong", "", "Early"), element("strong", "", "Mid"), element("strong", "", "Late"));
    for (const familyId of VASSAL_NORMAL_NODE_FAMILY_IDS) {
      weights.append(element("span", "", VASSAL_NODE_FAMILIES[familyId].label));
      for (const band of ["early", "mid", "late"]) {
        weights.append(numberInput(config.weights[band][familyId], `life-map-lab-weight-${band}-${familyId}`, (value) =>
          controller.updateValue(["generatorConfig", "weights", band, familyId], value), { min: 0, max: 100, step: 1 }));
      }
    }
    settings.append(weights);

    const previewCard = element("section", "life-map-lab-card");
    const previewActions = element("div", "life-map-lab-actions");
    previewActions.append(
      field("Preview seed", numberInput(draft.previewSeed, "life-map-lab-preview-seed", (value) => controller.setPreviewSeed(value), {
        min: -2147483648, max: 2147483647, step: 1,
      })),
      button("Regenerate", "life-map-lab-regenerate", () => controller.regenerate()),
      button("Next seed", "life-map-lab-next-seed", () => controller.nextPreviewSeed())
    );
    previewCard.append(previewActions);
    renderPreview(previewCard, snapshot.preview);
    const selected = snapshot.preview?.nodes.find((node) => node.id === selectedNodeId);
    const summary = selected
      ? `${selected.id} · depth ${selected.depth + 1} · lane ${selected.lane + 1} · ${VASSAL_NODE_FAMILIES[selected.family]?.label}`
      : snapshot.preview
        ? `${snapshot.preview.nodes.length} nodes · ${snapshot.preview.edges.length} edges · ${snapshot.routeTraces.length} route traces`
        : "Preview unavailable";
    previewCard.append(element("p", "", summary));
    for (const error of snapshot.diagnostics) previewCard.append(element("p", "life-map-lab-error", error));
    workspace.append(settings, previewCard);
    root.append(workspace);
    const status = element("p", snapshot.status?.tone === "error"
      ? "life-map-lab-error" : "life-map-lab-status", snapshot.status?.message ?? "");
    status.dataset.testid = "life-map-lab-status";
    root.append(status);
  }

  return {
    element: root,
    init() { if (!unsubscribe) unsubscribe = controller.subscribe(render); render(); },
    render,
    destroy() { unsubscribe?.(); unsubscribe = null; root.remove(); },
  };
}
