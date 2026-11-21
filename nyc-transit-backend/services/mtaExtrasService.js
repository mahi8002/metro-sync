import axios from 'axios';

// MTA Equipment feeds (elevators/escalators)
const MTA_BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds';
const OUTAGES_URL = `${MTA_BASE}/nyct%2Fnyct_ene.json`;
const EQUIPMENT_URL = `${MTA_BASE}/nyct%2Fnyct_ene_equipments.json`;
const EQUIPMENT_TTL_MS = 6 * 60 * 60 * 1000;

let equipmentCache = null; // { map: Map(equipmentId -> record), loadedAt }

// Equipment list: maps an equipment id (e.g. EL124) to the GTFS station it
// serves and whether another elevator gives the same access (redundant).
async function getEquipmentIndex() {
  if (equipmentCache && Date.now() - equipmentCache.loadedAt < EQUIPMENT_TTL_MS) {
    return equipmentCache.map;
  }
  try {
    const res = await axios.get(EQUIPMENT_URL, { timeout: 8000 });
    if (!Array.isArray(res.data)) throw new Error('Unexpected equipment feed format');
    const map = new Map(res.data.map((item) => [item.equipmentno, item]));
    equipmentCache = { map, loadedAt: Date.now() };
    return map;
  } catch (err) {
    console.warn('[Equipment Warning] Could not fetch equipment list:', err.message);
    return equipmentCache?.map || new Map();
  }
}

// Current and upcoming elevator/escalator outages.
// Errors propagate on purpose: an empty list would be indistinguishable from
// "no outages". The cache layer serves stale data or the API returns an error.
export async function fetchAccessibilityOutages() {
  const [res, equipment] = await Promise.all([
    axios.get(OUTAGES_URL, { timeout: 5000 }),
    getEquipmentIndex(),
  ]);
  if (!Array.isArray(res.data)) {
    throw new Error('Unexpected accessibility feed format');
  }

  const all = res.data.map((outage) => {
    const info = equipment.get(outage.equipment);
    return {
      stationName: outage.station,
      lines: outage.trainno || '',
      equipmentType: outage.equipmenttype === 'EL' ? 'Elevator' : 'Escalator',
      equipmentId: outage.equipment,
      serving: outage.serving || 'Platform / Street access',
      reason: outage.reason || 'Under Repair',
      outageDate: outage.outagedate || null,
      estimatedReturn: outage.estimatedreturntoservice || 'Unknown',
      isUpcoming: outage.isupcomingoutage === 'Y',
      // Used by accessible route planning.
      stopId: info?.elevatorsgtfsstopid || null,
      redundant: Number(info?.redundant) === 1,
    };
  });

  return {
    current: all.filter((outage) => !outage.isUpcoming),
    upcomingCount: all.filter((outage) => outage.isUpcoming).length,
  };
}
