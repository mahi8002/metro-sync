# NYC Transit Hub Pro — Product Requirements Document (PRD v2.1.0)

**Document Version:** 2.1.0  
**Status:** Approved for Production & MVP Demo  
**Target Delivery Date:** December 1, 2026  

---

## 1. Executive Summary & Problem Framing

Navigating the New York City subway system poses severe friction for commuters during subterranean connectivity loss (river tubes, deep stations) and for mobility-impaired riders facing broken accessibility infrastructure. **NYC Transit Hub Pro** is a lightweight, mobile-first Progressive Web Application (PWA) designed to provide instant, zero-latency route planning, real-time GTFS alerts, elevator outage monitoring, and a subterranean offline assistant. 

Operable at $0 hosting cost within strict student engineering limits (2 hours/week per member), the platform delivers robust wayfinding without expensive external server infrastructure.

---

## 2. Product Goals & Key Results (OKRs)

* **Instant Subterranean Access:** Achieve continuous offline availability in subway tunnels with route lookup latency under 50 milliseconds.
* **Accessibility Transparency:** Provide 100% visibility into elevator/escalator outages with explicit timestamp indicators to prevent riders with wheelchairs/strollers from stranding.
* **Zero-Budget Architecture:** Maintain $0/month operational costs by using static web hosting and client-side rule execution.
* **Engineering Excellence:** Deliver MVP by major milestones (Mid-Checkpoint Oct 27, Final Launch Dec 1) while establishing scalable PWA architecture, React state design, and responsive WCAG 2.1 AA UI patterns.

---

## 3. "What-If" Contingency Strategy: Offline Assistant Feature Fallback

To ensure risk-free execution during tight sprint deadlines and live presentations, the team has formally incorporated a modular **"What-If" Feature Architecture & Rapid De-scoping Protocol** into the product specification.

### 3.1 Problem Scenario & Risk Mitigation
While the offline-first assistant engine provides high value for subterranean riders, unforeseen edge cases during underground testing or Service Worker cache initialization could threaten demo stability or sprint delivery.

### 3.2 Technical Modularity & De-coupling Design
* **Independent State Isolation:** The Subterranean Assistant is implemented as a standalone React state machine (`isAssistantOpen`, `assistantMessages`, `runOfflineAssistantQuery`). It operates with zero tight coupling to core mapping (Leaflet canvas), origin/destination dropdowns, route polyline highlighting, or MTA line badging components.
* **Rapid Removal Protocol (< 2 Minutes):** If offline caching encounters instability prior to presentation or launch, the feature can be cleanly disabled without breaking core routing or triggering runtime exceptions.

#### 2-Step Scoping Instructions:
1. **UI Layer:** Comment out the floating trigger button component and drawer JSX overlay in `App()`.
2. **State Layer:** Remove network event listeners (`window.addEventListener('offline')`) and helper query functions. Core map, line badges, and saved favorites remain 100% functional.

---

## 4. Detailed Feature Specifications & MoSCoW Prioritization

| Priority | Feature Module | Technical Requirements | Acceptance Criteria (Given-When-Then) |
| :--- | :--- | :--- | :--- |
| **MUST HAVE** | Offline-First Subterranean Assistant (with "What-If" Toggle) | Client-side pattern-matching query engine running locally inside React state machine. Cross-references cached `STATIONS_DATA`, `GTFS_ALERTS`, and `YELP_VENUES` without network overhead. Completely de-coupled for instant feature toggle. | **Given** the rider is underground with zero internet,<br>**When** they click a quick chip or type "Is route accessible?",<br>**Then** the assistant returns elevator availability in < 50ms. |
| **MUST HAVE** | Interactive Transit Map & Polyline Highlighter | Leaflet rendering on dark basemaps. Dynamic canvas polylines connecting origin and destination nodes using official MTA line hex codes (`#EE352E`, `#00933C`, `#0039A6`, `#FCCC0A`). | **Given** an origin and destination are selected,<br>**When** the route updates,<br>**Then** the map draws a color-coded dashed route polyline and auto-fits bounds. |
| **MUST HAVE** | Official MTA Line Badging & Wayfinding UI | Strict compliance with MTA Trunk Line colors (e.g. 8th Ave `#0039A6`, Broadway `#FCCC0A` with dark text, Lexington `#00933C`). Circle badges for local routes, rotated diamond badges for express services. | **Given** route options or station cards are displayed,<br>**When** subway line bullets render,<br>**Then** they match official MTA color/contrast guidelines with screen-reader `aria-label` tags. |
| **MUST HAVE** | Real-Time Elevator & Escalator Outage Monitor | Displays status, station entrance locations, and ETA return-to-service times. Pre-caches equipment status for underground reference. | **Given** a station has an out-of-service elevator,<br>**When** viewing station details or planning a route,<br>**Then** a red warning badge indicates equipment status. |
| **SHOULD HAVE** | Saved Favorite Routes & Custom Renaming | Local persistence via `localStorage` / IndexedDB. Inline editing for custom commute nicknames (e.g., "Daily Work Commute"). | **Given** a saved route in the Profile tab,<br>**When** the user clicks edit and inputs a new name,<br>**Then** the route name updates across all views immediately. |
| **SHOULD HAVE** | WCAG 2.1 AA High-Contrast Mode | Pure CSS black/yellow color system toggle for outdoor direct sunlight and low-vision accessibility. | **Given** the user toggles High Contrast Mode,<br>**When** the UI renders,<br>**Then** contrast ratios exceed 7:1 across text and navigation controls. |
| **COULD HAVE** | Eco-Rider Impact Gamification | Calculates estimated $CO_2$ savings (1.8kg/ride) and hours saved versus driving. Logs completed commutes to client storage. | **Given** a completed commute,<br>**When** the user clicks "Log Trip",<br>**Then** $CO_2$ savings metrics increment instantly with a confirmation toast. |
| **WON'T HAVE** | Server-Side Cloud LLM Chat API | Heavy generative AI endpoints (e.g., OpenAI/Cloud Run LLM workers) are excluded from MVP due to network loss in tunnels and API cost bounds. | Excluded from MVP scope. |

---

## 5. Technical Architecture & Wayfinding Standards

* **Frontend Stack:** React 18, Tailwind CSS, Babel JSX, Leaflet.js, Lucide Icons (Single-file embed compatible).
* **MTA Visual Standards:** Full integration of official trunk line colors, local vs. express badge shapes, and high-contrast typography per MTA wayfinding specs.
* **Persistence & Offline Caching:** Service Worker Cache API for static map assets + IndexedDB / `localStorage` for station coordinates, static timetables, and user settings.
* **Storage Quota:** Total client footprint capped strictly at < 15 MB to ensure instant loading on low-tier mobile devices and legacy subterranean network handoffs.
* **Cloud Backend (Mock/Demo Ready):** Firebase Web SDK 11.0.0 initialized with local fallback handlers for zero-cost operation.

---

## 6. Student Team Workload & Sprint Schedule (MetroSync Plan)

To respect the limit of **2 hours/week per team member** (10 person-hours/week total across 5 roles), development is structured into bite-sized task blocks:

| Milestone Date | Core Sprint Objective | Role Assignments & Time Budget |
| :--- | :--- | :--- |
| **Oct 27 (Mid-Checkpoint)** | Working Demo, Wayfinding Badges & Architecture Review | • **UI/UX:** Layout wireframes & MTA line badge specs (1 hr)<br>• **Frontend:** Leaflet map integration & route polylines (1 hr)<br>• **DB/AI:** De-coupled offline assistant engine with fallback toggle (1 hr)<br>• **Backend (x2):** Firebase Auth integration & local fallbacks (2 hrs) |
| **Nov 10 (Sprint 2)** | PWA Offline Caching & Elevator Monitor | • **Offline QA:** Subterranean disconnect testing & fallback verification (1 hr)<br>• **Frontend:** Elevator badge status & profile view (1 hr)<br>• **DB/AI:** IndexedDB schema setup for station data (1 hr) |
| **Dec 1 (Final Launch)** | MVP Delivery & Project Post-Mortem | • **Full Team:** Demo deck, live testing, and post-mortem presentation (10 person-hours) |

---

## 7. Architectural Rationale & System Design Principles

Every engineering choice in this product specification is governed by enterprise design principles:

1. **Defensive System Architecture (Feature Flags & Fallbacks):** Decoupling experimental features (like the Subterranean Offline Assistant) ensures system stability and guarantees zero downtime during critical deployments or live presentations.
2. **Client-Side State Machines:** Building a local, pattern-matching assistant minimizes server dependencies, eliminates API costs, and guarantees sub-50ms execution times inside underground dead zones.
3. **Accessibility & Brand Compliance:** Implementing official MTA trunk line visual hierarchy (circle vs. diamond badges) and WCAG 2.1 AA high-contrast standards ensures the application meets public transportation usability benchmarks.
