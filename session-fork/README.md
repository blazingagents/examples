# Fork a Session

Create a child Session from an explicitly selected saved assistant reply and
print its ID and `forkedFrom` provenance. This command performs no model work.
The child shares the Agent's Workspace and Memories.

Requires an API with Session fork support, a server-side BA API key, an Agent,
and a source Session containing the selected accepted assistant message with
`branchable: true`. Copy `.env.example` to `.env` and fill in all six values.
Keep the API key in this server environment.

Run either script from this directory. TypeScript requires Node.js 24+:

```sh
cp .env.example .env
npm install
npm start
```

Python requires Python 3.12+ and `uv`:

```sh
cp .env.example .env
uv run --no-project --env-file .env --with ./vendor/blazing_agents-0.15.0-py3-none-any.whl python main.py
```

The folder includes pinned TypeScript SDK 0.21.0 and Python SDK 0.15.0
packages. Keep `vendor/` when copying the example.

After an uncertain outcome, retry with the same source Session, message ID,
and idempotency key to recover the same child. Use a fresh key for a different
fork. API errors exit the command unsuccessfully.

See the [Session documentation](https://docs.blazingagents.com/platform/sessions-and-turns#fork-a-conversation) for detailed
fork behavior and eligibility.
