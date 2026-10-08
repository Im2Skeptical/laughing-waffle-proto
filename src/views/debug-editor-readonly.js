// Keep inspection/navigation available while locking the recipe's data fields.
export function lockDebugEditor(root, readOnly, allowed = []) {
  if (!readOnly) return;
  for (const control of root.querySelectorAll('input, select, button')) {
    const id = control.dataset.testid ?? '';
    // Help toggles and searches change only the view, never the recipe.
    if (control.dataset.labUi != null) continue;
    if (!allowed.some(prefix => id.startsWith(prefix))) control.disabled = true;
  }
  for (const area of root.querySelectorAll('textarea')) area.readOnly = true;
}
