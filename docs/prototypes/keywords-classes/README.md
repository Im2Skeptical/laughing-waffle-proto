# Keywords and classes — throwaway experiment

**Integration update:** the selected [Practice keyword rules](../../practice-keywords.md)
now work in ordinary games on this branch without experiment configuration.
The reports below preserve the comparison history; A/B/C remain explicit dev
comparisons. Main is untouched. The earlier version was published for testing;
that publication does not automatically include this later integration.

**Current direction:** [A with Scholar Synthesis and Merchant Economic Regions](synthesis-a/README.md).
The [eight new Bronze card designs](bronze-cards/README.md) test the shared card
creation workflow with four new Practices for each of Scholar and Warrior.
Synthesis counts other supplied, Scholar-staffed Practices. The preceding
[multiplier-A revision](multiplier-a/README.md) is preserved as an earlier stage.
Cam leaned toward A and suggested multipliers instead of tracker strips. A now contributes
to the existing multiplier pool, with counts explained through its ledger and
linked inspection. A is the default. B/C remain comparison options; the report
and screenshots below preserve the original flat-output experiment at `e126d844`.

Question: can a named rule bundle carry a live, inspectable score across cards,
without turning a class into a compulsory civilisation build?

Local branch `proto/keywords-classes`, based on `ed68e0eb` (latest main at start).
No integration, publication or PR is intended. This is primary-source experiment
code, not an accepted design. Game design, the decisions log and aesthetic/UX
guidance govern all three options. Priest and Merchant remain planned classes.

## Run and compare

Run `npm ci`, then `npm start` from this worktree. Open the printed local URL,
then `#/dev/prototypes`. The Keywords & classes controls select option, role and
whether an earlier Economic Regions teaching exists. Open the experiment, choose
New game, and select a disposable save slot. The live workshop also has these
controls (hold the hourglass seal or Ctrl+Shift+D). Changing option deliberately
starts a new run; it never mutates a live timeline or reads its rules from storage.

Direct queries, on the printed preview origin:

- `?prototype=keywords&variant=disciplines&class=scholar`
- `?prototype=keywords&variant=disciplines&class=warrior`
- `?prototype=keywords&variant=lenses&class=scholar`
- `?prototype=keywords&variant=lenses&class=priest`
- `?prototype=keywords&variant=teachings&class=warrior`
- Add `&inherited=0` to compare an untaught civilisation in C.

The map, settlement board, clock, forecast, card faces, quick reads and recursive
inspection are the actual game. Select either player settlement. Barter carries
Economic Regions; Observation carries Monster Trophies. Tap a card to inspect;
tap its named keyword to open the definition. ER and MT on the face show the
count and added amount. Let a Death phase pass to see Monster Hunting consume
Arms and Food, kill the seeded monster, and increase Monster Trophies. The next
Birth uses the new score. Existing Crossroads routes can change trade-zone size.
Food, currency caps, worker assignment, other card effects and mortality still run.

## Shared rule grammar

Economic Regions = number of occupied settlements in the card's road-connected
component, including itself and neutral towns. Frontier and ruins break a zone.
Connection chains count; disconnected towns do not. All members of one component
read the same score. The keyword is **not** a civilisation-wide number of zones.

Monster Trophies = number of monsters destroyed during this civilisation. Hunt
and monster Campaign kills count. Defense and conquest of a neutral town do not.
It survives Vassal death; it is not spendable Loot Stock. The event emitter records
the count once for each actual destruction, independently of the bounded journal.

Each card adds one per score, capped at six, to its base one: Barter produces Stock;
Observation gains Research. Stock then uses the normal worker/output multipliers
and capacity. A class bonus of zero leaves the baseline card working. No new card
art or extra Practice slots are introduced. The numbers are provisional, selected
to expose the distinction quickly rather than establish balance.

## A — Class disciplines

Feels like choosing which part of the world your Vassal knows how to exploit.
Trade geography matters for Scholars/Merchants; a Warrior/Priest can turn dead
monsters into a growing Research engine. An off-class installed card remains
useful at base yield, but its named bonus is dormant.

Scholar and Merchant own Economic Regions; Warrior and Priest own Monster
Trophies. Counts exist globally, but only the current role can activate its
discipline. The inspection deliberately retains a dormant definition, rather than
making an installed card's rule disappear. This is **mechanical tutorial gating**:
one scaling system at a time, no permanent unlock and no account metaprogression.
The prototype supplies both example cards for comparison; a complete version would
introduce class-specific offers through the existing class/Common shop mixture.

Serves pillar 2 (distinct builds under limited opportunities) and pillar 4
(explicit count → bonus). Strains pillar 1: cross-class engine links are curtailed;
succession can disable an investment. Keep base recipes viable and preview that
loss before selecting a successor. Does not prescribe a universal development path.

Proper build cost: roughly **2–4 engineering days** for a small initial vocabulary,
including offer-pool integration, Founding/selection previews, replay tests and
phone input. Full Priest/Merchant content and balance are additional work.

## B — Shared lenses

Feels like one coherent world seen through different ambitions. Everyone uses
trade zones and monster history; the class changes what else can be made of them.
A Scholar's trade network funds Research, while a Priest makes remembered kills
resist Chaos. Losing the class leaves the shared engine intact.

Both keywords are always present and active for Warrior, Scholar, Priest and
Merchant. Emphasis is a **second DSL effect**, not just a colour or higher score:
Scholar adds Research from Economic Regions; Merchant adds Currency Stock from it;
Warrior banks formation Support from Monster Trophies (existing bank cap 10);
Priest gains temporary Chaos resistance from them, cleared at next Birth.
The normal card effects remain. Tutorial gating applies only to these extra uses;
there is no lock on understanding or using either base keyword.

Serves pillar 1 (cross-system compositions) and pillar 3 (economy, knowledge and
defense interact). Strains pillar 2: class distinctions may feel weaker and shared
staples may crowd out alternatives. Keep affinity uses complementary, rather than
making every count multiply everything. Existing five-slot and Stock caps remain.

Proper build cost: roughly **4–7 engineering days** for a small vocabulary, with
class conversion authoring, comparative tooltips, multiplier/cap clarity, succession
preview and balance passes. Full classes remain outside that estimate.

## C — Inherited teachings (bold)

Feels like building an intellectual ancestry instead of choosing a permanent job.
A Warrior can keep a trading civilisation's inherited engine and add trophy
knowledge. The first teacher matters because later Vassals can compose around
what that teacher left behind.

Merchant/Priest teach Economic Regions; Scholar/Warrior teach Monster Trophies.
The Scholar association is comparative study of monsters; the Priest association
is the economic network along pilgrim roads. A selected class teaches its keyword
to this civilisation; selected Vassals' recorded classes keep it active after their
death. A current role can use its own discipline immediately. Untaught bonuses
stay dormant, so onboarding is **historical tutorial gating**, not current-class
gating. The default fixture starts with an earlier Economic Regions teaching;
turn it off in the dev controls to see the counterexample.

Serves pillar 5's inheritance direction and pillar 1's combinations across
successions; this spike demonstrates within-civilisation transmission only.
Strains pillar 2 and the non-goal of a universal path: collecting every teacher
could become obligatory. A proper design should test a limited bequest choice
instead of automatic permanent accumulation; do not introduce mandatory tours or
maintenance chores. Cross-civilisation selection remains an open design question.

Proper build cost: roughly **1–2 engineering weeks**, excluding full classes:
authored teaching choices, lineage UI, constrained bequests, class-introduction
rules, succession/replay tests, and the question of what can cross civilisation
boundaries. This option changes progression more substantially than A or B.

## Evidence and limits

- `npm run test:keywords` covers all twelve mode/class combinations, actual
  hunting, disconnected roads, the neutral member, class-specific extra effects,
  past teachers, non-kill exclusions, exact replay including RNG, and JSON resume.
- `node scripts/keywords-classes-prototype-browser.mjs` runs against the local
  preview (`KEYWORD_PREVIEW_URL` overrides its origin). It captures 844×390 PNGs
  from real authoritative game states and real card inspection. It uses the
  supported debug browser seek to the first post-Hunt state, not a mock renderer.
- `browser-evidence.json` records bounded readings, counts and browser errors.
- A's Scholar/Warrior captures show the reciprocal active/dormant pair; B's Scholar
  and Priest captures show economic and trophy conversions; C's Warrior captures
  show both an inherited economic bonus and a current trophy bonus.

Phone-landscape screenshot pairs (all 844×390):

- A: [Scholar / Economic Regions](disciplines-scholar-economicRegions.png) and
  [Warrior / Monster Trophies](disciplines-warrior-monsterTrophies.png).
- B: [Scholar / economic Research](lenses-scholar-economicRegions.png) and
  [Priest / trophy Resistance](lenses-priest-monsterTrophies.png).
- C: [inherited Economic Regions](teachings-warrior-economicRegions.png) and
  [Warrior-taught Monster Trophies](teachings-warrior-monsterTrophies.png).
- Linked definitions: [A](disciplines-scholar-economicRegions-definition.png),
  [B](lenses-priest-monsterTrophies-definition.png), and
  [C](teachings-warrior-economicRegions-definition.png).

Each pair also has a `*-board.png` capture in this folder, plus reciprocal keyword
readings and `*-definition.png` captures. These preserve surrounding map and clock
context as well as the shared card reader.

Verification on 24 October 2026: `npm run verify` passed; the focused prototype
tests passed again after checking actual class selection and between-life behavior.
The browser run passed all five option/role states, ten keyword-definition taps,
and workshop controls, with no page errors. All 25 PNGs are exactly 844×390.

The supplemental `npm run probe:settlement` fails its existing civilisation graph
assertion: expected initial Chaos resistance 0, actual 57.5. The same command fails
with the same values against starting commit `ed68e0eb`, exported into an ignored
artifact folder with unchanged model/view code. Only the temporary baseline asset
copy uses junction dereferencing for Windows. This is not a prototype regression;
the graph and assertion were left unchanged. Local details:
`artifacts/settlement-browser-probe.json` and
`artifacts/keywords-baseline/artifacts/settlement-browser-probe.json`.

Temporary scaffolding: seed 1867; two normal player settlements; five installed
real cards per settlement, silver quality; initial Arms/Food supplies; one adjacent
zero-Defense monster for an early guaranteed Hunt. The earlier teaching is captured
launch data, not a simulated prehistory. The regular seed's two allies and neutral
trade town produce an Economic Regions count of three. This fixture is disposable
and can be saved only to a slot explicitly selected by the player.

The role selector is a focused rules lens, not a complete class implementation.
Actual Scholar/Warrior selection takes over for those two role contexts. Priest and
Merchant lenses remain explicit experiments. No new class-introduction mechanism,
account unlocks, priest vault ability, heirloom persistence, or new artwork is
claimed. C reads real selected-class history, but its cross-class introduction
and inheritance choices still need design work. Existing class progression is
preserved; the fixture exposes the proposed combination without building that
unresolved system.

The optional prototype config and history counter are plain JSON. No new RNG,
tick, schema number, or view-side simulation mutation is introduced. Named scaling
is a reusable DSL amount modifier over existing effects. Replaying and workers
read the same captured option, never browser preferences. Normal launches have
no prototype config and retain their existing rules. No production choice is
accepted by the existence of these screenshots.
