# Milestone 2 Substage 3 — Shared-Edge Test Configuration

## Configurations

- `milestone2Blank01` / `devMilestone2Blank01`: the authored shared-edge topology with no installed regional practices.
- `milestone2Sparse01` / `devMilestone2Sparse01`: the same map with sparse Store, Study, Cultivate, and Administer installations. Every player region retains one open capacity slot.
- Map Lab exposes both configurations through its authored-scenario selector.
- Mechanical JSON exports live in `exports/milestone2-blank-01.json` and `exports/milestone2-sparse-01.json`.

Every connection joins regions whose polygons share a complete vertex-to-vertex edge. The geometry supplies 25 possible mainland pairs; the authored configuration activates 17. Outer Isles shares no polygon edge with any other region, so it is necessarily an isolated fifteenth region under this rule.

## Topology and politics

Player territory is the connected four-region chain West Levee–Upper Floodplain–River Crown–Lake Country. Cedar Woods, High Pass, and Black Marsh are frontier regions. The remaining eight regions are split evenly between external-a and external-b.

- West Levee and Lake Country are the two degree-four player hubs, preventing one uniquely dominant connectivity location.
- Upper Floodplain is the politically deep degree-two capacity-four region.
- West Levee is an exposed player frontier with three non-player neighbours.
- The red West Levee–Upper Floodplain–River Crown chain is the visible homogeneous cluster.
- Lake Country is a blue crossroads touching red, green, blue, and black neighbours. Its blue edge with frontier-controlled Black Marsh crosses a political boundary.
- Copper Basin–East Steppe–Obsidian Ridge is an external loop.
- Iron Hills–High Pass–Copper Basin is a corridor linking the western player edge to the external loop.
- Black Marsh–Salt Coast is the bottleneck into the degree-one Salt Coast peripheral mainland branch.
- Blue is comparatively rare and appears at Lake Country, Black Marsh, and isolated Outer Isles.

## Score matrices

Scores are hypothetical placements in eligible player regions. Column order is West Levee, Upper Floodplain, River Crown, Lake Country.

### Blank suitability scenario

| Practice | West Levee | Upper Floodplain | River Crown | Lake Country |
| --- | ---: | ---: | ---: | ---: |
| Cultivate | 2 | 3 | 2 | 1 |
| Store | 1 | 1 | 1 | 1 |
| Study | 1 | 1 | 1 | 1 |
| Mobilize | 4 | 1 | 2 | 4 |
| Administer | 1 | 1 | 1 | 1 |
| Exchange | 4 | 1 | 3 | 4 |

Store, Study, and Administer are intentionally flat when the tableau is blank; this scenario isolates spatial suitability.

### Sparse interaction scenario

| Practice | West Levee | Upper Floodplain | River Crown | Lake Country |
| --- | ---: | ---: | ---: | ---: |
| Cultivate | 2 | 3 | 2 | 1 |
| Store | 3 | 1 | 1 | 2 |
| Study | 2 | 3 | 2 | 3 |
| Mobilize | 4 | 1 | 2 | 4 |
| Administer | 3 | 2 | 2 | 3 |
| Exchange | 4 | 1 | 3 | 4 |

No sparse-scenario evaluator is flat. Best regions differ: Upper Floodplain for Cultivate; West Levee for Store; Upper Floodplain/Lake Country for Study; and West Levee/Lake Country for Mobilize, Administer, and Exchange.

## Diagnostic revision

The first shared-edge pass omitted West Levee–Iron Hills and included Black Marsh–Obsidian Ridge. Lake Country was then the sole best region for both Mobilize and Exchange, scoring 4 for each. It appeared in five evaluator best-sets.

The revision:

- added the legal West Levee–Iron Hills edge, raising West Levee's Mobilize and different-colour Exchange scores to tie Lake Country;
- removed Black Marsh–Obsidian Ridge, making Black Marsh–Salt Coast a clearer bottleneck and preserving the peripheral mainland branch.

The final sparse diagnostics contain no shared sole-best region. West Levee and Lake Country each appear in four best-sets, Upper Floodplain appears in two, and no region leads every evaluator.

Exchange was subsequently narrowed from counting every host connection to counting only adjacent regions with a colour different from the host. This reduces its scores on homogeneous interiors, makes its readable breakdown explicitly colour-based, and leaves the topology unchanged.

## Assessment and concerns

The minimal grammar remains sufficient for a first placement experiment. Constraining the graph to visible shared-edge adjacency substantially improves legibility and still permits distinct overlapping preference maps.

Open concerns:

- Outer Isles cannot participate in the graph because its polygon is spatially separate. Connecting it later would require redrawing the geometry, removing the region, or explicitly introducing a non-shared-edge mechanic; the latter is outside this experiment.
- Store, Study, and Administer have no spatial signal on a blank tableau, so the paired seeded scenario remains necessary.
- Study and Administer vary by only one point in the sparse scenario, so their placement tension may remain subtle.
- Exchange and Mobilize still share the same two best locations on this authored map, although River Crown now distinguishes them by one point. This correlation is a remaining configuration concern rather than a formula ambiguity.
- Capacity creates eligibility and sequencing tension rather than directly changing evaluator scores.
