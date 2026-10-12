# Protovassal opening experiment

Open **Development Lab → Prototypes → Protovassal opening**, or run
`npm run preview:opening` and open
<http://localhost:5185/images/dark-fantasy/life-map-opening-prototype/>.
The Pages build bundles this page separately; player modules never import it.

The question is whether a curated Warrior opening teaches Prestige, makes early
military preparation useful and gives every encountered node a benefit or an
avoidable, signalled cost. This is an experimental first draft, not a finalized
opening or a replacement for normal gameplay.

## Modules

- `experiment.js`: editable JSON graph, offers and validation.
- `model.js`: disposable encounters using existing Life Map effects and fresh-game state.
- `controller.js`: transactions, tick resolution, complete rewind checkpoints and separate draft storage.
- `study.js`: compact text gameplay, graph/node editing, outcomes and guided experiments.

The initial branches are a curated ordinary Relic and a bundled world opportunity.
Both converge on Warrior founding, followed by expenditure, Development, martial
response, Stock Supply and an easy benefit. Node editing changes the draft only;
Restart captures it in a new disposable session. Advanced JSON supports adding
nodes/offers, changing entry points and rewiring the graph. Validation requires a
reachable acyclic graph whose every entry path reaches one founding node.

Save/Load uses `civsurvivor.prototype.warriorOpening.v1`, independently of player
saves, reviewed cards, launch profiles and the Museum. Export/import transfers
experiment recipes, not game saves. Rewind restores the whole prior state, RNG
and encounter history. Guided tabs restart the built-in experiment and provide a
Next guided choice button; all ordinary free-play controls remain available.

## Real rules and experimental differences

Fresh-game initialization, hosted Stock, five-slot Practices, construction,
Retinue, Campaigns, crisis responses, heirloom effects, ability gains, mortality
and elapsed simulation time use the existing engine. Time advances through real
ticks, with short yields so the interface remains responsive.

The outer authored graph is independent of the generated runtime graph. Its
encounters borrow ordinary runtime slots; founding uses the existing founding
slot at the authored convergence point. Normal GameState and graph schemas are
unchanged. The compact DOM controls are not a test of the full game's UI.

Curated shop offers use existing card definitions and eligibility. Ordinary
relics have zero direct death risk and explicit authored Chaos costs. The separate
`specialRelic` kind permits signalled direct death risk after founding. World
encounters combine real travel/route options and, for Warriors, legal Campaigns.
Martial encounters combine legal Campaigns/crisis responses with authored useful
alternatives. Stock Supply retains the current global unmet-input check.

Current routine node Prestige/Development gains and earned level-ups still apply.
Pre-founding actions reaching age 40 or containing direct death risk are blocked;
the real civilization can still collapse. No new Scholar unlock rule is applied.

Validate deployment with `npm run verify`. The updated
`npm run probe:prototypes` checks the directory, retirement, opening playthrough,
rewind, edited costs, draft persistence/import and mobile containment.
