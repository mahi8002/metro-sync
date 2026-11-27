import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { getStopDetails } from './staticMapService.js';

// Official MTA Subway GTFS-RT Endpoints
const MTA_FEEDS = {
  ACE: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  BDFM: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
  G: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
  JZ: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
  NQRW: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
  L: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l',
  NUMBERS:
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs', // 1, 2, 3, 4, 5, 6, 7
  SIR: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-si', // Staten Island Railway
};

// Convert protobuf int64 (Long) values to plain epoch numbers
const toEpoch = (t) =>
  t == null ? null : typeof t.toNumber === 'function' ? t.toNumber() : Number(t);

async function fetchSingleFeed(feedKey, url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 5000,
    });
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );

    // Only ids and times are kept here; station names/coordinates are
    // resolved by the caller (see resolveStop) to keep responses small.
    const tripUpdates = [];
    for (const entity of feed.entity) {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        tripUpdates.push({
          tripId: entity.tripUpdate.trip.tripId,
          routeId: entity.tripUpdate.trip.routeId,
          stopTimeUpdates: entity.tripUpdate.stopTimeUpdate.map((update) => ({
            stopId: update.stopId,
            arrivalTime: toEpoch(update.arrival ? update.arrival.time : null),
            departureTime: toEpoch(update.departure ? update.departure.time : null),
          })),
        });
      }
    }
    return tripUpdates;
  } catch (err) {
    // One broken feed should not crash the entire request
    console.error(`[MTA Feed Warning] Failed to fetch feed ${feedKey}: ${err.message}`);
    return null;
  }
}

// Name and coordinates for a stop id (used for the next stop only).
export const resolveStop = (stopId) => {
  const { stopName, lat, lon } = getStopDetails(stopId);
  return { stopName, lat, lon };
};

export async function fetchAllSubwayLines() {
  // Fetch all feeds concurrently; fetchSingleFeed returns null on failure.
  const results = await Promise.all(
    Object.entries(MTA_FEEDS).map(([key, url]) => fetchSingleFeed(key, url))
  );

  const succeeded = results.filter(Boolean);
  if (succeeded.length === 0) {
    // Let the cache layer serve stale data instead of caching an empty result.
    throw new Error('All MTA realtime feeds failed');
  }
  return succeeded.flat();
}
