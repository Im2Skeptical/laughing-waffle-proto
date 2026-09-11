# Settlement illustrations

Thirty original illustrations generated separately with OpenAI's built-in image generation tool on 2026-09-11. `prompts.json` records the generation and background-cleanup prompts.

The 16 practices use portrait compositions; the 14 structures use continuous landscape compositions for their one-, two-, or three-cell footprints. Each definition ID maps to one WebP file through `SETTLEMENT_PIECE_ART_IDS` in `src/views/chronicle-art.js`. Illustrations load on demand.

Production assets preserve their original proportions and alpha, with a maximum width of 960 px and height of 768 px, encoded as WebP at quality 0.86. Six illustrations use a dark background matching the card material after cleanup of generated checkerboard backgrounds. Original generated PNGs remain in the local Codex generated-images directory; only the approximately 4.2 MB production pack is deployed.

Frames, quality, charge fills, sources, outputs, worker sockets, placement guides and transition states are drawn in code. No gameplay UI is baked into the illustrations.
