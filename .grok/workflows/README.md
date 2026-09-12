# Completed extract orchestrators

These scripts already ran on `main`. They are historical, not jobs to
re-launch. Remaining god files are PIXI construction, composition roots,
or a dead tick whose live helpers cannot stand alone.

| Script | Landed |
|---|---|
| `agent-context-hygiene.rhai` | `eccab88` |
| `modularity-extract-loop.rhai` | `444b0eb` |
| `modularity-extract-followup.rhai` | `3353f95` |
| `modularity-legacy-split.rhai` | `799e100` |
| `leftover-surface-fence.rhai` | leftover exec/defs fences, architecture allowlists, ActionKinds trim |

Do not start another overlay or legacy-split extract loop. Skip a seam
rather than lift anything that still closes over PIXI or a controller.
Do not re-run `leftover-surface-fence.rhai`.
