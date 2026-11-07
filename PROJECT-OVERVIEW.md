# NYC Transit Hub - Project Overview

Last updated: November 7, 2026

## 1. Current Web Application Features

The current `Metro Sync_v2.1.1.html` application provides:

- Full-network subway route planning using 496 GTFS parent stations,
  direction-specific platform mappings, transfer walking times, and route-aware
  graph edges.
- Multiple route options, including the fastest route and alternative routes.
- Route duration, transit time, walking time, transfer count, line sequence,
  and map polyline output.
- Live MTA GTFS-Realtime trip updates for all subway feed groups.
- A map API backed by local MTA GTFS routes, stations, and shape data.
- Live elevator and escalator outage reporting from the MTA accessibility feed.
- Searchable origin and destination station inputs with fuzzy matching and
  keyboard navigation.
- Six interface languages: English, Spanish, Simplified Chinese, Traditional
  Chinese, Russian, and Haitian Creole.
- Persistent language, accessibility preference, and notification settings.
- Saved favorite routes with rename, delete, and map-load actions.
- Six local achievement badges for completed journeys, unique visited stations,
  and the first favorite route.
- Explicit journey start, completion, and cancellation states.
- Persistent journey statistics, achievement progress, unlock dates, and
  illustrative CO2 savings.
- Local registration and sign-in forms with full-name, email, password,
  password-confirmation, password-length, and mismatch validation.
- Remember-me session persistence and password-reset preview messaging.
- High-contrast mode, responsive layout, static interface icons, and a local
  route assistant.

Authentication, favorites, preferences, and achievements currently use
browser-local storage. They are not yet synchronized to a real user account or
cloud database.

## 2. Features Integrated from the Previous GitHub Repository

The following features were adapted from other branches in the GitHub
repository:

- Achievement definitions, progress rules, unique-station counting, duplicate
  protection, bookmark unlocks, and automated tests from the `luyao-liu`
  branch.
- Registration fields and validation ideas from `MetroSync_Signup.html` on the
  `mahi` branch, including full name, email, password confirmation, and the
  minimum password length.
- Sign-in experience ideas from `MetroSync_Login.html` on the `mahi` branch,
  including remember-me, password-reset guidance, autocomplete attributes, and
  clearer form feedback.
- Product requirements from `docs/PRD.md` were used to guide preference
  persistence and account-related UI behavior.

The separate GitHub HTML pages and old archives were not copied into the
application. Their useful behavior was merged into the existing single-page
React interface to preserve shared styling, language switching, and navigation.

## 3. Features Still To Be Implemented

### 3.1 Real Firebase Authentication

The current sign-in and registration experience is a local front-end
demonstration. A production implementation should add:

- A real Firebase project and browser-safe Firebase configuration.
- User registration with Firebase Authentication.
- Email/password sign-in, sign-out, and password-reset email delivery.
- Email verification and clear error handling for invalid or existing accounts.
- Firebase session restoration across page reloads.
- Firestore synchronization for favorites, preferences, and achievement
  progress.
- Account-specific data isolation so local demo data is not shared between
  users.
- Firestore security rules that restrict each user to their own records.
- Migration from the existing `localStorage` keys to the authenticated account
  model.

### 3.2 PWA and Offline Mode

The current page requires internet access for CDN libraries, MTA live feeds,
Firebase modules, and map tiles. A real offline mode should add:

- A Web App Manifest and installable PWA metadata.
- A Service Worker with versioned application-shell caching.
- Locally bundled React, Babel output, Tailwind CSS, Leaflet, and icons instead
  of runtime CDN dependencies.
- Precompiled JavaScript so the browser does not need the in-browser Babel
  transformer.
- IndexedDB or Cache Storage for station data, the route graph, last-known live
  updates, accessibility outages, favorites, and preferences.
- A clear offline status indicator and stale-data timestamp.
- Cached route planning and graceful fallback when MTA APIs are unavailable.
- A defined cache refresh strategy and cache invalidation on release.
- Automated testing in offline and low-connectivity browser conditions.

Until these items are implemented, users should treat live train, outage, map,
and authentication features as online-only capabilities.
