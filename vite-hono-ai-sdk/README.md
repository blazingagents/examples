# Blazing Agents + Vite + Hono

The relay supports one streamed approval continuation. The sample UI has no approval controls.

A minimal React client using AI SDK hooks and a Hono relay running on Node.js.
The browser receives only application bearer tokens. The Blazing Agents API key
stays in the backend environment.

Hono calls Blazing Agents as the signed-in user through
`client.forUser(userId)`. On a user's first request, Hono creates an Agent for
that user, which comes with its own Workspace. The API answers 404 for a
Session that the user does not own.

## Run

Set a Full API key (`ba_full_…`), a Provider ID, and a model in `.env`. The
relay creates Agents, so a read-only key does not work here. From this
directory:

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
The Agents this relay creates use the default `full` chat approval policy.
See [backend functions](https://docs.blazingagents.com/agents/tools/backend-functions)
for approval resume, cancellation, and application identity.

`useChat` stores the server-minted Session ID in `localStorage`, so a reload
resumes it. **New session** clears the browser's current Session ID.
Streaming errors appear in the page, and both chat and completion expose a
cancel button whose abort signal reaches Blazing Agents.

The Vite dev server proxies `/api` to Hono on port `8787`. To run only the
backend, for example from an integration test, set `PORT` and use:

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
