# Research card outputs

Research yields appear at the top right of Practices without Stock, in the same
65-by-42 fitting used for allegiance. Influence cards retain their allegiance
symbol above Research. Inputs, timing, Charge and secondary effects stay below.
Numerals are base yields; inspection describes conditions and scaling.

The six former Research/Stock recipes now have one primary output. Existing
saved runs retain their captured recipes; start a new run for these defaults.
No schema, RNG, resolver or replay changes are required.
The three dedicated Research engines are admitted to ordinary Scholar offers
at their existing minimum tiers. Each definition carries its offer eligibility
into new runs. Existing saves retain their original Scholar shop pools and
recipes. These three engines do not supply Stock.

| Practice | Pool / minimum tier | Exact recipe and engine role |
| --- | --- | --- |
| Anatomical Study | Scholar / Silver | Local deaths or another local Bone producer give 1 base Charge; at 2, gain 4 Research. No Stock output. Scholar staffing remains a requirement in the legacy ruleset; full-map worker rules remain unchanged. |
| Heresiography | Scholar / Silver | Civilization Chaos increases or adjacent Monster activity give 1 base Charge; at 2, gain 5 Research. No Stock output. |
| Doomsday Chronicle | Scholar / Gold | Birth consumes 1 Paper and grants 3 Research + 1 per lost settlement, capped at +4. No Stock or worker sockets. |
| Surveying | Scholar / Bronze | Migration produces 1 Record Stock. No Research. |
| Charnel Alchemy | Scholar / Diamond | Another local Bone/Medicine producer gives 1 base Charge; at 3, produce 2 Medicine/Metal/Trade Stock and add 15 Creep. No Research. |
| Monster Hunting | Warrior / Silver | Death consumes 1 Arms and 1 Edible to attack an eligible adjacent Monster. Victory produces the existing Loot/Record/Currency Stock with a flat defeated-Monster Strength bonus. Monster Trophies still scale Output and base capacity remains 12. No Research. Personal Campaign Research remains separate. |

Each uses one of five Practice spaces. Quality and minimum unlock tier remain
separate; Charge workers multiply incoming Charge, rather than Research payout.
These are first-pass yields, not a claim of campaign balance.

Anatomical Study can follow Bronze Ossuary Keeping before Silver unlocks:
Ossuary's Bone production and real local mortality feed its meter. Herbalism can
use the freed Medicine-producer role, while Scholarship remains a reliable
Record-consuming Research alternative. Study is intermittent and cannot supply
Medicine/Record inputs. Heresiography instead follows real Chaos income or a
threatened border: it composes with ordinary survival/Resistance engines, but
loses its Record-supply role and depends on dangerous events. Chronicle pairs
with Papermaking, supplied by Common Logging, and can use allied road-connected
Paper. A local food producer, Logging, Papermaking and Chronicle leave one slot
for a fifth Practice. No loss is required to start it; losing settlements
improves payout but risks ending the run. Unsupplied Chronicle yields nothing.

The redesign serves interacting engines and visibly changing civilization
(pillars 1 and 3) while preserving five-slot composition choices (pillar 2).
Fewer incidental Research sources makes dedicated Research access more valuable;
Observation and Field Study remain Bronze Common options at zero Research.

Verify with `npm run test:detailed-settlements`,
`node scripts/research-output-contracts-test.mjs`,
`node scripts/research-output-browser-probe.mjs <preview URL>`, and
`npm run verify`. Tests cover input payment and blocking, capped loss scaling,
unchanged RNG, save continuation and authoritative replay, plus catalogue/live
card layout, Charge progress, secondary effects and captured mixed definitions.
