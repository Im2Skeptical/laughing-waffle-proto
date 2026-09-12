# Graph metrics split

Public exports stay on `src/model/graph-metrics.js` (`GRAPH_METRICS`,
`getGraphMetric`, `SETTLEMENT_RESOURCE_COLOURS`). Live food, population, and
chaos series values stay in that file.

## Files

- `legacy-metrics.js` — leftover Gold/Grain/AP plus hub-vs-prototype
  food/population metrics. Grain/AP are unused by Chaos/Resources/Population
  UI groups; Gold remains the unscoped controller fallback.
- `tooltips.js` — legend tooltip copy. Detailed food uses stored/loose
  language, not hub floodplain stockpiles.
