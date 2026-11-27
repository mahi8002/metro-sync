# API Reference

All endpoints are mounted under `/api/v1`. JSON responses. Real example
responses are in the GCP hand-off notes (`api-samples/`).

## Health

`GET /health`

Returns service status, cache statistics, and route graph counts. The server
only starts listening after the route graph is loaded, so a 200 means ready.

## Stations

`GET /stations`

Returns all 496 GTFS parent stations with ID, name, coordinates, and served
lines. Cached by clients for 5 minutes.

## Route Planning

`GET /routes/plan?origin=127&destination=235&maxOptions=3`

| Parameter | Required | Description |
| --- | --- | --- |
| `origin` | yes | Parent-station ID (a full station name is also accepted). |
| `destination` | yes | Parent-station ID. |
| `maxOptions` | no | Integer 1 to 3 (default 3). |
| `accessible` | no | `true` or `1`: only board, leave and transfer at step-free stations (MTA ADA data). Stations with a current, non-redundant elevator outage are treated as not accessible. |
| `day` | no | `weekday`, `saturday` or `sunday`. Default: today in New York. Weekend graphs exclude lines that do not run on weekends (B, W, Z). |

Response fields:

- `origin`, `destination` (`id`, `name`), `serviceDay`, `accessibleOnly`,
  `accessibilityDataAvailable`, `alertsAvailable`, `outageDataAvailable`,
  `generatedAt`.
- `routes[]`: `id`, `title`, `duration` (minutes), `durationSeconds`,
  `transitMinutes`, `walkingMinutes`, `transfers`, `lines`, `isExpress`,
  `steps`, `polyline`, `isAda` (`true`, `false`, or `null` without ADA data) and
  `alerts` (`[{ line, items: [{ headline, kind }] }]`).
- `routes[].segments[]`: `kind` (`subway`, `walk` or `transfer`), `line`,
  `from`/`to` with names, `durationSeconds`. Subway segments add `stopIds` and
  `stops` (`id`, `name`, `lat`, `lon` for every stop on the ride). Walk and
  transfer segments add `path` and `distanceMeters` (straight-line distance).

When no route is returned, `routes` is empty and `reason` is one of
`origin_not_accessible`, `destination_not_accessible`, `no_accessible_route`,
`no_route` or `accessibility_data_unavailable`.

Service alerts come from the MTA alerts feed (English text only). Lines with a
delay alert get a small ranking penalty.

## Live Trains

`GET /trains/live`

Current MTA GTFS-Realtime trip updates. Cached for 15 seconds and refreshed in
the background. Each train has `tripId`, `routeId`, up to 8 `stopTimeUpdates`
(`stopId`, `arrivalTime`, `departureTime`) and `nextStop`, which also carries
`stopName`, `lat` and `lon`. The response includes `cached`, `stale`,
`ageSeconds` and `cachedAt`.

## Map Data

`GET /routes/shapes` (alias `GET /map`)

Line and station GeoJSON plus `lineStops`, the ordered stations of each line
(main trunk and branches). Served from `nyc-transit-backend/data/map.json`
(`npm run build:map`). Cached for one hour.

## Accessibility

`GET /accessibility`

Current MTA elevator and escalator outages (planned future outages are only
counted in `upcomingCount`). Each outage has `stationName`, `lines`,
`equipmentType`, `equipmentId`, `serving`, `reason`, `outageDate`,
`estimatedReturn`, `stopId` and `redundant`. Cached for 60 seconds.

## Error Responses

- `400`: missing route parameters.
- `404`: unknown station or endpoint.
- `500`: upstream or internal service error. When all MTA data is unavailable
  and nothing is cached, the live endpoints return `500`.
