import {
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import {
  getDetailedVassalDebugOptions,
  getElderOrderSummary,
} from "../model/detailed-settlements.js";
import { getGameSetting } from "../model/game-config.js";

function makeSelect(options) {
  const select = document.createElement("select");
  select.style.cssText = "min-height:34px;width:100%;box-sizing:border-box";
  for (const entry of options) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.label ?? entry.id;
    select.appendChild(option);
  }
  return select;
}

function makeNumber(value, min = 0) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  input.min = String(min);
  input.step = "1";
  input.style.cssText = "min-height:34px;width:100%;box-sizing:border-box;padding:5px";
  return input;
}

function addField(grid, labelText, input) {
  const label = document.createElement("label");
  label.style.cssText = "display:grid;gap:4px;color:#e8dfcb;font-size:12px";
  const caption = document.createElement("span");
  caption.textContent = labelText;
  label.append(caption, input);
  grid.appendChild(label);
  return input;
}

export function createVassalDebugDom({
  getState,
  replaceVassalCandidate,
  presetController,
} = {}) {
  const root = document.createElement("section");
  root.dataset.testid = "debug-vassal-lab";
  let loadedDraft = null;
  let selectedPresetId = null;

  function render() {
    const state = getState?.();
    root.replaceChildren();
    if (!state) {
      root.textContent = "No viewed simulation state.";
      return;
    }
    const options = getDetailedVassalDebugOptions(state);
    if (options.targetRegions.length === 0) {
      root.textContent = "No player-controlled detailed settlement is available.";
      return;
    }

    const intro = document.createElement("p");
    intro.textContent =
      "Replace one displayed Vassal choice with a fully specified test candidate. The candidate still must be selected from the map drawer to create a timeline action.";
    intro.style.cssText = "margin-top:0;color:#d8e2ef";
    root.appendChild(intro);

    const presetSnapshot = presetController?.getSnapshot?.() ?? { presetOptions: [] };
    const presetToolbar = document.createElement("div");
    presetToolbar.style.cssText = "display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:10px";
    const preset = makeSelect([
      { id: "", label: "Custom / unsaved Vassal" },
      ...presetSnapshot.presetOptions.map((entry) => ({
        id: entry.id,
        label: `Saved - ${entry.name}`,
      })),
    ]);
    preset.style.cssText = "min-height:34px;max-width:320px";
    preset.value = selectedPresetId ?? "";
    preset.dataset.testid = "vassal-debug-preset";
    const loadPreset = document.createElement("button");
    loadPreset.type = "button";
    loadPreset.textContent = "Load preset";
    loadPreset.dataset.testid = "vassal-debug-load-preset";
    const presetName = document.createElement("input");
    presetName.type = "text";
    presetName.placeholder = "Preset name";
    presetName.value = presetSnapshot.presetOptions.find((entry) => entry.id === selectedPresetId)?.name ?? "";
    presetName.dataset.testid = "vassal-debug-preset-name";
    const savePreset = document.createElement("button");
    savePreset.type = "button";
    savePreset.textContent = "Save preset";
    savePreset.dataset.testid = "vassal-debug-save-preset";
    const deletePreset = document.createElement("button");
    deletePreset.type = "button";
    deletePreset.textContent = "Delete saved";
    deletePreset.dataset.testid = "vassal-debug-delete-preset";
    deletePreset.disabled = !selectedPresetId;
    const presetStatus = document.createElement("span");
    presetStatus.style.color = "#d8e2ef";
    presetToolbar.append(preset, loadPreset, presetName, savePreset, deletePreset, presetStatus);
    root.appendChild(presetToolbar);

    const grid = document.createElement("div");
    grid.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px";
    root.appendChild(grid);

    const target = addField(grid, "Target settlement", makeSelect(options.targetRegions));
    target.dataset.testid = "vassal-debug-target";
    const initialAge = addField(
      grid,
      "Starting age",
      makeNumber(getGameSetting(state, "vassalStartingAgeMin"))
    );
    initialAge.dataset.testid = "vassal-debug-initial-age";
    const deathAge = addField(
      grid,
      "Death age",
      makeNumber(getGameSetting(state, "vassalDeathAgeMin"), 1)
    );
    deathAge.dataset.testid = "vassal-debug-death-age";
    const trait = addField(
      grid,
      "Trait",
      makeSelect(options.traits.map((entry) => ({
        id: entry.id,
        label: `${entry.id} (${entry.prestigeDelta >= 0 ? "+" : ""}${entry.prestigeDelta})`,
      })))
    );
    trait.dataset.testid = "vassal-debug-trait";
    const traitModifier = addField(
      grid,
      "Trait prestige modifier",
      makeNumber(options.traits[0]?.prestigeDelta ?? 0, -1000)
    );
    traitModifier.dataset.testid = "vassal-debug-trait-modifier";
    const profession = addField(grid, "Profession", makeSelect(options.professions));
    profession.dataset.testid = "vassal-debug-profession";
    const candidateSlot = addField(grid, "Replace choice", makeSelect([
      { id: "1", label: "Vassal 1" },
      { id: "2", label: "Vassal 2" },
      { id: "3", label: "Vassal 3" },
    ]));
    candidateSlot.dataset.testid = "vassal-debug-candidate-slot";

    const interventionSelects = [];
    const requirementInputs = [];
    const interventionOptions = options.interventionPracticeIds.map((id) => ({
      id: `practice:${id}`,
      label: detailedSettlementPracticeDefs[id]?.label ?? id,
    })).concat(
      options.interventionStructureIds.map((id) => ({
        id: `structure:${id}`,
        label: `Add ${settlementStructureDefs[id]?.label ?? id}`,
      })),
      [
        { id: "connection:add", label: "Add a valid connection" },
        { id: "connection:remove", label: "Remove a current connection" },
      ]
    );
    for (let index = 0; index < 3; index += 1) {
      const select = addField(
        grid,
        `Intervention ${index + 1}`,
        makeSelect(interventionOptions)
      );
      select.value = interventionOptions[index]?.id ?? "";
      select.dataset.testid = `vassal-debug-intervention-${index + 1}`;
      interventionSelects.push(select);
      const requirement = addField(grid, `Required prestige ${index + 1}`, makeNumber(0));
      requirement.dataset.testid = `vassal-debug-requirement-${index + 1}`;
      requirementInputs.push(requirement);
    }
    const resistance = addField(grid, "Resistance snapshot", makeNumber(0));
    resistance.dataset.testid = "vassal-debug-resistance";

    const draft = loadedDraft;
    function setSelectValue(select, value) {
      if ([...select.options].some((option) => option.value === value)) select.value = value;
    }
    if (draft) {
      setSelectValue(target, draft.targetRegionId);
      initialAge.value = String(draft.initialAge);
      deathAge.value = String(draft.deathAge);
      setSelectValue(trait, draft.traitId);
      traitModifier.value = String(draft.traitPrestigeModifier);
      setSelectValue(profession, draft.professionId);
      if (Number.isInteger(draft.candidateSlot)) setSelectValue(candidateSlot, String(draft.candidateSlot));
      draft.interventions.forEach((entry, index) => {
        if (!entry) return;
        const value = entry.kind === "practice"
          ? `practice:${entry.practiceId}`
          : entry.kind === "structure"
            ? `structure:${entry.structureId}`
            : `connection:${entry.mode}`;
        setSelectValue(interventionSelects[index], value);
      });
      draft.requiredPrestige.forEach((value, index) => {
        requirementInputs[index].value = String(value);
      });
      resistance.value = String(draft.resistanceSnapshot);
    }

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
    const replaceCandidate = document.createElement("button");
    replaceCandidate.type = "button";
    replaceCandidate.textContent = "Replace choice";
    replaceCandidate.dataset.testid = "vassal-debug-replace-candidate";
    replaceCandidate.style.cssText =
      "min-height:36px;padding:6px 14px;border:1px solid #d7b450;border-radius:6px;background:#526846;color:#fff";
    const status = document.createElement("span");
    status.style.color = "#d8e2ef";
    actions.append(replaceCandidate, status);
    root.appendChild(actions);

    function readDraft() {
      return {
        targetRegionId: target.value,
        initialAge: Number(initialAge.value),
        deathAge: Number(deathAge.value),
        traitId: trait.value,
        traitPrestigeModifier: Number(traitModifier.value),
        professionId: profession.value,
        candidateSlot: Number(candidateSlot.value),
        interventions: interventionSelects.map((select) => {
          const [kind, value] = select.value.split(":");
          if (kind === "practice") return { kind, practiceId: value };
          if (kind === "structure") return { kind, structureId: value };
          return { kind: "connection", mode: value };
        }),
        resistanceSnapshot: Number(resistance.value),
        requiredPrestige: requirementInputs.map((input) => Number(input.value)),
      };
    }

    function updateTargetDefaults() {
      const currentState = getState?.() ?? state;
      const currentResistance = getElderOrderSummary(currentState, target.value).resistance;
      resistance.value = String(currentResistance);
      requirementInputs.forEach((input, index) => {
        input.value = String(
          currentResistance + getGameSetting(
            currentState,
            `interventionRequirement0${index + 1}`
          )
        );
      });
    }
    updateTargetDefaults();
    if (draft) {
      // Loaded values are intentional test data, not target-derived defaults.
      resistance.value = String(draft.resistanceSnapshot);
      draft.requiredPrestige.forEach((value, index) => {
        requirementInputs[index].value = String(value);
      });
    }
    target.addEventListener("change", updateTargetDefaults);
    trait.addEventListener("change", () => {
      traitModifier.value = String(
        options.traits.find((entry) => entry.id === trait.value)?.prestigeDelta ?? 0
      );
    });

    replaceCandidate.addEventListener("click", async () => {
      const draftToInject = readDraft();
      const result = await replaceVassalCandidate?.(draftToInject.candidateSlot - 1, draftToInject);
      status.textContent = result?.ok
        ? `Replaced Vassal ${candidateSlot.value}. Choose it from the map drawer to apply it.`
        : `Replacement failed: ${result?.reason ?? "unknown error"}`;
      status.style.color = result?.ok ? "#b9f5c7" : "#ffb4a8";
    });

    loadPreset.addEventListener("click", () => {
      if (!preset.value) return;
      const result = presetController?.loadPreset?.(preset.value);
      if (!result?.ok) {
        presetStatus.textContent = "Preset could not be loaded.";
        presetStatus.style.color = "#ffb4a8";
        return;
      }
      loadedDraft = result.preset.draft;
      selectedPresetId = result.preset.id;
      render();
    });
    savePreset.addEventListener("click", () => {
      const name = presetName.value;
      let result = presetController?.savePreset?.(name, readDraft(), {
        overwritePresetId: selectedPresetId,
      });
      if (result?.requiresOverwrite && typeof confirm === "function"
          && confirm(`Replace the saved Vassal preset "${result.existingPresetName ?? name}"?`)) {
        result = presetController.savePreset(name, readDraft(), {
          overwritePresetId: result.existingPresetId,
        });
      }
      if (result?.ok) {
        loadedDraft = result.preset.draft;
        selectedPresetId = result.preset.id;
        render();
        return;
      }
      presetStatus.textContent = `Save failed: ${result?.reason ?? "unknown error"}`;
      presetStatus.style.color = "#ffb4a8";
    });
    deletePreset.addEventListener("click", () => {
      if (!selectedPresetId) return;
      const result = presetController?.deletePreset?.(selectedPresetId);
      if (result?.ok) {
        loadedDraft = null;
        selectedPresetId = null;
        render();
        return;
      }
      presetStatus.textContent = "Saved preset could not be deleted.";
      presetStatus.style.color = "#ffb4a8";
    });
  }

  return {
    element: root,
    init: render,
    render,
    destroy() {
      root.remove();
    },
  };
}
