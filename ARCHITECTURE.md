# TickWatch architecture

## Canonical delivery backend

The browser calls the **Next.js App Router API** at `/api/sightings` and
`/api/insights`. Next.js owns public validation, normalization, source handling,
filtering and persistence through the existing MySQL adapter in
`src/lib/mysql.ts`. The frontend uses React and Leaflet, including a density view.

`src/lib/sightings-domain.ts` contains query validation, normalization,
deduplication and aggregation. `src/lib/sightings-service.ts` loads both sources
and supplies the sightings and insights routes. Report creation remains in the
sightings POST handler. There is one implementation of these behaviors.

`server/` is an optional legacy NestJS compatibility proxy, not an independent
database backend. Set `NEXT_BACKEND_URL` to the Next.js server origin before
starting it. Its `/api/sightings` GET/POST forwards to the canonical route;
`/api/sightings/insights` forwards to `/api/insights`, including filters and error
statuses. It has no database provider or duplicate validation/query logic. Old
running NestJS processes must be restarted to use the new proxy build.

The Figma/Payload template remains intact. Existing application records still
use MySQL; P1 makes no schema changes or data migration. Moving existing records
to Payload is a separate, explicitly planned migration, not part of this change.

## HTTP contracts and scope

- `GET /api/sightings`: `{data, meta}`. Query parameters are `from`, `to`, `region`,
  `species`, and `q`. Dates must be real `YYYY-MM-DD` dates, with `from <= to`.
  Search is a literal, case-insensitive location/region substring of at most 120
  characters. Invalid filters return HTTP 400 with `{error, errors}`.
- All retrieved matching records are returned together, ordered by observation
  time descending, then stable ID. There is no pagination or page slicing.
  Legacy `page`/`pageSize` parameters are ignored. `meta.total` describes the
  full retrieved match set; the existing source bounds remain explicit below.
- The client sends filters after a 250 ms debounce, cancels obsolete requests,
  and hides stale results while loading. SQL applies filters before its source
  limit, so older matches are not hidden behind 500 unfiltered records.
- Map markers, density weights and selected-location counts cover all retrieved
  matching records together. They count records directly, never inherited
  `reportCount` values. Reports without both coordinates remain readable but
  have no marker/directions. No manual consolidation across pages is needed.
- `GET /api/insights` uses the same filters, sources, normalization and limits as
  sightings, and aggregates the same complete retrieved match set.
  `{total, byRegion, trend, meta}` includes chronological `YYYY-MM` periods.
  Zero-count months are omitted (`meta.zeroMonths: "omitted"`). The seasonal
  chart is separate from this endpoint and requests sightings for the selected
  exact location and region, grouping those real observations by calendar month.
- `meta.localAvailable` and `externalAvailable` identify partial source failures.
  Both unavailable returns HTTP 503; an available empty source is not a failure.
  `meta.truncated` explicitly warns that totals represent a bounded subset.
- `POST /api/sightings` validates/allowlists public fields and writes a pending
  community report. Blank, omitted or null coordinates are allowed as an empty pair;
  supplied coordinates must form a complete pair, with latitude from -90 to 90
  and longitude from -180 to 180. The form can fill these through its Leaflet
  picker or manual inputs.
  Workflow fields cannot be supplied by the client. JSON remains supported;
  multipart requests can also include one optional JPEG, PNG or WebP photo up to
  5 MiB. The server bounds the request, decodes and re-encodes the image as WebP,
  uploads it to the existing Payload Media collection with access checks enabled,
  then stores its Media ID, URL and dimensions on the MySQL report. Failed report
  writes trigger cleanup of the newly uploaded, unattached image. Successful
  writes return 201.

## Navigation, field guidance and seasonal insights

The site navigation links to the sightings map, graphs/insights, prevention field
guide, and tick identification information. The footer credits Anini Pandiyan
Sathya and the Elanco Placement Program technical task.

The field guide covers bite prevention, post-outdoor checks, safe tick removal,
and symptoms that warrant contacting a GP or NHS 111. It links to NHS guidance;
it is educational and does not diagnose illness.

The selected-area timeline uses the currently filtered sightings and displays up
to four newest observations at the selected exact location name and region. Three
seasonal charts make separate requests without date or species filters: the
selected exact location and region, the selected region, and all available UK
reports. Each groups observations across years into the twelve calendar months.
They display zero-count months, observed report counts, source availability and
truncation notices. Counts describe reports, not estimated tick abundance. If
there are no reports in a scope, it shows a zero-count profile and an explanatory
notice rather than substituting illustrative values. A zero means no records in
the loaded data, not proof ticks are absent; reporting coverage varies by place
and year.

Copy link adds the selected sighting ID as the `sighting` query parameter. On
opening a shared URL, the app selects that record if it is in the loaded filtered
results and displays a notice if it is unavailable. Clipboard access failures are
shown to the user. Reports may include a photo; it is displayed with the selected
sighting. Media files are publicly readable to support that display, and the form
warns reporters not to include faces, personal details or identifying information.

## Provenance, normalization and identity

The [Elanco API documentation](https://dev-task.elancoapps.com/) identifies its
feed as educational data for the 2026 student placement task, not an official
tick surveillance source. Its whole-list endpoint has no documented pagination
parameters; city/species and single-ID routes also exist. Its documented timestamp
format has no timezone. These facts were checked against the documentation loaded
by the site on 29 October 2026. We do not invent upstream page/cursor parameters.

The UI identifies the educational source. Known-city coordinates are approximate
city centres, inferred only for external records with both coordinates absent.
Missing/invalid coordinates otherwise become null; partial coordinate pairs are
not completed using an unrelated city-centre coordinate. Missing locations,
impossible dates, malformed rows and invalid timestamp formats are discarded.
Zone-less timestamps are explicitly interpreted as UTC, not server-local time;
this is an application assumption because the upstream supplies no zone.

Region names are matched case-insensitively to the supported UK regions; missing
regions can be inferred from a known city, otherwise become `Unknown`. Species
aliases/scientific names for supported categories are normalized; unsupported
species become `unknown` while their original names remain available in details
and as filter options.
Invalid/missing severity becomes `unknown`, rather than invented activity levels.
Notes are normalized as text and bounded to 1,000 characters. The four known local
sample fixtures are included in results when present in the local database.

IDs are origin-namespaced (`local-id-…`, `external-id-…`). An upstream ID is used
when present; otherwise SHA-256 of normalized observation content, including
notes and source species identity, supplies a stable fallback. Array positions
are never identifiers. Repeated IDs within a source collapse; conflicting values
use a deterministic lexicographic winner and increment a conflict diagnostic.
Distinct IDs remain distinct even when place, date and species match. Exact
content duplicates without IDs collapse: truly separate, indistinguishable
ID-less observations cannot be distinguished, an explicit limitation of this
fallback. Different content (including notes/species) produces a different hash.

Cross-source lookalikes remain separate unless a future explicit source-ID mapping
proves identity. Geography/date/species similarity alone is insufficient evidence
to merge community reports with educational observations. No deduplication deletes
or updates stored documents. Diagnostics per source expose received, discarded,
duplicate and conflicting-ID counts, coordinate inference/missing-coordinate
counts, UTC assumptions and unknown category counts.

## Bounded processing and failure recovery

Each request reads at most 10,001 matching local rows, exposing at most 10,000;
the extra row detects truncation. SQL queries have a five-second execution timeout
and parameterized predicates. The external reader limits the response to 5 MiB
before JSON parsing and normalizes at most 10,000 rows. Excess rows or an upstream
envelope indicating further pages sets `truncated`. Oversized, malformed, or
unavailable responses mark that source unavailable, not empty-success. Narrowing
filters is necessary when the local matching set exceeds its cap. External data
beyond its cap is not searchable by this MVP; it requires the ingestion work below.

The external fetch has an eight-second timeout **per attempt**, at most two
attempts for transport/429/5xx failures and a 250 ms backoff. Other 4xx, malformed
JSON and oversized responses are not retried. Successful normalized external data
is cached in-process for 15 minutes with one concurrent refresh. Failures impose a
30-second cooldown before a later request can retry; expired data is not silently
served as current. `externalFetchedAt` exposes freshness. Local reads are uncached,
and a failed database initialization can be retried on subsequent requests.

The per-process cache is not a shared ingestion system: cold replicas may each
fetch, and matching local reads still process up to the cap on every request.
Sources may change between sightings and insights requests; equal scopes agree
for the same underlying records, rather than promising cross-request transactions.

For larger workloads, the next step is a scheduled ingestion worker with:

1. A durable checkpoint and upstream snapshot/version, bounded download storage,
   and batch processing. With today's unpaginated API, validate a whole bounded
   snapshot or obtain a supported paginated export from the provider; do not
   pretend a cursor exists. If pagination is added, checkpoint its documented
   cursor only after each successful batch.
2. Stable origin/ID upserts, a versioned fallback fingerprint policy, retry queues,
   bounded exponential backoff with jitter and `Retry-After` support, rate limits,
   quarantine diagnostics and restartable batch checkpoints. Publish a new
   snapshot only after complete validation; keep the last known good snapshot
   explicitly marked stale during failures.
3. Indexed server-side filters, internal ingestion cursors over `(observedAt, id)`,
   snapshot-aware spatial map aggregates and daily/monthly summary
   tables. Compute aggregate/map scope on the server instead of sending every
   observation to the browser, while retaining one complete map view without
   user-facing pagination. These persistence/index changes need a separate
   schema/data plan and are not implemented by P1.

## Verification and remaining delivery limits

Focused checks: `tests/p0-api.cjs`, `tests/p1-api.cjs`, `tests/p1-storage.cjs`,
`tests/p0-browser.cjs`, `tests/p1-browser.cjs`, and read-only
`tests/p1-live.cjs`. API tests use isolated source/storage adapters; they do not
seed real application data. Live checks compare canonical/proxy responses and
combined/filtered insight totals. TypeScript and NestJS build checks also pass.

Production verification remains pending: the Figma CLI is unavailable and the
Payload build cannot resolve the platform Figma environment ID in this local
shell. No platform secrets or template internals were changed to bypass this.

## Accessibility preferences

The frontend accessibility provider stores text size and high contrast in
browser local storage under `tickwatch-accessibility-v1`; these are not account
or server preferences. Relative font sizes scale existing labels and controls.
The preferences dialog supports keyboard focus containment, Escape, focus return
and reset. High contrast preserves geographic tiles while strengthening text,
controls and marker labels.

The [browser Speech Synthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
reads the existing prevention-guide content after a user action. Shared panel
and guide controls manage short utterances, pause/resume, cancellation and error
feedback. Speech does not start on reload and is not saved as a preference.
Voice availability depends on the browser/device; unsupported browsers retain
the written guide. No new backend, external paid service or API key is involved.
