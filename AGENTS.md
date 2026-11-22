# Notes for AI coding agents

## Eco score and carbon wording

Before adding or changing any Eco score or carbon-savings text or placement (the 🌱 icon, Eco sheet, explanations, trip-saved message, profile stats), read and follow [docs/ECO-SCORE-WRITING.md](docs/ECO-SCORE-WRITING.md). It covers the approved voice, placement rules, approved wording, a mobile checklist, and how to verify changes.

Key rules:

- Eco never changes route order; route cards stay in travel-time order.
- On Map & Routes, Eco is only a small 🌱 ⓘ icon under the routes; details live in the sheet.
- Compare with "a car ride", not "driving"; many riders don't own a car.
- Keep wording concise and plain. Light, considerate New York humor only in optional explanations.

## Working on `Metro Sync_v2.1.1.html`

- An apostrophe inside a single-quoted JS string ends the string and blanks the page. Use double quotes for that string.
- The file mixes CRLF and LF line endings. Preserve them so diffs show only real edits.
- Run `node scripts/serve.cjs` (http://127.0.0.1:5500/) and `for t in tests/*.test.cjs; do node "$t"; done` after every change.
