# Domain Docs

How agents consume this repo's domain documentation.

## Route from the task

- **`ai/ai-context.md`**: engine invariants and schema numbers.
- The matching routing skill under `.grok/skills/`, when one applies.

Use the matching section of **`ai/repository-map.md`**. Read `ai/sim.md` or
`ai/ui.md` only when the routing skill is insufficient; read both for a task
crossing model and UI/replay. Read root **`CONTEXT.md`** when domain vocabulary
is unclear. Read a split folder's README before its orchestrator.

Root **`AGENTS.md`** owns the context-loading rules.

## Off-limits unless asked

- **`ai/history/`**: historical decision records for an older prototype or a
  completed effort. Not current routing, not task lists, and not sources of
  schema numbers or file paths. Read only when the task is explicitly about a
  past design decision.

This is a single-context repository. Root `CONTEXT.md` is the glossary.
There is no ADR directory; do not assume ADRs are present.

## Use the glossary's vocabulary

When your output names a domain concept, use the term as defined in
`CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.
