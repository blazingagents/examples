# Vite + FastAPI + AI SDK

Uses `@blazingagents/sdk` 0.20.0. The backend uses `blazing_agents` 0.14.0. The relay supports one streamed approval continuation; the sample UI has no approval controls.

This example pairs a small React/Vite UI with a FastAPI relay built on the Blazing Agents Python SDK. The browser uses an application token; FastAPI maps it to a trusted user ID, keeps the Blazing Agents key server-side, and persists Session ownership in SQLite.

## Run locally

Python 3.12+ and Node.js 24+ are required.

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

Open `http://localhost:5173` and enter either configured application token. The Vite development proxy sends `/api` requests to FastAPI on port 8000. The first chat creates a Session; its ID is saved in `localStorage`, authorized through SQLite, and resumed after reload. `New Session`, `Regenerate`, and `Stop` for chat and `Cancel` for completion demonstrate lifecycle and stream cancellation. Relay and streaming failures appear next to their respective form.

Ask "How much is shipping to the US?" to call the backend's `shippingQuote`
function. Its sample rates return GBP 14.99 for the US and GBP 4.99 for GB.
Use the agent's default `full` chat approval policy for this example.
See [backend functions](https://docs.blazingagents.com/agents/tools/backend-functions)
for approval resume, cancellation, and application identity.

To run only the backend (including from the repository integration harness):

```sh
PORT=8000 npm run start:test
```

For separate frontend/backend deployments, set `VITE_API_BASE_URL` when building the UI and include its exact origin in `ALLOWED_ORIGINS`. Replace the two-token demonstration mapping with your application's authenticated session lookup in production.

Never expose `BLAZING_AGENTS_API_KEY` through `VITE_*`, frontend source, or responses.

Failed or stopped chats require an explicit resend. Reload restores the Session ID without restarting work.
