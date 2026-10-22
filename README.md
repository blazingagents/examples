<div align="center">
  <a href="https://docs.blazingagents.com">
    <img src="https://raw.githubusercontent.com/blazingagents/docs/main/public/brand/icon.svg" alt="Blazing Agents logo" width="96">
  </a>
  <h1>Blazing Agents Examples</h1>
  <p>Runnable examples for connecting popular web stacks to Blazing Agents.</p>
  <p>
    <a href="https://docs.blazingagents.com/getting-started/connect-your-app">Documentation</a>
  </p>
</div>

Each example keeps API keys on the server and includes stack-specific setup,
security, and deployment guidance.

## Features

- Complete chat applications using the Blazing Agents TypeScript and Python SDKs.
- Server-side API-key handling and streaming response relays.
- A separate Agent and Workspace for each signed-in user, through a client
  scoped to that user.
- Examples for Next.js, TanStack Start, Vite, Express, FastAPI, Hono, and
  Cloudflare Workers.
- Stack-specific setup, security, and deployment guidance.

## Installation

Clone the repository, choose an example, and follow its README:

```bash
git clone https://github.com/blazingagents/examples.git
cd examples/nextjs-ai-sdk
npm install
```

Each example pins its SDK versions in its `package.json` or
`requirements.txt`, and documents its setup and run command.

## Prerequisites

- Node.js 24 or newer and npm.
- For the chat examples, a Full API key (`ba_full_…`), a Provider ID, and a
  model that Provider serves. Each relay creates an Agent for every new user,
  and creating an Agent needs a Full key.
- For the structured output script, an active Agent with a Provider and model.
  For the Session fork script, an Agent and one of its Sessions with a saved
  assistant reply. These scripts only use an existing Agent, so a read-only key
  (`ba_read_…`) is enough.
- Python 3.12 or newer for the FastAPI example.
- A Cloudflare account and Wrangler for the Worker example.

See [API key access levels](https://docs.blazingagents.com/platform/security-and-credentials#api-key-access-levels)
for what each key can do.

## Examples

| Example | Stack | Run |
| --- | --- | --- |
| [Cloudflare Worker relay](./cloudflare-worker-relay/) | Cloudflare Workers | Follow its README to configure secrets, and run `npm run dev`. |
| [Next.js + AI SDK](./nextjs-ai-sdk/) | Next.js App Router | Copy `.env.example` to `.env.local`, then run `npm install` and `npm run dev`. |
| [TanStack Start + AI SDK](./tanstack-start-ai-sdk/) | TanStack Start | Follow its README to load `.env` and run the server. |
| [Vite + Express + AI SDK](./vite-express-ai-sdk/) | React, Vite, and Express | Copy `.env.example` to `.env`, then run `npm install` and `node --env-file=.env --run dev`. |
| [Vite + FastAPI + AI SDK](./vite-fastapi-ai-sdk/) | React, Vite, and FastAPI | Create a Python virtual environment, install `requirements.txt`, configure `.env`, then run `npm install` and `npm run dev`. |
| [Vite + Hono + AI SDK](./vite-hono-ai-sdk/) | React, Vite, and Hono | Follow its README to export `.env` and run both servers. |
| [Session fork](./session-fork/) | TypeScript or Python script | Create a child from a selected saved assistant reply. Follow its README. |
| [Structured output](./structured-output/) | Node.js and Zod | Classify a support ticket into validated JSON with `npm start`. |

Each example README contains its complete setup, security notes, and deployment guidance.

The Rust and Go SDKs keep their examples in their own repositories:
[Rust examples](https://github.com/blazingagents/rust-sdk/tree/main/examples)
and [Go examples](https://github.com/blazingagents/golang-sdk/tree/main/examples).

## Give each user their own Agent

The chat examples map an application token to a user ID on the server. They
then call Blazing Agents through `client.forUser(userId)` in TypeScript or
`client.for_user(user_id)` in Python. On the first request from a user, the
relay creates an Agent for that user, and the API creates the Agent's Workspace
for the same user. Later requests find that Agent and reuse it.

The scoped client reaches only that user's Agents, Sessions, and Workspaces. If
a browser sends a Session ID that belongs to another user, or one that does not
exist, the API answers 404 `not_found`, and the relay passes that answer on. The
examples keep no table of who owns which Session.

Do not serve many users from one shared Agent. Every chat with that Agent works
in the same Workspace, so one user's chat could read, change, or delete files
that another user's chat wrote. See
[keep end users' files apart](https://docs.blazingagents.com/agents/workspaces#keep-end-users-files-apart).

The examples look up the Agent on every request. Two first requests from one
user that arrive together can each create an Agent. In production, create the
user's Agent once, for example when the user signs up.

## Choose a starting point

Start with **Next.js** for a full chat application, **Vite + FastAPI** for a
Python backend, or **structured output** for a small script without a browser.
The other chat examples show the same integration in different frameworks.

## Verification

From the repository root:

```sh
npm ci
npx playwright install chromium
npm run check
```

`check` runs type checks, lint, production builds, and the tests. Run just the
integration and browser tests with `npm test`. Python checks require `uv`.
See [the test guide](./tests/README.md) for coverage and limitations.

## Documentation

See [Connect your app](https://docs.blazingagents.com/getting-started/connect-your-app)
for the integration guide and links to the SDK documentation.

## License

[MIT](LICENSE)
