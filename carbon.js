(function (scope) {
  'use strict';
  // MTA Climate Sustainability Framework (2023), slide 3; underlying data: 2020.
  // Operational average CO2e, pounds per passenger-mile; not a life-cycle inventory.
  const SOURCE = 'https://www.mta.info/document/109966';
  const FACTORS = Object.freeze({
    carKgPerKm: 1.12 * 0.45359237 / 1.609344,
    subwayKgPerKm: 0.11 * 0.45359237 / 1.609344,
    source: SOURCE, dataYear: 2020, publicationYear: 2023
  });
  const validDistance = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 2000;
  function parseDistance(value, unit) {
    if (!['km', 'mi'].includes(unit) || !['string', 'number'].includes(typeof value)) return null;
    if (typeof value === 'string' && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    const km = Number(value) * (unit === 'mi' ? 1.609344 : 1);
    return validDistance(km) ? km : null;
  }
  function estimate(input) {
    if (!input || input.baselineMode !== 'solo-petrol-car') return { status: 'unavailable', reason: 'Choose the solo petrol-car comparison scenario.' };
    const drivingDistanceKm = parseDistance(input.drivingDistance, input.unit);
    const transitDistanceKm = parseDistance(input.transitDistance, input.unit);
    if (drivingDistanceKm === null || transitDistanceKm === null) return { status: 'unavailable', reason: 'Enter both real route distances (greater than 0, at most 2,000 km).' };
    if (typeof input.distanceSource !== 'string' || !input.distanceSource.trim() || input.distanceSource.trim().length > 200) return { status: 'unavailable', reason: 'Add a distance source, such as a map route or trip planner (up to 200 characters).' };
    const carEmissionsKgCO2e = drivingDistanceKm * FACTORS.carKgPerKm;
    const transitEmissionsKgCO2e = transitDistanceKm * FACTORS.subwayKgPerKm;
    return {
      status: 'estimated', methodVersion: 'distance-v1', baselineMode: input.baselineMode,
      drivingDistanceKm, transitDistanceKm, distanceMethod: 'user-entered', distanceSource: input.distanceSource.trim(),
      carKgPerKm: FACTORS.carKgPerKm, subwayKgPerKm: FACTORS.subwayKgPerKm,
      factorSource: FACTORS.source, factorDataYear: FACTORS.dataYear, factorPublicationYear: FACTORS.publicationYear,
      carEmissionsKgCO2e, transitEmissionsKgCO2e,
      // Keep negative comparisons: a long transit detour must not earn a positive saving.
      estimatedSavingsKgCO2e: carEmissionsKgCO2e - transitEmissionsKgCO2e
    };
  }
  function validSnapshot(s) {
    if (!s || s.status !== 'estimated' || !['distance-v1', 'distance-v2'].includes(s.methodVersion) || s.baselineMode !== 'solo-petrol-car') return false;
    if (!validDistance(s.drivingDistanceKm) || !validDistance(s.transitDistanceKm)) return false;
    if (s.methodVersion === 'distance-v1' && s.distanceMethod !== 'user-entered') return false;
    if (s.methodVersion === 'distance-v2') {
      if (s.distanceMethod !== 'gtfs-osrm' || typeof s.routeKey !== 'string' || !s.routeKey || !s.originId || !s.destinationId || s.originId === s.destinationId) return false;
      if (typeof s.transitDataVersion !== 'string' || !s.transitDataVersion || typeof s.transitSource !== 'string' || typeof s.roadSource !== 'string' || !Number.isFinite(Date.parse(s.roadFetchedAt))) return false;
      if (!Array.isArray(s.trainSegments) || !s.trainSegments.length || s.trainSegments.some(e => !e.from || !e.to || !e.route || !e.shape || !validDistance(e.distanceKm))) return false;
      if (Math.abs(s.trainSegments.reduce((sum, e) => sum + e.distanceKm, 0) - s.transitDistanceKm) > 1e-8) return false;
    }
    if (typeof s.distanceSource !== 'string' || !s.distanceSource.trim() || s.distanceSource.length > 200 || typeof s.factorSource !== 'string') return false;
    if (![s.carKgPerKm, s.subwayKgPerKm].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 10)) return false;
    if (![s.factorDataYear, s.factorPublicationYear].every(Number.isInteger)) return false;
    const car = s.drivingDistanceKm * s.carKgPerKm, transit = s.transitDistanceKm * s.subwayKgPerKm;
    return [[s.carEmissionsKgCO2e, car], [s.transitEmissionsKgCO2e, transit], [s.estimatedSavingsKgCO2e, car - transit]]
      .every(([actual, expected]) => typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8);
  }
  function estimateAutomatic(route, road, baselineMode = 'solo-petrol-car') {
    if (!route || !road) return { status: 'unavailable', reason: 'Both subway and driving distances are required.' };
    const result = estimate({ drivingDistance: road.drivingDistanceKm, transitDistance: route.transitDistanceKm, unit: 'km', baselineMode, distanceSource: 'MTA GTFS track shapes + OSRM road routing' });
    if (result.status !== 'estimated') return result;
    const automatic = { ...result, methodVersion: 'distance-v2', distanceMethod: 'gtfs-osrm',
      originId: route.originId, destinationId: route.destinationId, routeKey: route.routeKey,
      trainSegments: route.trainSegments, transitSource: route.transitSource,
      transitDataVersion: route.transitDataVersion, transitGeneratedAt: route.transitGeneratedAt,
      roadSource: road.roadSource, roadDataVersion: road.roadDataVersion, roadFetchedAt: road.fetchedAt,
      roadSnappingMetres: road.snappingMetres };
    return validSnapshot(automatic) ? automatic : { status: 'unavailable', reason: 'Automatic distance provenance is incomplete.' };
  }
  function snapshot(s) {
    return validSnapshot(s) ? JSON.parse(JSON.stringify(s)) : { status: 'unavailable', reason: s?.status === 'unavailable' && typeof s.reason === 'string' ? s.reason.slice(0, 300) : 'No valid distance estimate was recorded.' };
  }
  function summarize(trips) {
    const estimated = trips.filter(t => validSnapshot(t.carbon));
    return { estimatedJourneys: estimated.length, unestimatedJourneys: trips.length - estimated.length,
      savingsKgCO2e: estimated.reduce((total, trip) => total + trip.carbon.estimatedSavingsKgCO2e, 0) };
  }
  scope.MetroCarbon = { FACTORS, parseDistance, estimate, estimateAutomatic, validSnapshot, snapshot, summarize };
})(globalThis);
