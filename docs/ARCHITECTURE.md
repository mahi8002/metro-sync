# Architecture

## Components

1. `Metro Sync_v2.1.1.html`
   - Single-page React application loaded in the browser.
   - Uses React, Tailwind, Babel, Leaflet, and Lucide from CDNs.
   - Renders route controls, live data, profile, favorites, language, and
     achievements.

2. `nyc-transit-backend/server.js`
   - Express application and same-origin frontend host.
   - Implements in-memory response caching.
   - Starts the static stop index and route planner before listening.

3. Backend services
   - `routePlanningService.js`: parent stations, platforms, transfers, Dijkstra
     routing, and alternative route generation.
   - `mapService.js`: GTFS shapes and station GeoJSON.
   - `mtaMultiFeedService.js`: eight MTA subway GTFS-Realtime feeds.
   - `mtaExtrasService.js`: MTA elevator and escalator outages.
   - `staticMapService.js`: realtime stop ID to station metadata mapping.

4. Data
   - `full_graph.json`: route-aware directed platform graph.
   - `gtfs_supplemented/`: stops, transfers, routes, trips, and shapes.

5. Browser persistence
   - Language, preferences, session, favorites, and achievements currently use
     `localStorage`.

## Data Flow

```text
Browser
  ├── static HTML/achievements.js
  └── /api/v1/*
         │
         ▼
   Express backend
     ├── local GTFS + graph
     ├── MTA real-time proxy
     └── in-memory cache
         │
         ▼
     MTA open-data endpoints
```

## Planned Production Architecture

- Firebase Authentication for real accounts.
- Firestore for account-scoped favorites, preferences, and achievements.
- Bundled frontend assets instead of CDN and in-browser Babel.
- Service Worker and IndexedDB for offline-first behavior.
- Deploy the Express API and frontend on a Node-capable host such as Render,
  Railway, or Azure.

