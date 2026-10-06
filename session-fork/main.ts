import { BlazingAgents } from "@blazingagents/sdk";

function env(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const client = new BlazingAgents({
	apiKey: env("BLAZING_AGENTS_API_KEY"),
	baseUrl: env("BLAZING_AGENTS_BASE_URL"),
});
const child = await client.sessions.fork({
	agentId: env("BLAZING_AGENTS_AGENT_ID"),
	sessionId: env("BLAZING_AGENTS_SESSION_ID"),
	messageId: env("BLAZING_AGENTS_MESSAGE_ID"),
	idempotencyKey: env("BLAZING_AGENTS_IDEMPOTENCY_KEY"),
});
console.log(
	JSON.stringify({ id: child.id, forkedFrom: child.forkedFrom }, null, 2),
);
