# API Reference

All endpoints are mounted under `/api/v1`.

## Health

`GET /health`

Returns service status, cache statistics, and route graph counts.

## Stations

`GET /stations`

Returns all 496 GTFS parent stations with ID, name, coordinates, and served lines.

## Route Planning

`GET /routes/plan?origin=127&destination=235&maxOptions=3`

- `origin`: required parent-station ID.
- `destination`: required parent-station ID.
- `maxOptions`: optional integer from 1 to 3.

Returns route options with line sequences, transfer counts, durations, steps,
segments, and map polylines.

## Live Trains

`GET /trains/live`

Returns current MTA GTFS-Realtime trip updates and next-stop information.
Cached for 15 seconds.

## Map Data

`GET /routes/shapes`

Returns line and station GeoJSON generated from static GTFS. Cached for one hour.

`GET /map` is an alias.

## Accessibility

`GET /accessibility`

Returns current MTA elevator and escalator outages. Cached for 60 seconds.

## Error Responses

- `400`: missing route parameters.
- `404`: unknown station or endpoint.
- `500`: upstream or internal service error.

