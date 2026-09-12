# Domain Docs

How agents consume this repo's domain documentation.

## Always read first

- **`CONTEXT.md`** at the repo root: ubiquitous language glossary.
- **`ai/ai-context.md`**: engine invariants and schema numbers.

Then read the matching behavior doc (`ai/sim.md` and/or `ai/ui.md`) **and**
the matching section of **`ai/repository-map.md`**. After the map lands in a
split folder, read that folder README before the orchestrator file.

Routing skills live in `.grok/skills/`. Prefer those over loading a whole
subsystem.

## Off-limits unless asked

- **`ai/history/`**: historical decision records for an older prototype or a
  completed effort. Not current routing, not task lists, and not sources of
  schema numbers or file paths. Read only when the task is explicitly about a
  past design decision.

This is a single-context repository. Root `CONTEXT.md` is the glossary.
`docs/adr/` does not exist; do not assume ADRs are present.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in
`CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.
