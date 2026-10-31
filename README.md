# TickWatch UK — UK Tick Sighting Explorer

A local demo for exploring and reporting UK tick sightings. Built with Next.js,
React, Tailwind CSS and Leaflet. Community reports are stored in MySQL; optional
report photos use the existing Payload Media collection.

## Run locally

The project pins Node.js `24.22.1` and pnpm `10.34.9` in `.mise.toml`.
With Mise installed, run from this folder:

```sh
mise trust .mise.toml
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev
```

Open **http://localhost:3000**. Keep the terminal running during the demo;
press Ctrl+C to stop it. The development server uses `PORT`, defaulting to 3000.
For example, use `PORT=3001 mise exec -- pnpm dev` for a different port.

For subsequent starts:

```sh
mise exec -- pnpm dev
```

If your shell already uses the pinned Node.js and pnpm versions, `pnpm dev`
is sufficient. These shell command examples use macOS/Linux syntax.

## Data and demo requirements

### Internet and external reports

The app reads educational tick-sighting data from
`https://dev-task.elancoapps.com/data/tick-sightings`. This feed and the
OpenStreetMap tiles require internet access. External results are cached in the
server process for 15 minutes; restarting the server clears that cache.

Community and external sources are loaded independently. A partial-source notice
appears when one fails. If both sources fail, the data endpoints return HTTP 503
and the UI displays an error. Each source is bounded to 10,000 records; a
truncation notice appears when the loaded set is incomplete. Counts describe
reports, not estimated tick populations.

### MySQL and community reports

A running MySQL server is required to read or save community reports. Configure
these server-side environment variables as needed:

| Variable | Default in code |
| --- | --- |
| `MYSQL_HOST` | `127.0.0.1` |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | `root` |
| `MYSQL_PASSWORD` | Empty string |
| `MYSQL_DATABASE` | `dataWatch` |

Use your own database credentials privately. Next.js loads `.env.local` for the
app; environment files are ignored by Git. Never commit credentials.

On the first database access in each server process, `src/lib/mysql.ts`:

- Creates the database and sightings table if absent.
- Makes coordinate columns nullable when needed and adds missing photo columns.
- Attempts to insert four starter sightings with fixed IDs using `INSERT IGNORE`,
  preserving records that already have those IDs.

The configured MySQL user therefore needs the corresponding database/table
creation, alteration, read and write permissions. For the demo, use the existing
database; restarting the app does not intentionally clear its records.

There is also an explicit setup command:

```sh
mise exec -- pnpm db:setup
```

This script creates the database/table if absent, adjusts coordinate nullability
and attempts the same four starter inserts. It does **not** add the photo columns;
the app's database initializer does that. It reads exported shell environment
variables and does **not** automatically load `.env.local`. If credentials are
stored there, run the script with Node's environment-file option instead:

```sh
mise exec -- node --env-file=.env.local scripts/setup-mysql.mjs
```

New community reports are saved with `pending` status. The current list query
includes pending reports; there is no public moderation workflow in this demo.
Coordinates are optional, but must be supplied together. Reports without
coordinates can appear in lists/charts but have no map marker or directions link.

### Payload and optional photos

The project still uses `@payloadcms/figma` in its Payload configuration and image
loader. Removing the `.figma` folder removed deployment tooling, not this runtime
integration. Payload Admin, media uploads and production builds require the
existing backend environment. Missing backend configuration can also produce
server-side initialization errors when the sightings route imports Payload.

The photo-upload code accepts JPEG, PNG or WebP files up to 5 MiB, normalizes them
to WebP and uploads them to Payload before saving the report's photo relationship
in MySQL. Photo submission therefore needs both MySQL and a working Payload media
backend. A report without a photo does not call the Payload upload API.

## Demo walkthrough

1. Use **Sightings Map** to search by place or region and filter by dates, region
   or species. Select a map marker to inspect its reports.
2. Switch between sightings and reported-density views. **Reset view** restores
   the UK overview. Zooming out and panning are constrained to the UK area;
   neighbouring countries can still be visible around the UK.
3. Open **Charts & Trends**. The UK and location charts use bars; the regional
   chart uses a line. Each chart has independent year arrows and initially
   selects its latest available reporting year.
4. Open **Field Guide** for prevention advice, read-aloud and accessibility
   preferences. Read-aloud depends on browser/device speech support; a recognised
   UK female voice is preferred when available. Text size and high-contrast
   preferences are stored in the current browser when storage is available.
5. Open **About Ticks** to browse identification cards, up to four per page.
6. Submit a community sighting when MySQL is available. Include a photo only
   when the Payload media backend is configured too.

London is the preferred initial selection when a location named London appears
in the loaded filtered results. Otherwise, the first matching report is selected.
A shared `?sighting=...` link selects its report when that record is in the loaded
results; an unavailable record produces a notice.

Regional and location charts follow the selected report's region and exact
location. Their requests omit the map's date and species filters. Each chart
then groups its loaded reports by month for its own selected year, including
zero-count months. A year with no loaded reports is shown as empty rather than
skipped. Map date/species filters do not directly restrict these chart totals.

## Project structure and generated files

- `src/app/(frontend)/` — pages, UI and the sightings/insights API routes.
- `src/lib/` — data access, validation, normalization and shared utilities.
- `src/collections/` and `src/payload.config.ts` — existing Payload setup.
- `src/app/(payload)/` — Payload admin and API routes, including `/admin`.
- `img/` — the two pet photos used by the website.
- `scripts/` — MySQL setup utility.
- `tests/` — API, storage, accessibility and browser regression checks.
- `server/` — optional NestJS compatibility proxy. The Next.js API is the
  primary backend; this proxy is unnecessary for the normal frontend demo.
- `dist-server/` — compiled proxy used by `pnpm server:start`; regenerate it
  with `pnpm server:build` after changing proxy source.
- `.next/` — generated Next.js cache/build output, already ignored by Git. Stop
  the server before deleting it; `pnpm dev` or `pnpm build` recreates it.
- `node_modules/` — installed dependencies, already ignored by Git. Restore with
  `pnpm install --frozen-lockfile` if removed.

The optional proxy needs `NEXT_BACKEND_URL` set to the Next.js origin. It listens
on `API_PORT` (default 4000). Its sightings routes are `/api/sightings` and
`/api/sightings/insights`; the direct Next.js insights route is `/api/insights`.

`.figma` deployment files have been removed. `README.md` is the only Markdown
file maintained in the project source. `agentRules: false` in `next.config.ts`
prevents Next.js from recreating `AGENTS.md`. Dependencies and framework caches
may contain their own documentation.

## Verify before a demo

Check both TypeScript projects:

```sh
mise exec -- pnpm exec tsc --noEmit
mise exec -- pnpm exec tsc -p server/tsconfig.json --noEmit
```

With the development server running, check the HTTP responses (adjust the port
if needed):

```sh
curl -sS -o /dev/null -w 'Homepage HTTP %{http_code}\n' http://localhost:3000/
curl -sS -o /dev/null -w 'Sightings HTTP %{http_code}\n' http://localhost:3000/api/sightings
curl -sS -o /dev/null -w 'Insights HTTP %{http_code}\n' http://localhost:3000/api/insights
```

HTTP 200 on a data endpoint can still mean only one source is available. Inspect
`meta.localAvailable`, `meta.externalAvailable` and `meta.truncated` in the JSON
response or check the UI's notices before demonstrating live data.

API and storage regression checks use the installed project dependencies:

```sh
mise exec -- node tests/p0-api.cjs
mise exec -- node tests/p1-api.cjs
mise exec -- node tests/p1-storage.cjs
```

These three scripts use mocks; they do not verify live MySQL or Payload services.
Browser regression scripts additionally require Playwright and a Chrome browser
in the test environment. Playwright is **not** declared in this project's
`package.json`; make it available through your test setup before running, for
example, `node tests/accessibility-browser.cjs` with the app running. Some browser
scripts use fixed localhost port 3000 and older scripts may retain expectations
from earlier UI versions.

The local demo uses `pnpm dev`. `pnpm build` invokes `payload build` and needs the
existing Payload backend environment. `pnpm start` invokes `next start`; the
configuration requests standalone output, so a production deployment may instead
need the generated standalone server and its assets. Production startup is not
verified by the local demo checks above.
