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
the included SDK 0.22.0 and Python SDK 0.15.0 artifacts. These tests catch errors in
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
