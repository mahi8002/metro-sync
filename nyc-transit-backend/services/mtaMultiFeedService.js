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

    const tripUpdates = [];
    for (const entity of feed.entity) {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        tripUpdates.push({
          tripId: entity.tripUpdate.trip.tripId,
          routeId: entity.tripUpdate.trip.routeId,
          stopTimeUpdates: entity.tripUpdate.stopTimeUpdate.map((update) => {
            const stopInfo = getStopDetails(update.stopId);
            return {
              stopId: update.stopId,
              stopName: stopInfo.stopName,
              lat: stopInfo.lat,
              lon: stopInfo.lon,
              arrivalTime: toEpoch(update.arrival ? update.arrival.time : null),
              departureTime: toEpoch(
                update.departure ? update.departure.time : null
              ),
            };
          }),
        });
      }
    }
    return tripUpdates;
  } catch (err) {
    // One broken feed should not crash the entire request
    console.error(`[MTA Feed Warning] Failed to fetch feed ${feedKey}: ${err.message}`);
    return [];
  }
}

export async function fetchAllSubwayLines() {
  // Fetch all 8 feeds concurrently
  const feedPromises = Object.entries(MTA_FEEDS).map(([key, url]) =>
    fetchSingleFeed(key, url)
  );
  const results = await Promise.allSettled(feedPromises);

  // Flatten arrays from all successful feeds
  const allTrips = results
    .filter((res) => res.status === 'fulfilled')
    .flatMap((res) => res.value);

  return allTrips;
}
