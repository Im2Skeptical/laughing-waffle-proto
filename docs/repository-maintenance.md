# Repository maintenance

`main` is the development and Pages deployment branch. Keep completed work in
Git history, and remove finished topic branches and worktrees after checking
for unfinished files and commits. A comparison script should not depend on a
permanent agent checkout.

## Documentation ownership

- `ai/ai-context.md`: current invariants and schema numbers.
- `ai/sim.md` and `ai/ui.md`: current simulation and interface behavior.
- `CONTEXT.md`: current domain terms.
- `ai/repository-map.md` and folder READMEs: source and verification routes.
- `docs/civilization-milestone.md` and `docs/civcontent-2.6-implementation.md`:
  coverage, provisional choices and remaining content clauses.
- `Designer Docs/`: current effect, targeting and trigger dictionaries.
- `docs/research/`: dated measurements and implementation evidence; reproduce
  comparisons at their recorded revisions, not against an incompatible save schema.
- `ai/history/`: historical design records, consulted for past decisions.
- Versioned art READMEs and prompts: asset provenance and explicitly marked
  archived passes. Prototypes remain separate from production until approved.

Run `npm run check:docs` after document or source-route changes. It validates
local Markdown destinations/headings, current source paths, npm commands,
invariants-sheet schemas and the effect-operation whitelist. It skips historical
design records and preserves source references in dated research/deletion reports.
It does not verify external websites or prove prose agrees with every game rule;
behavioral documentation still requires comparison with implementation and tests.
`npm run verify` includes this guard and the normal architecture, source, asset,
build and simulation checks.

## Git cleanup and recovery

1. Fetch/prune remotes; inspect branches, open pull requests, worktrees and stashes.
2. Check each worktree's HEAD, index, modified files, untracked files and valuable
   ignored inputs. Preserve `exports/` and local configuration; generated test
   output and dependencies can be rebuilt.
3. Before retiring unmerged work, create and verify a Git bundle containing all
   original refs, detached HEADs and every stash commit. Archive binary diffs,
   staged/unstaged distinctions and unfinished files separately. Record the
   original branch names, paths, HEADs and archive checksums.
4. Recheck each checkout before removal. Verify resolved paths against the
   explicit repository/agent-worktree roots. Remove only the inventoried paths;
   retain any checkout whose contents changed during the audit.
5. Remove retired local/remote topic branches and archived stashes. Confirm the
   remaining worktree and branch inventory, verify changes, commit and push `main`
   according to `AGENTS.md`.

Recovery archives live outside the repository, under the repository's parent
directory at `.repo-housekeeping/laughing-waffle-proto/<timestamp>/`. They are
local backups, not published source or active branches. `README.txt` explains
bundle recovery; `refs-before.txt`, `recovery.json`, and `cleanup-result.json`
record the original refs, worktree ZIPs and removals. Clone the bundle to recover
history, then restore a matching ZIP's tracked patch and `files/` contents to
recover unfinished work. Keep these archives until their owner chooses to discard them.

## Pinned differential comparisons

`npm run test:differential` creates isolated temporary clones of its pinned
historical commits and removes them on success or failure. It registers no Git
worktrees. `--baseline`, `--refactor`, `NAV_BENCH_BASELINE`, and
`NAV_BENCH_REFACTOR` still accept caller-owned checkouts, which are never removed.
Eight supported historical scenarios compare complete states; the removed
regional-install action remains an explicit skip. This is a historical refactor
comparison; current gameplay/replay checks remain in `npm run verify`.
