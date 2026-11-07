import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllSubwayLines } from './services/mtaMultiFeedService.js';
import { fetchAccessibilityOutages } from './services/mtaExtrasService.js';
import { initStaticStops } from './services/staticMapService.js';
import { getMapData } from './services/mapService.js';
import {
  getRoutePlannerStats,
  getStationRouteLines,
  getStations,
  initRoutePlanner,
  planRoutes,
} from './services/routePlanningService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..');
const FRONTEND_FILE = path.join(PROJECT_DIR, 'Metro Sync_v2.1.1.html');
const PORT = Number(process.env.PORT) || 5000;

const app = express();
const cache = new Map();

app.disable('x-powered-by');
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim())
      : true,
  })
);
app.use(express.json({ limit: '100kb' }));

const getCached = async (key, ttlMs, loader) => {
  const existing = cache.get(key);
  const now = Date.now();
  if (existing && existing.expiresAt > now) {
    return { value: existing.value, cached: true, cachedAt: existing.cachedAt };
  }

  const value = await loader();
  const cachedAt = new Date().toISOString();
  cache.set(key, {
    value,
    cachedAt,
    expiresAt: now + ttlMs,
  });
  return { value, cached: false, cachedAt };
};

const normalizeLiveTrips = (trips) => {
  const now = Math.floor(Date.now() / 1000);
  const normalized = [];

  for (const trip of trips) {
    const futureStops = (trip.stopTimeUpdates || [])
      .filter((stop) => {
        const time = stop.arrivalTime || stop.departureTime;
        return !time || time >= now - 120;
      })
      .sort((a, b) => {
        const aTime = a.arrivalTime || a.departureTime || Infinity;
        const bTime = b.arrivalTime || b.departureTime || Infinity;
        return aTime - bTime;
      });

    if (futureStops.length === 0) continue;
    normalized.push({
      ...trip,
      stopTimeUpdates: futureStops.slice(0, 8),
      nextStop: futureStops[0],
    });
  }

  return normalized;
};

app.get('/api/v1/health', async (_req, res, next) => {
  try {
    res.json({
      status: 'ok',
      service: 'nyc-transit-backend',
      timestamp: new Date().toISOString(),
      cache: {
        engine: 'memory',
        entries: cache.size,
        keys: [...cache.keys()],
      },
      routePlanner: await getRoutePlannerStats(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/stations', async (_req, res, next) => {
  try {
    const stations = await getStations();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      count: stations.length,
      stations,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/trains/live', async (_req, res, next) => {
  try {
    const result = await getCached('trains:live', 15_000, async () => {
      const trips = normalizeLiveTrips(await fetchAllSubwayLines());
      return {
        trainCount: trips.length,
        trains: trips,
        timestamp: new Date().toISOString(),
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      ...result.value,
      cached: result.cached,
      cachedAt: result.cachedAt,
    });
  } catch (error) {
    next(error);
  }
});

const sendMapData = async (_req, res, next) => {
  try {
    const stationLines = await getStationRouteLines();
    const result = await getCached('map:subway', 3_600_000, () =>
      getMapData(stationLines)
    );
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ ...result.value, cached: result.cached });
  } catch (error) {
    next(error);
  }
};

app.get('/api/v1/routes/shapes', sendMapData);
app.get('/api/v1/map', sendMapData);

app.get('/api/v1/accessibility', async (_req, res, next) => {
  try {
    const result = await getCached('accessibility:outages', 60_000, async () => ({
      outages: await fetchAccessibilityOutages(),
      timestamp: new Date().toISOString(),
    }));
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      ...result.value,
      outageCount: result.value.outages.length,
      cached: result.cached,
      cachedAt: result.cachedAt,
    });
  } catch (error) {
    next(error);
  }
});

const sendRoutePlan = async (req, res, next) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'Both origin and destination station IDs are required.',
      });
    }

    const maxOptions = Math.min(
      3,
      Math.max(1, Number(req.query.maxOptions) || 3)
    );
    const result = await planRoutes(origin, destination, maxOptions);
    if (result.error === 'unknown_station') {
      return res.status(404).json(result);
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

app.get('/api/v1/routes/plan', sendRoutePlan);
app.get('/api/v1/routes', sendRoutePlan);

app.get('/full_graph.json', (_req, res) => {
  res.sendFile(path.join(PROJECT_DIR, 'full_graph.json'));
});

app.get('/achievements.js', (_req, res) => {
  res.sendFile(path.join(PROJECT_DIR, 'achievements.js'));
});

app.get('/', (_req, res) => {
  res.sendFile(FRONTEND_FILE);
});

app.use('/api', (_req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'The requested API endpoint does not exist.',
  });
});

app.use((error, _req, res, _next) => {
  console.error('[API Error]', error);
  res.status(500).json({
    error: 'internal_server_error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'The server could not complete the request.'
        : error.message,
  });
});

const start = async () => {
  await Promise.all([initStaticStops(), initRoutePlanner()]);
  const routeStats = await getRoutePlannerStats();

  const server = app.listen(PORT, () => {
    console.log(`NYC Transit Hub backend listening on http://localhost:${PORT}`);
    console.log(
      `Route planner: ${routeStats.stationNodes} stations, ${routeStats.platformNodes} platform nodes, ${routeStats.routeAwareEdges} route-aware train edges`
    );
    console.log(`Frontend: ${FRONTEND_FILE}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
