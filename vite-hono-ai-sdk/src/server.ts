import {
	BlazingAgents,
	createChatRelay,
	createCompletionRelay,
	defineFunction,
} from "@blazingagents/sdk";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";

function env(name: string): string {
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
const userAToken = env("APP_USER_A_TOKEN");
const userBToken = env("APP_USER_B_TOKEN");

const functions = {
	shippingQuote: defineFunction({
		description: "Get the shipping price for a destination country.",
		inputSchema: z.object({ country: z.enum(["GB", "US"]) }),
		execute: ({ country }) => ({
			currency: "GBP",
			amountMinor: country === "GB" ? 499 : 1499,
		}),
	}),
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
		token === userAToken
			? "user-a"
			: token === userBToken
				? "user-b"
				: undefined;
	if (!userId) return null;
	const agent = await agentFor(userId);
	return {
		agentId: agent.id,
		functions,
		metadata: { app: "vite-hono" },
		userId,
	};
}

const relayChat = createChatRelay({ client, resolveContext });
const relayCompletion = createCompletionRelay({ client, resolveContext });
const app = new Hono();

app.post("/api/chat", (context) => relayChat(context.req.raw));
app.post("/api/completion", (context) => relayCompletion(context.req.raw));

serve({
	fetch: app.fetch,
	hostname: "127.0.0.1",
	port: Number(env("PORT")),
});
