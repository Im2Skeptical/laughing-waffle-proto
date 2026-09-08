// View preferences only. Group choices never enter serialized game state.
export const SETTLEMENT_GRAPH_GROUPS = Object.freeze([
  { id: "chaos", label: "Chaos" },
  { id: "resources", label: "Resources" },
  { id: "population", label: "Population" },
]);

export function getGraphGroupSeriesIds(groupId, contextId, allSeries) {
  const local = contextId === "settlement";
  let ids = [];
  if (groupId === "chaos") ids = ["monsterCount", "chaosResistance", "chaosRawPressure"];
  if (groupId === "resources") ids = ["food", "gold", "totalPopulation", ...(local ? ["housingCapacity"] : [])];
  if (groupId === "population") {
    const prefix = "population:";
    ids = ["civilizationHousingCapacity", "totalPopulation",
      ...allSeries.filter((series) => series.id.startsWith(prefix)).map((series) => series.id),
      ...(local ? ["housingCapacity"] : [])];
  }
  return ids.filter((id) => allSeries.some((series) => series.id === id));
}

export function getActiveGraphGroups(visibleIds, contextId, allSeries) {
  return SETTLEMENT_GRAPH_GROUPS.filter(({ id }) => {
    const ids = getGraphGroupSeriesIds(id, contextId, allSeries);
    return ids.length > 0 && ids.every((seriesId) => visibleIds.includes(seriesId));
  }).map(({ id }) => id);
}

export function toggleGraphGroup(groupId, visibleIds, contextId, allSeries) {
  const ids = getGraphGroupSeriesIds(groupId, contextId, allSeries);
  const active = getActiveGraphGroups(visibleIds, contextId, allSeries);
  if (!active.includes(groupId)) return [...new Set([...visibleIds, ...ids])];
  const retained = active.filter((id) => id !== groupId)
    .flatMap((id) => getGraphGroupSeriesIds(id, contextId, allSeries));
  return visibleIds.filter((id) => !ids.includes(id) || retained.includes(id));
}
