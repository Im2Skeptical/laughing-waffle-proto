let meta = #{
    name: "leftover-surface-fence",
    description: "COMPLETED. Do not re-run. Historical orchestrator: leftover exec/defs fences, architecture allowlists, ActionKinds trim.",
    phases: [
        #{ title: "Seam 1", detail: "file-top fences, architecture allowlists, routing notes" },
        #{ title: "Seam 2", detail: "trim dead ActionKinds" },
        #{ title: "Report", detail: "hand back to parent for sanity check" },
    ],
    when_to_use: "Completed. Do not launch. Leftover exec/defs are fenced; remaining ActionKinds strings stay for sim-runner planner helpers.",
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
    p += "DO NOT edit: timegraph-forecast-worker.js, timegraph-forecast-worker-service.js, src/views/timegraphs-pixi.js, src/model/timegraph/controller-core.js, src/model/state.js serialize/deserialize.\n";
    p += "DO NOT delete settlement-exec.js. DO NOT unify vassal getters. DO NOT add Math.random.\n";
    p += "DO NOT change GameState schema numbers or save format. No migration shims.\n";
    p += "DO NOT start another timegraph overlay extract. DO NOT rewrite sim-runner tick/playback or planner closures.\n";
    p += "Model must not import views/controllers.\n";
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
    p += "Read ai/ai-context.md, CONTEXT.md, scripts/check-architecture.mjs, and the files you will edit BEFORE coding.\n";
    p += "git status first. If already done or still unsafe, set done=true changed=false. That is success.\n";
    p += "If you change files, set done=false changed=true, list files, run npm run check:architecture and npm run check:source. If you touch actions.js or sim-runner.js also run npm run test:world and npm run test:detailed-replay.\n";
    p += "Update ai/repository-map.md known-debt and the matching .grok/skills/ if ownership or do-not-extend lists changed.\n";
    p
}

fn rev_prompt(seam, round_label) {
    let p = "";
    p += fences();
    p += "\nROLE: REVIEWER for seam: ";
    p += seam;
    p += "\nRound: ";
    p += round_label;
    p += "\nDo not trust the implementer. git diff. Read changed files. Grep leftover imports and ActionKinds.\n";
    p += "Approve only if fences held, existing importers still allowed, no schema change, no deleted settlement-exec.js, tests/checks passed or you re-ran them.\n";
    p += "If implementer set done=true with no changes, approve only if you agree it is already done or unsafe.\n";
    p += "off_track=true if they rewrote the forecast worker, timegraphs-pixi.js, serialize schema, deleted still-imported settlement-exec.js, or started another extract loop.\n";
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

let seam1 = "";
seam1 += "FENCE leftover impostor files. Match settlement-exec.js file-top style.\n";
seam1 += "Add do-not-extend banners to:\n";
seam1 += "- src/model/settlement-vassal-exec.js (not Life Map; live rules in vassal-life-map.js)\n";
seam1 += "- src/model/settlement-order-exec.js\n";
seam1 += "- src/model/settlement-leadership.js\n";
seam1 += "- src/model/settlement-upgrades.js\n";
seam1 += "- src/defs/gamepieces/settlement-practice-defs.js (not Forage/Cultivate; live pieces in detailed-settlement-defs.js)\n";
seam1 += "- src/defs/gamepieces/hub-structure-defs.js (not Smokehouse/Granary)\n";
seam1 += "Extend scripts/check-architecture.mjs: reject NEW src/model/ imports (tests folder excluded, same as settlement-exec) of those leftover modules plus existing settlement-exec.js. Allowlist CURRENT importers only. Grep first. Known current model importers as of 84434c4 (verify, do not invent extras):\n";
seam1 += "settlement-exec.js <- src/model/commands/debug-commands.js\n";
seam1 += "hub-structure-defs.js <- debug-commands.js, settlement-upgrades.js, settlement-exec.js, src/model/state/board-legacy.js\n";
seam1 += "settlement-practice-defs.js <- debug-commands.js, settlement-exec.js, settlement-leadership.js, settlement-order-exec.js, settlement-vassal-exec.js, effects/ops/system/settlement-upgrade-ops.js, settlement-practice-ops.js\n";
seam1 += "settlement-vassal-exec.js <- settlement-exec.js, settlement-practice-ops.js, settlement-upgrade-ops.js\n";
seam1 += "settlement-order-exec.js <- debug-commands.js, settlement-upgrade-ops.js, settlement-practice-ops.js, settlement-vassal-exec.js, settlement-exec.js\n";
seam1 += "settlement-leadership.js <- settlement-order-exec.js, settlement-vassal-exec.js\n";
seam1 += "settlement-upgrades.js <- settlement-upgrade-ops.js, settlement-exec.js, board-legacy.js\n";
seam1 += "Leftover files importing each other MUST stay allowlisted. Do not fence views/controllers. Do not delete any leftover file.\n";
seam1 += "Update .grok/skills/change-settlement-sim/SKILL.md Do-not-extend list to include the leftover exec/defs. Add a short Do-not on .grok/skills/change-timegraph/SKILL.md: do not rewrite the forecast worker together with controller-core.js or timegraphs-pixi.js; forecast orchestration is src/controllers/settlement-forecast-controller.js; worker files stay their own. Update ai/repository-map.md known-debt: leftover defs/exec are non-extension points; architecture check rejects new model imports.\n";

let seam2 = "";
seam2 += "TRIM dead ActionKinds in src/model/actions.js. applyAction only handles live vassal/region/debug kinds; PLACE_PAWN, inventory suite, build designate, tile/hub tags, routing templates, ADJUST_FOLLOWER_COUNT, ADJUST_WORKER_COUNT, UNLOCK_SKILL_NODE are fake surface.\n";
seam2 += "KEEP every kind that applyAction handles, plus any ActionKinds.* still referenced (sim-runner uses DEBUG_SET_CAP and DEBUG_QUEUE_ENV_EVENT even if applyAction has no QUEUE case — keep the constant, do not add a new applyAction case).\n";
seam2 += "Grep each removed kind as ActionKinds.X AND as the string value before deleting. If a test or live dispatcher still uses it, KEEP it.\n";
seam2 += "DO NOT rewrite src/controllers/sim-runner.js planner helpers (isPlannerManagedAction, getPlannerActionSubjectKey, getActionItemIds) that still switch on placePawn/inventoryMove/buildDesignate strings. Those close over the runner. Leave them. Skip (done=true changed=false) rather than a sim-runner rewrite if the enum trim is blocked.\n";
seam2 += "Do not change GameState schema. Dead kinds hitting applyAction already return unsupportedAction.\n";

phase("Seam 1");
let r1 = run_pair("1", seam1, impl_schema, verdict_schema);

phase("Seam 2");
let r2 = run_pair("2", seam2, impl_schema, verdict_schema);

phase("Report");
let report = "";
report += "# Leftover-surface fence — sub-orchestrator report\n\n";
report += "Parent must sanity-check. Agents did not commit.\n\n";
report += "## Seam 1 fences / allowlists / routing\n";
report += r1.summary;
report += "\napproved=";
if r1.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r1.attempts.to_string() + "\n\n";
report += "## Seam 2 ActionKinds\n";
report += r2.summary;
report += "\napproved=";
if r2.approved { report += "true"; } else { report += "false"; }
report += " attempts=" + r2.attempts.to_string() + "\n";
let path = write_scratch_file("leftover-surface-fence-report.md", report);
complete(#{
    report_path: path,
    report: report,
    all_approved: r1.approved && r2.approved,
    seam1: r1,
    seam2: r2,
});
