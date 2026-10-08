import { lockDebugEditor } from "./debug-editor-readonly.js";
import { button as labButton, field as labField, disclosure, info, badge, isNarrow } from "./development-lab/elements.js";
import {
  VASSAL_NODE_FAMILIES,
  getVassalLifeMapNodeFamily,
  VASSAL_NORMAL_NODE_FAMILY_IDS,
} from "../defs/gamepieces/vassal-life-map-defs.js";

function element(tag, className = "", text = null) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, testId, handler, variant = "") {
  const node = labButton(label, handler, testId, variant);
  node.classList.add("life-map-lab-button");
  return node;
}

function numberInput(value, testId, handler, { min = null, max = null, step = 1 } = {}) {
  const input = element("input", "life-map-lab-input");
  input.type = "number";
  input.inputMode = "decimal";
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

function field(label, input, options) {
  return labField(label, input, options);
}

function svgNode(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function colorHex(value) {
  return `#${Math.max(0, Number(value) || 0).toString(16).padStart(6, "0")}`;
}

export function createLifeMapLabDom({ controller, readOnly = () => false } = {}) {
  const root = element("div", "life-map-lab-root lab-editor");
  root.dataset.testid = "life-map-lab";
  let unsubscribe = null;
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
    renderContents();
    lockDebugEditor(root, readOnly());
  }

  function renderContents() {
    const snapshot = controller.getSnapshot();
    const draft = snapshot.draft;
    const config = draft.generatorConfig;
    root.replaceChildren();
    const toolbar = element("div", "lab-editor-toolbar");
    toolbar.append(info("life-map-lab", [
      "Tunes deterministic Vassal life-map generation. Changes apply only to the next launch from New run setup; the preview seed only changes this preview.",
      "Lanes and depths shape the grid, route traces carve the paths through it, and smoothing and node gap tidy the layout. Weights set how often each room family appears in the early, mid and late depths.",
    ], { label: "How it works" }));
    root.append(toolbar);

    const workspace = element("div", "life-map-lab-workspace lab-editor-workspace");
    workspace.dataset.testid = "life-map-lab-workspace";
    const settings = element("div", "lab-editor-column");

    const grid = element("div", "lab-editor-grid life-map-lab-grid");
    const numeric = [
      ["Lanes", "laneCount", 2, 12, 1], ["Normal depths", "normalDepthCount", 3, 20, 1],
      ["Route traces", "routeCount", 2, 24, 1], ["Early depths", "earlyDepthCount", 1, 18, 1],
      ["Mid depths", "midDepthCount", 1, 18, 1], ["Layout smoothing", "layoutSmoothing", 0, 1, 0.05],
      ["Minimum node gap", "minimumNodeGap", 0.02, 0.3, 0.01],
    ];
    const help = {
      layoutSmoothing: "0 keeps raw lane positions; 1 smooths them fully.",
      minimumNodeGap: "Smallest distance between nodes, as a share of the map width.",
    };
    for (const [label, key, min, max, step] of numeric) {
      grid.append(field(label, numberInput(config[key], `life-map-lab-${key}`, (value) =>
        controller.updateValue(["generatorConfig", key], value), { min, max, step }), help[key] ? { help: help[key] } : undefined));
    }
    settings.append(disclosure("Topology & layout", [grid], { key: "lifemap:topology", open: true, count: numeric.length, className: "lab-editor-section" }));

    const repeats = element("div", "lab-editor-checks life-map-lab-actions");
    for (const familyId of VASSAL_NORMAL_NODE_FAMILY_IDS) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = config.nonRepeatFamilyIds.includes(familyId);
      checkbox.dataset.testid = `life-map-lab-no-repeat-${familyId}`;
      checkbox.setAttribute("aria-label", `Block repeated ${VASSAL_NODE_FAMILIES[familyId].label}`);
      checkbox.addEventListener("change", () => {
        const next = checkbox.checked
          ? [...new Set([...config.nonRepeatFamilyIds, familyId])]
          : config.nonRepeatFamilyIds.filter((id) => id !== familyId);
        controller.updateValue(["generatorConfig", "nonRepeatFamilyIds"], next);
      });
      repeats.append(field(VASSAL_NODE_FAMILIES[familyId].label, checkbox));
    }
    const blocked = config.nonRepeatFamilyIds.length;
    settings.append(disclosure("Sequential repeats", [
      info("life-map-repeats", "Checked room families never appear twice in a row along a route.", { label: "What this controls" }),
      repeats,
    ], {
      key: "lifemap:repeats", open: !isNarrow(), count: VASSAL_NORMAL_NODE_FAMILY_IDS.length,
      badges: [badge(`${blocked} blocked`, blocked ? "accent" : "")], className: "lab-editor-section",
    }));

    const weights = element("div", "life-map-lab-weight-grid");
    weights.setAttribute("role", "table");
    weights.setAttribute("aria-label", "Room-family weights");
    weights.append(element("span", "lab-editor-th", "Family"), element("span", "lab-editor-th", "Early"), element("span", "lab-editor-th", "Mid"), element("span", "lab-editor-th", "Late"));
    for (const familyId of VASSAL_NORMAL_NODE_FAMILY_IDS) {
      const family = VASSAL_NODE_FAMILIES[familyId];
      const name = element("span", "life-map-lab-family");
      const swatch = element("span", "life-map-lab-swatch", family.glyph ?? "");
      swatch.style.background = colorHex(family.color);
      name.append(swatch, element("span", "", family.label));
      weights.append(name);
      for (const band of ["early", "mid", "late"]) {
        const input = numberInput(config.weights[band][familyId], `life-map-lab-weight-${band}-${familyId}`, (value) =>
          controller.updateValue(["generatorConfig", "weights", band, familyId], value), { min: 0, max: 100, step: 1 });
        input.setAttribute("aria-label", `${family.label} ${band} weight`);
        weights.append(input);
      }
    }
    settings.append(disclosure("Room-family weights", [
      info("life-map-weights", "Relative chance of each family in each depth band. 0 removes the family from that band.", { label: "What this controls" }),
      weights,
    ], { key: "lifemap:weights", open: true, count: VASSAL_NORMAL_NODE_FAMILY_IDS.length, className: "lab-editor-section" }));

    const previewCard = element("section", "lab-editor-card life-map-lab-card life-map-lab-preview-card");
    const previewHead = element("div", "lab-editor-head");
    previewHead.append(element("h3", "", "Preview"));
    if (snapshot.preview) previewHead.append(badge(`${snapshot.preview.nodes.length} nodes`), badge(`${snapshot.preview.edges.length} edges`), badge(`${snapshot.routeTraces.length} routes`));
    previewCard.append(previewHead);
    const previewActions = element("div", "lab-editor-toolbar life-map-lab-actions");
    previewActions.append(
      field("Preview seed", numberInput(draft.previewSeed, "life-map-lab-preview-seed", (value) => controller.setPreviewSeed(value), {
        min: -2147483648, max: 2147483647, step: 1,
      })),
      button("Regenerate", "life-map-lab-regenerate", () => controller.regenerate()),
      button("Next seed", "life-map-lab-next-seed", () => controller.nextPreviewSeed(), "quiet")
    );
    previewCard.append(previewActions);
    renderPreview(previewCard, snapshot.preview);
    const selected = snapshot.preview?.nodes.find((node) => node.id === selectedNodeId);
    previewCard.append(element("p", "lab-editor-legend", selected
      ? `${selected.id} · depth ${selected.depth + 1} · lane ${selected.lane + 1} · ${getVassalLifeMapNodeFamily(selected)?.label}`
      : snapshot.preview ? "Tap a node to see its depth, lane and family." : "Preview unavailable"));
    for (const error of snapshot.diagnostics) previewCard.append(element("p", "lab-callout life-map-lab-error", error));
    workspace.append(previewCard, settings);
    root.append(workspace);
    const status = element("p", `lab-editor-status ${snapshot.status?.tone === "error"
      ? "life-map-lab-error" : "life-map-lab-status"}`, snapshot.status?.message ?? "");
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
