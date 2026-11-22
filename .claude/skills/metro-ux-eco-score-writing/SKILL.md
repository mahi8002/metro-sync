---
name: metro-ux-eco-score-writing
description: Write or review Metro Sync's Eco score and carbon-savings wording (the 🌱 icon, Eco sheet, explanations, trip-saved message, profile stats) in the team's approved voice — concise, plain, considerate, with light New York humor — and check that Eco stays out of the way of navigation on mobile. Use when adding or changing Eco / carbon text or placement, or evaluating the Eco score experience.
---

# Metro Sync Eco score writing

Metro Sync's job, in order: **fast, accurate navigation** first, nearby suggestions second, gentle encouragement to ride the train (Eco score, badges) third. Wording must never slow down the first job.

## Who we write for

Every line must work for all three:

- **Regular riders**: see the same screens daily. Repeated text becomes noise, so keep anything shown on every search very short.
- **Tourists and visitors**: may not be native English speakers, may think in km/kg, and are sightseeing. No idioms they'd miss, and no jokes at their expense.
- **Occasional riders**: don't know our terms. Say what a number means before showing the number.

Don't assume riders own a car. Plenty of New Yorkers don't.

## Voice

1. **Fact first, joke second.** The rider gets the information even if they skip the humor.
2. **Short.** Aim for one line. Sentences under 15 words. Whole numbers ("about 6 lb", not "6.1 lb").
3. **Plain words.** "carbon", not "CO₂e" or "emissions". "a car ride", not "a solo petrol car". Technical terms only under "Technical details".
4. **Considerate New York humor.** Dry, warm, local. At most one joke per screen or layer, and none in errors, loading states, or anything riders read while navigating.
   - Good: "Don't own a car? Plenty of New Yorkers don't. Your ride still counts." · "The city thanks you. 🗽" · "Here's every ride where you let the train do the driving."
   - Avoid: idioms that need local knowledge ("parallel park", "parking hunt"), jokes aimed at a group ("sorry sightseers"), puns.
5. **Honest.** Estimates say "about". Never claim something was "avoided" or "prevented"; we compare, we don't prove.
6. **American English** ("gas", "kilometers"), units with a space ("6 lb").

## Eco score rules

- **Eco never changes route order.** Routes stay in travel-time order; Eco is information only. (`eco-score.js` `rankRoutes` sorts by savings, so the page re-sorts by planner order after scoring.)
- **Map & Routes shows only a small 🌱 ⓘ icon** under the route list, once routes have loaded. No Eco text on route cards. Its `aria-label` carries the full sentence for screen readers.
- **Layers, each optional and shorter than the next is long:**
  1. Icon (always) → 2. Sheet: two lines + "How we calculate this" → 3. Plain explanation (score meaning, car-free note) → 4. "Technical details and sources" (formulas, factors, OSRM/GTFS).
- **Compare with "a car ride"**, which covers your own car, a cab, or a rideshare. The math is one rider in a gas car.
- **Units follow the rider:** a saved choice wins; otherwise US-English browsers get lb/mi, everyone else kg/km. Stored data stays in kg/km.
- **"Eco score" is the per-trip number; "badges" are ride achievements.** Never call the score a badge.
- **One everyday comparison is OK** (e.g. phone charges), rounded, with its source in Technical details.

### Approved Eco wording

| Where | Wording |
| --- | --- |
| Icon `aria-label` | Eco score 58: About 6 lb less carbon than a car ride. Show details |
| Sheet line 1 | About 6 lb less carbon than a car ride · Eco score 58 |
| Sheet line 2 | That's like skipping 220 phone charges. / no saving: Every ride still counts toward your badges. |
| Sheet, loading / error | Working out your carbon savings… / We couldn't get the distances for this trip. (+ Try again button) |
| Plain explanation | We compare your subway ride with the same trip by car: one rider in a gas car, like a solo cab or rideshare. Don't own a car? Plenty of New Yorkers don't. Your ride still counts. |
| Score meaning | Higher score = more carbon saved. 0 means no saving, and 50 means about 4 lb (2 kg) saved. Longer routes don't add points, and no car is needed to earn it. |
| Trip saved | We'll save this trip: about 6 lb less carbon than a car ride (Eco score 58). The city thanks you. 🗽 |
| Profile stat | Carbon saved (est.) — About 6 lb |

## Mobile checklist (any UI change)

- Tap targets at least 44×44px (a small visual with a larger hit area is fine).
- Nothing new runs off the right edge at 390px; long lines wrap. The page already overflows at phone width, so cap new elements with `max-w-[calc(100vw-…)]` rather than trusting the parent.
- Overlays: bottom sheet on phones, sized to `window.visualViewport`; no body scroll lock (it re-lays-out the overflowing page and pans the view); focus moves in with `preventScroll`, Escape and backdrop close, focus returns to the trigger.
- Body text at least 12px; sheet text 14px.
- Explanations open as overlays, never pushing route cards down.

## How to review wording

1. Find every rider-facing string for the feature: `grep -n` in `Metro Sync_v2.1.1.html` plus any helper `.js` files.
2. For each string, check it against **Voice**, **Who we write for**, and (for Eco) **Eco score rules**. Count the words in what riders see without tapping.
3. Report a findings table: where (file:line), current wording, problem, severity (High = misleads or blocks; Medium = confusing or distracting; Low = polish), suggested wording.
4. Save reviews in `local-notes/`, which is excluded via `.git/info/exclude` and never committed. Add that line to your own `.git/info/exclude` if you don't have it.

## How to change and verify

- Change only the frontend (`Metro Sync_v2.1.1.html`) unless asked; don't change `carbon.js`, `eco-score.js`, `achievements.js`, or data for wording work.
- **Gotchas in this file:**
  - Strings inside single quotes: an apostrophe ("That's") ends the string and blanks the page. Use double quotes for that string.
  - The file mixes CRLF and LF line endings. Some editors rewrite them all; check `git diff --stat` and restore the original endings if the diff is far larger than your edit.
- Run the app: `node scripts/serve.cjs` → http://127.0.0.1:5500/
- Verify after **every** edit, however small:
  - `for t in tests/*.test.cjs; do node "$t"; done`
  - Load the page at 390px wide (Chrome DevTools device mode, or headless Chrome) and confirm there are no console errors, the text reads as intended, and the mobile checklist holds.
