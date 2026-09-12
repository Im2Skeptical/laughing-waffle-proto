let meta = #{
    name: "modularity-legacy-split",
    description: "COMPLETED on main (799e100). Do not re-run. Historical orchestrator: board/pawn/hub-legacy constructors and sim-runner save-slots.",
    phases: [
        #{ title: "Seam 1", detail: "state.js board/hub/pawn extract" },
        #{ title: "Seam 2", detail: "settlement-state hub leftovers" },
        #{ title: "Seam 3", detail: "sim-runner save/load helpers" },
        #{ title: "Report", detail: "hand back to parent for sanity check" },
    ],
    when_to_use: "Completed on main. Do not launch. Remaining serialize-path files (sim-runner tick/playback, controller-core, settlement-exec derived-sync) still close over their orchestrators.",
};

let verdict_schema = #{
    "type": "object",
    "required": ["approved", "off_track", "summary", "issues"],
    "properties": #{
        "approved": #{ "type": "boolean" },
        "off_track": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "issues": #{ "type": "array", "items": #{ "type": "string" } },
    },
};

let impl_schema = #{
    "type": "object",
    "required": ["done", "changed", "summary"],
    "properties": #{
        "done": #{ "type": "boolean" },
        "changed": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
        "files": #{ "type": "array", "items": #{ "type": "string" } },
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

fn impl_changed(r) {
    if r == () { return false; }
    if r.success != true { return false; }
    if r.output == () { return false; }
    if type_of(r.output) != "map" { return false; }
    r.output.changed == true
}

fn issue_text(r) {
    if r == () { return "No reviewer result."; }
    if r.success != true { return "Reviewer failed."; }
    if r.output == () { return "Empty reviewer output."; }
    if type_of(r.output) != "map" { return "Reviewer output was not a map."; }
    let s = "";
    if r.output.summary != () { s += r.output.summary; }
    if r.output.issues != () && type_of(r.output.issues) == "array" {
        for item in r.output.issues {
            s += "\n- ";
            s += item;
        }
    }
    if s == "" { return "Reviewer did not approve."; }
    s
}

fn impl_summary(r) {
    if r == () { return "Implementer returned nothing."; }
    if r.success != true { return "Implementer failed."; }
    if r.output == () { return "Empty implementer output."; }
    if type_of(r.output) != "map" { return "Implementer output was not a map."; }
    if r.output.summary != () { return r.output.summary; }
    "Implementer gave no summary.";
}

fn fences() {
    let p = "";
    p += "Workspace: D:/Misc/IdleGameIdea - Civilization Survivor/laughing-waffle-proto\n";
    p += "SHARED workspace. Do NOT commit or push.\n";
    p += "DO NOT edit: timegraph-forecast-worker.js, timegraph-forecast-worker-service.js, src/views/timegraphs-pixi.js, src/model/timegraph/controller-core.js.\n";
    p += "DO NOT change GameState schema numbers, serialize format, or reject/accept different saves.\n";
    p += "DO NOT delete settlement-exec.js. DO NOT unify vassal getters. DO NOT add Math.random.\n";
    p += "Model must not import views/controllers. Re-export moved names from the original public file (barrel), matching detailed-settlements.js style. That is not a migration shim.\n";
    p += "Do not redo timegraph extracts already in src/views/timegraphs/.\n";
    p
}

fn impl_prompt(seam, round_label) {
    let p = "";
    p += fences();
    p += "\nROLE: IMPLEMENTER for seam: ";
    p += seam;
    p += "\nRound: ";
    p += round_label;
    p += "\nUse read_file, grep, list_dir, search_replace/write, run_terminal_command.\n";
    p += "Read ai/ai-context.md, CONTEXT.md, ai/repository-map.md known-debt, and any folder README you create.\n";
    p += "git status first. If already done or still unsafe, set done=true changed=false. That is success.\n";
    p += "If you extract, set done=false changed=true, list files, run npm run check:architecture, check:source, and the smallest tests: test:world and test:detailed-replay for state/settlement-state; test:world for sim-runner if you touch it.\n";
    p += "Add a short folder README if you create a new folder. Update ai/repository-map.md known-debt.\n";
    p
}

fn rev_prompt(seam, round_label) {
    let p = "";
    p += fences();
    p += "\nROLE: REVIEWER for seam: ";
    p += seam;
    p += "\nRound: ";
    p += round_label;
    p += "\nDo not trust the implementer. git diff. Read changed files.\n";
    p += "Approve only if: fences held, public exports still available from the original path, no schema change, no double-definition, tests passed or you re-ran them.\n";
    p += "If implementer set done=true with no changes, approve only if you agree it is already done or unsafe.\n";
    p += "off_track=true if they rewrote the forecast worker, timegraphs-pixi.js, serialize schema, or deleted still-imported settlement-exec.js.\n";
    p
}

fn run_pair(stream_name, seam, schema_impl, schema_rev) {
    log("Seam " + stream_name + ": " + seam);
    let impl = agent(impl_prompt(seam, "first"), #{
        label: "impl-" + stream_name,
        capability_mode: "all",
        agent_type: "general-purpose",
        output_schema: schema_impl,
    });
    let rev = agent(rev_prompt(seam, "first"), #{
        label: "review-" + stream_name,
        capability_mode: "read-only",
        agent_type: "general-purpose",
        output_schema: schema_rev,
    });
    if review_ok(rev) {
        log("Seam " + stream_name + ": first pair approved.");
        return #{
            stream: stream_name,
            approved: true,
            attempts: 1,
            changed: impl_changed(impl),
            summary: impl_summary(impl),
        };
    }
    log("Seam " + stream_name + ": spawning a FRESH pair.");
    let issues = issue_text(rev);
    let retry = impl_prompt(seam, "fresh-retry");
    retry += "\nPrior review failed:\n";
    retry += issues;
    retry += "\nRe-read git diff. Keep good files; fix or revert this seam only.\n";
    let impl2 = agent(retry, #{
        label: "impl-" + stream_name + "-retry",
        capability_mode: "all",
        agent_type: "general-purpose",
        output_schema: schema_impl,
    });
    let retry_rev = rev_prompt(seam, "fresh-retry");
    retry_rev += "\nPrior issues:\n";
    retry_rev += issues;
    let rev2 = agent(retry_rev, #{
        label: "review-" + stream_name + "-retry",
        capability_mode: "read-only",
        agent_type: "general-purpose",
        output_schema: schema_rev,
    });
    if review_ok(rev2) {
        return #{
            stream: stream_name,
            approved: true,
            attempts: 2,
            changed: impl_changed(impl2),
            summary: impl_summary(impl2),
        };
    }
    return #{
        stream: stream_name,
        approved: false,
        attempts: 2,
        changed: impl_changed(impl2),
        summary: issue_text(rev2),
    };
}

let seam1 = "Split src/model/state.js: move hub/board/pawn/env instance constructors, occupancy rebuilders, and related ensure* helpers into src/model/state/ (e.g. board-legacy.js / pawn-legacy.js). Keep createEmptyState, serializeGameState, deserializeGameState, validateState, load helpers, and season/RNG glue in state.js. Re-export moved names from state.js so existing imports keep working. Do not change v20 schema.";
let seam2 = "Split src/model/settlement-state.js: move leftover hub-core constructors, floodplain/hinterland tile food helpers, and stockpile accessors that are not current-vassal reads into a focused module under src/model/settlement-state/ or similar. Keep isSettlementPrototypeEnabled, structure/practice slot readers used by detailed UI, and vassal-history helpers. Re-export from settlement-state.js. Do not move getSettlementCurrentVassal (already in vassal-life-map).";
let seam3 = "src/controllers/sim-runner.js: extract save/load/slot helpers if they are separable inner functions with explicit args. Leave createSimRunner, tick, rebuildStateAtSecond wiring, and playback in the orchestrator. If save/load still closes over the whole runner, skip (done=true changed=false). Do not rewrite timeline/index.js.";

phase("Seam 1");
let r1 = run_pair("1", seam1, impl_schema, verdict_schema);

phase("Seam 2");
let r2 = run_pair("2", seam2, impl_schema, verdict_schema);

phase("Seam 3");
let r3 = run_pair("3", seam3, impl_schema, verdict_schema);

phase("Report");
let report = "";
report += "# Legacy-split loop — sub-orchestrator report\n\n";
report += "Parent must sanity-check. Agents did not commit.\n\n";
report += "## Seam 1 state.js\n";
report += r1.summary;
report += "\napproved=";
if r1.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r1.attempts.to_string() + "\n\n";
report += "## Seam 2 settlement-state.js\n";
report += r2.summary;
report += "\napproved=";
if r2.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r2.attempts.to_string() + "\n\n";
report += "## Seam 3 sim-runner.js\n";
report += r3.summary;
report += "\napproved=";
if r3.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r3.attempts.to_string() + "\n";
let path = write_scratch_file("legacy-split-report.md", report);
complete(#{
    report_path: path,
    report: report,
    all_approved: r1.approved && r2.approved && r3.approved,
    seam1: r1,
    seam2: r2,
    seam3: r3,
});
