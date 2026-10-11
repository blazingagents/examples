# Testing the examples

Run from the repository root with Node.js 24+ and `uv` installed:

```sh
npm ci
npx playwright install chromium
npm test
```

Linux CI installs Chromium's system dependencies with
`npx playwright install --with-deps chromium`. `npm run check` also runs every
example's type checks, lint, and production build.

The Vitest suite starts the actual Next.js, TanStack Start, Express, FastAPI,
Hono, and Wrangler servers. It uses temporary SQLite/D1 databases and randomly
allocated ports, and removes its processes and databases after the run.
Playwright drives each of the five browser applications.

Local HTTP fixtures implement BA's chat, generation, and Session fork responses.
Tests use the published BA SDKs and AI SDK hooks. The Session fork CLI uses
SDK 0.22.0 and Python SDK 0.15.0. These tests catch errors in
routing, authentication, session ownership across server restarts, headers,
stream handling, and structured output validation. Browser journeys also cover
reload/resume, regeneration, starting a new Session, errors, and Stop without
automatically resending work. The upstream fixture requires canonical `messages`
chat bodies and one streamed `/tool-approvals/continue` request per approval round.
All six relays test current-round decisions, ownership, and settled conflicts.
They require no BA account or model credentials and never load a development
BA API key into requests.

These tests do not verify a deployed BA API, model quality, Cloudflare deployment,
or production identity providers. Before deploying an app, also follow its
README with a published Agent and a real Provider, and replace the demo token
mapping with your application's authentication.

Wrangler's local proxy observes a disconnected reader when it next writes a
chunk. The cancellation fixture therefore streams heartbeat chunks; cancellation
during an idle upstream response is not covered.

## Coverage

`npm run test:coverage` runs the suite with `EXAMPLES_COVERAGE_DIR` set, which
makes the spawn helpers give every child `NODE_V8_COVERAGE` and the
`tests/coverage/flush.mjs` preload — servers stopped by SIGTERM still write V8
coverage. `tests/coverage/normalize.mjs` then flattens sectioned source maps
and absolutizes map sources so `c8` can remap bundled framework output to the
authored files, enforcing 99% lines, branches, functions, and statements on:

- `vite-express-ai-sdk/server.ts`
- `vite-express-ai-sdk/server/relay.ts`
- `vite-hono-ai-sdk/src/server.ts`
- `structured-output/main.ts`
- `session-fork/main.ts`
- `nextjs-ai-sdk/lib/server.ts`
- `tanstack-start-ai-sdk/src/server/relay.server.ts`

The first five Node executes directly with `--experimental-strip-types`, which
preserves source offsets. The framework files are measured through their
production servers — `next start` and `vite preview`, whose server builds ship
flat source maps that remap to the authored code. Dev-mode output cannot be
measured reliably: Turbopack duplicates modules per route bundle with
inconsistent remap fidelity, and Vite's module runner hides its source maps
behind a nonstandard `sourceMa` comment.

Run `npm run build` first: `next start`, `vite preview`, and a
production-static check all serve built output. Reports land in `coverage/node`
(text table plus `coverage-summary.json`).

### Browser

The Playwright journeys collect Chromium JavaScript coverage when
`EXAMPLES_COVERAGE_DIR` is set: `page.coverage.startJSCoverage()` before the
first navigation, one JSON dump per page reload into `coverage/browser/raw`
(navigation discards coverage for already-loaded scripts, so the test flushes a
segment before each reload). `tests/coverage/browser.mjs` remaps each entry
through `v8-to-istanbul` — Vite dev modules carry inline `data:` maps;
`vite preview`'s built chunks carry sibling `.js.map` files — merges them into
an Istanbul map, adds zero entries for included files the page never loaded,
and enforces 99% lines, branches, functions, and statements on:

- `tanstack-start-ai-sdk/src/routes/index.tsx`
- `vite-express-ai-sdk/src/App.tsx`
- `vite-hono-ai-sdk/src/App.tsx`
- `vite-fastapi-ai-sdk/src/App.tsx`

Mounting-only UI files stay excluded: `main.tsx`, `__root.tsx`, `router.tsx`,
`app/layout.tsx`, and `index.html`. `nextjs-ai-sdk/app/page.tsx` is also
excluded: no production build remaps its client code honestly. With the
default Turbopack build the map yields an empty function map and a
provably-executed `{completion.error && <p>}` consequent still reports zero
executions (post-reload scripts lose inner block ranges, so operands executed
after navigation can never be counted); a `next build --webpack` fixes client
remapping but ships degenerate *server* maps, which would silently degrade the
Node-side `lib/server.ts` gate instead.

Reports land in `coverage/browser` (text table, `coverage-final.json`, and
`coverage-summary.json`) and are separate from the Node scope.

### Python

When `EXAMPLES_COVERAGE_DIR` is set, the spawn helpers also pass children
`COVERAGE_FILE=<dir>/python/raw/.coverage` and
`COVERAGE_PROCESS_START=tests/coverage/python.coveragerc`. The coverage.py
`.pth` shim (installed via `--with coverage==7.16.2` in the FastAPI
`start:test` command and the inline session-fork `uv run`) then auto-starts
coverage in every measured Python process; `parallel = true` gives each
process its own data file and `sigterm = true` plus uvicorn's graceful
shutdown write data for SIGTERM-stopped servers. `tests/coverage/python.mjs`
runs `coverage combine`, prints the text report, writes
`coverage/python/coverage-final.json` and `report.txt`, and enforces 99%
statements and branches per file on:

- `vite-fastapi-ai-sdk/backend/main.py`
- `session-fork/main.py`

### Workerd

`cloudflare-worker-relay/src/index.ts` is not measured: workerd's DevTools
inspector does not implement `Profiler.startPreciseCoverage`. Connecting to
the inspector exposed by `wrangler dev --inspector-port` (wrangler 4.143.0,
workerd 2026-09-26) works — `Debugger.enable` returns a `debuggerId` and
`Debugger.scriptParsed` events report the bundled
`.wrangler/tmp/dev-*/index.js` plus its source map — but `Profiler.enable`
is only echoed back without enabling the agent, and
`Profiler.startPreciseCoverage` then fails with
`{"code":-32000,"message":"Profiler is not enabled"}`. workerd intercepts
the `Profiler` domain to provide its own CPU profiler
(`Profiler.start`/`stop`), so V8's coverage agent stays disabled; see
upstream issue cloudflare/workerd#2065.
