# Eco recommendation score

The feature interprets "the further the user travels, the better the
recommendation" as stronger subway recommendations when the estimated avoided
emissions versus a solo petrol car are larger. It is not cumulative mileage
rewards, and does not reward taking an unnecessarily long subway route.

## Rule

```
benefitKg = max(0, estimated car emissions - estimated subway emissions)
Eco score = round(100 * benefitKg / (benefitKg + 2), 1)
```

The output is a bounded 0–100 product score, model `eco-benefit-v1`. The 2 kg
half-score scale is a design choice (2 kg gives 50 points), not a scientific
emissions coefficient or certified rating. Under comparable conditions, longer
trips avoid more petrol-car emissions and score higher. A detour with the same
driving baseline consumes more transit energy and scores lower. Non-positive
comparisons score zero; missing distance data is unavailable, never a zero score.

Automatic route cards are ranked using the unrounded estimated avoided CO2e
across available candidate routes with the same station pair and driving result.
Ties prefer shorter travel time, then original route ID. Only the top positive
candidate receives an Eco recommendation badge. This compares available static
suggestions, not every possible itinerary or real-time service. User selection
is retained when the recommendation arrives, rather than silently switching it.

In manual backup mode, only the entered itinerary has a score. Incomparable
alternatives are not ranked using that manually entered mileage.

## Records

On arrival confirmation, the existing carbon snapshot receives an additional
`ecoScore` object: modelVersion, halfScoreKg, value and estimatedSavingsKgCO2e.
No original achievement rules, trip IDs or historical estimates are changed.
Existing valid estimates may display a score derived from their saved values,
clearly identified as derived; no such score is written back to historical
records. Trips without carbon estimates remain unscored.

## Test

```
node tests/eco-score.test.cjs
node tests/achievements.test.cjs
node tests/carbon.test.cjs
node tests/distance.test.cjs
```

In the browser, refresh at the same origin as your existing history. Choose a
short and a substantially longer station pair, wait for both distances, and
compare Eco scores. Typical Times Sq → Penn scores much lower than Times Sq →
Atlantic Av under the same baseline. Inspect the Eco recommendation badge and
remember different train lines along identical tracks can tie. Complete and
confirm a journey; Profile history must retain its saved score after reload.
Old journeys, counts and badges must remain. A provider failure shows score
unavailable. No score is added by simply browsing routes or cancelling arrival.

## Compact rider interface

The route page shows a leaf badge and score instead of a large explanation card. Tap or keyboard-activate the badge for a short, friendly explanation. Calculation & sources is a separate second disclosure containing the unchanged formulas, sources, limitations, distances and manual backup. Reopening the badge starts with the short explanation again. Route cards and saved-trip scores use the same compact badge. Missing data displays a dash rather than zero. Screen-reader labels include the score out of 100. This is a presentation change; scoring, CO2e calculations and stored records are unchanged.
