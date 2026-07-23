# Milestone 2 Substage 3 — Shared-Edge Test Configuration

## Configurations

- `milestone2Blank01` / `devMilestone2Blank01`: the authored shared-edge topology with no installed regional practices.
- `milestone2Sparse01` / `devMilestone2Sparse01`: the same map with sparse Store, Study, Cultivate, and Administer installations. Every player region retains one open capacity slot.
- Map Lab exposes both configurations through its authored-scenario selector.
- Mechanical JSON exports live in `exports/milestone2-blank-01.json` and `exports/milestone2-sparse-01.json`.

Every connection joins regions whose polygons share a complete vertex-to-vertex edge. The geometry supplies 25 possible mainland pairs; the authored configuration activates 17. Region15 shares no polygon edge with any other region, so it is necessarily isolated under this rule.

## Topology and politics

Player territory is the connected four-region chain Region03–Region06–Region07–Region11. Region01, Region05, and Region12 are frontier regions. The remaining eight regions are split evenly between external-a and external-b.

- Region03 and Region11 are the two degree-four player hubs, preventing one uniquely dominant connectivity location.
- Region06 is the politically deep degree-two capacity-four region.
- Region03 is an exposed player frontier with three non-player neighbours.
- The red Region03–Region06–Region07 chain is the visible homogeneous cluster.
- Region11 is a blue crossroads touching red, green, blue, and black neighbours. Its blue edge with frontier-controlled Region12 crosses a political boundary.
- Region09–Region10–Region14 is an external loop.
- Region02–Region05–Region09 is a corridor linking the western player edge to the external loop.
- Region12–Region13 is the bottleneck into the degree-one Region13 peripheral mainland branch.
- Blue is comparatively rare and appears at Region11, Region12, and isolated Region15.

## Score matrices

Scores are hypothetical placements in eligible player regions. Column order is Region03, Region06, Region07, Region11.

### Blank suitability scenario

| Practice | Region03 | Region06 | Region07 | Region11 |
| --- | ---: | ---: | ---: | ---: |
| Cultivate | 2 | 3 | 2 | 1 |
| Store | 1 | 1 | 1 | 1 |
| Study | 1 | 1 | 1 | 1 |
| Mobilize | 4 | 1 | 2 | 4 |
| Administer | 1 | 1 | 1 | 1 |
| Exchange | 4 | 1 | 3 | 4 |

Store, Study, and Administer are intentionally flat when the tableau is blank; this scenario isolates spatial suitability.

### Sparse interaction scenario

| Practice | Region03 | Region06 | Region07 | Region11 |
| --- | ---: | ---: | ---: | ---: |
| Cultivate | 2 | 3 | 2 | 1 |
| Store | 3 | 1 | 1 | 2 |
| Study | 2 | 3 | 2 | 3 |
| Mobilize | 4 | 1 | 2 | 4 |
| Administer | 3 | 2 | 2 | 3 |
| Exchange | 4 | 1 | 3 | 4 |

No sparse-scenario evaluator is flat. Best regions differ: Region06 for Cultivate; Region03 for Store; Region06/Region11 for Study; and Region03/Region11 for Mobilize, Administer, and Exchange.

## Diagnostic revision

The first shared-edge pass omitted Region03–Region02 and included Region12–Region14. Region11 was then the sole best region for both Mobilize and Exchange, scoring 4 for each. It appeared in five evaluator best-sets.

The revision:

- added the legal Region03–Region02 edge, raising Region03's Mobilize and different-colour Exchange scores to tie Region11;
- removed Region12–Region14, making Region12–Region13 a clearer bottleneck and preserving the peripheral mainland branch.

The final sparse diagnostics contain no shared sole-best region. Region03 and Region11 each appear in four best-sets, Region06 appears in two, and no region leads every evaluator.

Exchange was subsequently narrowed from counting every host connection to counting only adjacent regions with a colour different from the host. This reduces its scores on homogeneous interiors, makes its readable breakdown explicitly colour-based, and leaves the topology unchanged.

## Assessment and concerns

The minimal grammar remains sufficient for a first placement experiment. Constraining the graph to visible shared-edge adjacency substantially improves legibility and still permits distinct overlapping preference maps.

Open concerns:

- Region15 cannot participate in the graph because its polygon is spatially separate. Connecting it later would require redrawing the geometry, removing the region, or explicitly introducing a non-shared-edge mechanic; the latter is outside this experiment.
- Store, Study, and Administer have no spatial signal on a blank tableau, so the paired seeded scenario remains necessary.
- Study and Administer vary by only one point in the sparse scenario, so their placement tension may remain subtle.
- Exchange and Mobilize still share the same two best locations on this authored map, although Region07 now distinguishes them by one point. This correlation is a remaining configuration concern rather than a formula ambiguity.
- Capacity creates eligibility and sequencing tension rather than directly changing evaluator scores.
