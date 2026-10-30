# Ordinary keyword integration evidence

The selected [Practice keyword rules](../../../practice-keywords.md) now work
without `gameConfig.keywordPrototype`. Normal New Game captures the card
attachments automatically; the eight cards are ordinary class shop entries.
This integration remains on `proto/keywords-classes`, separate from `main`.

The 844×390 PNGs in this folder show real game states using the ordinary-rules
viewing deck, with a real selected Scholar or Warrior and no experiment config.
The test asserts that absence before examining actual Stock output, linked
keyword definitions, separate passive lines and touch multiplier ledgers.
`browser-evidence.json` records the eight real outputs and browser errors.
The blocked Scholar case waits for real seasonal supply to recover and then
the next Food activation; the Warrior case shows zero Trophies before its real
Hunt and the resulting scaling afterwards.

Reproduce with `npm start`, then set `KEYWORD_RULES=regular` and run
`node scripts/bronze-keyword-cards-browser.mjs` (set `KEYWORD_PREVIEW_URL` if the
printed preview origin differs). The script closes its browsers. Stop the
preview server when finished. These supplies and starting decks are viewing
fixtures; ordinary New Game retains its regular opening and acquisitions.

The Warrior viewing fixture starts with zero Prowess and zero Prestige. The
initial generated Vassal's combined Prowess/Retinue defended indefinitely and
made the opening forecast hit its existing limit. Weakening only this authored
fixture lets the ordinary simulation reach extinction at second 14862. The
forecast, combat rules and normal player candidates are unchanged. The fixture
also records its established class so subsequent candidates match it.

Key captures: [Scholar board](scholar-board.png), [Warrior board](warrior-board.png),
[Synthesis definition](scholar-definition.png), [Trophies definition](warrior-definition.png),
[blocked supply](scholar-blocked.png), [restored supply](scholar-restored.png).
