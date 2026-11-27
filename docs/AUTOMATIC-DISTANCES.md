# Automatic subway, driving and CO2e estimates

## Run locally after the main integration

Use Node.js 22+ (the same version family as CI). The main branch's backend now
provides station search, service-day routing, live updates and accessibility.
The frontend measures the exact platform hops of that backend-selected route
against the bundled GTFS track shapes. Missing matches remain unestimated;
an independently planned route or straight-line distance is never substituted.
Road distances still come from OSRM; the carbon factors and score formula are unchanged.

```powershell
cd G:\gitclone\metro-sync\nyc-transit-backend
npm ci
npm start
```

Open http://127.0.0.1:5000/ for the frontend and API on one origin.
The backend serves the Eco JavaScript and generated transit-distance JSON.

**To retain history from http://127.0.0.1:5500/, keep using that exact origin.**
In a second terminal, run `node scripts/serve.cjs` from the repository root,
or keep the existing VS Code Live Server. Leave the backend running on port 5000.
Browser storage differs by browser, hostname and port. Do not clear it.

Old records and carbon snapshots remain unchanged. Old short station IDs are
recognized when restoring station selections and favorites. A completed legacy
active journey is not restarted. New journeys use Start Journey, Complete Journey
and Cancel Journey from main. The estimate for the clicked route is captured at
Start Journey and saved on completion; later searches cannot change it. A journey
started before distances are available can still earn badges without an estimate.

## Updated smoke-test flow

1. Refresh the existing origin and inspect Profile & Favorites: previous history,
   unlock dates and saved carbon snapshots must remain intact.
2. Search Times Sq-42 St to Atlantic Av-Barclays Ctr. Open the small leaf/info
   button under the routes. Expect about 10.1 km by subway and a live road estimate.
   Values and service-day alternatives may change.
3. Choose an alternative and start that route. Complete it after arrival. The
   history entry must contain that route's snapshot, score, distances and sources.
4. Starting and cancelling must not add a completed trip. Completing twice must
   not duplicate the journey. A page reload must preserve completed estimates.
5. Change endpoints quickly. Previous route or road responses must not replace
   the current pair. Accessible-only and language controls from main still work.
6. An OSRM error or unmatched GTFS hop must leave the estimate unavailable; it
   must never fabricate mileage. Manual fallback is available with `?debug`.

## Automated checks

From the repository root:

```
node tests/achievements.test.cjs
node tests/carbon.test.cjs
node tests/distance.test.cjs
```

These need no network, packages or account. They cover the existing badge rules,
legacy/manual/automatic history round trips, units, signed emissions, all 90
directed pairs in the existing station selector, route alternatives and track
geometry, road response units and snapping, directional caches, cancellation,
timeouts and provider errors. The tests do not modify browser storage.

Optional real-provider smoke test (sends two public station coordinates):

```
node tests/live-distance-smoke.cjs
```

## Subway distance and itinerary source

The main frontend uses the backend planner (including service-day and accessibility
choices). `MetroDistance.measureRoute` matches every returned subway platform hop
and route ID to the bundled shape edges, sums train arcs and excludes walking.
If a hop cannot be matched, the route stays usable but has no automatic Eco estimate.
`MetroDistance.planRoutes` is retained for offline module checks, not used to replace
the backend-selected itinerary in the main page.

`data/transit-network.json` is a self-contained build artifact from the MTA's
official regular subway GTFS archive:
https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip . The feed is linked from
https://www.mta.info/developers . Its SHA-256 digest, feed_info and generation
timestamp are included in the artifact and the relevant version is saved in
automatic journey snapshots.

The builder joins trips, ordered stop_times, direction-specific platforms and
shapes. Each platform is projected onto its trip's track polyline, within 150 m.
Consecutive stops receive the along-shape arc length, not their straight-line
distance. Reverse or unmatched projections are excluded, not estimated. Train
edges retain route IDs, direction, shape IDs and projected geometry endpoints.
Station/platform walks and explicit GTFS transfers connect the network; walking
edges contribute no subway km. The selected card and its map polyline are built
from these same train edges, replacing the old fake Express Route fallback and
decorative midpoint path. The old full_graph.json is not used or deleted.

Routes optimize static running time with station-walk time and a three-minute
line-change allowance. They are normal-service suggestions, not departure-time
or live service predictions. Alternative suggestions exclude a line of the
first route; they do not enumerate all possible itineraries. There is no claim
of live accessibility. The original station selector and unrelated service-alert
demo UI have not been converted into a complete live trip-planning product.

To refresh the bundled data, download the official regular archive to
`data/gtfs_subway.zip` (ignored by Git) and run Python 3, standard library only:

```
python scripts/build-transit-network.py data/gtfs_subway.zip data/transit-network.json
node tests/distance.test.cjs
```

Review the generated artifact before committing it. Updating it does not rewrite
past journeys or their geometry/distance snapshots.

## Driving provider, caching and deployment

The default is the public OSRM demonstration endpoint at
https://router.project-osrm.org . API format:
https://project-osrm.org/docs/v26.6.1/http.html . The client requests the driving
route between the same GTFS station coordinates (longitude,latitude order),
converts metres to km and rejects errors, non-finite distances or road snaps
over 250 m. This estimates station-to-station travel, not home-door-to-work-door.
It requests only public station coordinates, not GPS or account data.

Timeout: 10 seconds per request. Requests are serialized with at least 1.1 seconds
between starts per page instance. Successful directed pairs are cached for up
to 24 hours in memory, capped at 100 entries; refreshing resets this cache.
Failures are not cached. Aborting requests or switching stations cannot apply a
stale result to the current UI. No straight-line or travel-time mileage fallback.

The public endpoint is for development, can be unavailable/rate-limited, and is
not a production SLA. Set `roadEndpoint` in `distance-config.js` to your own or
approved OSRM-compatible HTTPS service for deployment. It must allow your page's
origin via CORS. Never put secret keys in that browser file; a keyed provider
needs a server-side adapter. No paid subscription or account was created.

## CO2e and persistence

The formula and sourced MTA 2020 average factors (published 2023) are unchanged
from the distance-v1 model; see CO2-ESTIMATES.md. No automatic saving is based on
journey count, map screen length, duration or an invented detour multiplier.

Automatic distance-v2 snapshots add actual GTFS train segments/routeKey, parent
station IDs, track source/digest/build timestamp, road source/data version/fetch
time and snapping distances. Both route distances, coefficients and signed
result are copied independently on arrival confirmation. A negative comparison
is retained, not turned into a reward. Changing routes or factors later never
recalculates history. The summary includes all valid v1 and v2 snapshots, reports
coverage, and leaves unknown historical journeys untouched.

The existing localStorage key and version-1 achievement profile stay compatible.
The prior safety-backup key is retained. No reset, migration that deletes old
records, server database write, Git commit or push is performed by this update.
