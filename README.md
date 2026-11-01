> **Author:** [Anini Pandiyan Sathya](https://www.linkedin.com/in/aninisrinivasan/)

# TickWatch UK — UK Tick Sighting Explorer

Explore and report UK tick sightings using a self-contained Next.js backend.
Community reports are stored in MySQL. Uploaded photos are processed with Sharp,
stored on the backend filesystem and served through the app's photo API.

## Tech stack

Versions reflect the project manifest and tool configuration.

| Layer | Technologies | Role |
| --- | --- | --- |
| Frontend | Next.js 16.4.2, React 19.3.1, TypeScript 6.0.3 | Pages, interactive UI and typed application logic |
| Styling | Tailwind CSS 4, PostCSS, custom CSS | Responsive layouts and accessibility preferences |
| Maps | Leaflet 1.9, Leaflet.heat, OpenStreetMap tiles | Sighting markers, density heatmap and location picker |
| Charts | React, CSS and SVG | Monthly bar charts and regional line chart |
| Backend | Next.js Route Handlers, Node.js; optional NestJS 12 proxy | Report validation, uploads, data queries and insights |
| Database | MySQL, mysql2 | Community sightings and photo references |
| Image processing | Sharp | Image validation, resizing and WebP conversion |
| Photo storage | Node.js filesystem | Persistent uploaded photos served through the photo API |
| Accessibility | Web Speech API, browser localStorage | Read-aloud and saved display preferences |
| Development | Node.js 24.22.1, pnpm 10.34.9, Mise, Oxfmt | Runtime, dependencies and formatting |
| Regression checks | Node.js assertions; Playwright in a separate test setup | API, storage and browser checks |
| AI-assisted coding | AI coding assistance | Used during project development |

## Features

- Search sightings by place and filter by date, region or species.
- Explore a UK map with markers, a density heatmap and shareable sighting links.
- See a mild orange text notice above the map when reports have incomplete
  coordinates and cannot be mapped.
- Compare monthly reports for a selected location, region and the UK using
  independent year controls.
- Report sightings with optional coordinates, field notes and a photo.
- Browse tick identification cards and a field guide with read-aloud controls.
- Adjust text size and contrast, and see notices when a data source is unavailable.

## Run locally

Install the versions pinned in `.mise.toml`, then install dependencies:

```sh
mise trust .mise.toml
mise install
mise exec -- pnpm install --frozen-lockfile
```

Start a MySQL server and copy the environment template:

```sh
cp .env.example .env.local
```

Update `.env.local` with your MySQL credentials. Initialize the database and start
both the frontend and its backend API with one development server:

```sh
mise exec -- pnpm db:setup
mise exec -- pnpm dev
```

Open **http://localhost:3000**. Use `PORT=3001 mise exec -- pnpm dev` for a different
port. Press Ctrl+C to stop the server. If your shell already uses the pinned Node
and pnpm versions, omit `mise exec --` from these commands.

## Backend configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MYSQL_HOST` | `127.0.0.1` | Database host |
| `MYSQL_PORT` | `3306` | Database port |
| `MYSQL_USER` | `root` | Database user |
| `MYSQL_PASSWORD` | Empty | Database password |
| `MYSQL_DATABASE` | `dataWatch` | Database name |
| `SIGHTING_PHOTO_DIRECTORY` | `.data/sighting-photos` under the working directory | Uploaded WebP directory |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Public site origin used in page metadata |
| `PORT` | `3000` | App server port |

Next.js and `pnpm db:setup` load `.env.local`. Keep credentials in your local
environment; `.env.local` is ignored by Git.

On first access, the backend creates the database and sightings table if absent,
allows nullable coordinates, adds missing photo columns, and inserts four demo
sightings using fixed IDs and `INSERT IGNORE`. The setup script prepares the same
table and photo columns. Existing reports are preserved. The database account
needs the corresponding creation, alteration, read and write permissions.

New reports are saved with `pending` status and are included in the current list
query. This app does not include an authenticated moderation dashboard.

### Photo uploads

Reports accept JPEG, PNG or WebP photos up to 5 MiB. Sharp validates the image,
corrects orientation, resizes it to fit within 2560 × 2560 without enlargement,
and converts it to WebP. The backend saves it with a generated filename, then
stores its URL and dimensions with the report in MySQL. If saving the report
fails, the new photo is removed.

Photos are served from `/api/sighting-photos/[filename]`. The `.data/` directory
is ignored by Git. Back up MySQL and the photo directory together. Keep the photo
directory between restarts and deployments; multiple app instances must use the
same persistent directory. Existing remote photo URLs in saved reports remain
unchanged and still depend on their original host.

Coordinates are optional. Supply both latitude and longitude or leave both blank.
Reports without coordinates contribute to lists and charts but have no map marker
or directions link. A plain text notice above the map shows the number of reports
with incomplete coordinates in mild orange. The notice remains available to screen
readers and follows the high-contrast display preference.

### External reports

The app reads educational sightings from
`https://dev-task.elancoapps.com/data/tick-sightings`. This feed and OpenStreetMap
tiles need internet access. External results are cached for 15 minutes in the
server process; restarting clears this cache.

Community and external data load independently. The UI shows a partial-source
notice if one fails. Data endpoints return HTTP 503 if both fail. Each source is
limited to 10,000 records, with a truncation notice when results are incomplete.
Counts describe reports, not estimated tick populations.

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sightings` | Filtered sightings and source metadata |
| `POST` | `/api/sightings` | Submit a JSON report or a multipart report with a `photo` file |
| `GET` | `/api/insights` | Aggregated reporting totals and trends |
| `GET` | `/api/sighting-photos/[filename]` | Serve an uploaded WebP photo |

Sightings and insights accept `from`, `to`, `region`, `species` and `q` query
parameters. Dates use `YYYY-MM-DD`.

Reports require `observedAt`, `locationName`, `region`, `species` and `severity`.
Optional fields are `latitude`, `longitude`, `notes` and a multipart `photo`.
Supported report species are `sheep`, `hedgehog`, `ornate-cow` and `unknown`;
activity levels are `low`, `moderate` and `high`.

### Optional NestJS proxy

The Next.js server owns the database, validation and photo storage. The existing
NestJS service provides compatibility routes for clients that need a separate
API origin. Start it alongside Next.js:

```sh
mise exec -- pnpm server:build
NEXT_BACKEND_URL=http://localhost:3000 mise exec -- pnpm server:start
```

It listens on `API_PORT` (default 4000). Set `FRONTEND_ORIGIN` to restrict its CORS
origin. Its routes are `/api/sightings` and `/api/sightings/insights`. It forwards
JSON reports; send multipart photo uploads directly to the Next.js API.

## Page behaviour

**Reset view** returns the map to the full UK overview in both sightings and
density modes. If a zoom animation is running, the reset takes effect when it
finishes. Search and report filters stay selected.

London is the preferred initial selection when a matching location named London
exists. Otherwise, the first matching report is selected. Shared `?sighting=...`
links select a loaded report or show a notice if it is unavailable.

The UK and location charts use bars; the region chart uses a line. Each chart has
independent year controls and starts with its latest reporting year. Location
and region charts follow the selected report, independently of the map's date
and species filters. All twelve months appear, including zero-count months.

The field guide supports browser read-aloud, preferring a recognised UK female
voice when available. Display preferences are saved in the current browser.

## Project structure

- `src/app/(frontend)/` — pages, UI and backend API routes.
- `src/lib/` — MySQL access, photo storage, validation and data processing.
- `scripts/setup-mysql.mjs` — database initialization and upgrades.
- `server/` — optional NestJS compatibility proxy.
- `dist-server/` — compiled proxy; regenerate with `pnpm server:build` after edits.
- `tests/` — API, database, accessibility and browser regression checks.
- `img/` — photos used by the website.
- `.data/sighting-photos/` — uploaded photos, ignored by Git.
- `.next/` and `node_modules/` — generated build output and installed dependencies.

## Verification

```sh
mise exec -- pnpm test:api
mise exec -- pnpm exec tsc --noEmit
mise exec -- pnpm exec tsc -p server/tsconfig.json --noEmit
mise exec -- pnpm build
```

API checks mock MySQL and the external feed, and use a temporary photo directory.
They cover multipart boundary handling, validation, photo uploads and serving,
and cleanup after failed saves. They do not verify a live MySQL connection.

Browser scripts require Playwright and a Chrome browser in your test environment.
Playwright is not declared in `package.json`. Some scripts use fixed localhost
port 3000, and older scripts may retain expectations from earlier UI versions.

## Production

Set your database credentials, `NEXT_PUBLIC_SITE_URL` and an absolute
`SIGHTING_PHOTO_DIRECTORY` pointing to persistent writable storage. Then run:

```sh
mise exec -- pnpm build
mise exec -- pnpm start
```

The Next.js server runs the frontend and backend together. Keep MySQL running and
preserve the photo directory across deployments.
