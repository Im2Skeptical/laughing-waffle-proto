import { detailedSettlementPracticeDefs, settlementStructureDefs } from "../defs/gamepieces/detailed-settlement-defs.js";
import { worldMapDefs } from "../defs/world/world-map-defs.js";
import { REGION_COLOURS, REGION_CONTROLLERS } from "../model/world-state.js";

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

function button(label, testId, handler) {
  const node = element("button", "map-lab-button", label);
  node.type = "button";
  node.dataset.testid = testId;
  node.addEventListener("click", handler);
  return node;
}

function selectField(options, value, testId, handler) {
  const node = element("select", "map-lab-input");
  node.dataset.testid = testId;
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
  node.value = String(value ?? 0);
  node.dataset.testid = testId;
  node.addEventListener("change", () => handler(Number(node.value)));
  return node;
}

function textField(value, testId, handler) {
  const node = element("input", "map-lab-input");
  node.type = "text";
  node.value = String(value ?? "");
  node.dataset.testid = testId;
  node.addEventListener("input", () => handler(node.value));
  return node;
}

function labelled(label, control) {
  const node = element("label", "map-lab-field");
  node.append(element("span", "", label), control);
  return node;
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

export function createMapLabDom({ controller, onRequestClose } = {}) {
  const root = element("div", "map-lab-root");
  root.dataset.testid = "map-lab";
  const style = document.createElement("style");
  style.textContent = `
    .codex-debug-panel.map-lab-active{inset:8px;width:auto;max-width:none;max-height:none}
    .map-lab-root{display:grid;gap:10px;color:#f6efe3}
    .map-lab-toolbar,.map-lab-regions,.map-lab-slots{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
    .map-lab-layout{display:grid;grid-template-columns:minmax(280px,.7fr) minmax(420px,1.3fr);gap:10px}
    .map-lab-card{background:rgba(14,18,23,.38);border:1px solid rgba(248,234,208,.22);border-radius:7px;padding:10px}
    .map-lab-button,.map-lab-input{min-height:30px;border:1px solid rgba(224,199,137,.65);border-radius:5px;padding:4px 8px}
    .map-lab-button{background:#455463;color:#f8ead0;cursor:pointer}.map-lab-button.active{background:#7a5f32}
    .map-lab-input{background:#f8f0df;color:#1d2430}.map-lab-field{display:grid;gap:3px;font-size:12px}
    .map-lab-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .map-lab-warning{color:#ffd18d;font-size:12px}.map-lab-error{color:#ffb4a8;font-size:12px}
    .map-lab-json{width:100%;min-height:220px;font-family:monospace}
  `;
  let unsubscribe = null;
  let showJson = false;
  let jsonText = "";
  let scenarioNameText = "";
  let scenarioNameSelectionId = null;

  function render() {
    const snapshot = controller.getSnapshot();
    const definition = worldMapDefs[snapshot.draft.worldDefinitionId];
    const region = snapshot.draft.regions.find((entry) => entry.id === snapshot.selectedRegionId);
    root.replaceChildren();

    const toolbar = element("div", "map-lab-toolbar");
    const selectedScenarioValue = snapshot.selectedLocalScenarioId
      ? `local:${snapshot.selectedLocalScenarioId}`
      : snapshot.selectedPresetId
        ? `authored:${snapshot.selectedPresetId}`
        : "";
    const selectedScenarioSuffix = snapshot.selectedScenarioDirty ? " *" : "";
    const scenarioSelect = selectField(
      [
        { value: "", label: "Custom / unsaved draft" },
        ...snapshot.presetOptions.map((entry) => ({
          value: `authored:${entry.id}`,
          label:
            `Authored - ${entry.name}` +
            (selectedScenarioValue === `authored:${entry.id}`
              ? selectedScenarioSuffix
              : ""),
        })),
        ...snapshot.localScenarioOptions.map((entry) => ({
          value: `local:${entry.id}`,
          label:
            `Saved - ${entry.name}` +
            (selectedScenarioValue === `local:${entry.id}`
              ? selectedScenarioSuffix
              : ""),
        })),
      ],
      selectedScenarioValue,
      "map-lab-preset",
      () => {}
    );
    scenarioSelect.setAttribute("aria-label", "Map Lab scenario");
    const selectedLocal = snapshot.localScenarioOptions.find(
      (entry) => entry.id === snapshot.selectedLocalScenarioId
    );
    if (scenarioNameSelectionId !== snapshot.selectedLocalScenarioId) {
      scenarioNameSelectionId = snapshot.selectedLocalScenarioId;
      scenarioNameText = selectedLocal?.name ?? "";
    }
    const scenarioNameInput = textField(
      scenarioNameText,
      "map-lab-scenario-name",
      (value) => {
        scenarioNameText = value;
      }
    );
    scenarioNameInput.placeholder = "Scenario name";
    scenarioNameInput.maxLength = 80;
    scenarioNameInput.setAttribute("aria-label", "Scenario name");
    scenarioNameInput.style.minWidth = "170px";
    const loadScenarioButton = button(
      "Load scenario",
      "map-lab-load-preset",
      () => {
        if (!scenarioSelect.value) return;
        if (
          snapshot.selectedScenarioDirty &&
          !globalThis.confirm(
            "Replace the current Map Lab draft with the selected scenario?"
          )
        ) {
          return;
        }
        const [kind, id] = scenarioSelect.value.split(":");
        if (kind === "authored") controller.loadPreset(id);
        else if (kind === "local") controller.loadLocalScenario(id);
      }
    );
    loadScenarioButton.disabled = !scenarioSelect.value;
    const saveScenarioButton = button(
      "Save scenario",
      "map-lab-save-scenario",
      () => {
        const result = controller.saveLocalScenario(scenarioNameInput.value);
        if (
          result.requiresOverwrite &&
          globalThis.confirm(
            `Replace the saved browser scenario "${
              result.existingScenarioName
            }"?`
          )
        ) {
          controller.saveLocalScenario(scenarioNameInput.value, {
            overwriteScenarioId: result.existingScenarioId,
          });
        }
      }
    );
    const deleteScenarioButton = button(
      "Delete saved",
      "map-lab-delete-scenario",
      () => {
        const [kind, id] = scenarioSelect.value.split(":");
        if (kind !== "local") return;
        const scenario = snapshot.localScenarioOptions.find(
          (entry) => entry.id === id
        );
        if (
          globalThis.confirm(
            `Delete the saved browser scenario "${
              scenario?.name ?? id
            }"? The current draft will remain open.`
          )
        ) {
          controller.deleteLocalScenario(id);
        }
      }
    );
    deleteScenarioButton.disabled =
      !scenarioSelect.value.startsWith("local:");
    scenarioSelect.addEventListener("change", () => {
      loadScenarioButton.disabled = !scenarioSelect.value;
      deleteScenarioButton.disabled =
        !scenarioSelect.value.startsWith("local:");
    });
    toolbar.append(
      scenarioSelect,
      loadScenarioButton,
      scenarioNameInput,
      saveScenarioButton,
      deleteScenarioButton,
      button("Authored default", "map-lab-reset", () => controller.reset()),
      button("Copy current game", "map-lab-load-current-game", () => controller.loadCurrentGame()),
      button(showJson ? "Hide JSON" : "Import / Export", "map-lab-json-toggle", () => {
        showJson = !showJson;
        jsonText = controller.exportJson();
        render();
      }),
      button("Start fresh test run", "map-lab-apply", () => {
        const result = controller.applyToFreshRun();
        if (result.ok) onRequestClose?.();
      })
    );
    root.append(toolbar);

    const regions = element("div", "map-lab-regions");
    snapshot.draft.regions.forEach((entry, index) => {
      const name = definition.regions[index]?.name ?? entry.id;
      const node = button(
        `${name}${entry.detailedSettlementEnabled ? " •" : ""}`,
        `map-lab-region-${entry.id}`,
        () => controller.selectRegion(entry.id)
      );
      node.setAttribute("aria-label", `${name} region`);
      node.classList.toggle("active", entry.id === snapshot.selectedRegionId);
      regions.append(node);
    });
    root.append(regions);

    const status = element("div",
      snapshot.status.tone === "error" ? "map-lab-error" : "map-lab-warning",
      snapshot.status.message);
    status.dataset.testid = "map-lab-status";
    root.append(status);

    if (showJson) {
      const area = element("textarea", "map-lab-input map-lab-json");
      area.dataset.testid = "map-lab-json";
      area.value = jsonText;
      area.addEventListener("input", () => { jsonText = area.value; });
      root.append(area, button("Import JSON", "map-lab-import", () => controller.importJson(jsonText)));
      return;
    }
    if (!region) return;

    const layout = element("div", "map-lab-layout");
    const mechanics = element("section", "map-lab-card");
    mechanics.append(element("h3", "", definition.regions
      .find((entry) => entry.id === region.id)?.name ?? region.id));
    const fields = element("div", "map-lab-grid");
    fields.append(
      labelled("Colour", selectField(REGION_COLOURS.map((value) => ({ value, label: value })),
        region.colour, "map-lab-colour", (colour) => controller.updateRegion(region.id, { colour }))),
      labelled("Controller", selectField(REGION_CONTROLLERS.map((value) => ({ value, label: value })),
        region.controller, "map-lab-controller", (value) => controller.updateRegion(region.id, { controller: value }))),
      labelled("Structure capacity", numberField(region.structureCapacity, "map-lab-structure-capacity",
        (structureCapacity) => controller.updateRegion(region.id, { structureCapacity }))),
      labelled("Detailed settlement", (() => {
        const toggle = element("input", "");
        toggle.type = "checkbox";
        toggle.checked = region.detailedSettlementEnabled;
        toggle.dataset.testid = "map-lab-detailed-toggle";
        toggle.addEventListener("change", () => controller.updateRegion(region.id, {
          detailedSettlementEnabled: toggle.checked,
        }));
        return toggle;
      })())
    );
    mechanics.append(fields);
    const used = region.detailedState?.structureSlots?.filter(Boolean).length ?? 0;
    mechanics.append(element("p", "map-lab-warning",
      `${used} / ${region.structureCapacity} structure slots used`));
    mechanics.append(element("h4", "", "Shared-edge connections"));
    const connectionButtons = element("div", "map-lab-slots");
    const connectionKey = (a, b) => [a, b].sort().join("|");
    const activeConnectionKeys = new Set(snapshot.draft.connections.map((entry) =>
      connectionKey(entry.regionAId, entry.regionBId)));
    snapshot.connectionCandidates
      .filter((entry) => entry.regionAId === region.id || entry.regionBId === region.id)
      .forEach((entry) => {
        const neighbourId = entry.regionAId === region.id ? entry.regionBId : entry.regionAId;
        const connected = activeConnectionKeys.has(connectionKey(region.id, neighbourId));
        connectionButtons.append(button(
          `${connected ? "Connected" : "Add"}: ${getMapLabRegionReference(definition, neighbourId)}`,
          `map-lab-connection-${neighbourId}`,
          () => {
            controller.beginOrToggleConnection(region.id);
            controller.beginOrToggleConnection(neighbourId);
          }
        ));
      });
    mechanics.append(connectionButtons);
    layout.append(mechanics);

    const detail = element("section", "map-lab-card");
    if (!region.detailedSettlementEnabled || !region.detailedState) {
      detail.append(element("p", "", "This region has no detailed settlement."));
      layout.append(detail);
      root.append(layout);
      return;
    }
    const state = region.detailedState;
    detail.append(element("h3", "", "Detailed settlement"));
    const foodFields = element("div", "map-lab-grid");
    foodFields.append(
      labelled("Stored food", numberField(state.storedFood, "map-lab-stored-food",
        (storedFood) => controller.updateDetailedState(region.id, { storedFood }), { step: 0.0001 })),
        labelled("Loose food", numberField(state.looseFood, "map-lab-loose-food",
          (looseFood) => controller.updateDetailedState(region.id, { looseFood }), { step: 0.0001 })),
        labelled("Currency", numberField(state.currency, "map-lab-currency",
          (currency) => controller.updateDetailedState(region.id, { currency }), { step: 0.0001 }))
    );
    detail.append(foodFields);

    for (const classId of ["villager", "stranger"]) {
      const cohort = state.populationByClass[classId];
      const group = element("fieldset", "map-lab-card");
      group.append(element("legend", "", classId));
      const cohortFields = element("div", "map-lab-grid");
      cohortFields.append(
        labelled("Children", numberField(cohort.children, `map-lab-${classId}-children`, (children) =>
          controller.updateDetailedState(region.id, {
            populationByClass: {
              ...state.populationByClass,
              [classId]: { ...cohort, children },
            },
          }))),
        labelled("Adults", numberField(cohort.adults, `map-lab-${classId}-adults`, (adults) =>
          controller.updateDetailedState(region.id, {
            populationByClass: {
              ...state.populationByClass,
              [classId]: { ...cohort, adults },
            },
          })))
      );
      const elderInput = element("input", "map-lab-input");
      elderInput.value = eldersToText(cohort);
      elderInput.dataset.testid = `map-lab-${classId}-elder-ages`;
      elderInput.addEventListener("change", () => controller.updateDetailedState(region.id, {
        populationByClass: {
          ...state.populationByClass,
          [classId]: { ...cohort, eldersByAge: elderTextToCohorts(elderInput.value) },
        },
      }));
      group.append(cohortFields, labelled("Elder ages (comma separated)", elderInput));
      detail.append(group);
    }

    detail.append(element("h4", "", `${state.practiceSlots.length} practice slots`));
    const practices = element("div", "map-lab-slots");
    const practiceOptions = [
      { value: "", label: "Empty" },
      ...Object.values(detailedSettlementPracticeDefs).map((def) => ({ value: def.id, label: def.label })),
    ];
    state.practiceSlots.forEach((slot, index) => {
      practices.append(selectField(practiceOptions, slot?.practiceId ?? "",
        `map-lab-practice-slot-${index}`, (practiceId) =>
          controller.setPracticeSlot(region.id, index, practiceId || null)));
    });
    detail.append(practices, element("h4", "", "Structures"));
    const structures = element("div", "map-lab-slots");
    const structureOptions = [
      { value: "", label: "Empty" },
      ...Object.values(settlementStructureDefs).map((def) => ({ value: def.id, label: def.label })),
    ];
    state.structureSlots.forEach((slot, index) => {
      structures.append(selectField(structureOptions, slot?.structureId ?? "",
        `map-lab-structure-slot-${index}`, (structureId) =>
          controller.setStructureSlot(region.id, index, structureId || null)));
    });
    detail.append(structures);
    for (const warning of snapshot.diagnostics.warnings ?? []) {
      if (warning.includes(region.id) || warning.includes(`regions[${snapshot.draft.regions.indexOf(region)}]`)) {
        detail.append(element("p", "map-lab-warning", warning));
      }
    }
    layout.append(detail);
    root.append(layout);
  }

  return {
    element: root,
    init() {
      document.head.append(style);
      unsubscribe = controller.subscribe(render);
      render();
    },
    render,
    destroy() {
      unsubscribe?.();
      style.remove();
      root.remove();
    },
  };
}
