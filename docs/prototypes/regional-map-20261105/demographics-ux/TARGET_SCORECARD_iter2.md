# Visual census: final scoped audit

Same rubric and observed jobs as the baseline. Scores: 4,4,4,5,4,4,4,5 = 34/40.
Matches the scoped peer benchmark of 34; no dimension more than one below the
peer median. This is a self-audit of this census surface, not a claim of overall
game parity with Civilization or Victoria.

Evidence: `artifacts/demographics-ux/iteration-phone.png`, desktop capture,
Warrior inspection phone capture, first-moon and neutral-town captures;
`iteration-checks.json` records browser completion, not a user-test result.

- Task clarity 4: residents, needs, allegiances and classes are immediately
  labelled. The control summary identifies whose Force is displayed.
- Hierarchy 4: residents and needs precede the comparison grid; detailed rates
  and mortality stay in inspection. Faith/mood need a tap rather than a glance.
- Layout 4: no raw-age overflow; useful comparison occupies the available space.
  A fixed landscape game stage limits larger text and portrait adaptation.
- Signal/noise 5: short labels, exact counts, age figures and meters replace
  prose. Empty class/faction cells retain comparison structure without raw dumps.
- Consistency 4: existing game palette, resource icons and pinned inspection.
  The Arms icon for Warrior class is inherited vocabulary, not unique class art.
- Feedback 4: food/housing pressures, zero counts, no complete moon and static
  unheld-town data have explicit states. No trend forecast on this screen.
- Expert efficiency 4: one grid answers whose specialists and how many; one tap
  gives age/eligibility. The new inspection cue improves discoverability.
- Trust 5: totals reconcile across ages, faction rows and class columns; the
  inspector distinguishes children from active Warriors and per-phase rates
  from annual rates. Legacy allegiance is labelled Unrecorded rather than guessed.

The second iteration makes inspectors wider in physical text size while keeping
their content width narrow enough for landscape phones. Main counts remain on
screen. Touch testing also found a real tab/badge overlap: the settlement tabs
move left, the survival strip remains three columns, and Demographics gets a
wider labelled target. Ordinary playtesting is still required; canvas controls do not provide
the full keyboard/screen-reader semantics of a DOM interface.

Stop: the scoped success bar is reached. No further layout or gameplay expansion.
