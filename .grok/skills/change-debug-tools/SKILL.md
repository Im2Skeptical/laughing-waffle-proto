---
name: change-debug-tools
description: Change Gym new-run setup, profiles, Map Lab, Game Settings, Gamepieces, Life Map Lab, live Vassal tools, or save diagnostics.
---

# Change debug tools

Start in `ai/repository-map.md` **Debug tools**. Search the named symbol or
visible label, then read only that file and its direct imports.

## Where editors go

| Concern | File |
|---|---|
| Shared debug shell | `src/views/settlement-debug-menu-dom.js` |
| Gym fresh-run workshop | `src/views/development-lab/new-run-setup.js` |
| Map Lab | `src/views/map-lab-dom.js`, `src/controllers/map-lab-controller.js`, `src/model/map-lab-draft.js` |
| Debug world-map widget | `src/views/debug-world-map-dom.js` |
| Game Settings / Gamepieces | `src/views/debug-configuration-dom.js`, `src/controllers/debug-configuration-controller.js`, `src/model/game-config.js` |
| Vassal Lab | `src/views/vassal-debug-dom.js` |
| Vassal Lab presets | `src/controllers/vassal-debug-preset-controller.js` |
| Life Map Lab | `src/views/life-map-lab-dom.js`, `src/controllers/life-map-lab-controller.js`, `src/model/life-map-lab-draft.js` |
| Named draft libraries | `src/model/debug-draft-library.js` |
| Debug profiles | `src/controllers/debug-profile-controller.js`, `src/model/debug-profile-library.js` |

Gym → **New run setup** owns fresh-run editors and launch profiles. The read-only
Regular game baseline and its editable copies use `src/model/new-game.js`, the
same initializer as player New Game (including neutral seeding). **Start new run**
opens a disposable game; **Open in settlement sandbox** initializes Gym.
Museum stores states at a specific second, rather than launch recipes.
The live hold-button workshop owns Vassal replacement and save diagnostics.

## Do not

- Change a running simulation from an unsaved debug draft.
- Add view-side or one-off simulation behavior in Gamepieces; tune
  existing generalized DSL ops.
- Load `ai/history/` unless the task is explicitly about a past design
  decision.

Probe with `npm run probe:map-lab`.
