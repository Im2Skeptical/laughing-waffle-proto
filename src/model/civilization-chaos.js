// Read-only values shared by live graphs and replay snapshots.
export function getCivilizationChaosSummary(state) {
  const chaos = state?.civilization?.chaos;
  return {
    chaosPower: chaos?.chaosPower ?? 0,
    chaosIncome: chaos?.lastMoonIncome?.totalIncome ?? 0,
    monsterCount: chaos?.monsterCount ?? 0,
  };
}
