# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

Domain docs that actually exist in this repo:

- **`CONTEXT.md`** at the repo root: ubiquitous language glossary.
- **`ai/ai-context.md`**: engine invariants and schema numbers.
- Then only the relevant of **`ai/sim.md`**, **`ai/ui.md`**, or a section of
  **`ai/repository-map.md`**.

Generic skill layout also mentions:

- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

This repo is single-context. Root `CONTEXT.md` exists. `CONTEXT-MAP.md` and
`docs/adr/` do not. If any of those files don't exist, **proceed silently**.
Don't flag their absence; don't suggest creating them upfront. The
`/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions
actually get resolved.

## File structure

Single-context repo (this repo):

```
/
├── CONTEXT.md
├── ai/ai-context.md
└── src/
```

`docs/adr/` is the conventional ADR location if one is created later. It is
not present now.

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
