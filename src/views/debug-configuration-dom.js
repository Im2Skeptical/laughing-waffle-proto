import { lockDebugEditor } from "./debug-editor-readonly.js";
import {
  GAME_SETTINGS_DRAFT_KIND,
  GAME_SETTING_EDITOR_SECTIONS,
} from "../model/game-config.js";
import { el, field, disclosure, info, badge, isNarrow, setDisclosureOpen } from "./development-lab/elements.js";

function numberInput(value, { min = 0, max = 1000000, step = "any" } = {}) {
  const input = el("input");
  input.type = "number";
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.inputMode = "decimal";
  return input;
}

function booleanInput(value) {
  const input = el("input");
  input.type = "checkbox";
  input.checked = value === true;
  return input;
}

const shown = (value) => typeof value === "boolean" ? (value ? "On" : "Off") : String(value);

export function createDebugConfigurationDom({ controller, readOnly = () => false } = {}) {
  const root = el("section", "", "lab-editor lab-settings-editor");
  const kind = GAME_SETTINGS_DRAFT_KIND;
  root.dataset.testid = `debug-${kind}`;
  let unsubscribe = null, query = "";

  function render() {
    renderContents();
    lockDebugEditor(root, readOnly());
  }

  function renderContents() {
    const snapshot = controller.getSnapshot(kind);
    root.replaceChildren();

    const status = el("p", snapshot.status?.message ?? "", "lab-editor-status");
    if (snapshot.status?.tone === "error") status.classList.add("map-lab-error");
    else if (snapshot.status?.tone === "warning") status.classList.add("map-lab-warning");

    // Long list: a search narrows every section at once.
    const toolbar = el("div", "", "lab-editor-toolbar");
    const search = el("input");
    search.type = "search"; search.value = query; search.placeholder = "Find a setting…";
    search.setAttribute("aria-label", "Find a setting"); search.dataset.labUi = "search"; search.enterKeyHint = "search";
    search.addEventListener("input", () => { query = search.value; applySearch(); });
    toolbar.append(search, info("game-settings", [
      "These values apply to runs launched from this profile. Edits save into the draft as you type; a value outside its range is marked and ignored.",
      "Sections follow the order the simulation uses them. “Not default” counts values that differ from this build’s defaults; each one shows its default underneath.",
    ], { label: "How it works" }));
    root.append(toolbar, status);
    renderSettings(root, snapshot.draft);
    applySearch();
  }

  function applySearch() {
    const term = query.trim().toLowerCase();
    let any = false;
    for (const section of root.querySelectorAll(".lab-settings-section")) {
      let matches = 0;
      for (const row of section.querySelectorAll("[data-setting-label]")) {
        const hit = !term || row.dataset.settingLabel.includes(term) || section.dataset.sectionLabel.includes(term);
        row.hidden = !hit; if (hit) matches++;
      }
      const visible = !term || matches > 0;
      section.hidden = !visible; any ||= visible;
      if (term && visible) setDisclosureOpen(section, true);
      else if (!term && section.dataset.defaultOpen) setDisclosureOpen(section, section.dataset.defaultOpen === "true");
    }
    root.querySelector(".lab-settings-empty")?.toggleAttribute("hidden", any);
  }

  function bindNumber(input, path) {
    input.addEventListener("input", () => {
      if (input.value === "" || !Number.isFinite(Number(input.value))) return;
      const result = controller.updateValue(kind, path, Number(input.value));
      input.setAttribute("aria-invalid", result?.ok ? "false" : "true");
    });
  }

  function bindBoolean(input, path) {
    input.addEventListener("change", () => {
      const result = controller.updateValue(kind, path, input.checked);
      input.setAttribute("aria-invalid", result?.ok ? "false" : "true");
    });
  }

  function renderSettings(parent, draft) {
    const list = el("div", "", "lab-settings-list");
    for (const section of GAME_SETTING_EDITOR_SECTIONS) {
      const body = [];
      if (section.description) body.push(info(`settings:${section.id}`, section.description, { label: "What this controls" }));
      let changed = 0;
      if (section.fields.length > 0) {
        const grid = el("div", "", "lab-editor-grid");
        for (const entry of section.fields) {
          const value = draft.values[entry.id];
          const input = entry.type === "boolean" ? booleanInput(value) : numberInput(value, entry);
          input.dataset.testid = `setting-${entry.id}`;
          input.setAttribute("aria-label", entry.label);
          if (entry.type === "boolean") bindBoolean(input, ["values", entry.id]);
          else bindNumber(input, ["values", entry.id]);
          const row = field(entry.label, input);
          row.dataset.settingLabel = entry.label.toLowerCase();
          if (value !== entry.defaultValue) {
            changed++;
            row.dataset.edited = "true";
            row.append(el("span", `Default: ${shown(entry.defaultValue)}`, "lab-editor-default"));
          }
          grid.append(row);
        }
        body.push(grid);
      }
      // Remembered per section; the first sections open on larger screens.
      const open = !isNarrow() && GAME_SETTING_EDITOR_SECTIONS.indexOf(section) < 3;
      const node = disclosure(section.label, body, {
        key: `settings:${section.id}`, open, count: section.fields.length || undefined,
        badges: [changed ? badge(`${changed} not default`, "accent") : null], className: "lab-editor-section lab-settings-section",
      });
      node.dataset.sectionLabel = section.label.toLowerCase();
      node.dataset.defaultOpen = String(node.open);
      node.addEventListener("toggle", () => { if (!query.trim()) node.dataset.defaultOpen = String(node.open); });
      list.append(node);
    }
    list.append(el("p", "No setting matches that search.", "lab-empty lab-settings-empty"));
    parent.appendChild(list);
  }

  return {
    element: root,
    init() {
      unsubscribe = controller.subscribe((changedKind) => {
        if (changedKind !== kind) return;
        const active = document.activeElement;
        if (
          root.contains(active)
          && (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA")
        ) return;
        render();
      });
      render();
    },
    render,
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      root.remove();
    },
  };
}
