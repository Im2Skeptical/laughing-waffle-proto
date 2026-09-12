# Architecture checker fixtures

Scan-only samples for `scripts/check-architecture.mjs`. They are **not**
app modules: `check:source` only walks `src/`, and nothing under `src/`
imports this directory.

The leftover-module fence must see named `from` imports, dynamic
`import()`, and side-effect `import "./x.js"`.

## Run

From the repo root:

```
node scripts/check-architecture.mjs --fixtures
```

or `npm run check:architecture:fixtures`.

`node scripts/check-architecture.mjs` (no flag) still scans only the live
`src/` tree.

## Cases

| File | Virtual `src/model/` path | Expected |
|---|---|---|
| `negative-side-effect-leftover.js` | non-allowlisted | fail (`import "./settlement-exec.js"`) |
| `negative-dynamic-leftover.js` | non-allowlisted | fail (`import("./settlement-exec.js")`) |
| `positive-allowlisted-named.js` | `src/model/commands/debug-commands.js` | pass (named `from` leftover) |
| `positive-side-effect-non-leftover.js` | non-allowlisted | pass (side-effect of a non-leftover module) |

Do not execute these files. The checker reads them as text and applies
leftover rules against the virtual path in the `--fixtures` table.
