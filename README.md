# NYC Transit Hub / Metro Sync

An interactive NYC subway dashboard with full-network route planning, live MTA
GTFS-Realtime updates, accessibility outages, multilingual UI, favorites,
journey achievements, and a Leaflet transit map.

## Quick Start

Prerequisites:

- Node.js 20 or newer
- Internet access for MTA feeds, browser libraries, Firebase demo modules, and
  map tiles

```powershell
cd .\nyc-transit-backend
npm install
node server.js
```

Open `http://localhost:5000`.

The server also works when `Metro Sync_v2.1.1.html` is opened through a local
development server such as VS Code Live Server, because the frontend points
local API requests to `http://localhost:5000`.

## Main Features

- Full-network route planning across 496 GTFS parent stations.
- Direction-specific platform resolution and GTFS transfer walking times.
- Fastest and alternative routes with time, transfer, line, and map data.
- Live MTA GTFS-Realtime trip updates for all subway feed groups.
- Static subway line and station GeoJSON derived from MTA GTFS.
- Live elevator and escalator outages.
- Fuzzy station search with keyboard navigation.
- Six interface languages with persistent user selection.
- Saved routes, profile preferences, high-contrast mode, and local assistant.
- Six journey achievements with persistent progress and unlock dates.
- Local registration/sign-in validation and remember-me sessions.

## Repository Layout

```text
.
├── .github/workflows/ci.yml
├── docs/
├── gtfs_supplemented/
├── nyc-transit-backend/
├── scripts/
├── Metro Sync_v2.1.1.html
├── PROJECT-OVERVIEW.md
├── achievements.js
└── full_graph.json
```

## Validation

```powershell
cd .\nyc-transit-backend
npm run check
```

This validates the frontend JSX and server syntax and runs the achievement
model tests.

## Documentation

- [Project overview](PROJECT-OVERVIEW.md)
- [Setup guide](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Product requirements](docs/PRD.md)

## Current Limitations

- Authentication is browser-local and is not connected to Firebase
  Authentication yet.
- Favorites, preferences, sessions, and achievements are browser-local.
- The application is not a complete PWA and cannot run fully offline.
- Route times use static GTFS edges and do not yet reroute around live delays.
