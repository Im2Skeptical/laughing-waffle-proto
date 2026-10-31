# Full-map main integration

Cam requested that the full-map civilization become the first-class build, with
recent main updates restored. This supersedes the earlier isolated-only delivery
scope; the old game remains archived at tag
`archive/full-map-before-systems-2026-10-31` and on local port 5196.

## Restored work

The starting full-map head was `ba61a3ee`; its shared ancestor with main was
`a79777a4`. All ten intervening main updates are incorporated, rather than
selectively copying their visible UI:

| Main change | Integrated behavior |
|---|---|
| #58 | Monster Pressure in Chaos; shared territory borders |
| #59 | Ordinary class disciplines, their Bronze cards and keyword readings |
| #60 | Correct settlement-resistance probe and first-node preparation coverage |
| #61 | Vassal/timegraph focus and shared shop icons |
| #62 | Bounded rendered-card cache and tunable audit |
| #63 | Named Structure candidate-bonus attributes |
| #64 | Practice base production, multiplier and resource feedback |
| #65 | Libron headings and original-font comparison |
| #66 | Common Bronze Field Study, reacting to actual Practice installations |
| #68 | Ten completed/dead Vassal tenures per run, terminal presentation and saves |
| #69 | Indexed peak tests, cheaper terrain composition and territory-boundary cache |

Performance PR #69 was versioned as 1.1.40, fully verified locally, passed CI and
was squash-merged as `adf85ea8`. The combined full-map release is 1.1.41. Model
state 41, runner save 31 and captured config 29 form a clean save cut: older
baseline data is preserved rather than reinterpreted as joint-cohort/tenure data.
No Pages publication follows from a source merge.

This serves pillars 1 and 4 through working class engines and inspectable
consequences, while retaining pillar 2's five-slot and ten-tenure constraints.
Population and institutional allegiance serve pillar 3's visible transformation.
The existing discipline lifetime gating remains the previously accepted
tradeoff for continuity across lives; pillar 5's legacy between civilisations
is not expanded here.

## Semantic integration

An ordinary Git merge alone was insufficient. The finite full-map offer filter
hid Field Study and the class-discipline cards. Eleven existing mainline
Practices are now admitted at their authored classes and maturity, giving 106
executable admitted definitions: 72 candidates, 23 dependencies and 11 restored
Practices. The 66 other enemy-class candidates remain explicitly review-only.
The [content manifest](full-map-content-disposition.md) lists the extra content.

Field Study counts actual new installations, including itself and replacements;
upgrades, adoption and reordering do not invent installation events. Its
civilization scope follows the Resource region's controlling faction. Installing
a player-aligned Influence piece on foreign soil does not award the player's
Field Study Research. Unheld regions have only local installation knowledge,
not an implicit worldwide frontier alliance. Its rule remains captured DSL data:
an optional `controller: beneficiary` trigger predicate uses the event's
snapshotted holder, separately from the actor or Influence allegiance.

Player class disciplines are dormant on foreign-held boards. Only player-faction
monster destructions add to the player's Trophy history; a player expedition
retains its attribution even when launched from foreign territory. Beast
Rendering likewise matches its beneficiary faction through declarative trigger
data. Automatic Monster Hunting uses the supplied local faction army, not global
player Prowess or distant garrisons. Its foreign Research/victory history stays
regional. Visiting Vassals' discretionary Hunt costs use player-owned supplies.

These changes retain all zero-worker base effects, per-instance Influence
allegiance, physically hosted regional Stock, fixed five-slot boards, shared
Prestige and shortage substitution, hostile replacement taxes, population sinks
and the actual full-map control/occupation/unrest simulation. No manual shutdown
or staffing controls are introduced.

## Verification

Focused checks cover the 37 full-map contract groups, all three keyword suites,
real Field Study install/upgrade transactions, normal offer eligibility, faction
bonuses/rewards, unheld-region isolation, automatic local Hunt and foreign
discretionary-wallet rejection. Existing keyword viewing fixtures now carry
valid installed-instance identities and manipulate conserved population ledgers;
their economic-zone assertions reflect two allied holdings rather than obsolete
fixed neutral markets.

Ordinary New Game/Load passed at 844×390 and 1440×900, including plot containment,
real graph clicks, worker use and baseline-storage sentinels. Both 1× and 4× CPU
paths completed without page errors. The phone draft probe passed hostile
replacement, receipts, separate Citadel output/capacity ledgers and undo. All
eight restored Bronze cards passed real output, passive separation, linked
definitions and touch ledgers; 23 captures were recorded and sampled visually.
Both founder journeys
completed 35 nodes across three lives, reached three holdings and matched exact
authoritative replay.

| Diagnostic | 1× CPU | 4× CPU |
|---|---:|---:|
| Full opening | 98.6 s | 153.3 s |
| Reload | 40.2 s | 106.9 s |
| Restore to second 64 | 145.7 ms | 528.7 ms |
| Observed used heap | 521 MB | 793 MB |

These ran alongside repository verification on this workstation, with main's
new content and ending rules. They are neither an isolated before/after benchmark
nor physical-phone guarantees. Cold loading and memory remain material limits.
No claim of a particular end-to-end speedup follows from merging #69.

`npm run verify` passed in full after resolving the duplicate test import left
by the merge. A syntax sweep of all 81 changed JavaScript modules also passed.
Detailed logs
and captures live under ignored `artifacts/full-map-main-integration/`; the
ordinary-game and draft probes also write `artifacts/full-map-implementation/`.
The performance changes retain exact generation/composition tests, authoritative
ticks and summaries, deterministic replay and the full opening forecast gate.
