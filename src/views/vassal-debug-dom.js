import {
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import {
  getDetailedVassalDebugOptions,
  getElderOrderSummary,
} from "../model/detailed-settlements.js";
import { getGameSetting } from "../model/game-config.js";
import { getWorldConnectionCandidates, getWorldDefinition } from "../model/world-state.js";
import { createDebugWorldMapDom } from "./debug-world-map-dom.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function select(options, value, testid, onChange) {
  const node = document.createElement("select");
  node.dataset.testid = testid;
  node.style.cssText = "min-height:34px;width:100%;box-sizing:border-box";
  for (const option of options) {
    const entry = document.createElement("option");
    entry.value = option.id;
    entry.textContent = option.label ?? option.id;
    node.append(entry);
  }
  node.value = value ?? "";
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

function number(value, testid, onChange, min = 0) {
  const node = document.createElement("input");
  node.type = "number";
  node.value = String(value ?? 0);
  node.min = String(min);
  node.step = "1";
  node.dataset.testid = testid;
  node.style.cssText = "min-height:34px;width:100%;box-sizing:border-box;padding:5px";
  node.addEventListener("change", () => onChange(Number(node.value)));
  return node;
}

function button(label, testid, onClick) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.dataset.testid = testid;
  node.style.cssText = "min-height:34px;padding:5px 9px";
  node.addEventListener("click", onClick);
  return node;
}

function field(parent, labelText, control) {
  const label = document.createElement("label");
  label.style.cssText = "display:grid;gap:3px;color:#e8dfcb;font-size:12px";
  const caption = document.createElement("span");
  caption.textContent = labelText;
  label.append(caption, control);
  parent.append(label);
}

function playerRegionOptions(state) {
  return (state?.world?.regions ?? [])
    .filter((region) => region.controller === "player" && region.detailedSettlementEnabled)
    .map((region) => ({ id: region.id, label: region.id }));
}

function frontierRegionOptions(state, sourceRegionId) {
  const connected = new Set((state?.world?.connections ?? [])
    .filter((entry) => entry.regionAId === sourceRegionId || entry.regionBId === sourceRegionId)
    .map((entry) => entry.regionAId === sourceRegionId ? entry.regionBId : entry.regionAId));
  return (state?.world?.regions ?? [])
    .filter((region) => connected.has(region.id)
      && region.controller === "frontier" && !region.detailedSettlementEnabled)
    .map((region) => ({ id: region.id, label: region.id }));
}

function makeDefaultDraft(state, options) {
  const home = options.targetRegions[0]?.id ?? "";
  const players = playerRegionOptions(state);
  return {
    targetRegionId: home,
    initialAge: getGameSetting(state, "vassalStartingAgeMin"),
    deathAge: getGameSetting(state, "vassalDeathAgeMin"),
    traitId: options.traits[0]?.id ?? "",
    traitPrestigeModifier: options.traits[0]?.prestigeDelta ?? 0,
    professionId: options.professions[0]?.id ?? "",
    candidateSlot: 1,
    interventions: [
      { kind: "practice", targetRegionId: home, practiceId: options.interventionPracticeIds[0] ?? "forage" },
      { kind: "structure", targetRegionId: home, structureId: options.interventionStructureIds[0] ?? "mudHouses" },
      { kind: "globalStructure", structureId: options.interventionStructureIds[0] ?? "mudHouses" },
    ],
    resistanceSnapshot: getElderOrderSummary(state, home).resistance,
    requiredPrestige: [0, 0, 0],
  };
}

export function createVassalDebugDom({ getState, replaceVassalCandidate, presetController } = {}) {
  const root = document.createElement("section");
  root.dataset.testid = "debug-vassal-lab";
  let editingDraft = null;
  let mapAction = null;

  function render() {
    const state = getState?.();
    root.replaceChildren();
    if (!state) {
      root.textContent = "No viewed simulation state.";
      return;
    }
    const options = getDetailedVassalDebugOptions(state);
    if (!options.targetRegions.length) {
      root.textContent = "No player-controlled detailed settlement is available.";
      return;
    }
    const presetSnapshot = presetController?.getSnapshot?.() ?? { presetOptions: [] };
    if (!editingDraft) editingDraft = clone(presetSnapshot.currentDraft ?? makeDefaultDraft(state, options));
    const players = playerRegionOptions(state);
    const definition = getWorldDefinition(state);

    function update(mutator) {
      const next = clone(editingDraft);
      mutator(next);
      editingDraft = next;
      presetController?.setCurrentDraft?.(next);
      render();
    }

    const intro = document.createElement("p");
    intro.textContent = "The Vassal home determines identity and prestige. Each intervention may target its own valid region.";
    intro.style.cssText = "margin-top:0;color:#d8e2ef";
    root.append(intro);

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;gap:7px;flex-wrap:wrap;align-items:center";
    const saved = select([
      { id: "", label: "Custom / unsaved Vassal" },
      ...presetSnapshot.presetOptions.map((entry) => ({ id: entry.id, label: "Saved - " + entry.name })),
    ], presetSnapshot.selectedPresetId, "vassal-debug-preset", () => {});
    const presetName = document.createElement("input");
    presetName.placeholder = "Preset name";
    presetName.dataset.testid = "vassal-debug-preset-name";
    presetName.value = presetSnapshot.presetOptions.find((entry) =>
      entry.id === presetSnapshot.selectedPresetId)?.name ?? "";
    const status = document.createElement("span");
    status.dataset.testid = "vassal-debug-status";
    status.style.color = "#d8e2ef";
    toolbar.append(
      saved,
      button("Load preset", "vassal-debug-load-preset", () => {
        const result = presetController?.loadPreset?.(saved.value);
        if (result?.ok) editingDraft = clone(result.preset.draft);
        render();
      }),
      presetName,
      button("Save preset", "vassal-debug-save-preset", () => {
        presetController?.savePreset?.(presetName.value, editingDraft);
        render();
      }),
      button("Delete saved", "vassal-debug-delete-preset", () => {
        if (presetSnapshot.selectedPresetId) presetController?.deletePreset?.(presetSnapshot.selectedPresetId);
        render();
      }),
      status
    );
    root.append(toolbar);

    const layout = document.createElement("div");
    layout.style.cssText = "display:grid;grid-template-columns:minmax(300px,.9fr) minmax(360px,1.1fr);gap:12px;margin-top:10px";
    const mapPanel = document.createElement("section");
    mapPanel.style.cssText = "background:rgba(14,18,23,.38);border:1px solid rgba(248,234,208,.22);border-radius:7px;padding:10px";
    const actionText = mapAction
      ? "Map selection: " + mapAction.label
      : "Choose Select on map from a Vassal home or intervention card.";
    const actionHint = document.createElement("p");
    actionHint.textContent = actionText;
    actionHint.style.cssText = "margin:0 0 8px;color:#ffd98a;font-size:12px";
    mapPanel.append(actionHint);

    const validIds = (() => {
      if (!mapAction) return null;
      if (mapAction.kind === "home" || mapAction.kind === "practice" || mapAction.kind === "structure") {
        return new Set(players.map((entry) => entry.id));
      }
      if (mapAction.kind === "expandSource") return new Set(players.map((entry) => entry.id));
      if (mapAction.kind === "expandDestination") {
        return new Set(frontierRegionOptions(state, editingDraft.interventions[mapAction.index].sourceRegionId)
          .map((entry) => entry.id));
      }
      if (mapAction.kind === "connectionA") return new Set(players.map((entry) => entry.id));
      if (mapAction.kind === "connectionB") {
        const first = editingDraft.interventions[mapAction.index].regionAId;
        return new Set(getWorldConnectionCandidates(definition)
          .filter((entry) => entry.regionAId === first || entry.regionBId === first)
          .map((entry) => entry.regionAId === first ? entry.regionBId : entry.regionAId)
          .filter((id) => players.some((entry) => entry.id === id)));
      }
      return null;
    })();
    mapPanel.append(createDebugWorldMapDom({
      definition,
      regions: state.world.regions,
      connections: state.world.connections,
      connectionCandidates: getWorldConnectionCandidates(definition),
      selectedRegionId: editingDraft.targetRegionId,
      validRegionIds: validIds,
      pendingRegionIds: mapAction?.kind === "connectionB"
        ? [editingDraft.interventions[mapAction.index].regionAId] : [],
      testid: "vassal-debug-world-map",
      onRegionClick: (regionId, valid) => {
        if (!mapAction || !valid) return;
        const action = mapAction;
        mapAction = action.kind === "connectionA"
          ? { kind: "connectionB", index: action.index, label: "choose connection endpoint B" }
          : null;
        update((draft) => {
          if (action.kind === "home") draft.targetRegionId = regionId;
          else if (action.kind === "practice" || action.kind === "structure") {
            draft.interventions[action.index].targetRegionId = regionId;
          } else if (action.kind === "expandSource") {
            draft.interventions[action.index].sourceRegionId = regionId;
            draft.interventions[action.index].regionId = frontierRegionOptions(state, regionId)[0]?.id ?? "";
          } else if (action.kind === "expandDestination") {
            draft.interventions[action.index].regionId = regionId;
          } else if (action.kind === "connectionA") {
            draft.interventions[action.index].regionAId = regionId;
          } else if (action.kind === "connectionB") {
            draft.interventions[action.index].regionBId = regionId;
          }
        });
      },
    }));
    layout.append(mapPanel);

    const controls = document.createElement("section");
    controls.style.cssText = "display:grid;gap:10px";
    const vassalCard = document.createElement("fieldset");
    vassalCard.style.cssText = "border:1px solid #586876;border-radius:6px;padding:10px";
    const vassalGrid = document.createElement("div");
    vassalGrid.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(150px,1fr));gap:8px";
    field(vassalGrid, "Vassal home", select(players, editingDraft.targetRegionId, "vassal-debug-target",
      (value) => update((draft) => { draft.targetRegionId = value; })));
    field(vassalGrid, "Home map", button("Select home on map", "vassal-debug-select-home-map",
      () => { mapAction = { kind: "home", label: "choose Vassal home settlement" }; render(); }));
    field(vassalGrid, "Starting age", number(editingDraft.initialAge, "vassal-debug-initial-age",
      (value) => update((draft) => { draft.initialAge = value; })));
    field(vassalGrid, "Death age", number(editingDraft.deathAge, "vassal-debug-death-age",
      (value) => update((draft) => { draft.deathAge = value; }), 1));
    field(vassalGrid, "Trait", select(options.traits.map((entry) => ({ id: entry.id, label: entry.id })),
      editingDraft.traitId, "vassal-debug-trait", (value) => update((draft) => { draft.traitId = value; })));
    field(vassalGrid, "Trait prestige", number(editingDraft.traitPrestigeModifier,
      "vassal-debug-trait-modifier", (value) => update((draft) => { draft.traitPrestigeModifier = value; }), -1000));
    field(vassalGrid, "Profession", select(options.professions, editingDraft.professionId,
      "vassal-debug-profession", (value) => update((draft) => { draft.professionId = value; })));
    field(vassalGrid, "Replace choice", select([{ id: "1", label: "Vassal 1" }, { id: "2", label: "Vassal 2" }, { id: "3", label: "Vassal 3" }],
      String(editingDraft.candidateSlot), "vassal-debug-candidate-slot",
      (value) => update((draft) => { draft.candidateSlot = Number(value); })));
    vassalCard.append(vassalGrid);
    controls.append(vassalCard);

    const kindOptions = [
      { id: "practice", label: "Practice" }, { id: "structure", label: "Structure" },
      { id: "expandSettlement", label: "Expand settlement" },
      { id: "globalStructure", label: "Global structure" },
      { id: "connection", label: "Connection" },
    ];
    editingDraft.interventions.forEach((intervention, index) => {
      const card = document.createElement("fieldset");
      card.style.cssText = "border:1px solid #586876;border-radius:6px;padding:10px";
      const legend = document.createElement("legend");
      legend.textContent = "Intervention " + (index + 1);
      card.append(legend);
      const grid = document.createElement("div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(150px,1fr));gap:8px";
      field(grid, "Type", select(kindOptions, intervention.kind, "vassal-debug-intervention-" + (index + 1),
        (kind) => update((draft) => {
          const home = draft.targetRegionId;
          const replacement = kind === "practice"
            ? { kind, targetRegionId: home, practiceId: options.interventionPracticeIds[0] ?? "forage" }
            : kind === "structure"
              ? { kind, targetRegionId: home, structureId: options.interventionStructureIds[0] ?? "mudHouses" }
              : kind === "expandSettlement"
                ? { kind, sourceRegionId: home, regionId: frontierRegionOptions(state, home)[0]?.id ?? "" }
                : kind === "globalStructure"
                  ? { kind, structureId: options.interventionStructureIds[0] ?? "mudHouses" }
                  : { kind, mode: "add", regionAId: home, regionBId: home };
          draft.interventions[index] = replacement;
        })));
      field(grid, "Required prestige", number(editingDraft.requiredPrestige[index],
        "vassal-debug-requirement-" + (index + 1),
        (value) => update((draft) => { draft.requiredPrestige[index] = value; })));
      if (intervention.kind === "practice") {
        field(grid, "Target settlement", select(players, intervention.targetRegionId, "vassal-debug-intervention-target-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].targetRegionId = value; })));
        field(grid, "Target map", button("Select on map", "vassal-debug-select-target-map-" + (index + 1),
          () => { mapAction = { kind: "practice", index, label: "choose practice target" }; render(); }));
        field(grid, "Practice", select(options.interventionPracticeIds.map((id) => ({ id, label: detailedSettlementPracticeDefs[id]?.label ?? id })),
          intervention.practiceId, "vassal-debug-practice-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].practiceId = value; })));
        field(grid, "Slot", number(intervention.slotIndex ?? 0, "vassal-debug-slot-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].slotIndex = value; })));
      } else if (intervention.kind === "structure") {
        field(grid, "Target settlement", select(players, intervention.targetRegionId, "vassal-debug-intervention-target-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].targetRegionId = value; })));
        field(grid, "Target map", button("Select on map", "vassal-debug-select-target-map-" + (index + 1),
          () => { mapAction = { kind: "structure", index, label: "choose structure target" }; render(); }));
        field(grid, "Structure", select(options.interventionStructureIds.map((id) => ({ id, label: settlementStructureDefs[id]?.label ?? id })),
          intervention.structureId, "vassal-debug-structure-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].structureId = value; })));
        field(grid, "Slot", number(intervention.slotIndex ?? 0, "vassal-debug-slot-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].slotIndex = value; })));
      } else if (intervention.kind === "expandSettlement") {
        const frontiers = frontierRegionOptions(state, intervention.sourceRegionId);
        field(grid, "Source settlement", select(players, intervention.sourceRegionId, "vassal-debug-expand-source-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].sourceRegionId = value; draft.interventions[index].regionId = frontierRegionOptions(state, value)[0]?.id ?? ""; })));
        field(grid, "Source map", button("Select on map", "vassal-debug-select-source-map-" + (index + 1),
          () => { mapAction = { kind: "expandSource", index, label: "choose expansion source" }; render(); }));
        field(grid, "Frontier destination", select(frontiers, intervention.regionId, "vassal-debug-expand-destination-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].regionId = value; })));
        field(grid, "Destination map", button("Select on map", "vassal-debug-select-destination-map-" + (index + 1),
          () => { mapAction = { kind: "expandDestination", index, label: "choose adjacent frontier" }; render(); }));
      } else if (intervention.kind === "connection") {
        field(grid, "Mode", select([{ id: "add", label: "Add" }, { id: "remove", label: "Remove" }], intervention.mode,
          "vassal-debug-connection-mode-" + (index + 1), (value) => update((draft) => { draft.interventions[index].mode = value; })));
        field(grid, "Endpoint A", select(players, intervention.regionAId, "vassal-debug-connection-a-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].regionAId = value; })));
        field(grid, "Endpoint B", select(players, intervention.regionBId, "vassal-debug-connection-b-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].regionBId = value; })));
        field(grid, "Endpoints map", button("Select endpoints", "vassal-debug-select-connection-map-" + (index + 1),
          () => { mapAction = { kind: "connectionA", index, label: "choose connection endpoint A" }; render(); }));
      } else {
        field(grid, "Structure", select(options.interventionStructureIds.map((id) => ({ id, label: settlementStructureDefs[id]?.label ?? id })),
          intervention.structureId, "vassal-debug-global-structure-" + (index + 1),
          (value) => update((draft) => { draft.interventions[index].structureId = value; })));
        const global = document.createElement("p");
        global.textContent = "Applies to every player settlement with an empty structure slot.";
        global.style.cssText = "margin:0;color:#d8e2ef;font-size:12px";
        grid.append(global);
      }
      card.append(grid);
      controls.append(card);
    });
    field(controls, "Resistance snapshot", number(editingDraft.resistanceSnapshot, "vassal-debug-resistance",
      (value) => update((draft) => { draft.resistanceSnapshot = value; })));
    const replace = button("Replace choice", "vassal-debug-replace-candidate", async () => {
      const result = await replaceVassalCandidate?.(editingDraft.candidateSlot - 1, editingDraft);
      status.textContent = result?.ok
        ? "Replaced Vassal " + editingDraft.candidateSlot + ". Choose it from the map drawer to apply it."
        : "Replacement failed: " + (result?.reason ?? "unknown error");
      status.style.color = result?.ok ? "#b9f5c7" : "#ffb4a8";
    });
    controls.append(replace);
    layout.append(controls);
    root.append(layout);
  }

  return {
    element: root,
    init: render,
    render,
    destroy() { root.remove(); },
  };
}
