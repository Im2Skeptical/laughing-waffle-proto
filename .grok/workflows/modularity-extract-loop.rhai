let meta = #{
    name: "modularity-extract-loop",
    description: "Loop implementer/reviewer pairs on safe modularity extracts until no safe seam remains or three seams are done. Does not rewrite the forecast worker or state.js. Does not commit.",
    phases: [
        #{ title: "Seam 1", detail: "graph-metrics dual path" },
        #{ title: "Seam 2", detail: "timegraph snapshot/scale extract" },
        #{ title: "Seam 3", detail: "timegraph boot-fade/replacement extract" },
        #{ title: "Report", detail: "hand back to parent for sanity check" },
    ],
    when_to_use: "After a successful timegraph/ui-root extract, keep thinning god files with fenced pairs.",
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

fn impl_done(r) {
    if r == () { return false; }
    if r.success != true { return false; }
    if r.output == () { return false; }
    if type_of(r.output) != "map" { return false; }
    r.output.done == true && r.output.changed != true
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
    p += "DO NOT edit: timegraph-forecast-worker.js, timegraph-forecast-worker-service.js, src/model/state.js, src/model/timegraph/controller-core.js, src/model/timeline/index.js.\n";
    p += "DO NOT unify getCurrentLifeMapVassal with getSettlementCurrentVassal (they disagree on purpose).\n";
    p += "DO NOT delete settlement-exec.js, hub defs, or the effects/ DSL; they are still imported.\n";
    p += "DO NOT rewrite createMetricGraphView algorithms; only lift state/helpers with explicit args.\n";
    p += "Behavior-preserving. No Math.random. No migration shims. Model must not import views.\n";
    p += "Already landed (do not redo): timegraphs/forecast-reveal-state.js, scrub-session.js, ui-root/settlement-graph-session.js.\n";
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
    p += "Read ai/ai-context.md, CONTEXT.md, ai/repository-map.md known-debt, and the folder README for any split you touch.\n";
    p += "git status first. If this seam is already done in the tree, set done=true changed=false and explain. Do not invent extra scope.\n";
    p += "If the seam cannot be extracted without hitting the fences, set done=true changed=false and say why. That is success.\n";
    p += "If you extract, set done=false changed=true, list files, run npm run check:architecture, check:source, and the smallest relevant test (test:presentation for views; test:world if graph-metrics; test:detailed-replay only if replay-sensitive).\n";
    p += "Update the matching README and repository-map known-debt if ownership moved.\n";
    p += "Return the output schema fields only in your final structured result.\n";
    p
}

fn rev_prompt(seam, round_label) {
    let p = "";
    p += fences();
    p += "\nROLE: REVIEWER for seam: ";
    p += seam;
    p += "\nRound: ";
    p += round_label;
    p += "\nDo not trust the implementer. git diff. Read the changed files.\n";
    p += "Approve only if: fences held, no double-update, new modules have no PIXI unless they are already view draw helpers, tests listed were run or you re-ran them, public APIs stable.\n";
    p += "If the implementer set done=true with no changes, approve only if you independently agree the seam is already done or unsafe.\n";
    p += "off_track=true if they rewrote worker/state/controller-core or unified vassal getters or deleted still-imported legacy tick files.\n";
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
            exhausted: impl_done(impl),
            summary: impl_summary(impl),
        };
    }
    log("Seam " + stream_name + ": spawning a FRESH pair.");
    let issues = issue_text(rev);
    let retry = impl_prompt(seam, "fresh-retry");
    retry += "\nPrior review failed or was off-track:\n";
    retry += issues;
    retry += "\nRe-read git diff. Keep good files; fix or revert the rest of this seam only.\n";
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
        log("Seam " + stream_name + ": fresh pair approved.");
        return #{
            stream: stream_name,
            approved: true,
            attempts: 2,
            changed: impl_changed(impl2),
            exhausted: impl_done(impl2),
            summary: impl_summary(impl2),
        };
    }
    log("Seam " + stream_name + ": still not approved.");
    return #{
        stream: stream_name,
        approved: false,
        attempts: 2,
        changed: impl_changed(impl2),
        exhausted: false,
        summary: issue_text(rev2),
    };
}

let seam1 = "graph-metrics.js dual path: leftover Grain/AP series if unused by UI groups; floodplain/hub tooltip copy on detailed food; hub vs prototype branches. Keep live food/population/chaos series behavior. Do not rewrite timegraphs-pixi.js in this seam.";
let seam2 = "timegraphs-pixi.js: extract snapshot cache and/or run-scoped scale high-water into src/views/timegraphs/ as explicit-arg helpers with no PIXI and no worker/state rewrite. Leave getPlotSnapshot I/O in the orchestrator if it still closes over the controller.";
let seam3 = "timegraphs-pixi.js: extract boot-fade and projection-replacement STATE (numbers/flags/pure updates) into src/views/timegraphs/ if they can take an explicit state object. PIXI draw overlays stay. Do not touch the forecast worker.";

phase("Seam 1");
let r1 = run_pair("1", seam1, impl_schema, verdict_schema);

phase("Seam 2");
let r2 = run_pair("2", seam2, impl_schema, verdict_schema);

phase("Seam 3");
let r3 = run_pair("3", seam3, impl_schema, verdict_schema);

phase("Report");
let report = "";
report += "# Modularity extract loop — sub-orchestrator report\n\n";
report += "Parent must sanity-check. Agents did not commit.\n\n";
report += "## Seam 1 graph-metrics\n";
report += r1.summary;
report += "\napproved=";
if r1.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r1.attempts.to_string() + "\n\n";
report += "## Seam 2 snapshot/scale\n";
report += r2.summary;
report += "\napproved=";
if r2.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r2.attempts.to_string() + "\n\n";
report += "## Seam 3 boot-fade/replacement\n";
report += r3.summary;
report += "\napproved=";
if r3.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r3.attempts.to_string() + "\n";
let path = write_scratch_file("extract-loop-report.md", report);
complete(#{
    report_path: path,
    report: report,
    all_approved: r1.approved && r2.approved && r3.approved,
    seam1: r1,
    seam2: r2,
    seam3: r3,
});
