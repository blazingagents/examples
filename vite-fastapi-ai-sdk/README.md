# Vite + FastAPI + AI SDK

The relay supports one streamed approval continuation. The sample UI has no approval controls.

This example pairs a small React and Vite UI with a FastAPI relay built on the Blazing Agents Python SDK. The browser uses an application token. FastAPI maps it to a trusted user ID, keeps the Blazing Agents key on the server, and calls Blazing Agents as that user through `client.for_user(user_id)`. On a user's first request, FastAPI creates an Agent for that user, which comes with its own Workspace. The API answers 404 for a Session that the user does not own.

## Run locally

Python 3.12+ and Node.js 24+ are required. Set a Full API key (`ba_full_…`), a Provider ID, and a model in `.env`. The backend creates Agents, so a read-only key does not work here.

```sh
cd examples/vite-fastapi-ai-sdk
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env, then export it into the shell:
set -a && source .env && set +a
npm install
npm run dev
```

Open `http://localhost:5173` and enter either configured application token. The Vite development proxy sends `/api` requests to FastAPI on port 8000. The first chat creates a Session. The browser saves its ID in `localStorage` and resumes it after reload. `New Session`, `Regenerate`, and `Stop` for chat and `Cancel` for completion demonstrate lifecycle and stream cancellation. Relay and streaming failures appear next to their form.

Ask "How much is shipping to the US?" to call the backend's `shippingQuote`
function. Its sample rates return GBP 14.99 for the US and GBP 4.99 for GB.
The Agents this backend creates use the default `full` chat approval policy.
See [backend functions](https://docs.blazingagents.com/agents/tools/backend-functions)
for approval resume, cancellation, and application identity.

To run only the backend, for example from an integration test:

```sh
PORT=8000 npm run start:test
```

For separate frontend and backend deployments, set `VITE_API_BASE_URL` when building the UI and include its exact origin in `ALLOWED_ORIGINS`. Replace the two-token demonstration mapping with your application's authenticated session lookup in production.

Never expose `BLAZING_AGENTS_API_KEY` through `VITE_*`, frontend source, or responses.

Failed or stopped chats require an explicit resend. Reload restores the Session ID without restarting work.
