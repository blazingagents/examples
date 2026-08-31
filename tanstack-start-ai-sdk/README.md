# TanStack Start + AI SDK

This example uses TanStack Start server routes to keep the Blazing Agents API key on the server. The browser sends an application bearer token; the backend derives a trusted user ID and persists Session ownership in SQLite.

```sh
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`, enter one of the configured application tokens, and send a chat or completion. The browser saves the returned Session ID and resumes it after reload. Use `New session` before switching application users. `Cancel` aborts either active stream, and `Regenerate` reruns the last response in the owned Session.

Replace the two-token demo authentication with your application's session verification in production. Never expose `BLAZING_AGENTS_API_KEY` through a `VITE_*` variable or browser code.

To verify a production build:

```sh
npm run typecheck
npm run build
```
