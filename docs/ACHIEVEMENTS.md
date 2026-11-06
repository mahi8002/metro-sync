# Local achievements MVP

Open Metro Sync_v2.1.1.html through a local static HTTP server (keep achievements.js beside it). The page still requires its existing CDN dependencies.

Six badges: first / 5 / 20 completed journeys, 5 / 10 unique endpoint stations, and first explicitly bookmarked route. Demo favorites are not counted automatically. Line achievements are deferred until routing supplies trustworthy line data.

Complete Journey asks the rider to confirm arrival. A journey ID can be recorded once, including after reload. Start Another Journey explicitly creates another record for the same endpoints. Changing endpoints creates a new journey. Records are self-reported, not GPS-verified.

Profile & Favorites shows badge progress and unlock dates. Unlock notifications can be dismissed. CO2 is labeled as an illustrative estimate; synthetic starting ride counts were removed.

Storage: metro_sync_achievements_v1 stores trips, unlocks, and the active journey. Favorites use nyc_transit_saved_routes. Storage is browser-local and shared across demo accounts, not Firebase-backed. Storage failures display a warning. Clearing browser data removes progress.

Validation: node tests/achievements.test.cjs
Manual smoke check: complete a journey, dismiss its unlock, open Profile & Favorites, reload and verify persistence, bookmark a route, and start another journey. Canceling the confirmation must leave progress unchanged.

Existing routing/data issues and map view lifecycle are outside this feature change.
