# Local development

The project uses Node 24.22.1 and pnpm 10.34.9, pinned in `.mise.toml`.
`package.json` also pins pnpm so package-manager selection is consistent.

Mise and both tools have been installed on this Mac. From this directory, run:

```sh
mise exec -- pnpm dev
```

Open http://localhost:3000. Keep the terminal open; Ctrl+C stops the server.
`mise exec --` selects the project's tools even if the shell still defaults to
Node 22 and pnpm 12. There is no need to change the global tools.

For a fresh installation on a Mac with Homebrew:

```sh
brew install mise
mise trust .mise.toml
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm dev
```

The existing sightings API requires MySQL. Payload Admin separately depends on
the Figma-managed backend environment. Do not substitute dummy backend secrets.

## Repair results

- Installed Mise and Node 24.22.1.
- The original pnpm 10.34.3 pin failed Mise's trust check because its registry
  metadata lacked provenance available on earlier releases. Changed both pins
  to patch release 10.34.9, which passed the installer checks.
- Installed all 731 locked packages successfully without rewriting the lockfile.
- No release-age or trust-policy exceptions were added. pnpm 10 uses different
  default release-age behavior from pnpm 12.
- `mise exec -- pnpm exec tsc --noEmit` passed.
- Development startup succeeded; `/`, `/api/sightings`, and `/api/insights`
  returned HTTP 200. Insights reported four sightings.
- Production deployment and Payload Admin were not verified. The Figma CLI and
  required Payload skill were unavailable in this local environment.

## Commands run, in order

These are the shell commands from the repair turn, including diagnostic and
failed commands. Configuration/document edits used the editor tool, not shell
commands. Polling running processes did not execute additional shell commands.

1. Inspect tool versions and project configuration; search for required skills:

   ```sh
   pwd
   command -v mise
   command -v node
   node --version
   command -v pnpm
   pnpm --version
   cat package.json
   cat .mise.toml
   cat pnpm-workspace.yaml
   rg --files --hidden -g '*SKILL.md' -g '!node_modules' -g '!.git' /Users/aninisrinivasan/.codex /Users/aninisrinivasan/Downloads/UK-Tick-Sighting-Explorer-v3 2>/dev/null | rg 'payload-framework|nextjs-docs'
   ```

2. Check installed executables, app configuration, and registry connectivity
   (the sandboxed registry request failed DNS resolution):

   ```sh
   ls /opt/homebrew/bin/mise /opt/homebrew/bin/brew /opt/homebrew/opt/node/bin/node /Users/aninisrinivasan/.local/bin/mise 2>/dev/null
   ls node_modules/.bin/next node_modules/.bin/tsc 2>/dev/null
   cat next.config.ts
   cat 'src/app/(frontend)/layout.tsx'
   curl -I --max-time 15 https://registry.npmjs.org/pnpm
   ```

3. Confirm pinned versions exist, with network access:

   ```sh
   npm view pnpm@10.34.3 version
   npm view node@24.22.1 version
   npm view next@16.4.2 version
   npm view @payloadcms/figma@1.0.0-beta.1 version
   ```

4. Add the initial package-manager pin using the editor, then install Mise:

   ```sh
   brew install mise
   ```

   Homebrew also performed its automatic update.

5. Trust the inspected project configuration and install tools (Node succeeded;
   the original pnpm pin failed):

   ```sh
   mise trust .mise.toml && mise install
   ```

6. Inspect Mise options and lockfile presence:

   ```sh
   mise settings ls | rg 'npm|aube'
   mise install --help | head -45
   ls -l mise.lock .mise.lock 2>/dev/null
   ```

7. Diagnose pnpm installation (reported the provenance/trust failure):

   ```sh
   mise install npm:pnpm@10.34.3 --verbose
   ```

8. Compare release metadata and available versions:

   ```sh
   npm view pnpm@10.34.3 dist repository gitHead --json
   npm view pnpm@10.20.0 dist repository gitHead --json
   npm view pnpm@10 version
   npm view pnpm@10.34.9 dist.attestations --json
   npm view pnpm@10.33.4 dist.attestations --json
   npm view pnpm@10.32.1 dist.attestations --json
   ```

9. Change both pnpm pins to 10.34.9 using the editor, then install successfully:

   ```sh
   mise install
   ```

10. Confirm versions and install dependencies successfully:

    ```sh
    mise exec -- node --version
    mise exec -- pnpm --version
    mise exec -- pnpm install --frozen-lockfile
    ```

11. Check port availability and TypeScript:

    ```sh
    lsof -nP -iTCP:3000 -sTCP:LISTEN
    mise exec -- pnpm exec tsc --noEmit
    ```

12. Start the development server:

    ```sh
    mise exec -- pnpm dev
    ```

13. Request the homepage:

    ```sh
    curl -sS --max-time 45 -o /tmp/tickwatch-home.html -w 'Homepage HTTP %{http_code}\n' http://localhost:3000/
    ```

14. Request the data endpoints:

    ```sh
    curl -sS --max-time 20 -o /tmp/tickwatch-sightings.json -w 'Sightings HTTP %{http_code}\n' http://localhost:3000/api/sightings
    curl -sS --max-time 20 -o /tmp/tickwatch-insights.json -w 'Insights HTTP %{http_code}\n' http://localhost:3000/api/insights
    ```

15. Inspect response summaries and check for the Figma CLI/Mise lockfiles:

    ```sh
    node -e 'const fs=require("fs"); for (const name of ["sightings","insights"]) { const p="/tmp/tickwatch-"+name+".json"; if(fs.existsSync(p)) { try { const v=JSON.parse(fs.readFileSync(p,"utf8")); console.log(name, JSON.stringify(v).slice(0,700)); } catch { console.log(name,"Response is not JSON"); } } }'
    command -v figma
    ls -l mise.lock .mise.lock 2>/dev/null
    ```
