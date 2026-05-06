import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import {
  settlementVassalProfessionDefs,
  settlementVassalTraitDefs,
} from "../defs/gamepieces/settlement-vassal-defs.js";
import { TIER_ASC } from "../model/effects/core/tiers.js";
import {
  getSettlementClassIds,
  getSettlementDebugOverrideSlotSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStructureSlots,
} from "../model/settlement-state.js";

const PANEL_WIDTH_PX = 680;
const OPTION_LABEL_MAX = 96;

function capitalize(value) {
  if (typeof value !== "string" || value.length <= 0) return "";
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function getDefTitle(def, fallbackId) {
  return def?.ui?.title || def?.name || fallbackId || "";
}

function makeOptionLabel(def, id) {
  const title = getDefTitle(def, id);
  const label = title && title !== id ? `${title} (${id})` : id;
  return label.length > OPTION_LABEL_MAX
    ? `${label.slice(0, OPTION_LABEL_MAX - 3)}...`
    : label;
}

function resolveOptionId(value, options) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return null;
  const direct = options.find((option) => option.id === normalized);
  if (direct) return direct.id;
  const byLabel = options.find((option) => option.label === normalized);
  return byLabel?.id ?? normalized;
}

function getTierValue(value) {
  return typeof value === "string" && TIER_ASC.includes(value) ? value : "bronze";
}

function isPracticeEligibleForClass(def, classId) {
  const eligible = Array.isArray(def?.orderEligibleClassIds)
    ? def.orderEligibleClassIds
    : [];
  return eligible.length === 0 || eligible.includes(classId);
}

function getPracticeOptions(classId) {
  return Object.values(settlementPracticeDefs)
    .filter((def) => def?.id && isPracticeEligibleForClass(def, classId))
    .sort((a, b) => getDefTitle(a, a.id).localeCompare(getDefTitle(b, b.id)))
    .map((def) => ({
      id: def.id,
      label: makeOptionLabel(def, def.id),
    }));
}

function getStructureSpan(def) {
  return Number.isFinite(def?.defaultSpan) && def.defaultSpan > 0
    ? Math.floor(def.defaultSpan)
    : 1;
}

function getStructureOptions(slotIndex, slotCount) {
  const remaining = Math.max(0, slotCount - Math.max(0, Math.floor(slotIndex)));
  return Object.values(hubStructureDefs)
    .filter((def) => def?.id && getStructureSpan(def) <= remaining)
    .sort((a, b) => getDefTitle(a, a.id).localeCompare(getDefTitle(b, b.id)))
    .map((def) => ({
      id: def.id,
      label: makeOptionLabel(def, def.id),
    }));
}

function optionLabelForId(options, id) {
  return options.find((option) => option.id === id)?.label ?? "";
}

function createSelect(options, value = null, className = "codex-debug-input") {
  const select = document.createElement("select");
  select.className = className;
  for (const option of Array.isArray(options) ? options : []) {
    const node = document.createElement("option");
    node.value = option.id ?? "";
    node.textContent = option.label ?? option.id ?? "";
    select.appendChild(node);
  }
  select.value = value ?? "";
  return select;
}

function getProfessionOptions() {
  return [
    { id: "", label: "None" },
    ...Object.values(settlementVassalProfessionDefs)
      .filter((def) => def?.id)
      .sort((a, b) => String(a.label ?? a.id).localeCompare(String(b.label ?? b.id)))
      .map((def) => ({ id: def.id, label: def.label ?? def.id })),
  ];
}

function getTraitOptions() {
  return [
    { id: "", label: "None" },
    ...Object.values(settlementVassalTraitDefs)
      .filter((def) => def?.id)
      .sort((a, b) => String(a.label ?? a.id).localeCompare(String(b.label ?? b.id)))
      .map((def) => ({ id: def.id, label: def.label ?? def.id })),
  ];
}

function getCandidateScheduledField(candidate, kind, field) {
  const events = Array.isArray(candidate?.lifeEvents) ? candidate.lifeEvents : [];
  const match = events.find((event) => event?.kind === kind && typeof event?.[field] === "string");
  return match?.[field] ?? null;
}

function appendOptionsToDatalist(datalist, options) {
  datalist.replaceChildren();
  for (const option of options) {
    const node = document.createElement("option");
    node.value = option.label;
    datalist.appendChild(node);
  }
}

function createText(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function createTierSelect(currentTier) {
  const select = document.createElement("select");
  select.className = "codex-debug-tier";
  for (const tier of TIER_ASC) {
    const option = document.createElement("option");
    option.value = tier;
    option.textContent = capitalize(tier);
    select.appendChild(option);
  }
  select.value = getTierValue(currentTier);
  return select;
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) return "No debug snapshot available.";
  return JSON.stringify(
    {
      frontierSec: snapshot.frontierSec,
      viewedSec: snapshot.viewedSec,
      browseCapSec: snapshot.browseCapSec,
      playbackTarget: snapshot.playbackTarget,
      forecastStatus: snapshot.forecastStatus,
      displayedLossInfo: snapshot.displayedLossInfo,
      lineage: snapshot.lineage,
      runner: snapshot.runner,
    },
    null,
    2
  );
}

export function createSettlementDebugMenuDom({
  getState,
  getFrontierSec,
  getViewedSec,
  getPreviewStatus,
  applyOverrides,
  getVassalSelectionPool,
  isVassalSelectionOpen,
  selectCheatVassal,
  getDebugSnapshot,
  isInteractionBlocked,
} = {}) {
  if (typeof document === "undefined") {
    return {
      init() {},
      refresh() {},
      update() {},
      destroy() {},
    };
  }

  let initialized = false;
  let open = false;
  let activeTab = "practices";
  const dirtyRows = new Map();

  const root = document.createElement("div");
  root.className = "codex-debug-root";

  const style = document.createElement("style");
  style.textContent = `
    .codex-debug-root {
      position: fixed;
      inset: 0;
      z-index: 10000;
      pointer-events: none;
      font-family: Arial, sans-serif;
      color: #f6efe3;
    }
    .codex-debug-button {
      position: fixed;
      top: 14px;
      right: 14px;
      width: 84px;
      height: 34px;
      border: 1px solid #e0c789;
      border-radius: 6px;
      background: #273447;
      color: #f8ead0;
      font-weight: 700;
      pointer-events: auto;
      cursor: pointer;
    }
    .codex-debug-panel {
      position: fixed;
      top: 56px;
      right: 14px;
      width: ${PANEL_WIDTH_PX}px;
      max-width: calc(100vw - 28px);
      max-height: calc(100vh - 76px);
      display: none;
      pointer-events: auto;
      background: rgba(35, 39, 44, 0.97);
      border: 1px solid rgba(224, 199, 137, 0.9);
      border-radius: 8px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.42);
      overflow: hidden;
    }
    .codex-debug-panel.open { display: flex; flex-direction: column; }
    .codex-debug-root.blocked .codex-debug-panel {
      pointer-events: none;
      opacity: 0.38;
    }
    .codex-debug-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(224, 199, 137, 0.35);
      background: rgba(52, 60, 67, 0.96);
    }
    .codex-debug-title { font-weight: 800; margin-right: auto; }
    .codex-debug-tab,
    .codex-debug-action,
    .codex-debug-close {
      border: 1px solid rgba(224, 199, 137, 0.65);
      border-radius: 6px;
      background: #3b4650;
      color: #f8ead0;
      padding: 6px 10px;
      cursor: pointer;
    }
    .codex-debug-tab.active { background: #6c5c3e; }
    .codex-debug-body {
      overflow: auto;
      padding: 12px;
    }
    .codex-debug-status {
      min-height: 20px;
      margin-bottom: 10px;
      font-size: 12px;
      color: #d8e2ef;
    }
    .codex-debug-section-title {
      margin: 12px 0 8px;
      font-size: 13px;
      font-weight: 800;
      color: #e0c789;
      text-transform: uppercase;
    }
    .codex-debug-row {
      display: grid;
      grid-template-columns: 104px 1fr 104px 74px 62px 58px 64px;
      gap: 8px;
      align-items: center;
      min-height: 36px;
      padding: 6px;
      border-bottom: 1px solid rgba(248, 234, 208, 0.12);
    }
    .codex-debug-row.dirty { background: rgba(224, 199, 137, 0.11); }
    .codex-debug-row.debug-active {
      background: rgba(123, 223, 242, 0.13);
      box-shadow: inset 4px 0 #7bdff2;
    }
    .codex-debug-row.debug-active.dirty {
      background: linear-gradient(90deg, rgba(123, 223, 242, 0.16), rgba(224, 199, 137, 0.12));
    }
    .codex-debug-row.debug-active .codex-debug-slot-label {
      color: #aaf2ff;
      font-weight: 700;
    }
    .codex-debug-slot-label { font-size: 12px; color: #d8e2ef; }
    .codex-debug-current { font-size: 11px; color: #b9c7d8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .codex-debug-input,
    .codex-debug-tier {
      min-width: 0;
      height: 30px;
      border: 1px solid rgba(216, 226, 239, 0.45);
      border-radius: 5px;
      background: #f8f0df;
      color: #1d2430;
      padding: 0 8px;
      box-sizing: border-box;
    }
    .codex-debug-row button {
      height: 30px;
      border: 1px solid rgba(224, 199, 137, 0.65);
      border-radius: 5px;
      background: #455463;
      color: #f8ead0;
      cursor: pointer;
    }
    .codex-debug-cheat-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .codex-debug-field {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    .codex-debug-field label {
      font-size: 12px;
      color: #e0c789;
      font-weight: 700;
    }
    .codex-debug-agenda-row {
      display: grid;
      grid-template-columns: 92px repeat(3, minmax(0, 1fr));
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .codex-debug-agenda-row .codex-debug-slot-label {
      color: #e0c789;
      font-weight: 700;
    }
    .codex-debug-toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .codex-debug-meta { font-size: 12px; color: #cbd5e1; }
    .codex-debug-stats {
      white-space: pre-wrap;
      font: 12px/1.45 Consolas, monospace;
      color: #e8eef8;
      background: rgba(0, 0, 0, 0.24);
      border: 1px solid rgba(248, 234, 208, 0.18);
      border-radius: 6px;
      padding: 10px;
      margin: 0;
    }
  `;

  const button = document.createElement("button");
  button.className = "codex-debug-button";
  button.type = "button";
  button.textContent = "Debug";

  const panel = document.createElement("div");
  panel.className = "codex-debug-panel";

  const header = document.createElement("div");
  header.className = "codex-debug-header";
  const title = createText("div", "codex-debug-title", "Debug Menu");
  const practicesTab = document.createElement("button");
  practicesTab.className = "codex-debug-tab active";
  practicesTab.type = "button";
  practicesTab.textContent = "Practices";
  const structuresTab = document.createElement("button");
  structuresTab.className = "codex-debug-tab";
  structuresTab.type = "button";
  structuresTab.textContent = "Structures";
  const cheatVassalTab = document.createElement("button");
  cheatVassalTab.className = "codex-debug-tab";
  cheatVassalTab.type = "button";
  cheatVassalTab.textContent = "Cheat Vassal";
  const statsTab = document.createElement("button");
  statsTab.className = "codex-debug-tab";
  statsTab.type = "button";
  statsTab.textContent = "Stats";
  const closeButton = document.createElement("button");
  closeButton.className = "codex-debug-close";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  header.append(title, practicesTab, structuresTab, cheatVassalTab, statsTab, closeButton);

  const body = document.createElement("div");
  body.className = "codex-debug-body";
  const status = createText("div", "codex-debug-status", "");
  const content = document.createElement("div");
  body.append(status, content);
  panel.append(header, body);
  root.append(button, panel);

  function setStatus(message, tone = "info") {
    status.textContent = message || "";
    status.style.color =
      tone === "error" ? "#ffb4a8" : tone === "ok" ? "#b9f5c7" : "#d8e2ef";
  }

  function setOpen(nextOpen) {
    open = nextOpen === true;
    if (open && isVassalSelectionOpen?.() === true) {
      activeTab = "cheatVassal";
    }
    panel.classList.toggle("open", open);
    button.textContent = open ? "Debug*" : "Debug";
    if (open) render();
  }

  function setTab(tab) {
    if (isVassalSelectionOpen?.() === true && tab !== "cheatVassal") {
      activeTab = "cheatVassal";
    } else {
      activeTab = tab;
    }
    practicesTab.classList.toggle("active", activeTab === "practices");
    structuresTab.classList.toggle("active", activeTab === "structures");
    cheatVassalTab.classList.toggle("active", activeTab === "cheatVassal");
    statsTab.classList.toggle("active", activeTab === "stats");
    render();
  }

  function markDirty(key, row, buildOverride) {
    row.classList.add("dirty");
    dirtyRows.set(key, buildOverride);
  }

  async function applyBuiltOverrides(overrides) {
    const cleanOverrides = overrides.filter(Boolean);
    if (!cleanOverrides.length) {
      setStatus("No debug overrides to apply.");
      return;
    }
    const result = await applyOverrides?.(cleanOverrides);
    if (result?.ok) {
      dirtyRows.clear();
      setStatus(
        `Applied ${cleanOverrides.length} override(s) at t=${result.targetSec ?? "?"}.`,
        "ok"
      );
      render();
    } else {
      setStatus(`Override failed: ${result?.reason ?? "unknown"}`, "error");
    }
  }

  function appendToolbar(parent) {
    const toolbar = document.createElement("div");
    toolbar.className = "codex-debug-toolbar";
    const applyDirty = document.createElement("button");
    applyDirty.className = "codex-debug-action";
    applyDirty.type = "button";
    applyDirty.textContent = "Apply Dirty";
    applyDirty.addEventListener("click", () => {
      applyBuiltOverrides(Array.from(dirtyRows.values()).map((build) => build()));
    });
    const refreshButton = document.createElement("button");
    refreshButton.className = "codex-debug-action";
    refreshButton.type = "button";
    refreshButton.textContent = "Refresh";
    refreshButton.addEventListener("click", () => render());
    const preview = getPreviewStatus?.() ?? {};
    const meta = createText(
      "span",
      "codex-debug-meta",
      `viewed ${Math.floor(getViewedSec?.() ?? 0)} | frontier ${Math.floor(
        getFrontierSec?.() ?? 0
      )}${preview.active ? " | applies at viewed forecast second" : ""}`
    );
    toolbar.append(applyDirty, refreshButton, meta);
    parent.appendChild(toolbar);
  }

  function createOverrideRow({
    key,
    slotLabel,
    currentLabel,
    inputValue,
    options,
    datalistId,
    currentTier,
    buildOverride,
    buildClearOverride,
    debugActive = false,
  }) {
    const row = document.createElement("div");
    row.className = "codex-debug-row";
    row.classList.toggle("debug-active", debugActive === true);
    const label = createText("div", "codex-debug-slot-label", slotLabel);
    const input = document.createElement("input");
    input.className = "codex-debug-input";
    input.setAttribute("list", datalistId);
    input.placeholder = "empty";
    input.value = inputValue || "";
    const tierSelect = createTierSelect(currentTier);
    const current = createText("div", "codex-debug-current", currentLabel || "empty");
    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "Apply";
    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.textContent = "Empty";
    const clearOverrideButton = document.createElement("button");
    clearOverrideButton.type = "button";
    clearOverrideButton.textContent = "Unpin";

    const getOverride = () =>
      buildOverride({
        defId: resolveOptionId(input.value, options),
        tier: tierSelect.value,
      });
    input.addEventListener("input", () => markDirty(key, row, getOverride));
    tierSelect.addEventListener("change", () => markDirty(key, row, getOverride));
    applyButton.addEventListener("click", () => applyBuiltOverrides([getOverride()]));
    clearButton.addEventListener("click", () => {
      input.value = "";
      markDirty(key, row, getOverride);
    });
    if (typeof buildClearOverride === "function") {
      clearOverrideButton.addEventListener("click", () =>
        applyBuiltOverrides([buildClearOverride()])
      );
    } else {
      clearOverrideButton.disabled = true;
      clearOverrideButton.textContent = "";
      clearOverrideButton.style.visibility = "hidden";
    }

    row.append(label, input, tierSelect, current, applyButton);
    row.appendChild(clearButton);
    row.appendChild(clearOverrideButton);
    return row;
  }

  function renderPractices() {
    const state = getState?.();
    content.replaceChildren();
    appendToolbar(content);
    if (!state?.hub) {
      content.appendChild(createText("div", "codex-debug-meta", "No settlement state."));
      return;
    }
    for (const classId of getSettlementClassIds(state)) {
      const debugOverrides = getSettlementDebugOverrideSlotSummary(state);
      content.appendChild(
        createText("div", "codex-debug-section-title", `${capitalize(classId)} Practices`)
      );
      const slots = getSettlementPracticeSlotsByClass(state, classId);
      const options = getPracticeOptions(classId);
      const datalistId = `codex-debug-practice-${classId}`;
      const datalist = document.createElement("datalist");
      datalist.id = datalistId;
      appendOptionsToDatalist(datalist, options);
      content.appendChild(datalist);
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const card = slots[slotIndex]?.card ?? null;
        const currentDef = card?.defId ? settlementPracticeDefs[card.defId] : null;
        content.appendChild(
          createOverrideRow({
            key: `practice:${classId}:${slotIndex}`,
            slotLabel: `${classId} ${slotIndex + 1}`,
            currentLabel: currentDef ? makeOptionLabel(currentDef, card.defId) : "empty",
            inputValue: optionLabelForId(options, card?.defId),
            options,
            datalistId,
            currentTier: card?.tier,
            debugActive:
              debugOverrides?.practices?.[classId]?.[slotIndex] === true,
            buildOverride: ({ defId, tier }) => ({
              zone: "practice",
              classId,
              slotIndex,
              defId,
              tier,
            }),
            buildClearOverride: () => ({
              zone: "practice",
              classId,
              slotIndex,
              clearOverride: true,
            }),
          })
        );
      }
    }
  }

  function renderStructures() {
    const state = getState?.();
    content.replaceChildren();
    appendToolbar(content);
    if (!state?.hub) {
      content.appendChild(createText("div", "codex-debug-meta", "No settlement state."));
      return;
    }
    content.appendChild(createText("div", "codex-debug-section-title", "Structures"));
    const slots = getSettlementStructureSlots(state);
    const debugOverrides = getSettlementDebugOverrideSlotSummary(state);
    const occ = Array.isArray(state?.hub?.occ) ? state.hub.occ : [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const structure = slots[slotIndex]?.structure ?? occ[slotIndex] ?? null;
      const anchorCol = Number.isFinite(structure?.col)
        ? Math.floor(structure.col)
        : slots[slotIndex]?.structure
          ? slotIndex
          : null;
      const currentDef = structure?.defId ? hubStructureDefs[structure.defId] : null;
      const currentLabel = currentDef
        ? `${makeOptionLabel(currentDef, structure.defId)}${
            anchorCol != null && anchorCol !== slotIndex ? ` @ ${anchorCol + 1}` : ""
          }`
        : "empty";
      const options = getStructureOptions(slotIndex, slots.length);
      const datalistId = `codex-debug-structure-${slotIndex}`;
      const datalist = document.createElement("datalist");
      datalist.id = datalistId;
      appendOptionsToDatalist(datalist, options);
      content.appendChild(datalist);
      content.appendChild(
        createOverrideRow({
          key: `structure:${slotIndex}`,
          slotLabel: `slot ${slotIndex + 1}`,
          currentLabel,
          inputValue: optionLabelForId(options, structure?.defId),
          options,
          datalistId,
          currentTier: structure?.tier,
          debugActive: debugOverrides?.structures?.[slotIndex] === true,
          buildOverride: ({ defId, tier }) => ({
            zone: "structure",
            slotIndex,
            defId,
            tier,
          }),
          buildClearOverride: () => ({
            zone: "structure",
            slotIndex,
            clearOverride: true,
          }),
        })
      );
    }
  }

  function createCheatField(parent, labelText, input) {
    const field = document.createElement("div");
    field.className = "codex-debug-field";
    const label = createText("label", "", labelText);
    field.append(label, input);
    parent.appendChild(field);
    return input;
  }

  function renderCheatVassal() {
    const state = getState?.();
    const selectionPool = getVassalSelectionPool?.() ?? null;
    content.replaceChildren();
    if (!state?.hub || !selectionPool) {
      content.appendChild(
        createText("div", "codex-debug-meta", "Open vassal selection to craft a cheat vassal.")
      );
      return;
    }

    const defaultCandidate = Array.isArray(selectionPool?.candidates)
      ? selectionPool.candidates[0] ?? null
      : null;
    const defaultProfessionId =
      defaultCandidate?.professionId ??
      getCandidateScheduledField(defaultCandidate, "professionAssigned", "professionId");
    const defaultTraitId =
      defaultCandidate?.traitId ??
      getCandidateScheduledField(defaultCandidate, "traitAssigned", "traitId");
    const classIds = getSettlementClassIds(state);
    const classOptions = classIds.map((classId) => ({
      id: classId,
      label: capitalize(classId),
    }));

    const toolbar = document.createElement("div");
    toolbar.className = "codex-debug-toolbar";
    const applyButton = document.createElement("button");
    applyButton.className = "codex-debug-action";
    applyButton.type = "button";
    applyButton.textContent = "Select Cheat Vassal";
    const meta = createText(
      "span",
      "codex-debug-meta",
      `selection t=${Math.floor(selectionPool?.createdSec ?? getViewedSec?.() ?? 0)}`
    );
    toolbar.append(applyButton, meta);
    content.appendChild(toolbar);

    const grid = document.createElement("div");
    grid.className = "codex-debug-cheat-grid";
    content.appendChild(grid);

    const sourceClassSelect = createCheatField(
      grid,
      "Source Class",
      createSelect(classOptions, defaultCandidate?.sourceClassId ?? classIds[0] ?? "")
    );

    const initialAgeInput = document.createElement("input");
    initialAgeInput.className = "codex-debug-input";
    initialAgeInput.type = "number";
    initialAgeInput.min = "0";
    initialAgeInput.max = "199";
    initialAgeInput.step = "1";
    initialAgeInput.value = String(Math.floor(defaultCandidate?.initialAgeYears ?? 8));
    createCheatField(grid, "Starting Age", initialAgeInput);

    const deathAgeInput = document.createElement("input");
    deathAgeInput.className = "codex-debug-input";
    deathAgeInput.type = "number";
    deathAgeInput.min = "1";
    deathAgeInput.max = "200";
    deathAgeInput.step = "1";
    deathAgeInput.value = String(Math.floor(defaultCandidate?.deathAgeYears ?? 65));
    createCheatField(grid, "Death Age", deathAgeInput);

    const professionSelect = createCheatField(
      grid,
      "Profession",
      createSelect(getProfessionOptions(), defaultProfessionId ?? "")
    );
    const traitSelect = createCheatField(
      grid,
      "Trait",
      createSelect(getTraitOptions(), defaultTraitId ?? "")
    );

    content.appendChild(createText("div", "codex-debug-section-title", "Agenda"));
    const agendaInputsByClass = {};
    for (const classId of classIds) {
      const options = getPracticeOptions(classId);
      const datalistId = `codex-debug-cheat-agenda-${classId}`;
      const datalist = document.createElement("datalist");
      datalist.id = datalistId;
      appendOptionsToDatalist(datalist, options);
      content.appendChild(datalist);

      const row = document.createElement("div");
      row.className = "codex-debug-agenda-row";
      row.appendChild(createText("div", "codex-debug-slot-label", capitalize(classId)));
      const defaultAgenda = Array.isArray(defaultCandidate?.agendaByClass?.[classId])
        ? defaultCandidate.agendaByClass[classId]
        : [];
      agendaInputsByClass[classId] = [];
      for (let index = 0; index < 3; index += 1) {
        const input = document.createElement("input");
        input.className = "codex-debug-input";
        input.setAttribute("list", datalistId);
        input.placeholder = `Agenda ${index + 1}`;
        input.value = optionLabelForId(options, defaultAgenda[index]) || "";
        agendaInputsByClass[classId].push({ input, options });
        row.appendChild(input);
      }
      content.appendChild(row);
    }

    applyButton.addEventListener("click", async () => {
      const agendaByClass = {};
      for (const classId of classIds) {
        agendaByClass[classId] = agendaInputsByClass[classId]
          .map(({ input, options }) => resolveOptionId(input.value, options))
          .filter(Boolean);
      }
      const initialAgeYears = Math.max(0, Math.floor(Number(initialAgeInput.value)));
      const deathAgeYears = Math.max(0, Math.floor(Number(deathAgeInput.value)));
      const result = await selectCheatVassal?.({
        sourceClassId: sourceClassSelect.value,
        initialAgeYears,
        deathAgeYears,
        professionId: professionSelect.value || null,
        traitId: traitSelect.value || null,
        agendaByClass,
      });
      if (result?.ok) {
        setStatus(`Selected cheat vassal ${result.vassalId ?? ""}`.trim(), "ok");
        setOpen(false);
      } else {
        setStatus(`Cheat vassal failed: ${result?.reason ?? "unknown"}`, "error");
      }
    });
  }

  function renderStats() {
    content.replaceChildren();
    appendToolbar(content);
    const pre = createText("pre", "codex-debug-stats", summarizeSnapshot(getDebugSnapshot?.()));
    content.appendChild(pre);
  }

  function render() {
    if (!open) return;
    const selectionOpen = isVassalSelectionOpen?.() === true;
    cheatVassalTab.disabled = !selectionOpen;
    practicesTab.disabled = selectionOpen;
    structuresTab.disabled = selectionOpen;
    statsTab.disabled = selectionOpen;
    if (selectionOpen && activeTab !== "cheatVassal") {
      setTab("cheatVassal");
      return;
    }
    practicesTab.classList.toggle("active", activeTab === "practices");
    structuresTab.classList.toggle("active", activeTab === "structures");
    cheatVassalTab.classList.toggle("active", activeTab === "cheatVassal");
    statsTab.classList.toggle("active", activeTab === "stats");
    if (activeTab === "cheatVassal") renderCheatVassal();
    else if (activeTab === "structures") renderStructures();
    else if (activeTab === "stats") renderStats();
    else renderPractices();
  }

  button.addEventListener("click", () => setOpen(!open));
  closeButton.addEventListener("click", () => setOpen(false));
  practicesTab.addEventListener("click", () => setTab("practices"));
  structuresTab.addEventListener("click", () => setTab("structures"));
  cheatVassalTab.addEventListener("click", () => setTab("cheatVassal"));
  statsTab.addEventListener("click", () => setTab("stats"));

  return {
    init() {
      if (initialized) return;
      initialized = true;
      document.head.appendChild(style);
      document.body.appendChild(root);
    },
    refresh: render,
    update() {
      const blocked =
        typeof isInteractionBlocked === "function" &&
        isInteractionBlocked() === true;
      root.classList.toggle("blocked", blocked && activeTab !== "cheatVassal");
      if (blocked && open && activeTab !== "cheatVassal") render();
      if (open && activeTab === "stats") renderStats();
    },
    destroy() {
      root.remove();
      style.remove();
      initialized = false;
    },
  };
}
