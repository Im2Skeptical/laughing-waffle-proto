import { getDetailedVassalDebugOptions } from "../model/detailed-settlements.js";
import { VASSAL_DEBUG_DRAFT_SCHEMA_VERSION } from "../model/vassal-debug-draft.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function makeDefaultDraft(options) {
  return {
    schemaVersion: VASSAL_DEBUG_DRAFT_SCHEMA_VERSION,
    locationRegionId: options.targetRegions[0]?.id ?? "",
    age: 22,
    prestige: 11,
    cunning: 1,
    wisdom: 1,
    effectiveness: 1,
    intelligence: 1,
    candidateSlot: 1,
  };
}

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
  node.value = String(value ?? "");
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

function number(value, testid, onChange) {
  const node = document.createElement("input");
  node.type = "number";
  node.min = "0";
  node.step = "1";
  node.value = String(value ?? 0);
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

export function createVassalDebugDom({ getState, replaceVassalCandidate, presetController } = {}) {
  const root = document.createElement("section");
  root.dataset.testid = "debug-vassal-lab";
  let editingDraft = null;
  let statusText = "";

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
    const snapshot = presetController?.getSnapshot?.() ?? { presetOptions: [] };
    if (!editingDraft) {
      editingDraft = clone(snapshot.currentDraft ?? makeDefaultDraft(options));
    }

    function update(mutator) {
      const next = clone(editingDraft);
      mutator(next);
      editingDraft = next;
      presetController?.setCurrentDraft?.(next);
      render();
    }

    const intro = document.createElement("p");
    intro.textContent = "Replace one unrevealed candidate with an explicit Life-Map starting state. Life-map nodes and future mortality remain hidden and authoritative.";
    intro.style.cssText = "margin-top:0;color:#d8e2ef";
    root.append(intro);

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;gap:7px;flex-wrap:wrap;align-items:center";
    const saved = select([
      { id: "", label: "Custom / unsaved Vassal" },
      ...snapshot.presetOptions.map((entry) => ({ id: entry.id, label: `Saved - ${entry.name}` })),
    ], snapshot.selectedPresetId, "vassal-debug-preset", () => {});
    const presetName = document.createElement("input");
    presetName.placeholder = "Preset name";
    presetName.dataset.testid = "vassal-debug-preset-name";
    presetName.value = snapshot.presetOptions.find((entry) =>
      entry.id === snapshot.selectedPresetId)?.name ?? "";
    toolbar.append(
      saved,
      button("Load preset", "vassal-debug-load-preset", () => {
        const result = presetController?.loadPreset?.(saved.value);
        if (result?.ok) editingDraft = clone(result.preset.draft);
        render();
      }),
      presetName,
      button("Save preset", "vassal-debug-save-preset", () => {
        const result = presetController?.savePreset?.(presetName.value, editingDraft);
        statusText = result?.ok ? "Preset saved." : (result?.reason ?? "Preset was not saved.");
        render();
      }),
      button("Delete saved", "vassal-debug-delete-preset", () => {
        if (snapshot.selectedPresetId) presetController?.deletePreset?.(snapshot.selectedPresetId);
        render();
      })
    );
    root.append(toolbar);

    const card = document.createElement("fieldset");
    card.style.cssText = "border:1px solid #586876;border-radius:6px;padding:12px;margin-top:12px";
    const legend = document.createElement("legend");
    legend.textContent = "Candidate starting values";
    card.append(legend);
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:9px";
    field(grid, "Settlement", select(options.targetRegions, editingDraft.locationRegionId,
      "vassal-debug-location", (value) => update((draft) => { draft.locationRegionId = value; })));
    field(grid, "Age", number(editingDraft.age, "vassal-debug-age",
      (value) => update((draft) => { draft.age = value; })));
    field(grid, "Prestige", number(editingDraft.prestige, "vassal-debug-prestige",
      (value) => update((draft) => { draft.prestige = value; })));
    for (const stat of ["cunning", "wisdom", "effectiveness", "intelligence"]) {
      field(grid, stat[0].toUpperCase() + stat.slice(1), number(
        editingDraft[stat], `vassal-debug-${stat}`,
        (value) => update((draft) => { draft[stat] = value; })
      ));
    }
    field(grid, "Replace choice", select([
      { id: "1", label: "Vassal 1" },
      { id: "2", label: "Vassal 2" },
      { id: "3", label: "Vassal 3" },
    ], editingDraft.candidateSlot, "vassal-debug-candidate-slot",
    (value) => update((draft) => { draft.candidateSlot = Number(value); })));
    card.append(grid);
    root.append(card);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:9px;align-items:center;margin-top:12px";
    const status = document.createElement("span");
    status.dataset.testid = "vassal-debug-status";
    status.style.color = "#d8e2ef";
    status.textContent = statusText;
    actions.append(button("Replace candidate", "vassal-debug-apply", () => {
      const result = replaceVassalCandidate?.(editingDraft.candidateSlot - 1, clone(editingDraft));
      statusText = result?.ok ? "Candidate replaced." : (result?.reason ?? "Replacement failed.");
      render();
    }), status);
    root.append(actions);
  }

  return {
    element: root,
    root,
    init: () => render(),
    render,
    destroy: () => root.remove(),
  };
}
