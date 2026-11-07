import axios from 'axios';

// MTA Equipment Outages JSON Feed
const OUTAGES_URL = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2fnyct_ene.json';

// Fetch Elevator and Escalator Outages mapped by Station Name / ID
export async function fetchAccessibilityOutages() {
  try {
    const res = await axios.get(OUTAGES_URL, { timeout: 5000 });
    // Structure: [{ station: "14 St-Union Sq", equipment: "E101", equipmenttype: "EL", reason: "Maintenance" }]
    return res.data.map(outage => ({
      stationName: outage.station,
      equipmentType: outage.equipmenttype === 'EL' ? 'Elevator' : 'Escalator',
      equipmentId: outage.equipment,
      serving: outage.serving || 'Platform / Street access',
      reason: outage.reason || 'Under Repair',
      estimatedReturn: outage.estimatedreturntoservice || 'Unknown'
    }));
  } catch (err) {
    console.error('[Outages Warning] Could not fetch accessibility data:', err.message);
    return [];
  }
}