function collectTextLabels(displayObject, labels = []) {
  if (!displayObject) return labels;
  if (typeof displayObject.text === "string" || typeof displayObject.text === "number") {
    const text = String(displayObject.text).trim();
    if (text.length > 0) {
      labels.push(text);
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length > 0 && trimmed !== text) labels.push(trimmed);
      }
    }
  }
  const children = Array.isArray(displayObject.children) ? displayObject.children : [];
  for (const child of children) {
    collectTextLabels(child, labels);
  }
  return labels;
}

export function buildRenderSemanticSnapshot(contentLayer, overlayLayer) {
  const texts = [...collectTextLabels(contentLayer), ...collectTextLabels(overlayLayer)];
  const textSet = new Set(texts);
  const hasPrefix = (prefix) => texts.some((text) => text.startsWith(prefix));
  return {
    textCount: texts.length,
    texts: texts.slice(0, 240),
    sections: {
      vassal: {
        hasHeader: textSet.has("Vassal"),
        hasEmptyPrompt: textSet.has("Choose a vassal to begin the lineage."),
        hasAgenda: textSet.has("Agenda"),
        hasStats: textSet.has("Stats"),
        hasEventLog: textSet.has("Event Log"),
        hasClassLine: hasPrefix("Class "),
        hasProfessionLine: hasPrefix("Profession "),
        hasTraitLine: hasPrefix("Trait "),
        hasDeathYearLine: hasPrefix("Death Year "),
        hasStatus: textSet.has("Alive") || textSet.has("Elder") || textSet.has("Dead"),
      },
      chaos: {
        hasHeader: textSet.has("Chaos"),
        hasSharedPool: textSet.has("Shared Pool"),
        hasChaosPower: textSet.has("Chaos Power"),
        hasChaosIncome: textSet.has("Chaos Income"),
        hasRedGod: textSet.has("RedGod"),
        hasNextSpawn: textSet.has("Next Spawn"),
        hasMonsters: textSet.has("Monsters"),
      },
      classSummary: {
        hasAdults: textSet.has("Adults"),
        hasYouth: textSet.has("Youth"),
        hasFree: textSet.has("Free"),
        hasFaith: textSet.has("Faith"),
        hasMood: textSet.has("Mood"),
      },
    },
  };
}
