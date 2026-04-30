export const SCROLL_GRAPH_DEFAULT_HORIZON_SEC = 120;
export const SCROLL_GRAPH_DEFAULT_HISTORY_WINDOW_SEC = 120;

export const SCROLL_GRAPH_TYPE_IDS = Object.freeze([]);
export const SCROLL_GRAPH_SUBJECT_IDS = Object.freeze([]);
export const SCROLL_GRAPH_TYPE_DEFS = Object.freeze({});
export const SCROLL_GRAPH_SUBJECT_DEFS = Object.freeze({});

export function makeScrollItemKind(typeId, subjectId) {
  return `${typeId}${String(subjectId ?? "")}Scroll`;
}

export function makeScrollRecipeId(typeId, subjectId) {
  return `craft${String(typeId ?? "")}${String(subjectId ?? "")}Scroll`;
}

export function buildScrollTimegraphState() {
  return null;
}
