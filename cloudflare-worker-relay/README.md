# Cloudflare Worker relay

This backend-only Worker exposes `POST /chat` and `POST /completion`. It derives `userId` from application authentication, stores Session ownership in D1, allows only configured browser origins, exposes `Location` for Session persistence, and keeps the Blazing Agents key in a Worker secret.

```sh
npm install
npx wrangler d1 create blazing-agents-sessions
# copy the returned database id into wrangler.jsonc
npx wrangler d1 migrations apply blazing-agents-sessions --local
npx wrangler secret put BLAZING_AGENTS_API_KEY
npx wrangler secret put APP_USER_A_TOKEN
npx wrangler secret put APP_USER_B_TOKEN
npm run dev
```

For deployment, apply the migration without `--local`, set `ALLOWED_ORIGINS` to a comma-separated exact allowlist, then run `npm run deploy`.

Configure a browser client with `new BlazingAgentsChatTransport({ api: "https://your-worker.example/chat", headers: { authorization: "Bearer <application token>" }, onSessionId })`. Use `useCompletion({ api: "https://your-worker.example/completion", headers, streamProtocol: "text" })`. Persist only the returned Session ID; the Worker verifies its D1 owner on every resume. Cancellation propagates through both streaming endpoints.
