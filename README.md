# UK Tick Sighting Explorer

Explore and report tick sightings across the UK.

## Local setup

Run these commands from the project folder. On macOS, the first command requires
Homebrew; skip it if Mise is already installed.

```sh
brew install mise
mise trust .mise.toml
mise install
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev
```

The version checks should print Node `v24.22.1` and pnpm `10.34.9`.
Open http://localhost:3000 (or the port specified by `PORT`). Keep the terminal
open while using the app; press Ctrl+C to stop the server.

- `mise install` installs the tool versions pinned in `.mise.toml`.
- `mise exec --` runs a command using those tools instead of the global versions.
- `pnpm install --frozen-lockfile` installs dependencies using the existing lockfile.
- `pnpm dev` starts the development server.

For subsequent starts, run:

```sh
mise exec -- pnpm dev
```

The sightings API requires MySQL. Payload Admin separately requires the
Figma-managed backend environment; do not add dummy backend secrets.
Inside Figma Make, the development server starts automatically.

## Verification

Check TypeScript:

```sh
mise exec -- pnpm exec tsc --noEmit
```

With the development server running, check the homepage and data endpoints from
another terminal (adjust the port if needed):

```sh
curl -sS -o /dev/null -w 'Homepage HTTP %{http_code}\n' http://localhost:3000/
curl -sS -o /dev/null -w 'Sightings HTTP %{http_code}\n' http://localhost:3000/api/sightings
curl -sS -o /dev/null -w 'Insights HTTP %{http_code}\n' http://localhost:3000/api/insights
```

## Startup repair history

The original shell used Node 22 and pnpm 12, while the project required Node 24
and pnpm 10. The dependency install failed on pnpm's release-age check, leaving
the `next` executable unavailable.

These repair commands were run first:

```sh
brew install mise
mise trust .mise.toml
mise install
mise install npm:pnpm@10.34.3 --verbose
```

The last two commands encountered a provenance failure for the original pnpm
10.34.3 pin. This is historical diagnostic information, not a setup step to
repeat. Both `.mise.toml` and `package.json` were then updated to pnpm 10.34.9,
which passed the installer's checks. The successful commands followed:

```sh
mise install
mise exec -- node --version
mise exec -- pnpm --version
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm exec tsc --noEmit
mise exec -- pnpm dev
```

Dependencies installed successfully, TypeScript passed, and the homepage and
both data endpoints returned HTTP 200. Production deployment and Payload Admin
were not verified.

See [LOCAL-SETUP.md](LOCAL-SETUP.md) for the complete ordered command history,
including registry queries and other diagnostic commands.
