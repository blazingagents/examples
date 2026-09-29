# Cloudflare Worker relay

This backend-only Worker exposes `POST /chat` and `POST /completion`. It derives `userId` from application authentication, stores Session ownership in D1, allows only configured browser origins, exposes `Location` for Session persistence, and keeps the Blazing Agents key in a Worker secret.

```sh
npm install
cp .dev.vars.example .dev.vars
# Set your BA key and two application tokens in .dev.vars.
# Set your published Agent ID in wrangler.jsonc.
npx wrangler d1 create blazing-agents-sessions
# copy the returned database id into wrangler.jsonc
npx wrangler d1 migrations apply blazing-agents-sessions --local
npm run dev
```

For deployment, set `BLAZING_AGENTS_API_KEY`, `APP_USER_A_TOKEN`, and
`APP_USER_B_TOKEN` with `npx wrangler secret put <name>`, apply the migration without `--local`, set `ALLOWED_ORIGINS` to a comma-separated exact allowlist, then run `npm run deploy`.

Configure a browser client with `new BlazingAgentsChatTransport({ api: "https://your-worker.example/chat", headers: { authorization: "Bearer <application token>" }, onSessionId })`. Use `useCompletion({ api: "https://your-worker.example/completion", headers, streamProtocol: "text" })`. Persist only the returned Session ID; the Worker verifies its D1 owner on every resume. Cancellation propagates through both streaming endpoints.
