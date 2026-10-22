# Next.js + AI SDK

The relay supports one streamed approval continuation. The sample UI has no approval controls.

This minimal App Router example keeps the Blazing Agents key in Node route handlers. The browser sends an application token. The backend maps it to a trusted user ID and calls Blazing Agents as that user through `client.forUser(userId)`. On a user's first request, the backend creates an Agent for that user, which comes with its own Workspace. The API answers 404 for a Session that the user does not own.

Set a Full API key (`ba_full_…`), a Provider ID, and a model in `.env.local`. The backend creates Agents, so a read-only key does not work here.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`, enter the configured application token, and send a chat or completion. Chat Session IDs are saved to `localStorage` and reused after reload. Replace the two-token demo authentication with your application's session verification in production. `Stop` aborts the active stream. `Regenerate` reruns the last response in the user's Session.

Never put `BLAZING_AGENTS_API_KEY` in `NEXT_PUBLIC_*` or browser code.

Failed or stopped chats require an explicit resend. Reload restores the Session ID without restarting work.
