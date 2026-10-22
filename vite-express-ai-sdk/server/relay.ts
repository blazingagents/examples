import {
	BlazingAgents,
	createChatRelay,
	createCompletionRelay,
} from "@blazingagents/sdk";

export function env(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const client = new BlazingAgents({
	apiKey: env("BLAZING_AGENTS_API_KEY"),
	baseUrl: env("BLAZING_AGENTS_BASE_URL"),
});
const agentSettings = {
	name: "Chat assistant",
	providerId: env("BLAZING_AGENTS_PROVIDER_ID"),
	model: env("BLAZING_AGENTS_MODEL"),
};

/** Each signed-in user gets their own Agent, and with it their own Workspace. */
async function agentFor(userId: string) {
	const user = client.forUser(userId);
	const [agent] = (await user.agents.list({ limit: 1 })).data;
	return agent ?? (await user.agents.create(agentSettings));
}

async function resolveContext(request: Request) {
	const token = request.headers
		.get("authorization")
		?.match(/^Bearer (.+)$/)?.[1];
	const userId =
		token === env("APP_USER_A_TOKEN")
			? "user-a"
			: token === env("APP_USER_B_TOKEN")
				? "user-b"
				: undefined;
	if (!userId) return null;
	const agent = await agentFor(userId);
	return { agentId: agent.id, metadata: { app: "vite-express" }, userId };
}

export const relayChat = createChatRelay({ client, resolveContext });
export const relayCompletion = createCompletionRelay({
	client,
	resolveContext,
});
