# Seeded regional geography

`generator.js` and `biome-clustering.js` are pure seeded geography shared with
the workbench. `definition.js` adapts it to authoritative polygons, adjacency
and starting roads. Definition IDs capture the generator version and seed;
bounded caches avoid rebuilding geography during replay and forecasts.

No renderer, texture, or browser object enters game state. The renderer uses
the exact same generated outlines as the model.
