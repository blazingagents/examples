# Vite + Express + AI SDK

This example runs a React/Vite UI and an Express relay on one Node server. The browser sends an application bearer token; Express derives the trusted user ID and durably authorizes each Blazing Agents Session through SQLite. The Blazing Agents API key never reaches browser code.

Requires Node.js 24 or newer. From this directory:

```sh
cp .env.example .env
npm install
node --env-file=.env --run dev
```

Open `http://127.0.0.1:3000`, enter either configured application token, and send a chat or completion. The first chat saves its server-minted Session ID to `localStorage`; later turns and page reloads resume it after the backend checks ownership. `New session` starts over, `Regenerate` retries the last Session turn, and each `Cancel` button aborts its active stream. Relay and streaming errors appear in the page.

For a production build:

```sh
npm run build
node --env-file=.env --run start
```

Replace the two-token demo authentication with your application's session verification in production. Keep `BLAZING_AGENTS_API_KEY` server-side; never put it in `VITE_*` or browser code.
