# Cloudflare Worker relay

The relay supports one streamed approval continuation for an authenticated browser client.

This backend-only Worker exposes `POST /chat` and `POST /completion`. It derives `userId` from application authentication, allows only configured browser origins, exposes `Location` for Session persistence, and keeps the Blazing Agents key in a Worker secret.

The Worker calls Blazing Agents as the signed-in user through `client.forUser(userId)`. On a user's first request, it creates an Agent for that user, which comes with its own Workspace. The API answers 404 for a Session that the user does not own, so the Worker stores no Session data.

The Worker creates Agents, so it needs a Full API key (`ba_full_…`). A read-only key does not work here.

```sh
npm install
cp .dev.vars.example .dev.vars
# Set your BA key and two application tokens in .dev.vars.
# Set your Provider ID and model in wrangler.jsonc.
npm run dev
```

For deployment, set `BLAZING_AGENTS_API_KEY`, `APP_USER_A_TOKEN`, and
`APP_USER_B_TOKEN` with `npx wrangler secret put <name>`, set `ALLOWED_ORIGINS` to a comma-separated exact allowlist, then run `npm run deploy`.

Configure a browser client with `new BlazingAgentsChatTransport({ api: "https://your-worker.example/chat", headers: { authorization: "Bearer <application token>" }, onSessionId })`. Use `useCompletion({ api: "https://your-worker.example/completion", headers, streamProtocol: "text" })`. Persist only the returned Session ID. Cancellation propagates through both streaming endpoints.
