import { lockDebugEditor } from "./debug-editor-readonly.js";
import {
  GAME_SETTINGS_DRAFT_KIND,
  GAME_SETTING_EDITOR_SECTIONS,
} from "../model/game-config.js";

function numberInput(value, { min = 0, max = 1000000, step = "any" } = {}) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.style.cssText = [
    "width:100%",
    "min-width:90px",
    "min-height:34px",
    "box-sizing:border-box",
    "border:1px solid #8fa0ae",
    "border-radius:5px",
    "background:#f8f0df",
    "color:#1d2430",
    "padding:5px 8px",
  ].join(";");
  return input;
}

function booleanInput(value) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value === true;
  input.style.cssText = [
    "width:22px",
    "height:22px",
    "margin:6px 0",
    "accent-color:#d7b450",
  ].join(";");
  return input;
}

function fieldRow(labelText, input) {
  const label = document.createElement("label");
  label.style.cssText = "display:grid;gap:4px;min-width:0;font-size:12px;color:#e8dfcb";
  const caption = document.createElement("span");
  caption.textContent = labelText;
  label.append(caption, input);
  return label;
}

export function createDebugConfigurationDom({ controller, readOnly = () => false } = {}) {
  const root = document.createElement("section");
  const kind = GAME_SETTINGS_DRAFT_KIND;
  root.dataset.testid = `debug-${kind}`;
  let unsubscribe = null;

  function render() {
    renderContents();
    lockDebugEditor(root, readOnly());
  }

  function renderContents() {
    const snapshot = controller.getSnapshot(kind);
    root.replaceChildren();

    const status = document.createElement("div");
    status.textContent = snapshot.status?.message ?? "";
    status.style.cssText = [
      "min-height:18px",
      "margin-bottom:8px",
      "font-size:12px",
      `color:${snapshot.status?.tone === "error" ? "#ffb4a8" : snapshot.status?.tone === "warning" ? "#ffd98a" : "#b9f5c7"}`,
    ].join(";");
    root.appendChild(status);

    const editor = document.createElement("div");
    editor.style.cssText = "display:grid;gap:12px";
    root.appendChild(editor);
    renderSettings(editor, snapshot.draft);
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
    for (const section of GAME_SETTING_EDITOR_SECTIONS) {
      const group = document.createElement("fieldset");
      group.style.cssText = "border:1px solid #586876;border-radius:6px;padding:10px";
      const legend = document.createElement("legend");
      legend.textContent = section.label;
      legend.style.color = "#e0c789";
      group.appendChild(legend);
      if (section.description) {
        const description = document.createElement("p");
        description.textContent = section.description;
        description.style.cssText = "margin:0 0 9px;color:#c9d1d8;font-size:12px;line-height:1.35";
        group.appendChild(description);
      }
      if (section.fields.length > 0) {
        const grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px";
        for (const field of section.fields) {
          const input = field.type === "boolean"
            ? booleanInput(draft.values[field.id])
            : numberInput(draft.values[field.id], field);
          input.dataset.testid = `setting-${field.id}`;
          input.setAttribute("aria-label", field.label);
          if (field.type === "boolean") bindBoolean(input, ["values", field.id]);
          else bindNumber(input, ["values", field.id]);
          grid.appendChild(fieldRow(field.label, input));
        }
        group.appendChild(grid);
      }
      parent.appendChild(group);
    }
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
