import axios from 'axios';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

// MTA subway service alerts (GTFS-Realtime Alerts feed).
const ALERTS_URL =
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts';

const displayRouteId = (routeId) => {
  if (['FS', 'GS', 'H'].includes(routeId)) return 'S';
  if (routeId === 'SI') return 'SIR';
  return String(routeId || '').replace(/X$/, '');
};

const toNumber = (value) =>
  value == null ? null : typeof value.toNumber === 'function' ? value.toNumber() : Number(value);

const englishText = (translated) => {
  const items = translated?.translation || [];
  const plain = items.find((item) => item.language === 'en') || items[0];
  return plain?.text?.trim() || '';
};

// Returns the alerts that are active now, grouped by line:
// { alertsByLine: { "N": [{ headline, kind }] }, count }
// `kind` is "delay" when the headline mentions delays, otherwise "alert". The
// feed carries no machine-readable effect, so this is a text heuristic.
export async function fetchServiceAlerts() {
  const res = await axios.get(ALERTS_URL, { responseType: 'arraybuffer', timeout: 8000 });
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(res.data));
  const now = Math.floor(Date.now() / 1000);

  const alertsByLine = {};
  let count = 0;
  for (const entity of feed.entity) {
    const alert = entity.alert;
    if (!alert) continue;

    const periods = alert.activePeriod || [];
    const active =
      periods.length === 0 ||
      periods.some((period) => {
        const start = toNumber(period.start);
        const end = toNumber(period.end);
        return (!start || start <= now) && (!end || end >= now);
      });
    if (!active) continue;

    const headline = englishText(alert.headerText);
    if (!headline) continue;
    const kind = /delay/i.test(headline) ? 'delay' : 'alert';

    // Only alerts for a whole line (no specific stop) are attached to routes.
    const lines = new Set(
      (alert.informedEntity || [])
        .filter((informed) => informed.routeId && !informed.stopId)
        .map((informed) => displayRouteId(informed.routeId))
    );
    if (lines.size === 0) continue;

    count += 1;
    for (const line of lines) {
      if (!alertsByLine[line]) alertsByLine[line] = [];
      if (!alertsByLine[line].some((existing) => existing.headline === headline)) {
        alertsByLine[line].push({ headline, kind });
      }
    }
  }

  return { alertsByLine, count, timestamp: new Date().toISOString() };
}
