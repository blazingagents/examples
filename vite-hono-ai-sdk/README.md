# Blazing Agents + Vite + Hono

A minimal React client using AI SDK hooks and a Hono relay running on Node.js.
The browser receives only application bearer tokens. The Blazing Agents API key
stays in the backend environment.

## Run

From this directory:

```sh
npm install
cp .env.example .env
set -a; source .env; set +a
npm run dev
```

Open <http://localhost:5173> and enter either configured `APP_USER_A_TOKEN` or
`APP_USER_B_TOKEN`. These are application login stand-ins, not Blazing Agents
credentials. In production, replace them with your normal authentication and
derive the trusted `userId` from its verified server-side identity.

`useChat` stores the server-minted Session ID in `localStorage`, so a reload
resumes it. Hono checks the durable SQLite ownership record before every resume
or regeneration. **New session** clears the browser's current Session ID.
Streaming errors appear in the page, and both chat and completion expose a
cancel button whose abort signal reaches Blazing Agents.

The Vite dev server proxies `/api` to Hono on port `8787`. To run only the real
backend (including for an integration harness), set `PORT` and use:

```sh
set -a; source .env; set +a
PORT=8788 npm run start:test
```

Build and type-check with:

```sh
npm run typecheck
npm run build
```
