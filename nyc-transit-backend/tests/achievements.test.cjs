const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const achievementsPath = path.resolve(__dirname, '..', '..', 'achievements.js');
vm.runInThisContext(fs.readFileSync(achievementsPath, 'utf8'));

const Achievements = globalThis.MetroAchievements;
const now = '2026-11-07T12:00:00.000Z';
let progress = Achievements.empty();

progress = Achievements.start(progress, '127', '235', 'trip-1');
progress = Achievements.complete(progress, now);
assert.equal(progress.trips.length, 1);
assert.equal(progress.active, null);
assert.equal(progress.unlocked['first-trip'], now);
assert.equal(Achievements.stats(progress).stations, 2);

progress = Achievements.complete(progress, now);
assert.equal(progress.trips.length, 1);

for (let index = 2; index <= 20; index += 1) {
  progress = Achievements.complete(
    Achievements.start(progress, '127', `station-${index}`, `trip-${index}`),
    now
  );
}

assert.equal(Achievements.stats(progress).rides, 20);
assert.ok(progress.unlocked['five-trips']);
assert.ok(progress.unlocked['twenty-trips']);
assert.ok(progress.unlocked['five-stations']);
assert.ok(progress.unlocked['ten-stations']);

progress = Achievements.bookmark(progress, now);
assert.ok(progress.unlocked['first-favorite']);

const invalidSameStation = Achievements.start(progress, '127', '127', 'invalid');
assert.equal(invalidSameStation.active, null);

const normalized = Achievements.normalize(
  JSON.parse(JSON.stringify(progress))
);
assert.equal(normalized.trips.length, 20);
assert.equal(Achievements.cancel(normalized).active, null);

console.log('PASS: achievements persistence model, unique stations, duplicate protection, bookmark unlock');
