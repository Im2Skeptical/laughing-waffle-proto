# Full-map implementation record

Contract: [audited redesign](full-map-redesign-audit.md), including the parent
disposition. This records the initial isolated implementation. Cam subsequently
requested first-class integration with main; the [main integration record](full-map-main-integration.md)
supersedes that earlier branch restriction. The archived build and storage remain
preserved. GitHub Pages publication is a separate confirmed action.

Impact analysis before coding: this changes demographic state, schemas, supply
authority, activation ordering, control, transactions and presentation. Joint
cohorts are authoritative; aggregate demographic fields are derived. All state
remains JSON data. Random rolls use the existing simulation streams. Time still
advances through official ticks and authoritative replay/worker projection runs
the same model. Definitions remain data; controllers orchestrate; views read.

Verification plan: conservation and typed selection; worker affinity and base
activation; complete recipe atomicity and supply authority; control hysteresis,
garrison upkeep and territorial income; instance-safe intervention costs and
undo; executable content and default 20-region opening; save/replay/worker
differentials; real desktop and 844×390 touch views; forecast performance and
baseline storage isolation. Run repository verification and the local preview
before handing the branch to the parent for independent review.

## Implemented experiment

The ordinary New Game route uses the existing generated 20-region geometry.
Every region is inhabited and owns a five-Practice board. Two player holdings
face one inherited Warlord capital, adjacent remnant provinces and unheld
outskirts. The remnant has no strategic planner. A live Monster nest begins in
an inhabited region; pressure can destroy its host and spread thereafter.

Population is a joint residency / allegiance / specialty / age ledger.
Conversions change allegiance on selected living cohorts; training changes
specialty on those same people. Births follow pre-birth all-age allegiance
shares. Migration, arrival deaths, hardship and natural mortality operate on
actual cohorts. Stranger-only selections retain allegiance. Allocation metadata
is excluded from population state. Integer proportional allocations break ties
with locale-independent keys.

Resource Practices have hosted Stock and no allegiance. Influence Practices
have an instance allegiance and conversion/Force outcome instead of Stock.
Capture changes the controller and Stock authority, preserving both institutions
and population. Stable institution IDs survive adoption, upgrade and reorder.
Structures never independently convert and never store allegiance: conversion
support adds eligible people to an activating Influence Practice's result.

Workers multiply production; zero workers still produces the base result.
Loyal workers prioritize their own Influence Practices, then Resource Practices;
unaffiliated workers only staff Resource Practices. Assignment is deterministic
and disjoint. Scheduled conversions scale with workers. Charge gain, Charge
Stock output, generated Stock, capacity, costs, victims and Force retain separate
calculations. Real inputs, eligible targets and population reserves still gate
activation; staffing switches and manual shutdown are absent.

Automatic recipes access all local Stock regardless of institution allegiance.
Remote Influence supply follows the instance; other remote supply follows the
holder. Providers must be polygon-adjacent, directly road-connected and held by
the beneficiary. Unheld settlements use local inputs only. Complete Stock and
population recipes are planned before commitment; Require is retained. Foreign
Stock is unavailable as a visiting Vassal's discretionary wallet. Every local
meal resolves before remote leftovers are shared.

Control initially requires 60% allegiance on two Death checks; an incumbent
retains support at 45%. Otherwise supplied loyal armed Warriors provide one
occupation Force per five, against one required Force per 25 disloyal people,
rounded up. Extra garrison meals cost one Edible per ten armed Warriors plus
Structure upkeep. Unrest approaches 0 when supported, 25 + 50 times disloyal
share when occupied, or 100 when unsupported, increasing at most 15 or falling
at most 10 per check. Unsupported unrest of at least 75 for two checks loses
control. Regional outcomes are collected before controller changes.

Frontier Watch / Signal Bastion support requires an explicit adjacent allied
assignment. The same assigned Warriors and Force cannot also hold their source
or join a campaign. Campaigns reserve source holding troops and physically move
the smallest available loyal detachment; captured equipment can supply it.
Personal Prowess and Retinue remain expedition contributions, not remote holding
Force. Ordinary travel includes foreign inhabited destinations and physical
expeditions where roads do not reach.

The shared civilization treasury begins at 20 Prestige. Each inhabited player
holding earns one Prestige per year, reduced by unrest, with fractional income
carried forward. Node and Commission rewards use the same ledger. Installations
use the retained all-or-nothing 10-Pressure fallback when Prestige is short.
Each hostile institution removed or displaced adds 5 Prestige and 10 explicit
Pressure; a 15-Prestige hostile replacement therefore costs 20 Pressure at
balances 0/12 and 15 Prestige + 10 Pressure at balance 15. Staging and undo are
pure with respect to confirmed boards, currencies, Pressure and RNG.

Practice Reform always adds adoption offers for local hostile institutions:
10 Prestige, two years, same instance/private state and no instant population
conversion. Discarding a confirmed hostile institution also pays the removal
tax. Confirmed changes are installed before pressure consequences resolve.

## Content reconciliation

[The 138-row manifest](full-map-content-disposition.md) records every candidate.
There are 72 executable candidates (20 player, 30 neutral, 22 Warlord) and 66
alternate-class candidates retained explicitly for review, without fake offers.
23 explicit existing supply/housing dependencies remain available. The other
legacy definitions are retained for authored labs, but excluded from ordinary
fork offers. The manifest includes cadence and input coverage for all 95 admitted
definitions. Border Skirmishing supplies Loot through actual successful local
defense events; obsolete neutral-market raid offers are excluded. Current dedicated illustration
atlases are reused in the real card renderer.

Direct Structure conversions were revised to activating-Practice support.
Veterans' Hearth now supports Warrior conversion and supplies Housing rather
than independently converting retiring people. Support copies do not stack.
Iron Communion consumes one actual adult Warrior of any local allegiance,
requires six other adult Warriors and two retained Arms, and needs headroom for
its complete base yield. Capturing it does not remove its victim requirement.
Ration Depot, Leaking Granary and Imperial Armoury pay their documented drains;
Crowded Tenement's extra meal is overhead, not additional people fed. Citadel of
Stillness contributes separately to output and Arms capacity. Full-map Structure
multiplier bases remain their audited values even when their minimum quality is
Silver/Gold; quality adds only the remaining tier steps.

## Module routes and storage

- `full-map-world.js`, `new-game.js`: real opening and remnant seeding.
- `population-ledger.js`, demographic phases and helpers: conserved joint cohorts.
- `territory.js`, `external-world.js`, `campaign.js`: control, supplied military,
  explicit support, capture, Monsters and expeditions.
- `political-recipes.js`, `workers.js`, `practices.js`, `stock.js`, construction:
  declarative conversion/support, atomic costs and faction-aware supply.
- `treasury.js`, shops, practice drafts and node confirmation: shared income,
  adoption, stable identities, taxes and pure staging.
- `full-map-defs.js`: data definitions; no view imports in model.
- projection summaries / graph metrics and real map/card/settlement renderers:
  viewed-state allegiance, holder, conversion, workers, networks and holding costs.

GameState schema 41, runner save 31 and captured config 29 form a clean cut.
Runtime preferences, save database and import kinds use `full-map-redesign-v1`.
Missing/unknown full-map ruleset identities are rejected on deserialize.
No baseline save migration, export, deletion or preference import is performed.
The baseline tag, copied build and port 5196 server remain intact.

The subsequent [independent implementation audit](full-map-independent-audit.md)
records corrections to defence-event attribution, allied garrison supply,
captured-definition drafting and stale settlement-founding eligibility. It also
records joined founder journeys and the final verification of those corrections.

## Verification evidence

`npm run test:full-map` exercises the opening/content/category contract,
conservation, faction workers/base output, supply authority, hysteresis, victims,
shared income, real stage/undo/confirm, hostile discard taxes, exact adoption,
physical campaign transfer, explicit garrison assignment, Stranger migration,
birth shares, meal overhead, multi-victim atomicity and a long-lived default
forecast. Raw serialized state and RNG are compared across live ticks, save
continuation, authoritative reconstruction and the worker's projection builder.

Additional detailed logs, browser captures and timing reports are ignored under
`artifacts/full-map-implementation/`. The historical differential command is tied
to obsolete commits/fixture fields and is not valid evidence for this clean
ruleset cut; full-map exact-state/action comparisons are the relevant replacement.
Final repository/probe results and preview identity are recorded at handoff.


### Results and reproduction

- `npm run verify`: passed docs, architecture, source reachability, assets,
  production build/preview and all repository model/presentation/replay suites.
- `npm run test:full-map`: 27 focused contract groups passed. This includes the
  later regression for two independently priced hostile installations, staged
  adoption followed by replacement, and Pressure-triggered final-region loss.
- `node scripts/shop-undo-replay-test.mjs`: 276 checks, 180 replay comparisons,
  zero regression failures. Random offer assumptions were replaced by explicit
  fixtures; the replacement/undo assertions remain intact.
- Detailed replay: 208 shared-config anchors and 59 restores over 2,400 seconds;
  action stress: 48 comparisons/19 actions with both founder families; draft:
  78 comparisons; lineage: 48; terminal saves: 99; construction continuation: 93;
  terminal consumers: 86; three regional branch cases. All passed.
- `npm run probe:full-map`: ordinary `/` New Game and Load, 20 real regions,
  Resource/Influence frames, holder data, phone/desktop navigation, graph click
  alignment and read-only restoration, real worker startup, no browser errors,
  and unchanged baseline save/preferences sentinels.
- `npm run probe:full-map-draft`: real 20-region state handed to the existing Gym
  harness, then ordinary phone Life Map/shop. Separate Citadel output/capacity
  ledgers, hostile replacement receipt/discard and Undo passed. This injection
  tests a targeted intervention; the preceding probe proves ordinary startup.
- Supplemental `probe:settlement-draft` and `probe:timegraph-alignment` passed
  their existing legacy lab fixtures (desktop and touch). These are supplemental,
  not substitutes for the default-world probes above.

Logs and JSON reports: `artifacts/full-map-implementation/verify-final.log`,
`full-map-final.log`, `shop-undo.log`, `browser-1x.json`, `browser-4x.json`,
`draft-ui.json`, `draft-probe.log`, `alignment-probe.log`. Screenshots include
`phone-region-1x.png`, `desktop-region-1x.png`, `phone-citadel-multiplier.png` and
`phone-hostile-draft.png`. Scripts close their browser contexts in `finally`.

### Practical limits for the independent audit

This remains an experimental balance pass, not a claim that a full human
playthrough of both founder lines has been completed. The automated suites
exercise both founding identities and the political/economic/intervention
subsystems; a joined player journey still needs the parent's independent audit.
Remote conversion chooses the first eligible adjacent road-connected region in
authored order unless an instance has an explicit target; there is no manual
retarget control in this pass. Monster defeat preserves the previous ruin-board
and dormant population data for reconquest, as before; it is not a new refugee or
battle-casualty design. Structures never gain private political allegiance.

Cold forecast and reload are expensive. The opening gate still computes the real
model, every-second summaries and terminal detection; no offscreen exemption or
approximate second simulation was added. Browser measurements use Chromium with
software rendering on this Windows development host, and 4x CPU emulation is not
a physical-phone benchmark. Memory and cold-start costs remain optimization
work; steady frame/restore timings alone must not be read as a shipping verdict.

The source is confined to `proto/full-map-bronze-card-review`, based on
`3bc6dda44e91b0eee460a5b0a5e3de277251e5f3` over the preserved playable baseline
`c5289550fba6bedc8b6c2ae16dd4421bafbb1535`. Version remains 1.1.31 by instruction.
There is no PR, source push, main-checkout change or Pages publication.

### Measured default-world browser costs

| CPU emulation | Cold opening | Reload | Frame median / p95 | Restore to second 64 | Used / allocated heap |
|---|---:|---:|---:|---:|---:|
| 1x | 64.0 s | 47.1 s | 16.7 / 33.4 ms | 133.7 ms | 462 / 624 MB |
| 4x | 163.8 s | 133.9 s | 33.3 / 33.4 ms | 473.0 ms | 662 / 703 MB |

Both runs completed New Game and Load with 20 detailed regions, unchanged baseline
sentinels and zero browser errors. Graph clicks restored the intended second at
844x390 and 1440x900 without advancing the authoritative frontier.
