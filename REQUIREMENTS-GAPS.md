# Requirements gaps and next-session plan

Reviewed: 31 October 2026  
Target brief: [problemStatement.md](problemStatement.md)  
Status: P0 implemented on 29 October 2026 with focused API/browser checks.
P1 and P2 implemented on 29 October 2026 with focused API, storage and browser
checks; the species guide gallery was expanded on 30 October 2026, the
location-specific seasonal chart on 31 October 2026, and report photo uploads on
31 October 2026. Production delivery and real-database upload verification remain
pending as noted below.

## Objective

Close the gaps against the problem statement, prioritizing reliable data handling
and a complete report-submission experience. The brief requires at least **two
features from each frontend category**, not every listed feature. Backend data
consumption, processing, endpoints, and error handling are the main focus.

## Current coverage

| Area | Status | Notes |
| --- | --- | --- |
| Interactive map | Meets frontend minimum | UK map, count/colour markers, filters; density toggle is an extra. |
| Sighting information | Meets frontend minimum | Marker details, directions, selected-area timeline and selected-sighting sharing work. |
| Educational content | Meets frontend minimum | All current species options have guide cards in a three-at-a-time gallery; prevention tips and actual selected-area monthly counts are included. |
| Report a sighting | P0 implemented | Validation, feedback, optional coordinates and optional photo upload to Payload Media; report metadata persists in MySQL. |
| API ingestion and processing | P1 implemented with explicit bounds | Stable identities, normalization, diagnostics and source limits; larger-scale ingestion is documented. |
| Search and insights endpoints | P1 implemented | Server-side filtering, complete bounded single-view results and shared insight scope. |
| Error handling | P0/P1 implemented | Source availability, empty/failure states, malformed queries and submissions have visible feedback. |

## P0 — First work session: trustworthy data and submission feedback

### 1. Fix live-data loading, failures, and empty states

- [x] Check HTTP status before treating a sightings response as successful.
- [x] Handle legitimate empty results by showing an empty map/list, not demo records.
- [x] Display partial-source availability using `meta.localAvailable` and `meta.externalAvailable`.
- [x] Distinguish loading, no matching results, partial results, and total failure.
- [x] Remove silent illustrative-data fallback from the live view, or make a deliberate demo mode unmistakable.
- [x] Clear or update the selected report when it is no longer part of the displayed dataset.

**Original problem (fixed):** `TickWatch.tsx` started with demo records and replaces them only when
`result.data.length` is nonzero. HTTP errors and empty responses can leave those
records looking like live observations. The backend can return HTTP 200 with both
sources unavailable, so the client must inspect metadata too.

**Files:** `src/app/(frontend)/TickWatch.tsx`,
`src/app/(frontend)/api/sightings/route.ts`.

**Done when:** an empty response clears the map; one unavailable source produces a
visible partial-data notice; both unavailable sources produce a clear failure
state; no unlabelled demo observations appear as live data.

### 2. Complete report-form validation and submission feedback

- [x] Display returned field errors next to the relevant form inputs.
- [x] Put submission errors inside the open dialog, where they are visible.
- [x] Catch network failures and invalid/non-JSON responses.
- [x] Disable repeated submission while a request is pending and show progress.
- [x] Preserve entered values after failure; show a clear success message after saving.
- [x] Enforce field types, valid dates, and coordinate rules on the server.
- [x] Return structured client errors for malformed submissions rather than generic server failures.

**Original problem (fixed):** the API returned an `errors` object, but the UI ignores it. Its generic
status message is outside the modal. Submission has no network-error handler or
pending guard. Server checks also need consistency with browser validation—for
example, the browser disallows future dates but the server does not.

**Files:** `src/app/(frontend)/TickWatch.tsx`,
`src/app/(frontend)/api/sightings/route.ts`.

**Done when:** invalid inputs produce visible, specific messages; a failed request
does not lose form values; repeated clicks while pending cannot create multiple
requests; a valid report persists and success is confirmed.

### P0 verification — 29 October 2026

- [x] `mise exec -- pnpm exec tsc --noEmit` passed.
- [x] `mise exec -- node tests/p0-api.cjs` passed: malformed bodies,
  type/date/coordinate validation, field allowlisting, save/read through an isolated
  storage adapter, seeded local-row inclusion, source availability and storage failure.
- [x] `NODE_PATH=/private/tmp/tickwatch-browser/node_modules mise exec -- node tests/p0-browser.cjs`
  passed against `/` in Chrome with deterministic API responses. Covers loading,
  empty results, each partial-source case, both sources unavailable, HTTP/network/
  non-JSON failures, retry, selection after filtering, sightings/density toggle,
  inline form errors, preserved values, pending/repeat-submit protection, success,
  and mobile rendering. No browser runtime errors. Playwright is available in the
  temporary tooling directory; it was not added as an application dependency.
- [x] The real local `/api/sightings` returned HTTP 200 with both sources available.
- [ ] Verify a valid report persists against the real database. Save/read behavior
  was tested with isolated storage; no synthetic report was inserted into live data.
- [ ] **Verify production delivery**: `figma make verify-deploy` could not run
  because the Figma CLI is unavailable. `mise exec -- pnpm build` failed because
  the platform-provided Figma environment ID could not be resolved. Production
  route classification and generated public-route visits remain unverified.

Implementation removes the browser demo fallback and includes the four known
`sample-*` local fixtures when present in the local database.
Invalid upstream response envelopes now mark that source unavailable. The form
uses a submit event handler so failed requests do not trigger React form-action
resetting, and a synchronous pending guard blocks repeat requests. Map layers are
contained below the modal so notices and inputs remain visible.

The required `payload-framework` and `nextjs-docs` skills remain unavailable after
local rediscovery. Installed Next.js route-handler and form guides were read.
Persistence architecture and schema are unchanged; no data migration was performed.

## P1 — Backend assessment priorities

### 3. Establish the canonical backend before restructuring

- [x] Decide whether Next.js routes or the separate NestJS service are the delivery backend.
- [x] Make frontend integration, response shapes, validation, source handling, and documentation consistent with that choice.
- [x] Avoid maintaining two divergent implementations of the same domain logic.

**Original problem (fixed):** the current frontend calls Next.js `/api/sightings` directly. The
NestJS service has weaker validation, no Elanco fetch, and different response
shapes. `ARCHITECTURE.md` describes NestJS as the deployable backend and Next.js as
an adapter, which does not match the current implementation.

**Files:** `server/src/sightings.service.ts`,
`server/src/sightings.controller.ts`, `src/app/(frontend)/api/`,
`ARCHITECTURE.md`.

**Done when:** the documented request path matches the running app and the chosen
backend provides all required behavior. The problem statement itself does not
require NestJS.

### 4. Improve duplicate and incomplete-record handling

- [x] Define stable upstream identifiers; do not use array position as identity.
- [x] Define and document a duplicate policy for repeated observations and overlaps between sources.
- [x] Avoid collapsing legitimate separate observations solely because they share a place/date/species.
- [x] Normalize species, severity, dates, region names, and coordinate types consistently.
- [x] Document how missing/invalid fields are rejected, inferred, or retained as unknown.
- [x] Make discarded-record counts or diagnostics available for troubleshooting.

**Original problem (fixed):** merging currently deduplicates only by ID. Records with different IDs
remain duplicated, and missing upstream IDs fall back to an unstable array index.
The architecture document claims date/location/species deduplication that is not
implemented. Some malformed records are silently dropped; unsupported species or
severity strings can pass through unchanged.

**File:** `src/app/(frontend)/api/sightings/route.ts`.

**Done when:** repeated ingestion is stable; representative duplicates are handled
according to the documented policy; legitimate observations survive; malformed
records do not crash the map or silently corrupt totals.

### 5. Make filtering work beyond the initial 500 local records

- [x] Use server-side filters from the frontend rather than filtering only the initial downloaded subset.
- [x] Add bounded pagination or another documented strategy for retrieving all relevant results.
- [x] Define how map aggregation and counts work across pages.
- [x] Validate query dates and ranges and return useful errors.
- [x] Document the external API's pagination capabilities and the chosen ingestion/cache strategy.
- [x] Include retries/backoff, stable identities, bounded processing, and failure recovery in the scaling plan where applicable.

**Original problem (fixed):** MySQL reads stop at `LIMIT 500`, and there is no pagination. Client
filters operate on the initial result set, so older matching reports can be
invisible. External records are fetched and processed as one whole array.

**Files:** `src/lib/mysql.ts`, `src/app/(frontend)/TickWatch.tsx`,
`src/app/(frontend)/api/sightings/route.ts`, `ARCHITECTURE.md`.

**Done when:** a matching record outside the first 500 can be found; displayed
counts describe the filter scope accurately; the submission includes a concrete
large-dataset plan. A full ingestion platform is not necessarily required by the brief.

### 6. Align aggregate insights with the displayed dataset

- [x] Decide whether insights cover combined sources or explicitly labelled community-only data.
- [x] Apply consistent source, date, and location scope to totals and trends.
- [x] Ensure monthly periods are chronological and decide how zero-count months are represented.
- [x] Recalculate marker/heatmap counts for active filters rather than retaining broader counts attached to individual records.

**Original problem (fixed):** the map combines MySQL and Elanco, while `/api/insights` queries only
MySQL. Frontend-only filters can also retain `reportCount` values calculated for
the original, broader query, making density/counts misleading after filtering.

**Files:** `src/app/(frontend)/api/insights/route.ts`, `src/lib/mysql.ts`,
`src/app/(frontend)/TickWatch.tsx`, `src/app/(frontend)/LeafletSightingsMap.tsx`.

**Done when:** map counts and insights agree for an equivalent data scope, or any
intentional difference is clearly labelled. Filtered heatmap weights represent
the matching observations.

### P1 verification — 29 October 2026

- [x] Next.js is the canonical backend; NestJS forwards to it without database or
  domain logic. `ARCHITECTURE.md` documents the request path and response contracts.
- [x] TypeScript and `pnpm server:build` passed.
- [x] `tests/p1-api.cjs` passed: stable IDs/order-independent deduplication,
  malformed-record diagnostics, query validation, single-view search over 650
  records, equivalent insights, limits, retry/caching and failure cooldown.
- [x] `tests/p1-storage.cjs` passed: SQL filters precede the 10,001-row detection
  limit, literal substring search stays parameterized, query timeout is bounded,
  and broad `reportCount` values are no longer emitted.
- [x] `tests/p1-browser.cjs` passed: server filter requests, finding the older
  matching record beyond 500, full-result map counts, density view, visible
  date-range errors and mobile rendering.
- [x] P0 API and browser regression checks passed, including optional coordinates.
- [x] Read-only live checks (`tests/p1-live.cjs`) confirmed 1,000 combined records,
  76 London matches, equivalent sightings/insight totals, and canonical/proxy
  response and validation parity. Counts describe the checked source snapshot.
- [ ] **Verify production delivery** remains pending: `figma make verify-deploy`
  cannot run without the Figma CLI, and `pnpm build` fails because the platform
  environment ID is unavailable. Production route classification and public-route
  verification remain blocked.

Bounds are explicit: maximum 10,000 processed rows per source and 5 MiB upstream
response size; truncation is surfaced rather than reported as a complete result.
All retrieved matches appear in one view; map weights and insights cover that
same bounded match set. The external API documents no pagination; the
larger-scale ingestion plan is in `ARCHITECTURE.md`. No schema changes, data
migration or live test reports were introduced.

## P2 — Correct incomplete features already visible in the UI

### 7. Scope the timeline to the selected area

- [x] Define the area boundary as exact location name plus region.
- [x] Filter the timeline to that area and sort newest first.
- [x] Provide a useful empty state.

**Implemented:** the timeline shows up to four newest observations at the
selected location and region, after active filters are applied.

**File:** `src/app/(frontend)/TickWatch.tsx`.

**Done:** selecting another area changes the timeline to that area's actual
observations. Covered by `tests/p2-browser.cjs`.

### 8. Replace or honestly label the fixed seasonal chart

- [x] Use monthly counts from actual observations for the selected area.
- [x] Show month labels and observation counts.
- [x] Handle insufficient data explicitly.
- [x] Remove the location-specific claims based on illustrative values.

**Implemented:** three charts show all available reports at the selected exact
location, in its selected region, and across the UK. The location and region
charts update when the selected sighting changes. They ignore active date and
species filters, group observations across years into all twelve calendar months,
include zero-count months, and report actual sightings rather than estimated
tick abundance. They clarify that zero reports do not prove ticks are absent.
Loading, source-failure, truncation and no-sighting states are shown explicitly.

**File:** `src/app/(frontend)/TickWatch.tsx`.

**Done:** location, region and UK Jan–Dec profiles are derived from actual
observations across available years. Covered by `tests/p2-browser.cjs`.

### 9. Implement photo uploads or remove the nonfunctional promise

- [x] Send the photo with the report using multipart form data.
- [x] Validate the actual image format, decoded image and size on the server.
- [x] Persist the image in Payload Media and associate its ID and display metadata with the MySQL report.
- [x] Display the saved photo with its selected sighting and disclose public visibility in the form.

**Problem:** previously, the file input had no `name`, requests sent JSON without
a file, and no report-image persistence flow existed.

**Files:** `src/app/(frontend)/TickWatch.tsx`, the sightings API route,
`src/collections/Media.ts`, and `src/lib/mysql.ts`.

**Done:** the form accepts JPEG, PNG and WebP files up to 5 MiB. The API bounds
request size, verifies and re-encodes image data, stores it in the existing Media
collection, and associates the Media ID, URL and dimensions with the report.
Photos appear in the selected-report panel. API tests cover invalid/oversized
images and orphan cleanup; browser coverage verifies multipart submission and
later photo display. A real Payload/MySQL upload still needs verification in the
connected Figma environment.

### 10. Make sharing refer to a selected sighting

- [x] Encode the selected sighting in a query parameter and restore it on opening the URL.
- [x] Show copy-success/failure feedback and handle missing Clipboard API access.

**Implemented:** “Copy link” includes the selected sighting ID in the
`?sighting=` query parameter; opening it restores that selection when available.
Clipboard failures and unavailable IDs have visible messages.

**File:** `src/app/(frontend)/TickWatch.tsx`.

**Done:** opening a copied link selects the intended sighting, or explains that
it is unavailable. Covered by `tests/p2-browser.cjs`.

### 11. Show every listed tick type in a navigable guide

- [x] Build the guide from the species options used by the filter.
- [x] Show three species cards at a time with previous/next controls.
- [x] Provide identification notes for the current species options and clearly label unknown data labels.
- [x] Keep the unknown filter value separate from species cards because it is a report category, not a species.

**Implemented:** the guide now covers all eight named tick types available in
the current API response. Cards are alphabetized and shown three per page, with
working previous/next buttons on desktop and mobile. Additional future species
labels receive a cautious fallback card instead of silently disappearing.

**File:** `src/app/(frontend)/TickWatch.tsx`.

**Done:** users can page through every named tick type and read its field-guide
details. Covered by `tests/p2-browser.cjs`.

### P2 verification — 29–31 October 2026

- [x] `tests/p2-browser.cjs` passed: selected-location timeline ordering,
  location, region and UK seasonal charts with twelve months, grouping
  observations across years and species, including zero-count months; selected-sighting
  copy/deep link and unavailable-link notice; multipart photo submission and
  selected-report display; and all
  eight tick types in a three-card desktop/mobile gallery.
- [x] `tests/p0-api.cjs` passed photo coverage for image validation, Media upload,
  report association and cleanup after a failed report write.
- [x] `pnpm exec tsc --noEmit` passed.
- [x] P0/P1 browser and API/storage regression checks passed.
- [x] Main navigation links to map, insights, prevention guide and tick
  information; the footer includes the requested author/program text.
- [x] Seasonal charts appear in UK, region, location order with distinct colors;
  field guidance covers prevention, checks, removal and when to seek care.
- [ ] Production delivery and a real-database report write remain pending; see P0
  verification below. No test report was inserted into live data.

## P3 — Documentation and delivery evidence

- [x] Update `ARCHITECTURE.md` to describe the actual backend, eight-second external timeout, implemented deduplication policy, and current Leaflet map.
- [x] Document data provenance, source availability, result limits, and upstream data context.
- [x] Add focused P0/P1 regression checks, including failures and malformed data.
- [x] Run TypeScript checks and browser verification after changes.
- [ ] Keep **Verify production delivery** pending until the Make deployment checks and generated public routes are verified in the appropriate environment.

The local build previously failed because the Figma environment ID was absent.
`figma make verify-deploy` could not run because the Figma CLI was unavailable.
Do not invent platform secrets or remove Payload to bypass those limitations.

## Working environment and constraints

- Local tools: Node `24.22.1`, pnpm `10.34.9`, managed by Mise.
- App records currently use MySQL; Elanco records are merged at request time rather than persisted by that endpoint.
- Project instructions require Payload for durable-data work, while this existing implementation uses MySQL. Resolve the intended architecture before migrating or adding persistence; this review does not authorize a data migration.
- Follow the supplied schema-safety instructions before destructive schema/data changes.
- The required `payload-framework` and `nextjs-docs` skills were unavailable locally during earlier work; rediscover them before implementation and report continuing limitations.
- Focused implementation and browser checks do not replace production route
  verification or the pending real-database report-write check.

Useful commands from the project root:

```sh
mise exec -- pnpm dev
mise exec -- pnpm exec tsc --noEmit
```

If the server is already running, use it instead of starting another instance.
The app is normally at http://localhost:3000.

## Remaining verification

The P0-P2 implementation and focused regressions are complete. To finish delivery,
run `figma make verify-deploy` in the Figma Make lifecycle, inspect its production
route table, and visit every generated public route. Separately verify one valid
report write against the real database when an approved test environment is
available; do not insert synthetic reports into live data.

## Follow-up — optional coordinates (29 October 2026)

User approved relaxing the existing MySQL latitude/longitude columns to allow
NULL. Both form fields are optional independently; omitted, blank or null values
are stored as NULL, while supplied values still receive type and UK-range checks.
Required inputs now have adjacent asterisks and a legend. Reports need both
coordinates to appear on the map or offer directions; missing-coordinate reports
remain available in the details view, with an explanatory notice.

The existing database initialization and setup script now apply an idempotent
nullability update, retaining DECIMAL(9,6) precision. The real database check
(`tests/optional-coordinates-db.mjs`) verified both columns allow NULL and all
existing report IDs and coordinate values remained unchanged. TypeScript, API
regressions and browser tests passed, including submitting blank coordinates and
rendering reports without coordinates. Production delivery remains pending under
the previously documented Figma environment/CLI limitations.

## Follow-up — single-view results (user override)

Pagination was removed at the user's request. This supersedes the P1 pagination
UI and page-specific count decisions above. The sightings API returns every
retrieved match in one response; markers, density and selected-location counts
cover that same complete result set. Server filters, source bounds and visible
truncation/availability warnings remain. No Next/Previous controls or page-size
parameters are used by the frontend. Regression checks now verify all 650 test
reports appear together and location filtering retains complete counts.
