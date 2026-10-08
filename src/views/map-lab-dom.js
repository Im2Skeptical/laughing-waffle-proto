import { lockDebugEditor } from "./debug-editor-readonly.js";
import { button as labButton, field, disclosure, info, badge, isNarrow } from "./development-lab/elements.js";
import { detailedSettlementPracticeDefs, settlementStructureDefs } from "../defs/gamepieces/detailed-settlement-defs.js";
import { worldMapDefs } from "../defs/world/world-map-defs.js";
import { REGION_COLOURS, REGION_CONTROLLERS } from "../model/world-state.js";
import { createDebugWorldMapDom } from "./debug-world-map-dom.js";
import { occupiedCells } from "../model/structure-layout.js";

function getMapLabRegionReference(definition, regionId) {
  const index = (definition?.regions ?? []).findIndex((entry) => entry.id === regionId);
  return index >= 0 ? `R${String(index + 1).padStart(2, "0")}` : regionId;
}

function element(tag, className = "", text = null) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(label, testId, handler, variant = "") {
  const node = labButton(label, handler, testId, variant);
  node.classList.add("map-lab-button");
  return node;
}

function selectField(options, value, testId, handler, label = "") {
  const node = element("select", "map-lab-input");
  node.dataset.testid = testId;
  if (label) node.setAttribute("aria-label", label);
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    node.appendChild(item);
  }
  node.value = value ?? "";
  node.addEventListener("change", () => handler(node.value));
  return node;
}

function numberField(value, testId, handler, { min = 0, step = 1 } = {}) {
  const node = element("input", "map-lab-input");
  node.type = "number";
  node.min = String(min);
  node.step = String(step);
  node.inputMode = "numeric";
  node.value = String(value ?? 0);
  node.dataset.testid = testId;
  node.addEventListener("change", () => handler(Number(node.value)));
  return node;
}

function checkbox(checked, testId, handler) {
  const toggle = element("input", "");
  toggle.type = "checkbox";
  toggle.checked = !!checked;
  toggle.dataset.testid = testId;
  toggle.addEventListener("change", () => handler(toggle.checked));
  return toggle;
}

function labelled(label, control, options) {
  return field(label, control, options);
}

function eldersToText(classState) {
  return (classState?.eldersByAge ?? [])
    .flatMap((cohort) => new Array(cohort.count).fill(cohort.age))
    .join(", ");
}

function elderTextToCohorts(text) {
  const counts = new Map();
  for (const raw of String(text).split(",")) {
    const age = Number(raw.trim());
    if (!Number.isInteger(age) || age < 45) continue;
    counts.set(age, (counts.get(age) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0])
    .map(([age, count]) => ({ age, count }));
}

export function createMapLabDom({ controller, readOnly = () => false } = {}) {
  const root = element("div", "map-lab-root lab-editor");
  root.dataset.testid = "map-lab";
  let unsubscribe = null;
  let mapMode = "inspect";

  function render() {
    renderContents();
    lockDebugEditor(root, readOnly());
  }

  function renderContents() {
    if (readOnly()) mapMode = "inspect";
    const snapshot = controller.getSnapshot();
    const definition = worldMapDefs[snapshot.draft.worldDefinitionId];
    const region = snapshot.draft.regions.find((entry) => entry.id === snapshot.selectedRegionId);
    root.replaceChildren();

    const toolbar = element("div", "lab-editor-toolbar map-lab-toolbar");
    const connectionModeButton = button(
      mapMode === "connection" ? "Connection mode: on" : "Edit shared-edge connections",
      "map-lab-connection-mode",
      () => {
        mapMode = mapMode === "connection" ? "inspect" : "connection";
        controller.cancelConnection();
        render();
      }
    );
    connectionModeButton.classList.toggle("active", mapMode === "connection");
    connectionModeButton.setAttribute("aria-pressed", String(mapMode === "connection"));
    toolbar.append(
      button("Copy settlement sandbox", "map-lab-load-current-game", () => controller.loadCurrentGame(), "quiet"),
      connectionModeButton,
      info("map-lab", [
        "Tap a region on the map to edit it. Solid gold lines are active connections; dashed lines are shared edges that could be connected.",
        "Edit shared-edge connections, then tap two neighbouring regions to add or remove their connection. Each region’s Connections list does the same with one tap.",
        "Copy settlement sandbox replaces this draft with the settlement currently open in the Gym. Food and Currency are hosted Stock: edit each Practice’s Stock in its slot.",
      ], { label: "How it works" })
    );
    root.append(toolbar);

    const mapCard = element("section", "lab-editor-card map-lab-card map-lab-map");
    mapCard.append(createDebugWorldMapDom({
      definition,
      regions: snapshot.draft.regions,
      connections: snapshot.draft.connections,
      connectionCandidates: snapshot.connectionCandidates,
      selectedRegionId: snapshot.selectedRegionId,
      validRegionIds: mapMode === "connection"
        ? new Set(snapshot.draft.regions.map((entry) => entry.id))
        : null,
      pendingRegionIds: snapshot.connectionStartRegionId
        ? [snapshot.connectionStartRegionId] : [],
      onRegionClick: (regionId, valid) => {
        if (!valid) return;
        if (mapMode === "connection") {
          controller.beginOrToggleConnection(regionId);
          if (!controller.getSnapshot().connectionStartRegionId) mapMode = "inspect";
          return;
        }
        controller.selectRegion(regionId);
      },
      testid: "map-lab-world-map",
    }));
    const legend = element("p", "lab-editor-legend");
    if (mapMode === "connection") legend.append(badge("Connection mode", "accent"), " Tap two neighbouring regions.");
    else legend.append(element("span", "map-lab-key map-lab-key-active"), "Connected ", element("span", "map-lab-key map-lab-key-possible"), "Possible");
    mapCard.append(legend);
    const status = element("div",
      `lab-editor-status ${snapshot.status.tone === "error" ? "map-lab-error" : "map-lab-warning"}`,
      snapshot.status.message);
    status.dataset.testid = "map-lab-status";

    const workspace = element("div", "map-lab-workspace lab-editor-workspace");
    workspace.dataset.testid = "map-lab-workspace";
    if (!region) {
      workspace.append(mapCard, element("p", "lab-empty", "Tap a region on the map to edit it."));
      root.append(workspace, status);
      return;
    }

    const layout = element("div", "map-lab-layout");
    const regionName = definition.regions.find((entry) => entry.id === region.id)?.name ?? region.id;
    const used = occupiedCells(region.detailedState?.structureSlots ?? []).filter(Boolean).length;
    const head = element("div", "lab-editor-head");
    head.append(...[element("h3", "", regionName), badge(getMapLabRegionReference(definition, region.id)),
      badge(region.controller, region.controller === "player" ? "accent" : ""),
      region.detailedSettlementEnabled && badge("Detailed", "ok")].filter(Boolean));
    layout.append(head);

    const fields = element("div", "lab-editor-grid map-lab-grid");
    fields.append(
      labelled("Colour", selectField(REGION_COLOURS.map((value) => ({ value, label: value })),
        region.colour, "map-lab-colour", (colour) => controller.updateRegion(region.id, { colour }), "Region colour")),
      labelled("Controller", selectField(REGION_CONTROLLERS.map((value) => ({ value, label: value })),
        region.controller, "map-lab-controller", (value) => controller.updateRegion(region.id, { controller: value }), "Region controller")),
      labelled("Structure capacity", numberField(region.structureCapacity, "map-lab-structure-capacity",
        (structureCapacity) => controller.updateRegion(region.id, { structureCapacity })), { help: `${used} of ${region.structureCapacity} construction cells are in use.` }),
      labelled("Automatic capacity 5–8", checkbox(region.randomizeStructureCapacity, "map-lab-structure-capacity-random",
        (randomizeStructureCapacity) => controller.updateRegion(region.id, { randomizeStructureCapacity }))),
      labelled("Detailed settlement", checkbox(region.detailedSettlementEnabled, "map-lab-detailed-toggle",
        (detailedSettlementEnabled) => controller.updateRegion(region.id, { detailedSettlementEnabled })))
    );
    const regionPanel = [fields];
    if (region.detailedSettlementEnabled && region.controller !== "player") {
      const warning = element("p", "lab-callout map-lab-controller-warning");
      warning.dataset.testid = "map-lab-nonplayer-detailed-warning";
      const help = element("span", "lab-field-help", "External settlements run hosted Stock production and meals; frontier settlements are inactive. Authored neutral templates keep fixed demographics.");
      help.hidden = true;
      const more = labButton("i", () => { help.hidden = !help.hidden; more.setAttribute("aria-expanded", String(!help.hidden)); }, "", "");
      more.className = "lab-info-button"; more.dataset.labUi = "help";
      more.setAttribute("aria-label", "About non-player settlements"); more.setAttribute("aria-expanded", "false");
      warning.append(element("span", "", "Not player controlled: only hosted Stock and meals run. "), more, help);
      regionPanel.push(warning);
    }
    layout.append(disclosure("Region", regionPanel, { key: "map:region", open: true, count: 5, className: "lab-editor-section" }));

    const connectionButtons = element("div", "lab-editor-chips map-lab-slots");
    const connectionKey = (a, b) => [a, b].sort().join("|");
    const activeConnectionKeys = new Set(snapshot.draft.connections.map((entry) =>
      connectionKey(entry.regionAId, entry.regionBId)));
    const neighbours = snapshot.connectionCandidates
      .filter((entry) => entry.regionAId === region.id || entry.regionBId === region.id);
    let connectedCount = 0;
    neighbours.forEach((entry) => {
      const neighbourId = entry.regionAId === region.id ? entry.regionBId : entry.regionAId;
      const connected = activeConnectionKeys.has(connectionKey(region.id, neighbourId));
      if (connected) connectedCount++;
      const control = button(
        `${connected ? "Connected" : "Add"}: ${getMapLabRegionReference(definition, neighbourId)}`,
        `map-lab-connection-${neighbourId}`,
        () => {
          controller.beginOrToggleConnection(region.id);
          controller.beginOrToggleConnection(neighbourId);
        }
      );
      control.setAttribute("aria-pressed", String(connected));
      connectionButtons.append(control);
    });
    if (!neighbours.length) connectionButtons.append(element("p", "lab-empty", "No shared edges."));
    layout.append(disclosure("Connections", [connectionButtons], {
      key: "map:connections", open: !isNarrow(), count: neighbours.length,
      badges: [badge(`${connectedCount} connected`, connectedCount ? "accent" : "")], className: "lab-editor-section",
    }));

    if (!region.detailedSettlementEnabled || !region.detailedState) {
      layout.append(element("p", "lab-empty", "No detailed settlement. Turn on Detailed settlement to edit its population, Practices and Structures."));
      workspace.append(mapCard, layout);
      root.append(workspace, status);
      return;
    }
    const state = region.detailedState;

    const population = element("div", "lab-editor-cohorts");
    let people = 0;
    for (const classId of ["villager", "stranger"]) {
      const cohort = state.populationByClass[classId];
      people += (cohort.children ?? 0) + (cohort.adults ?? 0) + (cohort.eldersByAge ?? []).reduce((sum, entry) => sum + entry.count, 0);
      const group = element("fieldset", "lab-editor-cohort");
      group.append(element("legend", "", classId === "villager" ? "Villagers" : "Strangers"));
      const cohortFields = element("div", "lab-editor-grid");
      const elderInput = element("input", "map-lab-input");
      elderInput.value = eldersToText(cohort);
      elderInput.inputMode = "numeric";
      elderInput.dataset.testid = `map-lab-${classId}-elder-ages`;
      elderInput.addEventListener("change", () => controller.updateDetailedState(region.id, {
        populationByClass: {
          ...state.populationByClass,
          [classId]: { ...cohort, eldersByAge: elderTextToCohorts(elderInput.value) },
        },
      }));
      cohortFields.append(
        labelled("Children", numberField(cohort.children, `map-lab-${classId}-children`, (children) =>
          controller.updateDetailedState(region.id, {
            populationByClass: { ...state.populationByClass, [classId]: { ...cohort, children } },
          }))),
        labelled("Adults", numberField(cohort.adults, `map-lab-${classId}-adults`, (adults) =>
          controller.updateDetailedState(region.id, {
            populationByClass: { ...state.populationByClass, [classId]: { ...cohort, adults } },
          }))),
        labelled("Elder ages", elderInput, { help: "Comma-separated ages, one per Elder (45 or older), e.g. 52, 60, 61." })
      );
      group.append(cohortFields);
      population.append(group);
    }
    layout.append(disclosure("Population", [population], {
      key: "map:population", open: !isNarrow(), badges: [badge(`${people} people`)], className: "lab-editor-section",
    }));

    const practices = element("div", "lab-editor-slots");
    const practiceOptions = [
      { value: "", label: "Empty" },
      ...Object.values(detailedSettlementPracticeDefs).map((def) => ({ value: def.id, label: def.label })),
    ];
    let filledPractices = 0;
    state.practiceSlots.forEach((slot, index) => {
      if (slot) filledPractices++;
      const row = element("div", "lab-editor-slot");
      row.append(element("span", "lab-editor-slot-index", String(index + 1)));
      row.append(selectField(practiceOptions, slot?.practiceId ?? "",
        `map-lab-practice-slot-${index}`, (practiceId) =>
          controller.setPracticeSlot(region.id, index, practiceId || null), `Practice slot ${index + 1}`));
      if (slot) {
        const stock = numberField(slot.stock ?? 0, `map-lab-stock-${index}`, (value) => controller.updateDetailedState(region.id, {
          practiceSlots: state.practiceSlots.map((entry, i) => i === index ? { ...entry, stock: value } : entry),
        }), { min: 0, step: 1 });
        stock.setAttribute("aria-label", `Stock in slot ${index + 1}`);
        const stockLabel = element("label", "lab-editor-stock");
        stockLabel.append(element("span", "", "Stock"), stock);
        row.append(stockLabel);
      }
      practices.append(row);
    });
    layout.append(disclosure("Practices", [practices], {
      key: "map:practices", open: !isNarrow(), count: state.practiceSlots.length,
      badges: [badge(`${filledPractices} filled`, filledPractices ? "accent" : "")], className: "lab-editor-section",
    }));

    const structures = element("div", "lab-editor-slots lab-editor-slots-compact");
    const structureOptions = [
      { value: "", label: "Empty" },
      ...Object.values(settlementStructureDefs).map((def) => ({ value: def.id, label: `${def.label} (${def.footprint} cells)` })),
    ];
    const occupied = occupiedCells(state.structureSlots);
    state.structureSlots.forEach((slot, index) => {
      const covered = occupied[index] && !slot;
      const row = element("div", "lab-editor-slot");
      row.append(element("span", "lab-editor-slot-index", String(index + 1)));
      const control = selectField(structureOptions, occupied[index]?.structureId ?? "",
        `map-lab-structure-slot-${index}`, (structureId) =>
          controller.setStructureSlot(region.id, index, structureId || null), `Construction cell ${index + 1}`);
      control.disabled = !!covered;
      control.title = covered ? `Covered by construction at cell ${occupied[index].origin + 1}` : `Construction origin ${index + 1}`;
      row.append(control);
      if (covered) row.dataset.covered = "true";
      structures.append(row);
    });
    layout.append(disclosure("Structures", [structures], {
      key: "map:structures", open: !isNarrow(),
      badges: [badge(`${used}/${region.structureCapacity} cells`, used ? "accent" : "")], className: "lab-editor-section",
    }));
    const regionIndex = snapshot.draft.regions.indexOf(region);
    for (const warning of snapshot.diagnostics.warnings ?? []) {
      if (warning.includes(region.id) || warning.includes(`regions[${regionIndex}]`)) {
        layout.append(element("p", "lab-callout map-lab-warning", warning));
      }
    }
    workspace.append(mapCard, layout);
    root.append(workspace, status);
  }

  return {
    element: root,
    init() {
      unsubscribe = controller.subscribe(render);
      render();
    },
    render,
    destroy() {
      unsubscribe?.();
      root.remove();
    },
  };
}
