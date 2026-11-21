# Distance-based CO2e comparisons

**Current default:** distances are now calculated automatically from MTA GTFS
track shapes and OSRM driving routes. See [AUTOMATIC-DISTANCES.md](AUTOMATIC-DISTANCES.md)
for setup and tests. The manual-input instructions below document the retained
distance-v1 backup mode. Old v1 estimates and unestimated historical records are
preserved alongside new automatic distance-v2 snapshots.

## What changed

The application no longer multiplies all completed journeys by 1.8 kg. Each new
journey may have an optional distance-based comparison with a solo petrol car:

```
avoided kg CO2e = driving distance km * car kg/passenger-km
               - subway distance km * subway kg/passenger-km
```

Factors come from MTA's 2023 Climate Sustainability Framework, slide 3, using
2020 data: https://www.mta.info/document/109966 . The chart gives 1.12 pounds
CO2e per passenger-mile for a single-occupancy petrol vehicle, and 0.11 for
subway. Code converts with 0.45359237 kg/lb and 1.609344 km/mile, without rounding
the stored factors. These are historical average operational comparisons, not
current line-specific measurements or a full life-cycle assessment. They do
not prove that a particular car journey was avoided.

## Distance input and limitations

This branch has no reliable road routing provider or selected-itinerary GTFS
distance output. Its map polyline is decorative and must not be used as route
length. This version therefore requires manual driving and subway distances
from an actual map/trip planner, plus a description of that source. No routing
service account, API key, subscription, or external request was added.

The input is optional and tied to origin, destination and selected itinerary.
Changing any of them resets the fields; switching units clears numeric fields
to avoid reinterpreting kilometres as miles. Values must be positive and no
greater than 2,000 km. Missing, invalid or unsupported-scenario inputs leave
CO2e unestimated without blocking journey completion or achievement progress.
Negative comparisons are retained: a long subway detour does not earn a
positive saving. The displayed total is a signed net comparison.

To automate this later, feed verified driving/subway distances and provenance
into `MetroCarbon.estimate`, and explicitly extend the distance-method metadata
for the chosen provider. Do not substitute a straight-line distance or infer
mileage from travel time.

## Persistence and future database fields

The existing `metro_sync_achievements_v1` key, version-1 model, trip IDs, badges,
unlock dates, active journey and favorites are preserved. The first successful
save also backs up the pre-upgrade progress under
`metro_sync_achievements_before_distance_v1` if it exists. No browser data is
cleared. The backup is a safety copy, not an automatically restored state.

On completion the trip receives an independent `carbon` snapshot containing:

- status and methodVersion (`distance-v1`);
- baselineMode (`solo-petrol-car`);
- drivingDistanceKm and transitDistanceKm;
- distanceMethod (`user-entered`) and distanceSource;
- carKgPerKm, subwayKgPerKm, factorSource, factorDataYear,
  factorPublicationYear;
- carEmissionsKgCO2e, transitEmissionsKgCO2e, estimatedSavingsKgCO2e.

Trip ID and completedAt remain on the parent trip. Unknown estimates store an
unavailable status/reason. History is not recalculated when current inputs or
factors change. Legacy trips with no snapshot stay intact and count toward all
existing achievements, but not the CO2e total. The UI shows estimated coverage
and the latest 20 records; all records remain stored. Favorites, language and
other settings are untouched. Data remains browser-local, not cloud-synced.

## How to check

1. Run the existing local static server from the repository root. Open
   `Metro Sync_v2.1.1.html` at the same scheme/host/port as before so the browser
   sees your existing storage. Keep `carbon.js` alongside `achievements.js`.
2. Open Profile & Favorites before recording a new trip. Existing trip counts,
   visited stations and unlocked badges should be unchanged. Old journeys show
   as unestimated; with no valid snapshots the total says Not estimated.
3. Go to Map & Routes and choose a different origin/destination. For a synthetic
   calculation check only, enter driving 10, subway 10, km, source "Test only".
   Preview should show 2.85 kg CO2e avoided (about 3.16 minus 0.31).
4. Complete Journey and confirm arrival. Profile coverage increases by one and
   history shows both distances, the source, model and estimate. Do not use
   synthetic distances for a real-world emissions claim.
5. Refresh: saved estimate and badge progress must remain. Completing the same
   journey again must not double-count it. Start Another Journey to record a
   separate journey with the same endpoints.
6. A new test journey with 1 mile driving and 1 mile subway previews 0.46 kg.
   Changing units clears distance numbers. Changing endpoints clears all inputs.
7. Leave either distance/source blank or choose the other-transport scenario:
   no estimate is available, but a confirmed journey still counts for badges.
8. With driving 1 km and subway 100 km the comparison is negative. No positive
   reward is invented. Clearing/changing current inputs must not alter earlier
   saved estimates. Source/method details appear in Profile & Favorites.

These checks record real local test journeys. Use a separate browser profile
for synthetic test data, rather than deleting existing personal history.

Automated checks (Node.js, from the repository root):

```
node tests/achievements.test.cjs
node tests/carbon.test.cjs
```

They cover the original badge model, units, missing/invalid values, signed
results, history compatibility, immutable snapshots and duplicate protection.
