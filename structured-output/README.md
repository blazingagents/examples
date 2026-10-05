# Classify a support ticket

Uses `@blazingagents/sdk` 0.20.0.

Use BA's structured generation API to turn a support ticket into a category,
summary, and urgency flag. A Zod schema defines the requested JSON shape and
validates the result before the application uses it.

Requires Node.js 24+, a BA API key, and a published Agent configured with a
Provider and model that supports structured output. Run from this directory:

```sh
cp .env.example .env
# Set your API key and Agent ID in .env.
npm install
npm start -- "I was charged twice today. Please fix this urgently."
```

The command prints JSON like this. The exact wording depends on the model:

```json
{
  "category": "billing",
  "summary": "Duplicate subscription charge",
  "urgent": true
}
```

This is a stateless generation request. It does not create or resume a chat
Session. Keep the API key in the server environment, and handle validation
errors before routing a ticket or performing any other action.

See the [SDK documentation](https://docs.blazingagents.com) for other generation
and Session APIs.
