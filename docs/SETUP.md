# Local Setup

## Requirements

- Node.js 22 or newer
- npm
- Internet access for live MTA data and external map/browser libraries

## Install and Start

```powershell
cd .\nyc-transit-backend
npm install
node server.js
```

Open `http://localhost:5000`.

## Configuration

The backend runs on port `5000` without an environment file. To override local
settings:

```powershell
Copy-Item ..\.env.example .env
```

Supported variables:

- `PORT`: Express listening port.
- `CORS_ORIGIN`: optional comma-separated list of allowed origins.

Do not commit `.env`.

## Data

Runtime route planning uses:

- `full_graph.json`
- `gtfs_supplemented/stops.txt`
- `gtfs_supplemented/transfers.txt`
- `gtfs_supplemented/routes.txt`
- `gtfs_supplemented/trips.txt`
- `gtfs_supplemented/shapes.txt`

To download a fresh full GTFS archive:

```powershell
node .\scripts\fetch_gtfs.mjs
```

To rebuild all generated data (route graphs for weekday, Saturday and Sunday,
station order per line, step-free station data, map data) see
`nyc-transit-backend/README.md` (`npm run build:transit`, `build:ada`,
`build:map`). The older single-graph script still works:

```powershell
node .\scripts\build_graph.js
```

## Testing

```powershell
cd .\nyc-transit-backend
npm run check
```

