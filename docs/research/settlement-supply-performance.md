# Settlement supply performance follow-up

Measured 2026-10-02 against `055b8eb`, the adjacent-and-connected supply build.

The new provider resolver rebuilt the complete polygon adjacency graph for
every stock query, including recipes with no inputs. A CPU profile put polygon
edge construction at the top of the stock-query workload. Authored adjacency is
now cached independently of live ownership, connections and settlement boards;
empty recipes return their empty plan immediately. Provider order and allocation
remain unchanged.

Browser profiling also found forecast polls repeatedly deserializing the same
frontier to merge persistent knowledge. The timeline now retains one validated
serialized boundary per timeline/revision/source and computes knowledge overlays
separately. New anchors retain full deserialization; mutable replay states remain
independent. Knowledge changes, anchor replacement and timeline edits invalidate
the relevant cached result.

The 750 ms worker watchdog mistook slow module loading and each chunk's boundary
validation for a failed worker under CPU throttling. Each request now has a
bounded 5 s first-result allowance; the normal 750 ms progress timeout resumes
after streaming begins. Explicit errors still fall back immediately, and edits
still terminate obsolete jobs.

## Node measurements

`node scripts/settlement-supply-performance-probe.mjs <055b8eb-checkout>` alternates
both implementations, discards warmup, compares complete outputs and asserts
that query/boundary costs fall by at least half. Medians on this machine:

| Workload | Supply build | Optimized |
| --- | ---: | ---: |
| 10,000 empty recipe checks | 338.8 ms | 0.8 ms |
| 10,000 remote-input recipe checks | 345.3 ms | 34.0 ms |
| 100 frontier reads with remembered knowledge | 1240.7 ms | 32.4 ms |
| Full 512-second long-lived projection | 457.4 ms | 413.8 ms |

Three 6400-second production projection comparisons also match all summaries,
anchors and final states. The action differential has eight passing scenarios
with no mismatches; its obsolete regional-install scenario remains explicitly
unsupported. Its Crisis fixture now empties Stock and selects an actually
dangerous incident, rather than assuming the first current option is fatal.

## Browser measurements and limits

Foreground Chromium on an RTX 3080, authored long-lived setup, 24 samples:
desktop steady-frame p95 decreased from 34.8 to 27.7 ms. Random restore plus
render p95 was essentially unchanged, 41.9 versus 42.1 ms. These exceed the
existing strict smoothness budgets; this work does not establish hitch-free play.
The normal-CPU mobile layout measured 27.8 ms steady-frame p95 and 47.8 ms
restore-plus-render p95 on the same desktop hardware, not a physical phone.

At 844 x 390 with 4x CPU throttling, the baseline worker was disabled and most
forecasting ran on the main thread. The final run kept the worker active (6528
worker-built seconds, only 32 initial seed seconds on the main thread). Frame
p95 fell from about 5.8 s to 0.58 s, but restores and rendering are still costly;
the final random-restore p95 was 756 ms. The runs reveal at different rates and
are diagnostic comparisons, not a physical-phone or large-world guarantee.

Use `PROBE_LONG_LIVED=1`, `PROBE_MOBILE=1`, `PROBE_CPU_RATE=4` with
`node scripts/timegraph-performance-probe.mjs <label>` to reproduce. Optional
`PROBE_PROFILE=1` writes a main-thread CPU profile to `artifacts/`; profiling
adds overhead and should not be used for final timing claims.

Validation: `npm run verify`, settlement/navigation/timegraph-alignment browser
probes, the stock/boundary performance probe and complete production/action
differentials. No ticks, phases, every-second summaries or loss checks were
skipped. RNG streams, game/save schemas and transfer icons are unchanged.
