# Next.js + AI SDK

This minimal App Router example keeps the Blazing Agents key in Node route handlers. The browser sends an application token; the backend maps it to a trusted user ID and owns the Session-to-user mapping in SQLite.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`, enter the configured application token, and send a chat or completion. Chat Session IDs are saved to `localStorage` and reused after reload. Replace the two-token demo authentication with your application's session verification in production. `Cancel` aborts the active stream; `Regenerate` resumes the owned Session.

Never put `BLAZING_AGENTS_API_KEY` in `NEXT_PUBLIC_*` or browser code.
