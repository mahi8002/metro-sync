// Optional integration check: sends public station coordinates to the road provider.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
for (const file of ['distance-config.js', 'distance.js', 'carbon.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/transit-network.json'), 'utf8'));
const route = MetroDistance.planRoutes(MetroDistance.prepare(data), '127', '235')[0];
MetroDistance.createRoadClient({ endpoint: MetroDistanceConfig.roadEndpoint }).get(data.stops['127'], data.stops['235']).then(road => {
  const result = MetroCarbon.estimateAutomatic(route, road);
  if (!MetroCarbon.validSnapshot(result)) throw new Error('Automatic snapshot invalid');
  console.log(JSON.stringify({ lines: route.lines, subwayKm: result.transitDistanceKm, drivingKm: result.drivingDistanceKm, avoidedKgCO2e: result.estimatedSavingsKgCO2e, roadProvider: result.roadSource }, null, 2));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
