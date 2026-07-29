import { detailedSettlementPracticeDefs } from "../defs/gamepieces/detailed-settlement-defs.js";
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

export function createVassalDebugDom({ getState, selectCheatVassal } = {}) {
  const root = document.createElement("section");
  root.dataset.testid = "debug-vassal-lab";

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
      "Inject a fully specified vassal at the viewed second. This creates a deterministic timeline action and consumes no RNG.";
    intro.style.cssText = "margin-top:0;color:#d8e2ef";
    root.appendChild(intro);

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

    const interventionSelects = [];
    const requirementInputs = [];
    const interventionOptions = options.interventionPracticeIds.map((id) => ({
      id,
      label: detailedSettlementPracticeDefs[id]?.label ?? id,
    }));
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

    const replaceLabel = document.createElement("label");
    replaceLabel.style.cssText = "display:flex;gap:7px;align-items:center;margin:12px 0;color:#e8dfcb";
    const replaceCurrent = document.createElement("input");
    replaceCurrent.type = "checkbox";
    replaceCurrent.dataset.testid = "vassal-debug-replace-current";
    replaceLabel.append(replaceCurrent, document.createTextNode("Replace the current living vassal"));
    root.appendChild(replaceLabel);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap";
    const inject = document.createElement("button");
    inject.type = "button";
    inject.textContent = "Inject Vassal";
    inject.dataset.testid = "vassal-debug-inject";
    inject.style.cssText =
      "min-height:36px;padding:6px 14px;border:1px solid #d7b450;border-radius:6px;background:#526846;color:#fff";
    const status = document.createElement("span");
    status.style.color = "#d8e2ef";
    actions.append(inject, status);
    root.appendChild(actions);

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
    target.addEventListener("change", updateTargetDefaults);
    trait.addEventListener("change", () => {
      traitModifier.value = String(
        options.traits.find((entry) => entry.id === trait.value)?.prestigeDelta ?? 0
      );
    });

    inject.addEventListener("click", async () => {
      const result = await selectCheatVassal?.({
        targetRegionId: target.value,
        initialAge: Number(initialAge.value),
        deathAge: Number(deathAge.value),
        traitId: trait.value,
        traitPrestigeModifier: Number(traitModifier.value),
        professionId: profession.value,
        interventionPracticeIds: interventionSelects.map((select) => select.value),
        resistanceSnapshot: Number(resistance.value),
        requiredPrestige: requirementInputs.map((input) => Number(input.value)),
        replaceCurrent: replaceCurrent.checked,
      });
      status.textContent = result?.ok
        ? `Injected ${result.vassal?.vassalId ?? "vassal"}.`
        : `Injection failed: ${result?.reason ?? "unknown error"}`;
      status.style.color = result?.ok ? "#b9f5c7" : "#ffb4a8";
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
