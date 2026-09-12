let meta = #{
    name: "modularity-extract-followup",
    description: "COMPLETED on main (3353f95). Do not re-run. Historical orchestrator: time-bounds, action-second caches, scale-flash. Metric resolution was skipped (closes over the controller).",
    phases: [
        #{ title: "Seam 1", detail: "time-window animation state" },
        #{ title: "Seam 2", detail: "action caches and scale-flash" },
        #{ title: "Seam 3", detail: "metric/series resolution" },
        #{ title: "Report", detail: "hand back to parent for sanity check" },
    ],
    when_to_use: "Completed on main. Do not launch another timegraph overlay extract.",
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
    p += "DO NOT edit: timegraph-forecast-worker.js, timegraph-forecast-worker-service.js, src/model/state.js, src/model/timegraph/controller-core.js, src/model/timeline/index.js.\n";
    p += "DO NOT extract getPlotSnapshot, refreshPlotSnapshotForecastState, buildDynamicSnapshotParts, endScrub, applyPreviewThrottled, drawPlot, drawScrub, or key-cabinet PIXI construction. Those still close over the controller or PIXI.\n";
    p += "DO NOT unify vassal getters. DO NOT delete settlement-exec.js.\n";
    p += "Already landed, do not redo: forecast-reveal-state.js, scrub-session.js, plot-snapshot-cache.js, scale-high-water.js, boot-fade-state.js, projection-replacement-state.js, ui-root/settlement-graph-session.js, graph-metrics/legacy-metrics.js, graph-metrics/tooltips.js.\n";
    p += "Behavior-preserving. No Math.random. No migration shims.\n";
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
    p += "Read src/views/timegraphs/README.md remaining inner-function map before coding.\n";
    p += "git status first. If this seam is already done or still closes over PIXI/controller, set done=true changed=false. That is success. Do not invent extra scope.\n";
    p += "If you extract, set done=false changed=true, list files, run npm run check:architecture, check:source, and npm run test:presentation.\n";
    p += "Update timegraphs/README.md and ai/repository-map.md if ownership moved.\n";
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
    p += "Approve only if fences held, no double-update, new modules have no PIXI, tests passed or you re-ran them, public APIs stable.\n";
    p += "If implementer set done=true with no changes, approve only if you agree the seam is already done or still unsafe.\n";
    p += "off_track=true if they rewrote worker/state/controller-core or extracted getPlotSnapshot/endScrub/drawPlot.\n";
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
        log("Seam " + stream_name + ": fresh pair approved.");
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

let seam1 = "Extract time-window animation STATE from timegraphs-pixi.js (setTimeBounds / animateBoundToward / resetAnimatedTimeBounds numbers and lerp) into src/views/timegraphs/time-bounds-state.js. PIXI visibility, zoom, and projection-floor I/O stay in the orchestrator. Same pattern as boot-fade-state.js.";
let seam2 = "Extract action-second caches (getActionSecs / getMarkerActionSecs) and series scale-max flash state (triggerSeriesScaleMaxFlash numbers) into src/views/timegraphs/ with explicit args. No PIXI. Leave draw overlays in plot-draw.js.";
let seam3 = "Extract resolveMetric / getActiveSeries / getMetricLabel if they are pure GRAPH_METRICS lookups with explicit args. If they close over view/controller state, skip (done=true changed=false). Do not extract snapshot sampling or the frame loop.";

phase("Seam 1");
let r1 = run_pair("1", seam1, impl_schema, verdict_schema);

phase("Seam 2");
let r2 = run_pair("2", seam2, impl_schema, verdict_schema);

phase("Seam 3");
let r3 = run_pair("3", seam3, impl_schema, verdict_schema);

phase("Report");
let report = "";
report += "# Modularity extract follow-up — sub-orchestrator report\n\n";
report += "Parent must sanity-check. Agents did not commit.\n\n";
report += "## Seam 1 time-window animation\n";
report += r1.summary;
report += "\napproved=";
if r1.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r1.attempts.to_string() + "\n\n";
report += "## Seam 2 action caches / scale-flash\n";
report += r2.summary;
report += "\napproved=";
if r2.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r2.attempts.to_string() + "\n\n";
report += "## Seam 3 metric resolution\n";
report += r3.summary;
report += "\napproved=";
if r3.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r3.attempts.to_string() + "\n";
let path = write_scratch_file("extract-followup-report.md", report);
complete(#{
    report_path: path,
    report: report,
    all_approved: r1.approved && r2.approved && r3.approved,
    seam1: r1,
    seam2: r2,
    seam3: r3,
});
