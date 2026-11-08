# Visual census: first audit

Same rubric and observed jobs as the baseline. Scores: 4,4,4,5,4,3,3,4 = 31/40.

Phone/desktop captures: `artifacts/demographics-ux/iteration-*.png`.
The first inspection capture was superseded by the second iteration.

- Strong improvement: total/age hierarchy, visible housing/food coverage, and
  allegiance-by-class counts replace the raw text dump.
- Main remaining gap: the first inspector used the default small text at twice
  scale. On an 844×390 phone, its body was still too small to read comfortably.
- Counts were directly inspectable, but the resting panel did not advertise it.
- The probe's simulated fullscreen and changing build-badge state initially
  obscured tab input. Correct the harness prerequisites before judging the panel.

Next: larger/narrower census inspectors, explicit inspection cue, repeat real
touch checks, and inspect missing-history and unheld-town states.
