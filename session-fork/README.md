# Fork a Session

Create a child Session from an explicitly selected saved assistant reply and
print its ID and `forkedFrom` provenance. This command performs no model work.
The child shares the Agent's Workspace and Memories.

You need:

- A BA API key. The script only forks a Session, so a read-only key
  (`ba_read_…`) is enough.
- The ID of the Agent that owns the source Session.
- The ID of that Session. It needs at least one saved assistant reply.
- The ID of an assistant message in that Session whose `branchable` is `true`.
- An idempotency key that is unique to this fork.

Copy `.env.example` to `.env` and fill in all six values. Keep the API key in
this server environment.

To find a message to fork, read the Session's saved messages and pick one whose
`branchable` is `true`. Stream chunks do not carry `branchable`, so do not pick
the reply from a live stream:

```ts
const history = await client.sessions.messages({ agentId, sessionId });
const selected = history.data.find((message) => message.branchable);
if (!selected) throw new Error("The Session has no saved reply to fork.");
console.log(selected.id);
```

```python
history = client.sessions.messages(agent_id=agent_id, session_id=session_id)
selected = next((message for message in history.data if message.branchable), None)
if selected is None:
    raise ValueError("The Session has no saved reply to fork.")
print(selected.id)
```

Run either script from this directory. TypeScript requires Node.js 24+:

```sh
cp .env.example .env
npm install
npm start
```

Python requires Python 3.12+ and `uv`:

```sh
cp .env.example .env
uv run --no-project --env-file .env --with blazing_agents==0.32.0 python main.py
```

After an uncertain outcome, retry with the same source Session, message ID,
and idempotency key to recover the same child. Use a fresh key for a different
fork. API errors exit the command unsuccessfully.

See the [Session documentation](https://docs.blazingagents.com/platform/sessions-and-turns#fork-a-conversation) for detailed
fork behavior and eligibility.
