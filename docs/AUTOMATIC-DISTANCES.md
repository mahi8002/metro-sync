# Automatic subway, driving and CO2e estimates

## Run locally

No npm installation or API key is needed. Node.js 18+ is required for the local
server and tests. The page still uses its existing CDN libraries and map tiles.

```
cd G:\gitclone\metro-sync
node scripts/serve.cjs
```

Open http://127.0.0.1:5500/ . An existing static server such as VS Code Live Server
also works when it serves the repository root, including `data/`, `distance.js`,
`distance-config.js`, `carbon.js`, and `achievements.js`.

**Keep the same browser, hostname and port as before to see existing history.**
`localhost` and `127.0.0.1`, different ports and browser profiles have separate
localStorage. Do not clear storage to install this update. If port 5500 is busy,
keep using your existing static server, or select another PORT for an isolated
test profile. Opening the HTML as a file:// URL cannot reliably fetch the JSON.

## Manual verification

1. Refresh the current page with Ctrl+F5. In Profile & Favorites, confirm existing
   trip counts, badges, unlock dates and manually estimated journeys are intact.
   Old journeys without distances remain unestimated; they are not fabricated
   or retroactively assigned today's route.
2. In Map & Routes, select Times Sq - 42 St to Atlantic Av - Barclays Ctr. Keep
   Distance calculation on Automatic. Do not enter any mileage. After loading,
   the supplied data currently gives a subway itinerary on line 2 or 3 around
   10.10 km. A real OSRM check returned driving 9.69 km and about 2.75 kg CO2e
   avoided. Road data may change, so these are examples, not hard-coded values.
3. Select an alternative route card. Its subway itinerary and track distance
   determine the comparison; driving distance is shared for the same endpoints.
   Different lines on the same tracks can legitimately have the same distance.
4. Click Complete Journey, then Cancel: no completed journey or estimate is added.
   Repeat and select Confirm arrival. Profile history should contain the two
   distances, automatic source and distance-v2 model. The original badge rules
   still apply. Refresh: the recorded estimate should remain unchanged.
5. Repeated completion of the same journey ID is prevented. Start Another Journey
   explicitly creates a separate journey; it does not count as completed until
   arrival is confirmed.
6. Change the destination to Penn Station. Subway distance is around 0.62 km and
   a fresh driving result is used. Quickly switch several endpoints: an older
   road response must never replace the current pair's result.
7. For failure testing, use an isolated test browser profile and block requests to
   router.project-osrm.org in browser developer tools, or temporarily configure
   an unreachable endpoint in distance-config.js and reload. The page must show
   Unavailable and Retry driving distance, not zero or a made-up straight line.
   After failure you can record a badge-only journey or choose Manual backup.
   Restore the configuration/request access after the test.
8. If the subway JSON cannot load, Retry subway data is available. A self-reported
   badge-only completion remains possible without inventing a route or mileage.
9. The comparison is fixed to one person driving a petrol car; there is no scenario selector. The page explains that this is a comparison, not a verified car trip avoided. Manual backup remains available with km/mile input and a required distance source, and retains distance-v1 snapshots.

Use a separate profile for synthetic test trips rather than deleting personal
records. Application data remains browser-local and shared across demo accounts;
this change does not introduce Firebase synchronization.

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
