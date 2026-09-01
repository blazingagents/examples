# Blazing Agents examples

Runnable examples for connecting popular web stacks to Blazing Agents while keeping API keys on the server.

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
