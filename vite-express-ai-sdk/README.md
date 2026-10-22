# Vite + Express + AI SDK

The relay supports one streamed approval continuation. The sample UI has no approval controls.

This example runs a React and Vite UI and an Express relay on one Node server. The browser sends an application bearer token. Express derives the trusted user ID and calls Blazing Agents as that user through `client.forUser(userId)`. On a user's first request, Express creates an Agent for that user, which comes with its own Workspace. The API answers 404 for a Session that the user does not own. The Blazing Agents API key never reaches browser code.

Requires Node.js 24 or newer. Set a Full API key (`ba_full_…`), a Provider ID, and a model in `.env`. The relay creates Agents, so a read-only key does not work here. From this directory:

```sh
cp .env.example .env
npm install
node --env-file=.env --run dev
```

Open `http://127.0.0.1:3000`, enter either configured application token, and send a chat or completion. The first chat saves its server-minted Session ID to `localStorage`. Later turns and page reloads resume it. `New session` starts over, and `Regenerate` retries the last Session turn. `Stop` aborts chat and `Cancel` aborts completion. Relay and streaming errors appear in the page.

For a production build:

```sh
npm run build
node --env-file=.env --run start
```

Replace the two-token demo authentication with your application's session verification in production. Keep `BLAZING_AGENTS_API_KEY` on the server. Never put it in `VITE_*` or browser code.

Failed or stopped chats require an explicit resend. Reload restores the Session ID without restarting work.
