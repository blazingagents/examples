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

- Complete chat applications using the Blazing Agents TypeScript SDK.
- Server-side API-key handling and streaming response relays.
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

Each example documents its required environment variables and run command.

## Prerequisites

- Node.js 24 or newer and npm
- A Blazing Agents API key and Agent ID
- Python 3.12 or newer for the FastAPI example
- A Cloudflare account and Wrangler for the Worker example

## Examples

| Example | Stack | Run |
| --- | --- | --- |
| [Cloudflare Worker relay](./cloudflare-worker-relay/) | Cloudflare Workers and D1 | Follow its README to create D1, configure secrets, and run `npm run dev`. |
| [Next.js + AI SDK](./nextjs-ai-sdk/) | Next.js App Router | Copy `.env.example` to `.env.local`, then run `npm install` and `npm run dev`. |
| [TanStack Start + AI SDK](./tanstack-start-ai-sdk/) | TanStack Start | Copy `.env.example` to `.env`, then run `npm install` and `npm run dev`. |
| [Vite + Express + AI SDK](./vite-express-ai-sdk/) | React, Vite, and Express | Copy `.env.example` to `.env`, then run `npm install` and `node --env-file=.env --run dev`. |
| [Vite + FastAPI + AI SDK](./vite-fastapi-ai-sdk/) | React, Vite, and FastAPI | Create a Python virtual environment, install `requirements.txt`, configure `.env`, then run `npm install` and `npm run dev`. |
| [Vite + Hono + AI SDK](./vite-hono-ai-sdk/) | React, Vite, and Hono | Copy `.env.example` to `.env`, then run `npm install` and `npm run dev`. |

Each example README contains its complete setup, security notes, and deployment guidance.

## Documentation

See [Connect your app](https://docs.blazingagents.com/getting-started/connect-your-app)
for the integration guide and links to the SDK documentation.
