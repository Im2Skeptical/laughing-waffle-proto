# Seeded regional geography

`generator.js` and `biome-clustering.js` are pure seeded geography shared with
the workbench. `definition.js` adapts it to authoritative polygons, adjacency
and starting roads. Definition IDs (`regional-v<revision>:<seed>`) capture the generator revision and seed, and
revision 1 is pinned by a golden-geometry test, so geometry changes need a new revision;
bounded caches avoid rebuilding geography during replay and forecasts.

No renderer, texture, or browser object enters game state. The renderer uses
the exact same generated outlines as the model.

- `boot-profile.js` — keeps the approved opening economy/tableau on the new seeded geography.

`names.js` derives literal compass/biome labels from captured geometry, without RNG. Direction uses 75% position within the shared-edge biome patch and 25% world position, preserving patch aspect ratio. Minimum-cost matching uses distinct compass directions before letters; Central is eligible only in the inner half-radius of the patch. A/B/C suffixes resolve remaining duplicate labels in north-to-south, then west-to-east order, including disconnected patches. Neutral markets inherit the region label. Revision 2 enables names with unchanged revision-1 geometry; revision 1 retains its original labels.

Player-facing references resolve the definition name; IDs remain internal keys. Views abbreviate compass words only when fitting requires it. Singleton patches use the global compass, with Central covering the inner 0.17 map-unit radius.
