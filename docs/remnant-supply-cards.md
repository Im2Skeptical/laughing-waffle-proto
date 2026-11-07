# Inherited supply in disrepair

Cam requested degraded counterparts for the map-generation pool rather than
letting class supply cards appear in every Vassal's shops. This extends the
existing neutral remnant pool. The eight new Practices are Common, Bronze,
map-only cards. Each occupies one of the five Practice slots, has base Stock
capacity 2 and one worker socket. Ordinary quality, worker (+1 Output or Charge
Multiplier per effective worker), Output and Capacity rules still apply.
No new keyword or effect operation is introduced; input costs do not scale.

The original seven supply cards retain their authored Scholar/Warrior class and
minimum tier. Irrigating is admitted as a Scholar-only Bronze upgrade; Flood
Almanacs is Scholar-only Bronze and Papermaking remains Scholar-only Silver.
The legacy supply list admits definitions without overriding their class.
The new remnant IDs are excluded before shop selection, specialty discovery,
refreshes, adoption offers and Stock Supply generation. Editing their class,
quality or lock fields cannot admit them. First-life Stock Supply uses Common
producers before Founding and admits class-only outputs afterwards, including
when the Lab moves or disables Founding.

| Map Practice | Counterpart | Exact base recipe and loss of efficiency | World placement |
| --- | --- | --- | --- |
| Neglected Flocks | Sheep Husbandry, Scholar/Bronze | Autumn only: Require 1 Edible, retained; generate 1 Animal/Edible/Cloth Stock. The original produces in three seasons, totaling 4 base Stock a year, without that requirement. | Forager Hamlet |
| Salt Monopoly | Salt Gathering, Scholar/Bronze | Summer: Consume 2 Edible; generate 1 Salt/Currency Stock. The original generates 3 with no input. Food is diverted to the overseer. | Grain Village, Market Town |
| Rotting Pulp Vat | Papermaking, Scholar/Silver | Autumn only: Consume 2 Timber and Require 1 retained Water; generate 1 Paper/Record Stock. The original uses 1 Timber for 3 Stock every Birth. | Timber Village |
| Falsified Ledgers | Record Keeping, Scholar/Bronze | Winter only: Consume 1 Currency; generate 1 Record Stock. The original produces every season without payment and scales with population. | Market Town |
| Splintered Bow Workshop | Bowmaking, Warrior/Bronze | Autumn only: Consume 2 Timber and Require 1 retained Tool; generate 1 Arms Stock. The original uses 1 Timber for 3 Arms every Birth. | Timber Village |
| Rusted Armoury | Weaponsmithing, Warrior/Silver | Summer only: Consume 2 Metal and 2 Fuel; generate 1 Arms/Tool Stock. The original uses 1 Metal and 1 Fuel for 3 Stock every Birth. | Quarry Village |
| Withheld Spoils | Border Skirmishing, Warrior/Silver | Successful local automated defense/interception: +1 base Charge; at 6 Charge Discharge for 1 Loot Stock. The original discharges at 2 Charge and has twice the base capacity. | Forager Hamlet |
| Silted Channels | Irrigating, Scholar/Bronze | Spring only: Consume 1 Construction; generate 1 Water Stock, with no Edible output. The original generates 8 base Edible/Water Stock across three seasons without inputs and has capacity 8. | Timber Village |

Stock with several Traits is one hosted amount, not separate payouts. All
scheduled outputs are one annual opportunity; Withheld Spoils follows real
defense events. Zero workers retains each card's base output. Compared at the
same worker count, these cards also have fewer available sockets and much less
storage than their class counterparts. They intentionally cannot imitate a
developed class engine.

## Obtainable openings and relationships

Town type is chosen by the existing seeded biome recipe. Its captured Practice
list now includes the appropriate degraded cards; no extra RNG draw is needed.
Unheld storefronts retain empty boards until first control, then activate the
same captured list. Existing developed Crown towns install it at world creation.
Town population, allegiance, road generation and the five-slot limit are retained.

- A Timber Village fits Woodlot Rights, Hearth Barter, Silted Channels, Rotting Pulp Vat and
  Splintered Bow Workshop. Woodlot Rights supplies Construction and Timber. A Spring
  channel repair leaves Water for the Autumn paper recipe. Records can enable
  scholarly institutions after capture. The bow workshop additionally needs
  Tool supply from an adjacent connected allied quarry, or a replacement of one
  of the five local cards. This dependence is intentional, rather than a hidden
  starter Tool grant.
- A Quarry Village fits Rubble Picking, Hearth Barter, Scrap Gathering, Peat Cutting
  and Rusted Armoury. Scrap supplies Metal, Peat supplies Fuel; their ordinary
  capacities permit the complete two-Metal/two-Fuel recipe. Retained Arms/Tool
  can equip local Warriors or support a neighbour's workshop. Food must still
  come from the existing local/network/storefront economy.
- A Forager Hamlet keeps Scrub Foraging and Hearth Barter alongside Neglected Flocks and
  Withheld Spoils. Retaining Edible enables the autumn flock; Cloth and Animal
  can support later class recipes. Spoils only accrue after the settlement
  actually wins defenses; merely installing the card supplies no victories.
- A Market Town's Scrub Foraging/Fallow Fields feed Salt Monopoly. Hearth Barter pays for
  Falsified Ledgers. Salt/Currency and Record create modest bridges to class
  consumers, while their material waste and annual cadence reward replacement.

These cards serve the engine-building and evolving-civilization pillars by
making inherited material chains usable but visibly inefficient. They strain
the limited-space pillar deliberately: restoring a useful economy requires
choosing which broken institution to keep, support or replace. They grant no
population conversion, sacrifice, free faction control or new settlement.

## Artwork and verification

The complete [starter-economy pass](starter-economy.md) replaces the remaining
adopted Common cards in player starts, Crown boards and first-control recipes,
and documents the two additional basic cards and weaker inherited storage.

All eight use dedicated opaque 5:7 Common-palette paintings: anonymous figures,
ruined or repurposed apparatus, decisive focal actions and quiet visible lower
halves for overlays. The exact built-in ImageGen prompts and source/output paths
are recorded in
[`remnant-supply-prompts-v2.json`](../images/dark-fantasy/settlement-pieces-v4/remnant-supply-prompts-v2.json).
This replacement pass strengthens the individual narrative actions, material
rendering, coherent perspective and environmental scale. The first-pass prompts
remain in `remnant-supply-prompts.json` as superseded provenance; the previous
paintings are retained under the ignored `artifacts/remnant-art-pass2/previous/`.
All eight replacements were inspected at full size and on actual working cards,
including 70x100 renderings and phone touch inspection. Gameplay is unchanged.

`node scripts/remnant-supply-test.mjs` checks actual recipes, atomic missing-input
failures, off-season behavior, real defense rewards, town activation, class and
map-only pool boundaries, JSON continuation and authoritative replay.
`npm run test:full-map` includes it. Run `npm run verify` for the complete repo
checks, and inspect the new cards in Development Lab's Zoo or in inherited towns.
Tuning remains a locally implemented first pass for Cam's gameplay sign-off.
