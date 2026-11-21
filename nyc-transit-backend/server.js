import 'dotenv/config';
import compression from 'compression';
import cors from 'cors';
import frontendLocator from './frontendFile.cjs';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCache } from './services/cacheService.js';
import { fetchAllSubwayLines, resolveStop } from './services/mtaMultiFeedService.js';
import { fetchAccessibilityOutages } from './services/mtaExtrasService.js';
import { fetchServiceAlerts } from './services/mtaAlertsService.js';
import { initStaticStops } from './services/staticMapService.js';
import { getMapData } from './services/mapService.js';
import {
  getRoutePlannerStats,
  getStationRouteLines,
  getStations,
  initRoutePlanner,
  planRoutes,
  serviceDayFor,
} from './services/routePlanningService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, '..');
const { findFrontendFile } = frontendLocator;
const PORT = Number(process.env.PORT) || 5000;

const app = express();
const cache = createCache();

const TRAINS_TTL_MS = 15_000;
const OUTAGES_TTL_MS = 60_000;
const TRAINS_MAX_STALE_MS = 5 * 60_000;
const OUTAGES_MAX_STALE_MS = 30 * 60_000;
const ALERTS_TTL_MS = 60_000;
const ALERTS_MAX_STALE_MS = 10 * 60_000;
const SERVICE_DAYS = ['weekday', 'saturday', 'sunday'];

app.disable('x-powered-by');
app.use(compression());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim())
      : true,
  })
);
app.use(express.json({ limit: '100kb' }));

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
      nextStop: { ...futureStops[0], ...resolveStop(futureStops[0].stopId) },
    });
  }

  return normalized;
};

const loadTrains = async () => {
  const trips = normalizeLiveTrips(await fetchAllSubwayLines());
  return {
    trainCount: trips.length,
    trains: trips,
    timestamp: new Date().toISOString(),
  };
};

const loadAlerts = () => fetchServiceAlerts();

const loadOutages = async () => {
  const { current, upcomingCount } = await fetchAccessibilityOutages();
  return {
    outages: current,
    upcomingCount,
    timestamp: new Date().toISOString(),
  };
};

app.get('/api/v1/health', async (_req, res, next) => {
  try {
    res.json({
      status: 'ok',
      service: 'nyc-transit-backend',
      timestamp: new Date().toISOString(),
      cache: cache.stats(),
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
    const result = await cache.get('trains:live', TRAINS_TTL_MS, loadTrains, {
      maxStaleMs: TRAINS_MAX_STALE_MS,
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      ...result.value,
      cached: result.cached,
      stale: result.stale,
      ageSeconds: result.ageSeconds,
      cachedAt: result.cachedAt,
    });
  } catch (error) {
    next(error);
  }
});

const sendMapData = async (_req, res, next) => {
  try {
    const data = await getMapData(getStationRouteLines);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(data);
  } catch (error) {
    next(error);
  }
};

app.get('/api/v1/routes/shapes', sendMapData);
app.get('/api/v1/map', sendMapData);

app.get('/api/v1/accessibility', async (_req, res, next) => {
  try {
    const result = await cache.get('accessibility:outages', OUTAGES_TTL_MS, loadOutages, {
      maxStaleMs: OUTAGES_MAX_STALE_MS,
    });
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
      ...result.value,
      outageCount: result.value.outages.length,
      cached: result.cached,
      stale: result.stale,
      ageSeconds: result.ageSeconds,
      cachedAt: result.cachedAt,
    });
  } catch (error) {
    next(error);
  }
});

// Optional inputs for route planning. Each fails soft: if a feed is down the
// route is still planned, without that information.
const getPlanningContext = async () => {
  const context = { blockedStationIds: new Set(), alertsByLine: null, outageDataAvailable: true };

  try {
    const outages = await cache.get('accessibility:outages', OUTAGES_TTL_MS, loadOutages, {
      maxStaleMs: OUTAGES_MAX_STALE_MS,
    });
    for (const outage of outages.value.outages) {
      // A non-redundant elevator outage removes step-free access to the station.
      if (outage.equipmentType === 'Elevator' && outage.stopId && !outage.redundant) {
        context.blockedStationIds.add(outage.stopId);
      }
    }
  } catch (error) {
    context.outageDataAvailable = false;
  }

  try {
    const alerts = await cache.get('alerts:service', ALERTS_TTL_MS, loadAlerts, {
      maxStaleMs: ALERTS_MAX_STALE_MS,
    });
    context.alertsByLine = alerts.value.alertsByLine;
  } catch (error) {
    context.alertsByLine = null;
  }
  return context;
};

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
    const accessible = ['true', '1'].includes(String(req.query.accessible));
    const dayType = SERVICE_DAYS.includes(req.query.day) ? req.query.day : serviceDayFor();

    const context = await getPlanningContext();
    const result = await planRoutes(origin, destination, maxOptions, {
      accessible,
      dayType,
      blockedStationIds: context.blockedStationIds,
      alertsByLine: context.alertsByLine,
    });
    if (result.error === 'unknown_station') {
      return res.status(404).json(result);
    }
    return res.json({ ...result, outageDataAvailable: context.outageDataAvailable });
  } catch (error) {
    return next(error);
  }
};

app.get('/api/v1/routes/plan', sendRoutePlan);
app.get('/api/v1/routes', sendRoutePlan);

app.get('/full_graph.json', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(path.join(PROJECT_DIR, 'full_graph.json'));
});

app.get('/achievements.js', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(PROJECT_DIR, 'achievements.js'));
});

app.get(['/', '/index.html'], (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(findFrontendFile());
  } catch (error) {
    next(error);
  }
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

  // Refresh live data in the background while clients are polling, so requests
  // are served from cache. Pauses after 2 minutes without requests.
  cache.keepFresh('trains:live', loadTrains, { intervalMs: TRAINS_TTL_MS - 1_000 });
  cache.keepFresh('accessibility:outages', loadOutages, { intervalMs: OUTAGES_TTL_MS - 5_000 });
  cache.keepFresh('alerts:service', loadAlerts, { intervalMs: ALERTS_TTL_MS - 5_000 });

  const server = app.listen(PORT, () => {
    console.log(`NYC Transit Hub backend listening on http://localhost:${PORT}`);
    console.log(
      `Route planner: ${routeStats.stationNodes} stations, ${routeStats.platformNodes} platform nodes, ${routeStats.routeAwareEdges} route-aware train edges`
    );
    console.log(`Frontend: ${findFrontendFile()}`);
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
