# TickWatch UK — UK Tick Sighting Explorer

A local demo for exploring and reporting UK tick sightings. Built with Next.js,
React, Tailwind CSS and Leaflet, with MySQL for community reports.

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
press Ctrl+C to stop it. Set `PORT` if another port is needed.

For subsequent starts:

```sh
mise exec -- pnpm dev
```

If your shell already uses the pinned Node.js and pnpm versions, `pnpm dev`
is sufficient.

## Data and demo requirements

- The app reads the Elanco educational tick-sightings API, so external reports
  require an internet connection. Map tiles also require internet access.
- Community reports require a running MySQL server. The server reads
  `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` and `MYSQL_DATABASE`.
  Configure credentials privately in the server environment; never commit them.
- The database defaults to `dataWatch` on localhost. Use the existing database
  for the demo. For initial database setup, run `mise exec -- pnpm db:setup`
  after configuring MySQL; this creates tables and may seed starter reports.
- Source availability notices identify partial failures. If both data sources
  are unavailable, the app displays an error instead of fabricated reports.
- Optional report-photo uploads and the Payload admin still depend on the
  existing Payload backend configuration. The required Payload packages and
  image loader remain in the project; removing the `.figma` deployment folder
  does not replace those services.

## Demo walkthrough

1. Explore the UK map, search or filter reports, and select a location.
2. Switch between sightings and density views; use **Reset view** after zooming.
3. Browse UK, regional and location charts using their independent year arrows.
4. Open the Field Guide and try read-aloud or accessibility preferences.
5. Browse the identification cards, four at a time.
6. Submit a community sighting when MySQL is available. Photo uploads also need
   the configured Payload media backend.

London is the preferred initial selection when a London record is available.
Explicit shared sighting links select their linked report.

## Project structure

- `src/app/(frontend)/` — pages, UI and the sightings/insights API routes.
- `src/lib/` — data access, validation, normalization and shared utilities.
- `src/collections/` and `src/payload.config.ts` — existing Payload setup.
- `src/app/(payload)/` — Payload admin and API routes.
- `img/` — the two pet photos used by the website.
- `scripts/` — MySQL setup utility.
- `tests/` — API, storage, accessibility and browser regression checks.
- `server/` — optional NestJS compatibility proxy; the Next.js API is the
  primary backend. The proxy requires `NEXT_BACKEND_URL`.
- `dist-server/` — compiled proxy used by `pnpm server:start`; regenerate it
  with `pnpm server:build` after changing proxy source.

`.figma` deployment files have been removed. `README.md` is the only Markdown
file maintained in the project source. Dependencies and framework caches may
contain their own documentation.

## Verify before a demo

```sh
mise exec -- pnpm exec tsc --noEmit
mise exec -- pnpm exec tsc -p server/tsconfig.json --noEmit
```

With the development server running:

```sh
curl -sS -o /dev/null -w 'Homepage HTTP %{http_code}\n' http://localhost:3000/
curl -sS -o /dev/null -w 'Sightings HTTP %{http_code}\n' http://localhost:3000/api/sightings
curl -sS -o /dev/null -w 'Insights HTTP %{http_code}\n' http://localhost:3000/api/insights
```

Browser regression scripts require Playwright and Chrome in the test environment.
For example, run `node tests/accessibility-browser.cjs` with the app running.
Production build/start commands are `pnpm build` and `pnpm start`; the build
requires the existing Payload backend environment.
