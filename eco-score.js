(function (scope) {
  'use strict';
  // Product scoring scale, not an emissions factor or certified environmental rating.
  const MODEL_VERSION = 'eco-benefit-v1';
  const HALF_SCORE_KG = 2;
  function fromSnapshot(snapshot) {
    if (!scope.MetroCarbon.validSnapshot(snapshot)) return null;
    const benefit = Math.max(0, snapshot.estimatedSavingsKgCO2e);
    return { modelVersion: MODEL_VERSION, halfScoreKg: HALF_SCORE_KG,
      value: Math.round(1000 * benefit / (benefit + HALF_SCORE_KG)) / 10,
      estimatedSavingsKgCO2e: snapshot.estimatedSavingsKgCO2e };
  }
  function attach(snapshot) {
    const copy = scope.MetroCarbon.snapshot(snapshot);
    const score = fromSnapshot(copy);
    return score ? { ...copy, ecoScore: score } : copy;
  }
  function rankRoutes(routes, road) {
    // Every alternative uses the same driving baseline, never a reward for detours.
    const scored = routes.map(route => {
      const comparison = scope.MetroCarbon.estimateAutomatic(route, road);
      return { ...route, ecoScore: fromSnapshot(comparison), ecoRecommended: false };
    });
    if (!scored.length || scored.some(route => route.ecoScore === null)) return scored;
    scored.sort((a, b) => b.ecoScore.estimatedSavingsKgCO2e - a.ecoScore.estimatedSavingsKgCO2e || a.duration - b.duration || a.id - b.id);
    // A negative/net-zero comparison is never advertised as an Eco recommendation.
    if (scored[0].ecoScore.estimatedSavingsKgCO2e > 0) scored[0].ecoRecommended = true;
    return scored;
  }
  scope.MetroEcoScore = { MODEL_VERSION, HALF_SCORE_KG, fromSnapshot, attach, rankRoutes };
})(globalThis);
