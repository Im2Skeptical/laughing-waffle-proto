# Milestone 2 Substage 3 — First Authored Test Configuration

## Configurations

- `milestone2Blank01` / `devMilestone2Blank01`: identical topology and region properties with no installed regional practices.
- `milestone2Sparse01` / `devMilestone2Sparse01`: the same map with sparse Store, Study, Cultivate, and Administer installations. Every player region retains one open capacity slot.
- Map Lab exposes both configurations through its authored-scenario selector.
- Mechanical JSON exports live in `exports/milestone2-blank-01.json` and `exports/milestone2-sparse-01.json`.

## Topology and politics

Player territory is the connected four-region centre: West Levee, Upper Floodplain, River Crown, and Lake Country. Cedar Woods, High Pass, and Black Marsh are frontier regions. The remaining eight regions are split evenly between external-a and external-b.

- Lake Country is the six-edge, mixed-colour crossroads and Exchange hub.
- Upper Floodplain is the politically deep, lower-connectivity capacity-four region.
- West Levee is an exposed player frontier with three non-player neighbours.
- The red West Levee–Upper Floodplain–River Crown chain is the visible homogeneous cluster.
- Lake Country touches neighbours of all four colours; its blue link to external-b Reed Delta crosses a political boundary.
- The player centre contains multiple loops. Copper Basin–East Steppe–Obsidian Ridge supplies an external loop.
- Iron Hills–High Pass–Copper Basin is a corridor.
- Black Marsh–Salt Coast is the bottleneck into the Salt Coast–Outer Isles peripheral branch.
- Blue is comparatively rare and terminates at peripheral Outer Isles.

## Score matrices

Scores are hypothetical placements in eligible player regions. Column order is West Levee, Upper Floodplain, River Crown, Lake Country.

### Blank suitability scenario

| Practice | West Levee | Upper Floodplain | River Crown | Lake Country |
| --- | ---: | ---: | ---: | ---: |
| Cultivate | 2 | 3 | 2 | 1 |
| Store | 1 | 1 | 1 | 1 |
| Study | 1 | 1 | 1 | 1 |
| Mobilize | 4 | 1 | 3 | 4 |
| Administer | 1 | 1 | 1 | 1 |
| Exchange | 6 | 4 | 5 | 7 |

Store, Study, and Administer are intentionally flat when the tableau is blank; this scenario isolates spatial suitability.

### Sparse interaction scenario

| Practice | West Levee | Upper Floodplain | River Crown | Lake Country |
| --- | ---: | ---: | ---: | ---: |
| Cultivate | 2 | 3 | 2 | 1 |
| Store | 3 | 1 | 1 | 2 |
| Study | 2 | 3 | 2 | 3 |
| Mobilize | 4 | 1 | 3 | 4 |
| Administer | 3 | 2 | 2 | 3 |
| Exchange | 6 | 4 | 5 | 7 |

No sparse-scenario evaluator is flat. Best regions differ: Upper Floodplain for Cultivate; West Levee for Store; Upper Floodplain/Lake Country for Study; West Levee/Lake Country for Mobilize and Administer; Lake Country for Exchange.

## Diagnostic revision

The first pass made Lake Country the sole best region for both Mobilize and Exchange. It had four non-player neighbours, a Mobilize score of 5, an Exchange score of 7, and appeared in five evaluator best-sets.

The revision:

- added the internal Upper Floodplain–Lake Country connection;
- added the boundary-crossing West Levee–Iron Hills connection;
- removed Lake Country–Black Marsh;
- removed Obsidian Ridge–Salt Coast.

This retained Lake Country as the connectivity hub while reducing its non-player exposure from four to three. Mobilize now ties at 4 between Lake Country and West Levee. The southeast change also created a clearer Black Marsh bottleneck and peripheral branch. In the sparse scenario Lake Country now appears in four best-sets, West Levee in three, and Upper Floodplain in two; no region leads every evaluator.

## Assessment and concerns

The minimal grammar is sufficient for a first placement experiment: topology, political boundaries, colour, capacity, and tableau order produce distinct but overlapping preference maps without assigning exactly one region to each practice.

Open concerns:

- Store, Study, and Administer have no spatial signal on a blank tableau; the paired seeded scenario is necessary to evaluate them.
- Study and Administer vary by only one point in the sparse scenario, so their placement tension may remain too subtle in play.
- Exchange still strongly rewards the visible hub, although its low relative capacity and weaker Cultivate/Store scores provide counter-pressure.
- Cultivate ignores matching colours across non-player boundaries by design; the blue Lake Country–Reed Delta pattern is visible but currently matters only if political control changes in a future experiment.
- Capacity creates eligibility and sequencing tension rather than directly changing evaluator scores. Longer play is needed to learn whether that is enough.
