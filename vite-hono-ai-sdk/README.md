# Blazing Agents + Vite + Hono

Uses `@blazingagents/sdk` 0.20.0. The relay supports one streamed approval continuation; the sample UI has no approval controls.

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

Ask "How much is shipping to the US?" to call the backend's `shippingQuote`
function. Its sample rates return GBP 14.99 for the US and GBP 4.99 for GB.
Use the agent's default `full` chat approval policy for this example.
See [backend functions](https://docs.blazingagents.com/agents/tools/backend-functions)
for approval resume, cancellation, and application identity.

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

Failed or stopped chats require an explicit resend. Reload restores the Session ID without restarting work.
