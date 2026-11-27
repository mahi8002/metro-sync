# NYC Transit Hub Backend

Express API for the `Metro Sync_vX.Y.Z.html` frontend. The server serves the
frontend and all backend APIs from the same origin. It picks `index.html` if
present, otherwise the highest `Metro Sync_v*.html` in the project folder (set
`FRONTEND_FILE` to override), so a version bump needs no code change.

## Run

```powershell
cd .\nyc-transit-backend
node server.js
```

Open `http://localhost:5000` (set `PORT` in `.env` to change it).

The package's `npm start` script also runs the same entry point when Node and
npm are installed normally.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Service, cache and route-graph status |
| GET | `/api/v1/stations` | All 496 GTFS parent stations |
| GET | `/api/v1/routes/plan?origin=127&destination=235` | Full-network route planning. Optional: `accessible=true` (step-free only), `day=weekday\|saturday\|sunday` (default: today in New York), `maxOptions` |
| GET | `/api/v1/trains/live` | MTA GTFS-Realtime trip updates |
| GET | `/api/v1/routes/shapes` | Subway line and station GeoJSON |
| GET | `/api/v1/accessibility` | Current elevator and escalator outages (`upcomingCount` = planned future ones) |

Live train data is cached in memory for 15 seconds and accessibility data for
60 seconds. While clients keep polling, both are refreshed in the background
(paused after 2 minutes without requests), concurrent misses share one MTA
fetch, and if a refresh fails the last good data is served with `stale: true`
and `ageSeconds` (up to 5 min for trains, 30 min for outages; after that the API
returns an error). `/trains/live` returns only stop ids and times per stop;
`nextStop` additionally carries `stopName`, `lat` and `lon`. Responses are
gzip-compressed.

The map is served from `data/map.json`. Regenerate it after changing
`gtfs_supplemented/` or `full_graph.json`:

```powershell
npm run build:map
```

If the file is missing the server falls back to building it from GTFS on first
request (slow).

## Rebuild The Data Files

Generated files and how to refresh them:

| Command | Needs | Writes |
| --- | --- | --- |
| `npm run build:transit` | The full GTFS folder with `stop_times.txt` (default `../../gtfs_supplemented`, or pass a path). Not part of the runtime package. | `full_graph.json`, `full_graph_weekday.json`, `full_graph_saturday.json`, `full_graph_sunday.json`, `data/line_stops.json` |
| `npm run build:ada` | Internet (data.ny.gov "MTA Subway Stations") | `data/ada_stations.json` (step-free flags per station) |
| `npm run build:map` | The files above | `data/map.json` (line shapes, stations, station order per line) |

Run `build:transit` and `build:ada` first, then `build:map`. The graph keeps the
fastest observed travel time for each `from -> to -> route_id` edge. The
scheduled GTFS data in `gtfs_supplemented/` is valid until 2026-10-31; refresh
it from the MTA feed when a newer one is needed.

## Route Planning

The planner combines:

1. Parent station hubs such as `station:127`.
2. Direction-specific platform nodes such as `127N` and `127S`.
3. GTFS `trips.txt`/`stop_times.txt` directed edges with route IDs.
4. `transfers.txt` minimum walking times.
5. A boarding and line-change penalty so routes with needless transfers do not
   outrank a direct train.

The route API returns the fastest path plus up to two alternatives, including
total time, transit/walking minutes, transfer count, line sequence, the stops of
every ride, the straight-line walking distance of each transfer, and a
coordinate polyline for the map.

Extra inputs, each failing soft if its feed is down:

- **Service day**: weekday, Saturday and Sunday use separate graphs, so lines
  that do not run on weekends are not offered. Time of day (late nights) is not
  modelled.
- **Accessibility**: `isAda` tells whether every boarding and alighting platform
  is step-free (ADA data). With `accessible=true` the planner only boards,
  leaves and transfers at step-free stations. Stations with a current,
  non-redundant elevator outage are treated as not accessible.
- **Service alerts**: active MTA alerts for a line are attached to each route
  (`alerts`). Lines with delay alerts get a small ranking penalty. The alert
  feed has no machine-readable effect, so "delay" is detected from the
  English headline text.

## Validation

```powershell
cd .\nyc-transit-backend
npm run check
```

`check` parses the frontend JSX, syntax-checks the server and services, and
runs the achievements tests.
