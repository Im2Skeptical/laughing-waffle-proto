import {
  GAMEPIECES_DRAFT_KIND,
  GAME_SETTINGS_DRAFT_KIND,
  GAME_SETTING_EDITOR_SECTIONS,
  getAtPath,
  getGamepieceEditorGroups,
} from "../model/game-config.js";

function button(label, testid) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  if (testid) node.dataset.testid = testid;
  node.style.cssText = [
    "min-height:32px",
    "padding:5px 10px",
    "border:1px solid #8fa0ae",
    "border-radius:5px",
    "background:#455463",
    "color:#f8ead0",
  ].join(";");
  return node;
}

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

function tagsInput(value) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = Array.isArray(value) ? value.join(", ") : "";
  input.placeholder = "Food, Trade";
  input.style.cssText = [
    "width:100%", "min-width:90px", "min-height:34px", "box-sizing:border-box",
    "border:1px solid #8fa0ae", "border-radius:5px", "background:#f8f0df",
    "color:#1d2430", "padding:5px 8px",
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

export function createDebugConfigurationDom({ controller, kind, title } = {}) {
  const root = document.createElement("section");
  root.dataset.testid = `debug-${kind}`;
  let scenarioName = "";
  let unsubscribe = null;

  function render() {
    const snapshot = controller.getSnapshot(kind);
    root.replaceChildren();

    const toolbar = document.createElement("div");
    toolbar.style.cssText = "display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-bottom:10px";
    const preset = document.createElement("select");
    preset.setAttribute("aria-label", `${title} preset`);
    preset.dataset.testid = `${kind}-preset`;
    preset.style.cssText = "min-height:34px;max-width:320px";
    const custom = document.createElement("option");
    custom.value = "";
    custom.textContent = "Custom / unsaved draft";
    preset.appendChild(custom);
    const authored = document.createElement("option");
    authored.value = "authored";
    authored.textContent = `Authored - ${title}`;
    preset.appendChild(authored);
    for (const entry of snapshot.presetOptions) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = `Saved - ${entry.name}`;
      preset.appendChild(option);
    }
    preset.value = snapshot.selectedPresetId ?? "";
    if (snapshot.selectedPresetDirty && preset.value) {
      preset.options[preset.selectedIndex].textContent += " *";
    }
    const load = button("Load preset", `${kind}-load-preset`);
    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "Preset name";
    name.setAttribute("aria-label", `${title} preset name`);
    name.dataset.testid = `${kind}-preset-name`;
    name.value = scenarioName;
    name.style.cssText = "min-height:34px;box-sizing:border-box;padding:5px 8px";
    name.addEventListener("input", () => {
      scenarioName = name.value;
    });
    const save = button("Save preset", `${kind}-save-preset`);
    const remove = button("Delete saved", `${kind}-delete-preset`);
    remove.disabled = !snapshot.presetOptions.some(
      (entry) => entry.id === snapshot.selectedPresetId
    );
    const reset = button("Authored values", `${kind}-authored`);
    const io = button("Import / Export", `${kind}-import-export`);
    toolbar.append(preset, load, name, save, remove, reset, io);
    root.appendChild(toolbar);

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
    if (kind === GAME_SETTINGS_DRAFT_KIND) {
      renderSettings(editor, snapshot.draft);
    } else {
      renderGamepieces(editor, snapshot.draft);
    }

    load.addEventListener("click", () => {
      if (!preset.value) return;
      if (
        snapshot.selectedPresetDirty
        && typeof confirm === "function"
        && !confirm("Replace the current draft with the selected preset?")
      ) return;
      controller.loadPreset(kind, preset.value);
    });
    reset.addEventListener("click", () => controller.reset(kind));
    save.addEventListener("click", () => {
      const result = controller.savePreset(kind, scenarioName);
      if (result?.ok) scenarioName = result.preset.name;
      render();
    });
    remove.addEventListener("click", () => {
      const selected = snapshot.presetOptions.find(
        (entry) => entry.id === snapshot.selectedPresetId
      );
      if (!selected) return;
      if (typeof confirm === "function" && !confirm(`Delete "${selected.name}"?`)) return;
      controller.deletePreset(kind, selected.id);
    });
    io.addEventListener("click", () => appendImportExport(root));
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

  function bindTags(input, path) {
    input.addEventListener("change", () => {
      const tags = [...new Set(input.value.split(",").map((tag) => tag.trim()).filter(Boolean))];
      const result = controller.updateValue(kind, path, tags);
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

  function renderGamepieces(parent, draft) {
    for (const groupData of getGamepieceEditorGroups(draft)) {
      const group = document.createElement("fieldset");
      group.style.cssText = "border:1px solid #586876;border-radius:6px;padding:10px";
      const legend = document.createElement("legend");
      legend.textContent = `${groupData.kind === "structures" ? "Structure" : "Practice"} - ${groupData.label}`;
      legend.style.color = "#e0c789";
      group.appendChild(legend);
      const grid = document.createElement("div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px";
      for (const field of groupData.fields) {
        const value = getAtPath(draft, field.path);
        const input = field.type === "boolean"
          ? booleanInput(value)
          : field.type === "tags"
            ? tagsInput(value)
            : numberInput(value, {
            min: String(field.path.at(-1)).startsWith("additive") ? -1000 : 0,
            step: "any",
          });
        input.dataset.testid = `gamepiece-${groupData.kind}-${groupData.id}-${field.id}`;
        input.setAttribute("aria-label", `${groupData.label} ${field.label}`);
        if (field.type === "boolean") bindBoolean(input, field.path);
        else if (field.type === "tags") bindTags(input, field.path);
        else bindNumber(input, field.path);
        grid.appendChild(fieldRow(field.label, input));
      }
      group.appendChild(grid);
      parent.appendChild(group);
    }
  }

  function appendImportExport(parent) {
    parent.querySelector("[data-debug-config-io]")?.remove();
    const box = document.createElement("div");
    box.dataset.debugConfigIo = "true";
    box.style.cssText = "position:sticky;bottom:0;background:#1d252c;border:1px solid #d7b450;padding:10px;z-index:2";
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", `${title} JSON`);
    textarea.value = controller.exportJson(kind);
    textarea.style.cssText = "width:100%;height:180px;box-sizing:border-box;font-family:monospace";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:8px";
    const importButton = button("Import JSON", `${kind}-import-json`);
    const refreshExport = button("Refresh export", `${kind}-refresh-export`);
    const close = button("Close JSON", `${kind}-close-json`);
    importButton.addEventListener("click", () => controller.importJson(kind, textarea.value));
    refreshExport.addEventListener("click", () => {
      textarea.value = controller.exportJson(kind);
    });
    close.addEventListener("click", () => box.remove());
    row.append(importButton, refreshExport, close);
    box.append(textarea, row);
    parent.appendChild(box);
    textarea.focus();
    textarea.select();
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

export { GAMEPIECES_DRAFT_KIND, GAME_SETTINGS_DRAFT_KIND };
