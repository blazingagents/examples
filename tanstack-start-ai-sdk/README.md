# TanStack Start + AI SDK

The relay supports one streamed approval continuation. The sample UI has no approval controls.

This example uses TanStack Start server routes to keep the Blazing Agents API key on the server. The browser sends an application bearer token. The backend derives a trusted user ID and calls Blazing Agents as that user through `client.forUser(userId)`. On a user's first request, the backend creates an Agent for that user, which comes with its own Workspace. The API answers 404 for a Session that the user does not own.

Set a Full API key (`ba_full_…`), a Provider ID, and a model in `.env`. The backend creates Agents, so a read-only key does not work here.

```sh
cp .env.example .env
npm install
node --env-file=.env --run dev
```

Open `http://localhost:5173`, enter one of the configured application tokens, and send a chat or completion. The browser saves the returned Session ID and resumes it after reload. Use `New session` before switching application users. `Stop` aborts chat and `Cancel` aborts completion. `Regenerate` reruns the last response in the user's Session.

Replace the two-token demo authentication with your application's session verification in production. Never expose `BLAZING_AGENTS_API_KEY` through a `VITE_*` variable or browser code.

To verify a production build:

```sh
npm run typecheck
npm run build
```

Failed or stopped chats require an explicit resend. Reload restores the Session ID without restarting work.
