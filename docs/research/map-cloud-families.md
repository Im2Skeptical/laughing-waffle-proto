# Cloud families for the regional map

> **Historical note.** Dated measurement/research record written against the commit and date stated below. Current schema numbers are in ai/ai-context.md; do not treat numbers here as current.

Research date: 2026-10-16. Scope: overhead cloud art and decorative motion for the map prototype. This is a visual weather study, not an atmospheric simulation. The recommendations below do not change simulation state, RNG, schemas or replay.

## Observational basis

**Small cumulus and fragments.** From above, Cumulus humilis has rounded tops that reach approximately the same level. Individual clouds can be widely separated or close and flattened enough to resemble stratocumulus patches. It should read as an arrangement of shallow lobes, not a side-view tower with a dark underside. [WMO: Cumulus humilis](https://cloudatlas.wmo.int/en/cumulus-humilis.html)

Cumulus forms through rising air and condensation. Stable layers limit its height; a strongly stable layer can cause the tops to spread. Clouds can also dissipate rather than simply translating unchanged. Over land, formation and disappearance often follow a pronounced daily cycle. [WMO: Cumulus development](https://cloudatlas.wmo.int/en/explanatory-remarks-and-special-clouds-cumulus.html)

Fractus denotes ragged, irregular cloud shreds. Humilis denotes modest vertical development. These are useful shape distinctions within the low-cloud art family. [WMO: cloud species definitions, p. 13](https://cloudatlas.wmo.int/docs/ICA_1956-Vol_I_low_res.pdf)

**Stratocumulus patches.** Satellite views reveal broad cellular structure that is difficult to see from beneath. Closed cells have denser cloud-filled centers; open cells have cloud around clearer centers. NASA describes open-cell systems reorganizing over hours and closed cells sometimes preserving their forms for about half a day. Use both filled patches and broken, incomplete cellular shapes rather than identical puffs arranged in rows. [NASA: Ex-cell-ent Clouds off Chile's Coast, including GOES animation](https://science.nasa.gov/earth/earth-observatory/ex-cell-ent-clouds-off-chiles-coast-150926/)

**Cirrus filaments.** Fibratus comprises fine separate straight or curved filaments without hooked ends. Uncinus has a curved, hook-like or comma-like head with trailing strands. These should be visibly fibrous, not translucent versions of rounded cumulus. [WMO: Cirrus descriptions, p. 25](https://cloudatlas.wmo.int/docs/wmo_407_en-v1.pdf)

NASA's satellite example off Chile shows thin diverging plumes associated with high-altitude flow; turbulence or wind shear may explain their spreading. NASA also cautions that assigning a classic species from above can be difficult because classifications largely describe the view from below. The art families should therefore be described as *inspired by* these forms. [NASA: Cirrus Clouds off the Coast of Chile](https://science.nasa.gov/earth/earth-observatory/cirrus-clouds-off-the-coast-of-chile-85943/)

Wind advection transports air, while differences in wind speed and direction can deform cloud formations. Upper-level flow can differ from lower-level flow. These observations justify related motion within a layer and distinct motion between layers; they do not justify arbitrary independent headings for neighboring clouds. [NWS: upper-air flow and advection](https://www.weather.gov/lmk/basic-fronts), [NWS: jet stream and shear-associated cirrus](https://forecast.weather.gov/glossary.php?word=jet+stream)

## Art and motion recommendations

These are design choices derived from the references, not measured meteorological rates. All assets should use a consistent overhead viewpoint, light direction and palette, with no baked ground shadow or sky background. Keep ample transparent space and genuine silhouette differences.

| Family | Eight base silhouettes | Motion character |
| --- | --- | --- |
| Cumulus / fractus | Four compact arrangements: single uneven lobe, unequal paired lobes, triangular three-lobe group, broad notched cluster. Four fragmented arrangements: trailing scraps, split pair, ragged crescent, loose asymmetric fragments. | Lower-layer advection; local growth and density erosion at different ages; modest change in breadth. Fragments disperse more than compact lobes. Avoid wobbling or uniform breathing. |
| Stratocumulus | Four cushions: long scalloped raft, irregular broad patch, narrow branching patch, offset joined patches. Four broken forms: incomplete cellular arc, torn network, open pocket with unequal sides, ragged split bank. | More persistent coherent translation; small differential shear between portions; gaps and margins open gradually. Avoid rotating rafts like solid islands. |
| Cirrus / uncinus | Four filament forms: narrow taper, broad fan, divided streamer, irregular feather. Four hooked forms: long sparse tail, short forked tail, broad asymmetric hook, detached trailing strands. | Separate upper-layer flow; restrained stretching and shear along the strands; slower density change than the small low-cloud fragments. Very weak, diffuse shadows. No puffy inflation. |

Eight sprites per family is a starting art budget, not a promise of invisible repetition. Keep distinct subtypes equally represented over long samples; do not let random selection mostly show one silhouette. Further variations should change internal holes, fragment layout, lobe proportions and filament density, not merely mirror or rescale the same outline. Limit rotation where directional lighting would become inconsistent.

## Long-span playback and repetition

Use fewer visible clouds with irregular clear gaps. Coverage should be a slowly changing envelope, independent of individual cloud lifetimes. Family mix can change gradually so every moment is not the same three layers at the same density.

Give each cloud a finite deterministic episode derived from the map seed, family and absolute episode index. Overlap births and deaths using density-based appearance/erosion; do not recycle an unchanged immortal sprite at the opposite edge. Adjacent episodes should have independent shape, position, scale, lifetime and local drift, with smooth endpoints. Within a layer, use a shared broad flow plus restrained spatial variation. Separate layer flows create parallax without a swarm of unrelated trajectories.

Evaluate from displayed simulation time directly, including reverse seeks. Do not advance decorative random state per frame, or let animation depend on scrub direction. Do not change the time mapping when selecting a different graph span: the same timestamp must show the same weather. The 50- and 300-year views are artistic time compression, not literal cloud survival across decades.

## Review checks

- Contact sheets: eight readable silhouettes in each family; fragments and holes survive atlas reduction; no side-view bases, clipped edges or baked ground shadows.
- Same timestamp after forward/backward scrubbing: identical cloud placement, art choice, morphology and shadows.
- Slow playback across episode boundaries: no abrupt new silhouettes, popping, wraps or synchronized births.
- Full 50- and 300-year scrubs: no obvious repeated conveyor belt, shared breathing pulse or persistent landmark-shaped cloud.
- Compare cloud-free gaps and terrain readability at fit and close zoom. Confirm denser rafts do not negate the requested reduction in overall coverage.

Useful additional satellite comparison: [NASA: Afternoon Clouds over the Amazon Rainforest](https://science.nasa.gov/earth/earth-observatory/afternoon-clouds-over-the-amazon-rainforest-39936/) shows the high-altitude scale of small cumulus populations. It is a shape-and-scale reference, not a recommendation to fill the playable map with that density.
