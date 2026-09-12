let meta = #{
    name: "agent-context-hygiene",
    description: "COMPLETED on main (eccab88). Do not re-run. Historical orchestrator: archive AI docs, delete Matt Pocock skills, register repo skills, collapse vassal selectors, remove dead substrate.",
    phases: [
        #{ title: "Docs and skills", detail: "history folder, delete Matt Pocock pack, routing skills, AGENTS/README" },
        #{ title: "Vassal ownership", detail: "move live vassal selectors into vassal-life-map" },
        #{ title: "Dead substrate", detail: "unreachable init tail, empty controller folders, moon fences" },
        #{ title: "Report", detail: "structured change report for parent sanity check" },
    ],
    when_to_use: "Completed on main. Do not launch. Remaining god files are PIXI, composition, or dead-tick-with-live-helpers, not this hygiene pass.",
};

let verdict_schema = #{
    "type": "object",
    "required": ["approved", "off_track", "summary", "issues"],
    "properties": #{
        "approved": #{ "type": "boolean" },
        "off_track": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "issues": #{
            "type": "array",
            "items": #{ "type": "string" },
        },
    },
};

fn review_ok(r) {
    if r == () { return false; }
    if r.success != true { return false; }
    if r.output == () { return false; }
    if type_of(r.output) != "map" { return false; }
    if r.output.approved != true { return false; }
    if r.output.off_track == true { return false; }
    true
}

fn issue_text(r) {
    if r == () { return "Reviewer returned no result."; }
    if r.success != true { return "Reviewer failed (success=false)."; }
    if r.output == () { return "Reviewer returned empty output."; }
    if type_of(r.output) != "map" { return "Reviewer output was not a verdict map."; }
    let s = "";
    if r.output.summary != () {
        s += r.output.summary;
    }
    if r.output.off_track == true {
        s += " OFF_TRACK=true.";
    }
    if r.output.issues != () && type_of(r.output.issues) == "array" {
        for item in r.output.issues {
            s += "\n- ";
            s += item;
        }
    }
    if s == "" { return "Reviewer did not approve (no details)."; }
    s
}

fn shared_rules() {
    let p = "";
    p += "Workspace: D:/Misc/IdleGameIdea - Civilization Survivor/laughing-waffle-proto\n";
    p += "You work in the SHARED workspace. Do not use a private worktree.\n";
    p += "Do NOT commit, push, or create git tags.\n";
    p += "Do NOT rewrite timegraphs-pixi.js reveal/scrub, the forecast worker, or state.js serialize.\n";
    p += "Do NOT add migration shims. This prototype does not preserve obsolete saves.\n";
    p += "Determinism: no Math.random(); GameState stays JSON-only; rebuildStateAtSecond remains authority.\n";
    p += "Model must not import views/controllers.\n";
    p += "Use targeted reads/grep. Do not dump artifacts/ or large JSON.\n";
    p += "Read files before editing. Match existing comment and code style.\n";
    p
}

fn docs_impl() {
    let p = "";
    p += shared_rules();
    p += "\nROLE: IMPLEMENTER for stream Docs and skills.\n";
    p += "Use read_file, grep, list_dir, search_replace/write, and run_terminal_command.\n";
    p += "\nOBJECTIVES (all of them):\n";
    p += "1) DELETE the improperly installed Matt Pocock skill pack. These are retrievable elsewhere and must leave this repo:\n";
    p += "   - ai/skills/engineering/ (entire tree)\n";
    p += "   - ai/skills/grill-me/\n";
    p += "   - ai/skills/grilling/\n";
    p += "   - ai/skills/handoff/\n";
    p += "   - ai/skills/ubiquitous-language/\n";
    p += "   Use git rm -r if they are tracked, otherwise Remove-Item -Recurse. After deletion, ai/skills/ should only contain repo/ (until you move it).\n";
    p += "2) MOVE historical AI docs into ai/history/ and mark them historical.\n";
    p += "   Create ai/history/README.md stating: these files are historical decision records for an older prototype or a completed effort; they are not current routing, not task lists, and not sources of schema numbers or file paths. Point readers to ai/ai-context.md, ai/sim.md, ai/ui.md, ai/repository-map.md, CONTEXT.md.\n";
    p += "   git mv (or move) these files into ai/history/:\n";
    p += "   - ai/ChatwindowOnboardingPrompt-01.md\n";
    p += "   - ai/debug-tools-expansion-plan.md\n";
    p += "   - ai/detailed-settlement-redesign-plan.md\n";
    p += "   - ai/milestone2-substage3-report.md\n";
    p += "   - ai/PROTOTYPE-RESET.md\n";
    p += "   - ai/Refactor Initial Prompt.md\n";
    p += "   - ai/refactor-token-navigation-plan.md\n";
    p += "   At the TOP of each moved file, insert a blockquote banner: Historical document. Not current routing. Not a task list. Not a source of schema numbers or paths. Current invariants: ai/ai-context.md. Current sim/UI: ai/sim.md, ai/ui.md. Current file routing: ai/repository-map.md.\n";
    p += "   KEEP in ai/: ai-context.md, sim.md, ui.md, repository-map.md, visual-overhaul.md, References/.\n";
    p += "3) REGISTER repo routing skills for Grok discovery.\n";
    p += "   Grok auto-loads <repo>/.grok/skills/*/SKILL.md. It does NOT auto-load ai/skills/.\n";
    p += "   MOVE the three existing skills from ai/skills/repo/ into .grok/skills/ (add-gamepiece, change-settlement-sim, change-view).\n";
    p += "   ADD three new skills with the same terse routing style as change-view:\n";
    p += "   - change-vassal-life-map: route to src/model/vassal-life-map.js barrel + vassal-life-map/ (selectors, shop, lifecycle/, presentation) and src/defs/gamepieces/vassal-life-map-defs.js. Generator is vassal-life-map-generator.js. Do not extend settlement-vassal-exec.js or settlement-state.js for new Life Map rules. Tests: npm run test:vassal-life-map and replay-sensitive changes also npm run test:detailed-replay.\n";
    p += "   - change-timegraph: route via ai/repository-map.md Timegraph section. Labels in src/model/graph-metrics.js; ink/constants in src/views/timegraphs/; chrome in timegraph-scroll-pixi.js; series menu/window in src/views/ui-root/. Search timegraphs-pixi.js for reveal/scrub/playhead; do not read it end-to-end for label work; do not rewrite it together with the forecast worker or state.js. Probe: npm run probe:navigation or probe:settlement as relevant.\n";
    p += "   - change-debug-tools: Map Lab / Game Settings / Gamepieces / Vassal Lab / Life Map Lab / debug profiles. Include the previously unmapped modules: src/controllers/debug-profile-controller.js, src/model/debug-profile-library.js, src/controllers/vassal-debug-preset-controller.js, src/views/debug-world-map-dom.js. Apply starts a fresh run. Probe: npm run probe:map-lab.\n";
    p += "   Keep SKILL.md frontmatter name+description trigger-rich. If ai/skills/ is empty afterward, remove the empty tree.\n";
    p += "4) REWRITE agent navigation so surgical work actually works.\n";
    p += "   AGENTS.md: stop the exclusive-or. Always read ai/ai-context.md and CONTEXT.md. Then read the matching behavior doc (ai/sim.md and/or ai/ui.md) AND the matching section of ai/repository-map.md. After the map lands in a split folder, read that folder README before the orchestrator file. Prefer .grok/skills/ routing skills. Do not read ai/history/ unless the task is explicitly about a past design decision. Keep core constraints, verify, deploy, context hygiene. Remove Matt Pocock / engineering-skill language. Keep a short GitHub Issues pointer if docs/agents/issue-tracker.md remains; drop references to /triage /wayfinder /domain-modeling /setup-matt-pocock-skills /grill-with-docs.\n";
    p += "   docs/agents/domain.md: rewrite as THIS repo's domain-doc consumer rules (CONTEXT.md, ai-context, sim/ui/repository-map, ai/history is off-limits). Delete generic multi-context ADR scaffolding and skill-pack cross-links.\n";
    p += "   README.md: shrink to what the prototype is, how to run/verify/probe, and pointers to ai-context/sim/ui/repository-map. Remove the long gameplay restatement and the link to detailed-settlement-redesign-plan.md. Do not treat README as the rules document.\n";
    p += "   ai/ai-context.md: keep invariants; mention ai/history/ as historical; point skills at .grok/skills/; add missing schema numbers you can confirm in code (Life Map Lab draft, generator, graph, debug profile library, draft library) by reading the source constants — do not invent numbers.\n";
    p += "   ai/repository-map.md: update skill path; add missing debug/UI routes listed above; point historical plans at ai/history/; keep known bounded debt. Fix ui-root/README.md if it still omits settlement-graph-groups.js.\n";
    p += "   ai/visual-overhaul.md: replace the dead src/views/chronicle-card.js pointer with src/views/settlement-piece-pixi.js (and chronicle-inspection.js). Align workshop-seal vs hourglass wording with ai/ui.md if you touch that sentence.\n";
    p += "   Update any remaining live-doc links to the moved historical files (grep the repo for those filenames, skip artifacts/ and dist/).\n";
    p += "5) Verification for this stream: grep that ai/skills/engineering is gone; historical files exist under ai/history/ with banners; .grok/skills has the six SKILL.md files; AGENTS.md no longer says exclusive-or; README no longer links the redesign plan. Do not run the full game suite unless you also edited src/.\n";
    p += "When done, list every path you created, moved, deleted, or edited.\n";
    p
}

fn docs_review() {
    let p = "";
    p += shared_rules();
    p += "\nROLE: REVIEWER for stream Docs and skills. Read-only.\n";
    p += "Do not trust the implementer. Run git status and git diff. Read the changed files.\n";
    p += "Approve only if ALL are true:\n";
    p += "- Matt Pocock pack is gone (no ai/skills/engineering, grill-me, grilling, handoff, ubiquitous-language).\n";
    p += "- Historical docs live in ai/history/ with a folder README and a historical banner on each moved file. Live ai/ still has ai-context, sim, ui, repository-map, visual-overhaul, References.\n";
    p += "- Repo routing skills exist under .grok/skills/ including the three new ones, with accurate file routes. AGENTS.md points at them.\n";
    p += "- AGENTS.md no longer uses exclusive-or of sim/ui/repository-map; it requires behavior doc plus repository-map section plus folder README; it fences ai/history/.\n";
    p += "- README is not a second rules dump and does not link historical plans as current.\n";
    p += "- visual-overhaul does not point at chronicle-card.js.\n";
    p += "- No commit/push happened.\n";
    p += "- No timegraph/forecast/state.js rewrite.\n";
    p += "Set off_track=true if the implementer edited unrelated gameplay, restored Matt Pocock skills, or ignored the history-folder requirement.\n";
    p += "Set approved=true only with evidence from files you read. Empty issues is allowed only after that inspection.\n";
    p
}

fn vassal_impl() {
    let p = "";
    p += shared_rules();
    p += "\nROLE: IMPLEMENTER for stream Vassal ownership.\n";
    p += "Use read_file, grep, list_dir, search_replace/write, and run_terminal_command.\n";
    p += "Read ai/ai-context.md, CONTEXT.md, the Simulation routes in ai/repository-map.md, and src/model/vassal-life-map/README.md before coding.\n";
    p += "\nOBJECTIVE: Live current-vassal / selected-vassal reads must be owned by vassal-life-map, not settlement-state.js.\n";
    p += "Facts already verified:\n";
    p += "- getCurrentLifeMapVassal in src/model/vassal-life-map/selectors.js is id-only.\n";
    p += "- getSettlementCurrentVassal / getSettlementSelectedVassals / getSettlementFirstSelectedVassal in src/model/settlement-state.js have extra fallbacks (currentVassal object, selected ids). Forecast, ui-root-settlement-pixi.js, projection-summary.js, settlement-navigation-state.js, and settlement-vassal-exec.js call the settlement-state versions.\n";
    p += "- vassal-life-map modules do not import settlement-state.js. settlement-state does not import vassal-life-map. Keep that acyclic.\n";
    p += "Required design:\n";
    p += "1) Move the live lineage getters into src/model/vassal-life-map/selectors.js. Preserve the fallback behavior of getSettlementCurrentVassal (do not silently drop currentVassal object or selected-id fallbacks used by HUD/forecast).\n";
    p += "2) Export them from src/model/vassal-life-map.js (public barrel). Update src/model/vassal-life-map/README.md.\n";
    p += "3) Update external callers to import from vassal-life-map.js, not settlement-state.js: projection-summary.js, ui-root-settlement-pixi.js, ui-root/settlement-navigation-state.js, settlement-forecast-controller.js. settlement-vassal-exec.js may keep importing from settlement-state only if moving that import would be a large unrelated touch; prefer vassal-life-map.js if it is a one-line import change.\n";
    p += "4) settlement-state.js must STOP exporting those getters. If it still uses them internally, import from ./vassal-life-map/selectors.js (the leaf, NOT the vassal-life-map.js barrel, to avoid loading lifecycle).\n";
    p += "5) Keep getCurrentLifeMapVassal. Either document the two semantics in the README, or make getCurrentLifeMapVassal delegate to the moved fuller getter if tests and Life Map internals still behave. Prefer preserving observable HUD/forecast behavior.\n";
    p += "6) Do not add new gameplay to settlement-state.js, settlement-exec.js, or settlement-vassal-exec.js.\n";
    p += "7) Tests: npm run test:vassal-life-map ; npm run test:detailed-replay. If you touched forecast callers, also npm run test:world if that suite covers the import. Fix failures you caused.\n";
    p += "When done, list changed files and the test commands you ran with pass/fail.\n";
    p
}

fn vassal_review() {
    let p = "";
    p += shared_rules();
    p += "\nROLE: REVIEWER for stream Vassal ownership. Read-only besides running tests if needed.\n";
    p += "Do not trust the implementer. git diff. Read selectors.js, vassal-life-map.js, settlement-state.js, and every updated caller.\n";
    p += "Approve only if ALL are true:\n";
    p += "- Live current/selected vassal getters are defined in vassal-life-map/selectors.js and exported from the barrel.\n";
    p += "- settlement-state.js no longer defines/exports getSettlementCurrentVassal / getSettlementSelectedVassals / getSettlementFirstSelectedVassal.\n";
    p += "- UI/forecast/projection-summary import them from vassal-life-map, not settlement-state.\n";
    p += "- Fallback behavior used by HUD/forecast is preserved (not a silent id-only collapse that would null out current vassal).\n";
    p += "- No cycle: settlement-state imports selectors.js leaf if needed, not the lifecycle barrel; vassal-life-map still does not import settlement-state.\n";
    p += "- Tests listed in the stream were run or you ran them and they pass.\n";
    p += "- No commit/push; no timegraph/worker/state.js rewrite; no new gameplay in settlement-exec.js.\n";
    p += "Set off_track=true if they rewrote Life Map shop/confirm rules, forecast worker, or dual-path graph-metrics food tooltips as a drive-by.\n";
    p
}

fn dead_impl() {
    let p = "";
    p += shared_rules();
    p += "\nROLE: IMPLEMENTER for stream Dead substrate.\n";
    p += "Use read_file, grep, list_dir, search_replace/write, and run_terminal_command.\n";
    p += "Read ai/ai-context.md and the Known bounded debt section of ai/repository-map.md.\n";
    p += "\nOBJECTIVES:\n";
    p += "1) src/model/init.js: createInitialState (or equivalent) currently returns around the initializeDetailedSettlementCivilization / recomputeInitialActionPoints point, then has UNREACHABLE hub/board assembly (nextHubStructureInstanceId, ensureBoardCols, buildSettlementPrototypeHubState, stepSettlementOrders, syncSettlementDerivedState, then a throw). DELETE that dead tail after the live return. Do not change the live return path. Remove imports that become unused.\n";
    p += "2) Remove empty leftover folders src/controllers/actionmanagers/ and src/controllers/eventmanagers/ if they contain no source files. If git does not track empty dirs, just delete them from disk.\n";
    p += "3) Fence the two moons with file-top comments:\n";
    p += "   - src/model/moon-phases.js = live detailed-settlement named phases (Birth/Food/Housing/Faith/Migration/Death).\n";
    p += "   - src/model/moon.js = leftover AP / waxing helpers on MOON_CYCLE_SEC. Do not add new detailed-settlement phase rules here.\n";
    p += "4) Strengthen file-top comments on settlement-exec.js if needed: stepSettlementSecond has no callers; do not add gameplay here. New site sim is detailed-settlements; new Life Map is vassal-life-map.\n";
    p += "5) Do NOT delete settlement-exec.js, settlement-state.js, or hub/env defs in this stream. They are still imported. Clean cuts only for unreachable code and empty dirs.\n";
    p += "6) If scripts/check-architecture.mjs can cheaply reject NEW model imports of settlement-exec.js from files that do not already import it, add that — only if it is a small, obviously correct check. Skip if it would false-positive existing files.\n";
    p += "7) Run: npm run check:architecture ; npm run check:source ; npm run test:world. Fix failures you caused.\n";
    p += "When done, list changed files and test results.\n";
    p
}

fn dead_review() {
    let p = "";
    p += shared_rules();
    p += "\nROLE: REVIEWER for stream Dead substrate. Read-only besides tests if needed.\n";
    p += "Do not trust the implementer. git diff. Read init.js around createInitialState, moon.js, moon-phases.js, and any architecture-check change.\n";
    p += "Approve only if ALL are true:\n";
    p += "- Unreachable hub/board tail after the live return in init.js is gone; live initializeDetailedSettlementCivilization path remains.\n";
    p += "- Empty actionmanagers/eventmanagers folders are gone (or never tracked and removed from disk).\n";
    p += "- moon.js vs moon-phases.js headers correctly split leftover AP clock vs live named phases.\n";
    p += "- settlement-exec.js / hub defs were not deleted.\n";
    p += "- check:architecture, check:source, test:world pass (run them if the implementer did not show passing output).\n";
    p += "- No commit/push; no forecast/timegraph rewrite.\n";
    p += "Set off_track=true if they started the abandoned timegraph refactor or deleted still-imported modules, breaking reachability.\n";
    p
}

fn run_pair(stream_name, impl_prompt, review_prompt, schema) {
    log("Stream " + stream_name + ": launching implementer + reviewer pair.");
    let impl_opts = #{
        label: "impl-" + stream_name,
        capability_mode: "all",
        agent_type: "general-purpose",
    };
    let impl = agent(impl_prompt, impl_opts);
    let rev_opts = #{
        label: "review-" + stream_name,
        capability_mode: "read-only",
        agent_type: "general-purpose",
        output_schema: schema,
    };
    let rev = agent(review_prompt, rev_opts);
    if review_ok(rev) {
        log("Stream " + stream_name + ": first pair approved.");
        return #{
            stream: stream_name,
            approved: true,
            attempts: 1,
            summary: rev.output.summary,
        };
    }
    log("Stream " + stream_name + ": first pair not approved or off-track. Spawning a FRESH pair.");
    let issues = issue_text(rev);
    let retry_impl = impl_prompt;
    retry_impl += "\n\nFRESH ATTEMPT. A prior pair went off-track or failed review. Do not resume their mistakes. Re-read the current workspace (git diff / git status) and finish the objectives. Prior review:\n";
    retry_impl += issues;
    retry_impl += "\nIf the prior pair already completed some objectives correctly, keep those files and fix the rest. If they made a mess, revert only the bad parts of this stream and redo them.\n";
    let impl2_opts = #{
        label: "impl-" + stream_name + "-retry",
        capability_mode: "all",
        agent_type: "general-purpose",
    };
    let impl2 = agent(retry_impl, impl2_opts);
    let retry_rev = review_prompt;
    retry_rev += "\nThis is a FRESH reviewer for a second pair. Inspect the workspace from scratch. Prior review issues were:\n";
    retry_rev += issues;
    let rev2_opts = #{
        label: "review-" + stream_name + "-retry",
        capability_mode: "read-only",
        agent_type: "general-purpose",
        output_schema: schema,
    };
    let rev2 = agent(retry_rev, rev2_opts);
    if review_ok(rev2) {
        log("Stream " + stream_name + ": fresh pair approved.");
        return #{
            stream: stream_name,
            approved: true,
            attempts: 2,
            summary: rev2.output.summary,
        };
    }
    log("Stream " + stream_name + ": fresh pair still not approved.");
    return #{
        stream: stream_name,
        approved: false,
        attempts: 2,
        summary: issue_text(rev2),
    };
}

phase("Docs and skills");
let docs = run_pair("docs-skills", docs_impl(), docs_review(), verdict_schema);

phase("Vassal ownership");
let vassal = run_pair("vassal-ownership", vassal_impl(), vassal_review(), verdict_schema);

phase("Dead substrate");
let dead = run_pair("dead-substrate", dead_impl(), dead_review(), verdict_schema);

phase("Report");
let report = "";
report += "# Agent context hygiene — sub-orchestrator report\n\n";
report += "Do not treat this as a substitute for the parent sanity check.\n\n";
report += "## Docs and skills\n";
report += "- approved: ";
if docs.approved { report += "true"; } else { report += "false"; }
report += "\n- attempts: " + docs.attempts.to_string() + "\n";
report += "- summary: " + docs.summary + "\n\n";
report += "## Vassal ownership\n";
report += "- approved: ";
if vassal.approved { report += "true"; } else { report += "false"; }
report += "\n- attempts: " + vassal.attempts.to_string() + "\n";
report += "- summary: " + vassal.summary + "\n\n";
report += "## Dead substrate\n";
report += "- approved: ";
if dead.approved { report += "true"; } else { report += "false"; }
report += "\n- attempts: " + dead.attempts.to_string() + "\n";
report += "- summary: " + dead.summary + "\n";
let path = write_scratch_file("sub-orchestrator-report.md", report);
let all_ok = docs.approved && vassal.approved && dead.approved;
complete(#{
    report_path: path,
    report: report,
    all_approved: all_ok,
    docs: docs,
    vassal: vassal,
    dead: dead,
});
