import {
	BlazingAgents,
	createChatRelay,
	createCompletionRelay,
} from "@blazingagents/sdk";

function env(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function client() {
	return new BlazingAgents({
		apiKey: env("BLAZING_AGENTS_API_KEY"),
		baseUrl: env("BLAZING_AGENTS_BASE_URL"),
	});
}

/** Each signed-in user gets their own Agent, and with it their own Workspace. */
async function agentFor(userId: string) {
	const settings = {
		name: "Chat assistant",
		providerId: env("BLAZING_AGENTS_PROVIDER_ID"),
		model: env("BLAZING_AGENTS_MODEL"),
	};
	const user = client().forUser(userId);
	const [agent] = (await user.agents.list({ limit: 1 })).data;
	return agent ?? (await user.agents.create(settings));
}

async function resolveContext(request: Request) {
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return null;
	const token = authorization.slice("Bearer ".length);
	const userId =
		token === env("APP_USER_A_TOKEN")
			? "user-a"
			: token === env("APP_USER_B_TOKEN")
				? "user-b"
				: undefined;
	if (!userId) return null;
	const agent = await agentFor(userId);
	return { agentId: agent.id, metadata: { app: "tanstack-start" }, userId };
}

export const relayChat = (request: Request) =>
	createChatRelay({ client: client(), resolveContext })(request);

export const relayCompletion = (request: Request) =>
	createCompletionRelay({ client: client(), resolveContext })(request);
