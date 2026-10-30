# Laughing Waffle: decisions log

**Updated through 82a68da** (2026-10-26). Original audit: `4014a92`, 2026-10-18.

Corrected on 2026-10-18 after the design-vs-implementation audit. The first draft was built from a local checkout (`45745e5`, 8 Oct) that was 200 commits behind `origin/main`, so several of its "contradictions" were already fixed in code and have been updated below. Cam's answers of 2026-10-18 are recorded as LOCKED in section 0 and in the area sections. This living log is not a full code audit.

**Sources**
- Trello board "Laughing Waffle Ideas" (read 2026-10-18: Inbox 51, In progress 2, Ready 0, Done 44, before the audit follow-up cards). Short links are `https://trello.com/c/<id>`; below only the id is shown, e.g. `c/6qqmQxbx`.
- Repo `Im2Skeptical/laughing-waffle-proto` at `origin/main` `4014a92`. Design-bearing docs read: README.md, AGENTS.md, CONTEXT.md, ai/ai-context.md, ai/sim.md, ai/ui.md, docs/civilization-milestone.md, docs/civcontent-2.6-implementation.md, docs/timegraph-ux-and-capacity-brief.md, docs/timegraph-optimisation-guardrails.md, docs/vassal-selection-prototype.md, docs/development-lab.md, docs/minimal-bronze-test-set.md, src/model/vassal-life-map/README.md. `ai/history/*` is historical and not used for claims.
- Implementation facts come from Code Health's implemented-features write-up of `4014a92` and spot-checks by `git show` / `git grep` / node imports against `4014a92`. Items marked **[built]** were checked in code; **[partial]** and **[not built]** are noted explicitly.
- All 653 commits are authored as `Im2Skeptical` and history was rewritten on 8 Oct, so git cannot separate Cam's text from AI text. No repo doc is verifiably Cam's own notes; only `docs/timegraph-ux-and-capacity-brief.md` says it records Cam's intent.


**Rules used**
- LOCKED = Cam explicitly decided it. Evidence is a labelled `Decision (Cam)` / `Decisions (Cam)` / `Decision:` / `Approach (Cam)` / `Constraint (Cam)` / `Priority (Cam)` / `Design notes (Cam)` / `Clarified` block, a directive in Cam's own shorthand on a card that is in the Done list (marked `[Done card]`), or Cam's verbatim chat/shorthand stating "we decided". Cleaned-up text written by the bot is not treated as a decision.
- OPEN = open questions on cards, ideas still sitting in Inbox/In progress, and contradictions.
- DOCS-ONLY CLAIMS = things repo docs state as design or behaviour that no Trello decision locks. Docs are AI-written; treat them as claims to check. Where I checked code it is noted. Entries are checked against `4014a92` where noted.
- Trello card text often said "(In progress)" in Related lines for cards that are now Done; those labels were corrected on 2026-10-18. Only c/5hZZB8qo and c/97w8GxRT are actually In progress.

---

## 0. Decisions by Cam, 2026-10-18

### LOCKED
- Device floor is Pixel 6 (it replaces Pixel 3). (c/3UX7cTZf updated)
- Priest and Merchant are still planned as the next classes after Scholar and Warrior. (c/pWk7dIEn updated)
- Buying at a shop with no Prestige adds a flat +10 Monster Pressure; Cam: "its fine for now". (c/6qqmQxbx)
- Keep the Random +10 Prestige option as the third slot in shops (practice shops: 2 stock tags plus Random). It works well in current playtesting. (c/Ab6XVvDM)
- Chaos gods, as design direction only (the exact implementation is still to be narrowed down): a flavourful way of creating different kinds of pressure. Philosophically they map to dimensions, probably relatable to the Magic: The Gathering colours. They are necessary components of a complex system; pushed too far they lead to a destructive failure state, narratively like the chaos gods in Warhammer lore. In gameplay they work like the bosses in Balatro or Slay the Spire, testing a deck's ability to handle stress along certain dimensions. (c/3OngyRBs; recorded on c/jtlmCOzz, c/tjM2LfrT, c/VSzy2CRd)
- Neutral-town billboard prices should ideally move eventually, but that is low priority. Higher priority: neater, nicer UX, showing fewer options, and more variety in each settlement's wares. (c/YGXLJ05z, c/vY4qkNuU)
- The "1000 years in 1 second" target is a performance goal (make the engine as performant as possible) and a narrative device for how the player should feel: change something and see the effect across time almost instantly. It is not a hard requirement. (c/Jn2BM22a)

### OPEN (Cam said undecided)
- Neutral takeover rework: undecided, needs fleshing out; blocked on Cam's own discussion. (c/zpigMvXJ)
- Political prestige on the billboard: not answered (no such value exists in the code).

---

## 1. Economy and shops

### LOCKED
- Buying at shops with no Prestige stays possible; the penalty is a pushed monster wave (Monster Pressure), not Chaos. Cam: "I think we already decided that penalties were not to chaos but to pushing for a monster wave. So we do it that way." (c/6qqmQxbx) **Built [built]:** if an add-Practice or add-Structure offer costs more Prestige than the vassal has, its Prestige cost becomes 0 and confirming adds a flat +10 Monster Pressure (all-or-nothing per offer, not scaled; shown in the cost box). Numbers locked by Cam on 2026-10-18 (section 0). The Inbox card c/6qqmQxbx is now effectively built; it has a comment for Cam to confirm.
- Every early chain should greatly increase food capacity, housing capacity or research. (c/t8QX1qpP, "Decision:")
- Shop card replacement is the player's free choice of any card, and the removed card must be visible. (c/KxLXLA7M "Decision (Cam)"; c/88oVAj2s)
- Shops communicate that several offers can be bought per visit; discard pile is interactive and cards can be dragged back; avoid adding text, no invented titles/subheadings. (c/88oVAj2s, "Constraint (Cam)") [Done card]
- Shop mix: most shops are 2 class-specific + 1 generic offers, plus one generic-only node and one class-only node. "Shop" means the card market nodes. (c/n8StneM7, "Clarified") [Done card]
- Food (and ideally all practice inputs) are sourced from player-controlled adjacent and connected settlements; base behaviour is adjacent sourcing; show transfer icons on the map. (c/PbTqRcm5, "Decisions (Cam)") [Done card]
- Structure shop offers are repeatable building plans with Stock/material costs; playtest this as the first economic sink. (c/As2vcsWD) [Done card]
- Tag picker: practice shops offer 2 stock tags plus a Random option worth +10 Prestige; Cam keeps Random as the third slot (2026-10-18). Structure shops offer Housing / Stock / Special. **[built]** (c/Ab6XVvDM)

### OPEN
- Does "Redesign early game economy" replace or absorb the initial balance pass? Which outputs count as "clear"? (c/dtQKoUpd)
- Fix dead-end early chains by changing shop mix, practice inputs, or gating complex chains? (c/t8QX1qpP)
- Tag picker (built as 2 stock tags + Random +10 Prestige for practices; Housing/Stock/Special for structures): does the pick filter offers or only weight them? What is Special? The "3 tags" in the card text no longer matches the build. (c/Ab6XVvDM)
- Categorical balance values (low/med/high shared table) as the long-term balance pattern. Idea only. (c/VrmwLcLT)
- Population payoff audit: which mature chains dead-end; add endpoints or cut chains? (c/gNdn4KIl)
- Housing ladder: which Stock Traits gate each tier; do higher tiers need Research? (c/fCVEgZX5)
- Structure material audit: which Stock Traits are broad enough; cut Prestige/time across the board or only ordinary Structures? (c/HUZs7pQ9)
- Repeatable structure plans: per-settlement repeat limits? interaction with slots, replacement, discard? (c/As2vcsWD)
- Practice requirements as bonuses instead of hard blocks: which requirements convert; bonus form; card UX. (c/YEwT7ass)
- Pricing and balance for adjacent sourcing: do requirements count neighbours' structures/population? Distance limits beyond adjacent? (c/PbTqRcm5)
- No card found for "the first slot in practice shops" (Cam asked in chat; still unanswered).

### DOCS-ONLY CLAIMS
- Default New Game shared prices for both Practice and Structure purchases are Bronze–Diamond 10/20/30/40 Prestige and 2/3/4/5 years. With shared pricing disabled, card-definition bases remain 10 Prestige / 12 phases for Practices and 2–5 Prestige / 1–2 phases for Structures; construction needs 3–8 paid Housing-phase cycles. 110 Practices and 78 Structures in code. **[built]** (docs/civilization-milestone.md, Code Health)
- Common Housing ladder in code: 30/60/90/210/360/630. **[built]**
- Hosted Stock only: Food and Currency are derived by Trait; no loose wallets; providers chosen local-first then adjacent-and-connected. **[built]** (Code Health; ai/sim.md, ai/ai-context.md). `localCurrencyCost` exists but is 0 on every Structure (stub).
- Worker bonus is +100% per effective worker. Existing flat purchase prices remain "provisional". (docs/civilization-milestone.md, civcontent doc)
- Currency purchases and Crisis procurement debit hosts; Trade is a bonus to Barter, not a rival buying strategy. (docs/civilization-milestone.md)
- Food Shop and Housing Shop are ordinary Life Map nodes with equal early/mid/late weights, about three per graph. Naming trap: the Life Map node family `neutralMarket` is the unclassed Common-pool card shop, **not** a neutral-town visit; unclassed Life Maps swap Class Markets for it. (docs/civilization-milestone.md, Code Health)
- Shop purchases are ordered drafts; only Scholars can refresh offers through Delve while the draft is empty, at a shared base 10 years before discounts. (ai/sim.md, ai/ui.md) **[built]**
- Stock Supply nodes (`stockShop`) focus on one named output; each Life Map inserts 2 random outputs and guarantees one the player lacks. **[built]** The Inbox card c/ZdxHz1ai is effectively built (comment added for Cam to confirm).

---

## 2. Monster Pressure, Chaos and chaos gods

### LOCKED
- Green Ascendancy is a visual-only placeholder pending a chaos-god rework, with tiers at 100/200/300 years (capped at 3), no gameplay effects, and debug tier/cadence controls. Decision (Cam, 2026-10-18, c/OI0fWgOb); **[built]** (#38).
- Replace the fixed 1000-Chaos monster spawn with deterministic Monster Pressure: smooth, log-style curve, pulses advance existing monster threat before spawning more. (c/Ip5xsBYi) [Done card] **[built]** Shared Monster Pressure tracker, one front per 100 progress.
- Selected ambitious actions generate explicit Chaos (Raid, conquest/aggressive Campaign, powerful Discovery, esoteric knowledge, forbidden/ruin interactions) and show the Chaos cost in the action UI. (c/33DTojMF) [Done card] **[built, with a substitution]:** the cost is Monster Pressure, not Chaos. 8 Practices carry `addMonsterPressure` (astronomy 5, forecasting 5, alchemy 10, charnelAlchemy 15, experimentation 10, ruinDelving 10, raidingParties 5, mountedRaiding 20); the `addChaos` op exists but no Practice uses it. Chaos itself only accrues passively via Faith-phase Primordial pressure. Whether the substitution is intended has not been confirmed by Cam.
- Introduce monsters from the world to pressure the player once food is solved. (c/DE1YlyEu) [Done card]
- An early monster or martial pressure point: the purpose is to pressure martial/defence earlier than now. (c/jtlmCOzz "Decision (Cam)")
- Every game starts with one small neutral settlement connected to the start, playtested for Growth vs Opportunity vs Monster Threat. (c/mUhzjpPK) [Done card] **[built, different count]:** the code seeds 4 neutral towns (one adjacent to the capital and force-connected by road) plus 1 weak opening Monster.
- Parked, leaning no: Dark Souls style fire-kingdom/ruins lifecycle; Cam judges rising chaos-god pressure stronger. (c/VSzy2CRd, "Status: parked idea, leaning no")
- Chaos gods direction (Cam, 2026-10-18): see section 0. Direction only; no chaos-god system exists in code. (c/3OngyRBs)

### OPEN
- Monster Pressure: exact curve and tuning; what a pulse can do (spread, strengthen, new lair); how the player sees the next pulse. (c/Ip5xsBYi)
- Ambitious Chaos: flat vs scaled by power; which other actions join. (c/33DTojMF)
- Monster rewards (In progress): strengthen them. What Monsters give now is answered by docs (see Docs-only claims); tie into warrior currency-like resource? (c/97w8GxRT)
- Early monster node: guaranteed in the first few nodes or weighted? How does it tie into chaos gods? (c/jtlmCOzz) Code: one Monster is seeded at the start but there is no early martial Life Map node (Campaign, Challenge and Crisis have weight 0 in the early band).
- Chaos gods: direction is now locked (section 0) but the exact implementation is open. Three cards depend on them (c/jtlmCOzz, c/tjM2LfrT, c/VSzy2CRd); how many gods, which dimensions, how they are tested, how they relate to Chaos, Monster Pressure and Green Ascendancy. (c/3OngyRBs)
- Last life: on death offer a super-powerful chaos god enchant + one final life. Blocked on chaos gods. What counts as death; pick-from-few or random? (c/tjM2LfrT)

### DOCS-ONLY CLAIMS
- At Death, Monster Pressure gains `(1 + ln(1 + Chaos/100)) / 24` pulses; fractional pressure is saved; Chaos stays accumulated. A pulse rotates among expandable fronts, three advances expand one; new Monster spawns only if no front can expand; if map full, a blocked Monster strengthens. (ai/sim.md, docs/civilization-milestone.md)
- Each fresh game seeds one weak Defense-2 frontier Monster, ideally one frontier step from player settlements. (ai/ai-context.md, docs/civilization-milestone.md)
- Faith phase adds uncapped civilization-wide "Primordial pressure" (cadence-based exponentiation); loss pressure and population/Faith resistance set the Chaos that arrives. (ai/sim.md)
- Action costs are fixed numbers of Monster Pressure (not Chaos): see the LOCKED item on ambitious actions. This answers c/33DTojMF's "flat vs scaled" for the current build (fixed), but no Trello decision confirms it. **[built]**
- Monster rewards now: Campaign victories give 12 + 4xDefense Prestige and 3xDefense Research; automatic hunts give Loot/Record/Currency trophies and 6 Research; defense/diversion give Defense Research and diversion 6 Prestige. (docs/civilization-milestone.md) This answers c/97w8GxRT's "what do Monsters give now".
- Settlement loss is the run-ending condition; loss history feeds later content. (ai/sim.md)
- Legacy Red God simulation removed; live graphs and Life Map effects use civilization Chaos. Saved effect and loss-reason aliases remain readable. (c/Gfij80No)
- Built per Code Health: Chaos income, Resistance, shared Monster Pressure tracker, action risk, defense/loss, run end when no player settlement is left.

---

## 3. Neutral towns, conquest and regional map

### LOCKED
- Neutral towns have no practice board or structures; the main element is a billboard of stocks with prices (maybe population and political prestige); currency is the sink; you draw from neighbouring neutral settlements at those prices. (c/YGXLJ05z) [Done card] **[built]:** neutrals cannot hold Practices or Structures (`src/views/neutral-market-pixi.js:19`, `src/model/detailed-settlements/neutral-market.js:43`). **Not built:** political prestige (does not exist in `src`), price movement (prices are fixed authored values), and a spender for the Currency neutrals receive (`currencyStock` accumulates and nothing spends it).
- Neutral towns must be far more distinct from player towns: headings AND graphics and banners. (c/FD0yQwhI "Decision (Cam)") **[built]:** teal glyph and billboard art.
- Eventually categorise neutral towns (e.g. mining, farming), each with a sensible market and sensible practices on conquest, communicated to the player. (c/vY4qkNuU, priority "later")
- Highlighting a settlement shows its adjacent and connected neighbours. (c/wAHOcn0X) [Done card]
- Regional resources view: stock tag icons above settlements; red outline = consumer with no local source, green = producer with nonlocal consumer, none = producer with local consumer. (c/zczQznSj) [Done card]
- Expanding means creating a settlement (timeline card). (c/GtoOjsuv "Decision (Cam)")

### OPEN
- Neutral takeover: undecided, needs fleshing out, blocked on Cam's own discussion (2026-10-18). Current build: 4 fixed neutral towns, no spawning, they never grow, build or do diplomacy. Open: how often to campaign vs how often neutrals appear; takeover other than campaigning (trade, prestige, billboard)? (c/zpigMvXJ, size L)
- Billboard: prices should ideally move eventually (supply, distance, demand), low priority; the higher priority is neater UX, fewer options shown, and more variety in each settlement's wares. Political prestige is unanswered. (c/YGXLJ05z)
- Neutral categories: what are they, how shown, does conquest swap billboard for a fixed practice set or a pool draw? (c/vY4qkNuU)
- Opening neutral: what counts as "meaningful early interaction"? Answered for connection: the first neutral is adjacent to the capital and force-connected by road. (c/mUhzjpPK)
- Neutral distinctness: settlement view, regional map or both? (c/FD0yQwhI)
- Regional name generator: deterministic from seed? terrain-aware? same generator for neutrals? (c/PP8AslAw)
- Regional map graphics pass: adopt the five MTG biomes or keep current terrain set? Scope? (c/WZaR8GsN)
- Population-triggered auto-expansion: threshold, repeat, where new settlement appears, starts connected? (c/GtoOjsuv)

### DOCS-ONLY CLAIMS
- Neutrals are four fixed templates (Forager Hamlet, Timber Village, Stone Village, Market Town) with fixed demographics and a market that restocks 1-4 Stock per moon. They hold no Practices or Structures, never grow, build or do diplomacy, and do not spawn after the start. **[built]** The earlier claim of "five practice slots including neutrals" came from the stale checkout and is wrong at `4014a92`. Conquest turns population into Strangers with no practice set. (Code Health, `external-world.js:104`)
- New Game: Starter_02 map, nine fixed roads, one rolled road, two adjacent player settlements, four authored neutrals including one adjacent and connected to the capital. (ai/ai-context.md, README.md, CONTEXT.md) **[built]** `ai/ai-context.md:41` also says neutrals use priced market inventories instead of installed Practices.
- Conquest: below advantage three, 80% of population and Stock survive as adult Strangers; ruins retain dormant population/Stock for reconquest. Campaign needs Prowess + Retinue + local Support and one hosted Edible. (docs/civilization-milestone.md)
- Structure capacity rolled 5-8 per region from `state.rng`. (ai/ai-context.md)
- Docs' own play questions: does adjacent conquest need a stronger supply or travel constraint; should reconquest preserve survivors' age/specialists? (docs/civilization-milestone.md)

---

## 4. Life Map, Lifegraph, timegraph and time

### LOCKED
- Normal New Game Lifegraph: five lanes, thirteen normal depths (4/5/4); Practice Reform at 1, Founding before Crossroads at 5, Relic at 10, Discovery Rare without a guaranteed minimum. Cam first-pass tuning #45, updated layout #52 (Cam confirmed 2026-10-26).
- Absolute Balance bands (3/5/10 years) and shared type/quality shop prices; shared Delve 10 years and empty exit 5 years before discounts. Only Scholars refresh shops through Delve, with an empty draft; non-Scholar reroll removed. (Cam, PR #45; confirmed 2026-10-26)
- Life Map year = four seasons x season duration (32 s default), converted to phases. Decision (Cam, 2026-10-18, c/dnhO891i); **[built]** (#39). Legacy independent generation uses the 3.6× multiplier on authored Patronage/Development/Crisis/Legacy/route/removal costs; its balance value remains undecided. Default pooled generation uses absolute Balance bands (3/5/10 years) and shared shop services (Delve 10 years, empty exit 5 years), before discounts.
- Delve recap shows TIME PASSED with time boxes only, no Age/Prestige/EXP rows, and no `nodeResolved` event. (c/3Ii95dpM) [Done card] **[built]** (#34).
- Lifegraph loading indicator sits above the timegraph. (c/f6RAY0lA) [Done card] **[built]** (#40).
- Highest priority for making the game better: the protovassal Lifegraph design and an overall redesign to raise player agency even on the "worst path". (c/5hZZB8qo "Priority (Cam)", In progress)
- Life Map node entry: pressing enter opens a small description modal then a big central confirm (two-step) to stop misclicks. (c/XgiOOke1) [Done card]
- Selecting next node: the big modal shows only a very small description by design (player shouldn't see full node contents until they commit) but must not block quick comparison; keep some Enter-to-confirm. (c/9VyRXQ0u "Actual problem (Cam, clarified)") [Done card]
- Routes node: just show the map. (c/746E03eY) [Done card] At the audited commit, `routes` had weight 0 in every band and was never rolled. (c/WW9JUNnb) Routes family since removed (ai/sim.md).
- Time-passing modal themed as time passing with big clocks centred. (c/3cnCKxuW) [Done card]
- Time icons Year, Moon, Phase labelled and animated on foreseen extinction and turning-point resolved modals; the extinction modal is where the icons are taught. (c/z0APbW8J) [Done card]
- When pinning a node, dim nodes (or pathways) that would reset pins. (c/QRFah1js) [Done card]
- Scholars need a custom prestige node because the standard one offers Cunning. (c/agoGuUlz) [Done card] **[built]:** Scholar swaps Cunning for Ingenuity.

### OPEN
- Lifegraph redesign: what makes the worst path agency-free; which related cards fold in (prestige purpose, early martial node, forced warrior campaign, timegraph useless actions, shop pooling, stock-output nodes). (c/5hZZB8qo)
- Shop pooling/generation rules: how many shops per stretch, weights, same two-step pooling for other families? Cam is "not sure our generation rules are sensible". (c/WQPB9gbS)
- Stock-output nodes: built (see section 1). Remaining question: the definition of "unsatisfied". (c/ZdxHz1ai)
- Prestige purpose unclear; curate the first few nodes for protovassals? (c/siS5YPxj)
- Timegraph: too many useless actions, bundle actions, what makes a node "dead"? (c/XC7MZfav)
- Time controls: lever relative to timegraph span, wheel momentum; other experiments? (c/WWTiaS2l)
- Focus button overhaul: grey when one vassal, arrows between vassals, max/full-timeline control, skip buttons vs vassal arrows? Documented behaviour of focus button unchecked. (c/DpH4ZXMw)
- Timeline play: big stockpile boosts that dwindle far in the future to make curves; which stockpiles, how far, how shown. (c/GtoOjsuv)
- Timegraph shop icons: shared base + type indicator (glyph/colour/badge)? (c/mPd8KSbn)
- Bugs: faded graph lost after switching out of lifegraph (c/yFLNqIQi); first Life Map node failed (c/oW5SonlM); crossroads modal doesn't close (c/RbIqp9Cb); these still need a runtime repro.
- Foreseen extinction modal pass, loading lag on first settlement examine (both Done): confirm they are really closed (c/X4yksYCd, c/HypVV9qP). Not verified.

### DOCS-ONLY CLAIMS
- Timegraph brief (labelled "Status: Draft", records Cam's interview): irreversible vassal actions; every node costs time; unveil only to time spent; scrubbing the past is read-only; only the most recent previous projection is shown; unveil has no skip control ("decided by Cam"); New Game waits for the full opening forecast ("decided by Cam on 8 Oct 2026"); smooth scrubbing outranks unveil speed and horizon length; device floor Pixel 6 ("decided by Cam on 8 Oct 2026"), now also confirmed by Cam on Trello (section 0). Repo-doc claims; only the Pixel 6 one is locked on Trello.
- Unveil target "about 1000 years in 1 s" is **not met** (reveal runs about 14 s; limits: 40-year window, 200-year cache, 600-year loss search). Cam has clarified it is a performance goal and narrative device, not a hard requirement (section 0). Phone performance is unmeasured apart from Cam's play test of PR #18; at 4x CPU mobile fails the smooth gate. By code reading, a forecast that survives 600 years makes New Game fail with `forecastIncomplete` (untested; c/Jn2BM22a).
- Older projection survives only as a dimmed, view-only overlay (not browsable during a vassal's life) and "navigation and graph close/open retain it". The brief wants it browsable (c/vxhyqbEt). Relevant to bug c/yFLNqIQi.
- Life Map is a DAG: six non-crossing route traces over five lanes, thirteen normal depths (4 Early / 5 Middle / 4 Late) plus terminal Legacy; 22 node families (16 normal, including Special Relic); Travel and Routes removed; ordinary graphs no longer roll Settlement nodes. Signature nodes: three candidates advertise distinct broad groups. (ai/sim.md, Code Health)
- Node confirmation: advances accumulated Phases, pays recurring Prestige/EXP once, one natural-mortality roll; EXP thresholds queue a three-of-four stat choice. (ai/sim.md)
- Six fixed moon phases (Birth, Food, Housing, Faith, Migration, Death). Time-cost icons are sun, crescent, lunar-phase sprites. (ai/ui.md)
- Dock: single-click Regional Map / Life Map / Settlement navigation; Present button returns to live second. (ai/ui.md, CONTEXT.md)

---

## 5. Vassal classes and founders

### LOCKED
- Founder attributes apply before Founding: Philosopher uses Ingenuity, Warlord Prowess. (Cam, PR #54; confirmed 2026-10-26)
- Founders: Philosopher founds Scholars, Warlord founds Warriors; not subclasses but one-time historical founder candidates. Founding is a single-choice milestone at depth 5 by default, after Practice Reform at 1; successors get Crossroads there. This supersedes the “first node” placement (Cam layout, PR #52; confirmed Cam 2026-10-26). The only founder spawn is the first vassal; afterwards vassals are unclassed or founder's class; don't require conquest for Warlord; present existing founding as Philosopher/Warlord founding life. (c/U8v7feoR "Decisions") [Done card]
- Priest and Merchant are still planned as the next classes (Cam, 2026-10-18). Docs list them as "outside this pass", which is not a cancellation. (c/pWk7dIEn)
- Vassal selection redesign approach: mock up and prototype approaches first; emphasise the protoclass (founder) selection, then regular selection. (c/7F1UxDGf "Approach (Cam)") [Done card]
- Highest-level tooltip tag is class or neutral. (c/v9kiwWwC "Design notes (Cam, Oct 3)")

### OPEN
- Remaining classes: Priest and Merchant are planned (locked above); their identities beyond the name and their systems are still open. The relic vault effect may be the Priest ability (Cam, direction only). (c/pWk7dIEn, c/WSwDOUt1)
- Class-gated systems (class as tutorial): Warrior kills yield currency-like resource; Priest scales off vassal stats?; Scholar more powerful structures? Only sketched, "needs a design pass". (c/ksjmhFae)
- Forced campaign for warriors: when it triggers; one campaign or a chain? (c/hsInbn7l)
- Founder-later classes: Prophet (Priests); merchant founder "unresolved (Magnate or Merchant Prince)". Another mechanic to introduce other classes "comes later; don't build now". (c/U8v7feoR)
- Scholar candidate bonus text: "+1 to future Scholar candidates" never names the stat. Checked in code: it is not backwards. Scholar adds to the `cunning` key (shown as Ingenuity) and Warrior to the `intelligence` key (shown as Prowess). The card text just needs to name the stat. (c/9FwTOJ0t)
- Warrior campaign UX/balance: Cam asked for it in chat; card now exists (c/6OioI8xc). Duel / Quest / Attack / Honour duel modes are built; the `challenge` family is never seen placed.
- Vassal selection screen not pixel-art enough: which parts, which reference screen. (c/NLXckxyu)
- Equip vs carry confusing: force equip, carry only in bag UI? what when slots full? (c/irCo20Dk)

### DOCS-ONLY CLAIMS
- First candidate pool has only Philosophers and Warlords; founding takes six phases; Scholar founding trains two adults + a Lyceum where space permits, Warrior founding trains ten adults; founders never recur; an unfinished founding leaves later pools unclassed. (ai/sim.md, docs/civilization-milestone.md) Partly consistent with c/U8v7feoR but the numbers (2 / 10 / six phases) are docs-only.
- Class meanings: Scholar stat is Ingenuity (key `cunning`), Warrior stat is Prowess (key `intelligence`); visible labels are Ingenuity/Prowess. **[built]** The Scholar +Cunning and Warrior +Intelligence candidate bonuses are the intended key mapping, not backwards. (docs, `lifecycle/candidates.js:113,128`)
- Scholar: Ingenuity replaces Cunning income with quality uplift (5% per point, cap 75%), Discovery, Scholar-only Delve refresh (shared base 10 years, empty draft only), Commissions (20 Prestige). Warrior: Prowess, Retinue = floor(Prestige/10) capped, Support = floor(Warriors/5), Campaign/Challenge. (docs/civilization-milestone.md)
- Candidate bonus is capped at +5 combined (institutions + history + retired vassals) in code (src/model/vassal-life-map/lifecycle/candidates.js) and in card text **[built]**.
- Rival AI, tactical combat, equipment crafting and an expanded Elder Order are "outside this pass" in the docs (Priest and Merchant are listed there too, but are planned per Cam, section 0). Elder Order is aggregate state and does not affect candidates. (docs/civilization-milestone.md, CONTEXT.md)
- Vassal selection prototypes: A founder ceremony (carousel of 4/6/8 slots with locked silhouettes), B council beside map, C successor drawer; "no recommended winner yet"; "does not replace the real drawer"; Scholar first-run gate is "a design proposal, undecided". (docs/vassal-selection-prototype.md)
- Code: 2 classes (Scholar, Warrior) via 2 founders (Philosopher, Warlord); further founder slots are 2 locked silhouettes only. The founder dossier is live (`protovassal-dossier-pixi.js`, #22). "Mage" in older Trello text means Scholar.

---

## 6. Structures, practices and cards

### LOCKED
- Staged construction zones drag back onto the shop to undo, only before confirming; the shop highlights as the target. Decision (Cam, 2026-10-18, c/UavT2N8J); **[built]** (#37).
- Terms: Stock, Ready, Activate ("Activate" names a card activating); don't name a specific stock in tooltip text, just "stock"; remove tooltip "inspect" text button (flavour text at bottom, maybe double-click to inspect). (c/v9kiwWwC "Design notes (Cam, Oct 3)") [Done card]
- Bring charge cards back into the game; charge-card layout: triggers bottom left, subdivided charge bar. (c/oxdLd3h6, c/73AE811i) [Done cards] **[built]:** 110 Practices, 86 Scheduled and 24 Charge, with a Charge/Discharge resolver. The "94 practices, none use charge" text on c/oxdLd3h6 is stale.
- Research click opens a card library grouped by tier with filters and tier odds; locked/hidden cards are out of scope. (c/ksp7EXxA) [Done card]
- Housing tag pass so the housing shop works. (c/z9h6d71d) [Done card]
- Structure material audit: non-Housing structures use broad existing Stock Traits, not bespoke ingredient lists. (c/HUZs7pQ9) [Done card]
- Housing ladder Mud House -> Timber -> Stone -> Longhouse -> Tenement -> Great Dwelling converts stronger economy to density. (c/fCVEgZX5) [Done card]
- Gym shop sandbox (not Zoo, not Museum). (c/M9hobOtp) [Done card]

- 2026-10-23 — Independent Output and Capacity Multipliers (Cam, PR #53;
  additive Structure Capacity pools previously approved in #46). Cam confirmed the first biome Output rules: +1 per region in the settlement's
  contiguous same-biome shared-edge patch, including its own region regardless of
  ownership. Plains target the existing Grain Stock Trait, including Milling;
  mountains target Stone; forest targets Construction. Both additive pools start
  at ×1. Granary retains Capacity only. “Stock Power” becomes “Capacity Multiplier”.
  The selected UI is per-Practice symbolic pairs, compact pinnable ledgers with
  nested individual sources, Practice shop readings and completed-result Structure
  previews on the settlement board. Construction reservations remain inactive until
  real completion. See [implementation scope](output-capacity-multipliers.md) for
  the accepted interaction fixes and excluded prototype scaffolding.

### OPEN
- Charge cards: second word for the scheduled/charge tag beside "Cyclic". Code and docs still say Scheduled/Charge. (c/v9kiwWwC "Open")
- Card tiers: add Stone, reconsider Diamond; replacement name; check how many cards reference tiers. (c/Rg5dmcGY)
- Common bronze Research charge card gaining Research on every practice install: new or change; amount; cap. (c/AjxkKGW5) Note: `observation` (+1 Research per Birth) is already a Common Bronze Research Practice, but it is scheduled, not charge.
- Practice feedback hierarchy: cap-blocked less severe than missing-resource blocked. Failed activation animations. (c/Bpdhtdou, c/qWJqqQjJ)
- Passive bonus text pass on structures; how much detail on card vs Full rules. (c/9FwTOJ0t)
- Threshold practice (keep a number near a limit) idea: which number/class. (c/VXA1kXBh)
- Unlocks as tutorial (Balatro style) and account metaprogression: unscoped, "low, later". (c/NRxAcB5B, c/rGYsHYSE)
- Playtest findings: rename "practice reform", prestige bank visibility, node info, text size. (c/4EK874Le)

### DOCS-ONLY CLAIMS
- Practice slots fixed at five, "reaffirmed after the content pass; the temporary twelve-slot expansion was reverted". (docs/civilization-milestone.md, ai/ai-context.md, README.md, CONTEXT.md)
- The default New Game pool is a trimmed "minimal bronze" set (4 Practices locked, 10+ moved to Silver); never decided by Cam. (docs/minimal-bronze-test-set.md, commit `6dfa46a`; c/Q1zwEwz5)
- Pool: 110 Practices (86 Scheduled / 24 Charge) and 78 Structures, 188 runtime pieces. 101 of 110 Practices still carry `provisionalNotes`. **[built]**
- Charge is a private per-practice meter, not Stock; discharges at most once per root chain; workers multiply incoming Charge; all 24 Charge practices have empty Consume/Require. (ai/sim.md, civcontent doc)
- Construction: each commission reserves a site; paid Housing-phase cycles consume Stock Traits; unfinished sites supply no Housing/modifiers. No standalone demolition, refund or salvage. (ai/sim.md)
- Quality tiers in code: bronze, silver, gold, diamond (src/model/vassal-life-map/shop.js, phases/faith.js). Docs refer to Common (bronze), Silver, Gold/Diamond. (ai/sim.md)
- Practice Require is currently a hard gate that retains provider Stock; Consume debits the source. (docs/civilization-milestone.md)
- Practice faces show Stock, Trait glyphs; hover gives plain English recipe; full inspect has glossary; these belong to the tooltip redesign Cam locked only in part. (ai/ui.md)
- Many secondary clauses (Legacy outcomes, Chairs, Tomes, Storehouse trait choice, Astronomy all-season reward, etc.) are explicitly "deferred". (docs/civcontent-2.6-implementation.md "Remaining deviations")

---

## 7. Legacy, relics and heirlooms

Decision (Cam, 2026-10-28; implementation approved 2026-10-30): each run has ten tenures. Death or retirement spends one; zero freezes the run with history browsing and New game. No chaos-gods dependency. (c/UZvJAJNn)

### LOCKED
- "Items" means heirlooms (for the heirloom UX/art revisit). (c/vmWs67HO "Decision (Cam)") [Done card]
- Death screen comes before the heirloom screens. (c/tjdusEj7) [Done card]

### OPEN
- Relic vault effects: should most relics do something while sitting in the vault (not carried)? Every relic or most? Weaker or different effect? Display? Cam, chat: "potentially that vault effect is the priest class ability if we still do that". (c/WSwDOUt1) Update 2026-10-18: Priest is confirmed still planned, so the vault effect may be the Priest class ability (direction only).
- Scholar special Legacy "writing a book" relic as an extra node after the Legacy node: for every Scholar or on choice; what decides the relic; cost? (c/7MUiOOIR)
- Legacy should always reward stats in some way. No open-question section. (c/pNUGysKY)
- Relic risk card (c/UvHNbFbn, still in Inbox): **[built]**. Time costs use shared low/medium/high ranges (Bronze low, Silver medium, Gold/Diamond high). Gold and Diamond carry a base 35% immediate-death chance at every site and Special sites raise any tier to at least 35%; the card says "always a death roll". Cam to confirm 35% or 100%.
- Simplify equip vs carry. (c/irCo20Dk)
- Revisit heirloom UX and proper art, "low, for later". (c/vmWs67HO)

### DOCS-ONLY CLAIMS
- Heirloom slots: Equipped, Carry, Vault (six vault slots; overflow is a player choice). Death/retirement inheritance: Sanctified returns to vault unchanged, Unmarked becomes Fragile, Fragile has 50/50 break roll; next Vassal equips 0-3 vault relics; Carry starts empty. Only one owned copy of each definition. (ai/sim.md, CONTEXT.md) The vault is storage only in docs: nothing about vault effects.
- Relic nodes offer three heirlooms with no Prestige price; each persists a random phase cost from `VASSAL_TIME_COST_RANGES`; a Mandate relic can't protect its own acquisition. **[built]** Relics above Bronze also add 10/25/50 Monster Pressure. (ai/sim.md, `heirlooms.js`)
- Equipped Heirlooms can grant large temporary bonuses including a once-per-life Mandate preventing fatal natural or immediate-danger death. (ai/sim.md)
- The vault is storage only: nothing outside inheritance consumes it. 14 heirlooms; 3 Equipped / 3 Carry / 6 Vault slots. **[built]**
- Legacy node: terminal node with 3 free choices (found a settlement, teach highest stat floor(stat/3), leave renown floor(Prestige/10)); Legacy+ signature upgrades it; "special Legacy outcomes" and Chairs/Tomes/Chronicles are deferred. The "found a settlement" card says no Prestige or population cost, but the code needs 10 adult Villagers and a connected frontier target. (ai/sim.md; `world-choices.js:66`; `node-confirm.js:112,426,463`; c/0fNY9nb2)

---

## 8. UI/UX, art and dev tooling

### LOCKED
- `game-design.md` is the gameplay authority. (Cam agreed 2026-10-21, PR #48)
- `aesthetic-ux-design.md` is the UX guide; Cam asked for its merge (PR #49). Its wording is AI synthesis of Cam feedback, not verbatim Cam decisions. (Cam confirmed 2026-10-26)
- Gamepiece tooltip redesign direction (placeholder tooltips unreadable). (c/v9kiwWwC) [Done card]
- Shop screens show gamepieces at full size. (c/tCEdqSpY) [Done card]
- Card layout prototype compared to in-game cards and previewed on real screens. (c/YoOepbaZ) [Done card]
- Dev areas: source-graphics toggle; fullscreen/landscape for Pixi windows; card zoo update. (c/A1PrltTq, c/nWqD5KO3, c/7LT4Plnn) [Done cards]
- Don't auto-open vassal drawer after death. (c/2WXDf6ij) [Done card]
- Keyword system in the inspection tooltip. (c/3dqABYuQ) [Done card]
- Constraint on all implementation prompts: avoid adding text, don't invent titles or subheadings. (c/88oVAj2s, Cam)

### OPEN
- Try the Libron font: headings only or body too? (c/n7EfyOa5)
- Card reviewer in Dev tools (mobile-friendly flag/edit/compare/export): a Reviewer with flagging, bulk edit and import/export already exists; the card may need trimming to what is missing (tap-on-card editing, compare view). (c/Cd7toHWG)
- Profile the timegraph on a real Pixel 6 (device floor locked, section 0). Not yet done. (c/3UX7cTZf)
- Fork into an idle / number-go-up game; first step a performance spike. Low priority. (c/r2s9WfIq)
- Mine the old Notebook board for forgotten ideas. Low. (c/M8vfbEtM)
- Keyword names still being workshopped (Stock, Ready, Activate, scheduled/charge). (c/3dqABYuQ)
- Vassal drawer portraits broken? (c/CmWyQEXF Done) confirm.

### DOCS-ONLY CLAIMS
- Dev Lab: Zoo, Reviewer, Museum, Gym, Prototypes under `#/dev`; hold workshop seal 850 ms or Ctrl+Shift+D. Card reviewer already exists in docs ("Card review proposals", schema v1), while Trello c/Cd7toHWG asks for it as a new tool. (docs/development-lab.md, ai/ai-context.md) Mobile is only partly proven: the only real-device check was Cam's play test of PR #18.
- Fixed-landscape dark stone/brass frame, pixel-art terrain, painted gamepiece illustrations for all 188 pieces, Pixi UI. (ai/ui.md; piece count per code)
- Boot menu: New game, Continue, Load game with three IndexedDB slots; autosave every ten seconds. (ai/ui.md)
- Deploys: `main` is the dev branch and GitHub Pages mobile build; agents commit and push `main` after verified changes. (AGENTS.md) Policy for agents, not a game decision.

---

## 9. Built but never decided (no Cam decision on record)

Found in code at `4014a92`; Cam may not know about these. Cards exist for the first few.
- Scholar kit beyond the locked Delve refresh: ongoing Commissions at 20/40/60 Prestige, +5% quality chance per Ingenuity. Warrior kit: Prowess risk bonus, +15 Prestige on a successful risk, Retinue = floor(Prestige/10), campaign modes Duel/Quest/Attack/Honour duel. (c/6OioI8xc)
- Founding numbers: Philosopher trains 2 Scholars plus a Lyceum, Warlord trains 10 Warriors, 6 phases each.
- Class-action families (training, discovery, campaign, challenge) have weight 0 and are substituted into a class's graph after generation. (c/WW9JUNnb)
- Heirloom mechanics: Mandate of Heaven blocks one fatal outcome per life, Fragile has a 50/50 break roll, the next vassal equips 0-3 Vault relics.
- Observation Practice (Common Bronze, +1 Research per Birth).
- Default minimal-bronze card pool. (c/Q1zwEwz5)
- Tunable audit (c/STkDw2JT): removed unused `legacyStartingPrestigeBonusCap` and `ENV_EVENT_DRAW_CADENCE_SEC`. Retained `localCurrencyCost` (implemented shop payment, authored defaults zero) and `addChaos` (supported DSL capability; authored use awaits the Chaos/Monster Pressure decision above). Legacy prestige/year costs are consumed; former phase-cost helpers and the phases-per-year comment are already absent.

---

## Contradictions and disagreements (status after the 2026-10-18 audit)

**Resolved by Cam on 2026-10-18**
1. Device floor: Pixel 3 (card) vs Pixel 6 (docs). **Pixel 6 locked**; card c/3UX7cTZf updated.
2. Priest/Merchant existence (c/pWk7dIEn vs c/ksjmhFae vs chat "if we still do that"). **Planned as the next classes.**
3. How the flat monster-wave penalty sits with the Chaos-driven curve. **Flat +10 Monster Pressure locked for now.** It feeds Monster Pressure, not Chaos.
4. Chaos gods referenced by three cards with no definition. **Direction locked, implementation open** (c/3OngyRBs).
5. The 1000-years-in-1-second target. **A performance goal and narrative device, not a hard requirement.**

**Resolved by code check at `4014a92` (no Cam decision needed)**
6. Neutral towns: the billboard is built; neutrals cannot hold Practices or Structures. The docs' "five practice slots including neutrals" was a stale-checkout error.
7. Charge cards: Trello c/oxdLd3h6 says 94 practices and none charge; code has 110 Practices, 86 Scheduled and 24 Charge.
8. Opening neutral: Trello says one small connected neutral; code seeds 4 neutrals (one adjacent and force-connected) plus 1 opening Monster.
9. Class names: Trello c/pWk7dIEn said "Warrior and Mage"; the code and docs say Scholar. Card fixed.
10. Stat naming: Scholar +Cunning and Warrior +Intelligence is the intended key mapping (shown as Ingenuity and Prowess), not backwards. The card text never names the stat (c/9FwTOJ0t, fixed).
11. Relic risk (c/UvHNbFbn) and stock-output nodes (c/ZdxHz1ai) are built, so those Inbox cards are stale; both carry a comment for Cam to confirm. Relic death risk is 35% for Gold/Diamond, not "always".
12. Delve (c/3Ii95dpM): **[built]** (#34); recap shows TIME PASSED with time boxes only, no Age/Prestige/EXP rows, and no `nodeResolved` event.
13. Ambitious-action Chaos (c/33DTojMF, Done): built as Monster Pressure, fixed numbers, not Chaos.
14. Card reviewer (c/Cd7toHWG): a Reviewer already exists; the card needs trimming.
15. Monster rewards (c/97w8GxRT): docs already list concrete rewards (campaign victories 12 + 4xDefense Prestige and 3xDefense Research; hunts give trophies and 6 Research).
16. Housing ladder: code is 30/60/90/210/360/630; `docs/civcontent-2.6-implementation.md` matches.
17. Monster Pressure source: ambitious actions and no-Prestige purchases add Monster Pressure directly; Chaos is a separate passive stat driven by Faith-phase Primordial pressure.

**Still open**
18. Tier names: Trello c/Rg5dmcGY proposes Stone, Bronze, Iron, Gold, Diamond; code and docs use bronze, silver, gold, diamond.
19. Tooltip vocabulary: Cam's notes use Stock, Ready, Activate with "Cyclic" plus one TBD word; docs and code use Scheduled/Charge, Activation, Cycle, Discharge, no "Ready".
20. Vassal selection: c/7F1UxDGf is Done, docs describe a throwaway prototype behind `?prototype=vassal-selection`, and c/NLXckxyu says the selection screen isn't pixel-art enough. The founder dossier is live; check that c/NLXckxyu is about the regular candidate drawer only.
21. Faded graph: bug c/yFLNqIQi says the faded graph is lost after switching views; the brief says it survives navigation. Needs a runtime repro.
22. Dead-end chains: Trello says early shops have too many dead practices; docs describe no gating of complex chains. 101 of 110 Practices carry `provisionalNotes`. (c/t8QX1qpP)
23. Warrior purpose is split across c/hsInbn7l (forced campaign), c/ksjmhFae (class-gated systems) and c/97w8GxRT (Monster rewards); none locked. Consider one umbrella card.
24. Billboard political prestige: card mentions it, nothing in code, Cam has not said.
