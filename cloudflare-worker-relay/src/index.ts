import {
	BlazingAgents,
	createChatRelay,
	createCompletionRelay,
} from "@blazingagents/sdk";

interface Env {
	ALLOWED_ORIGINS: string;
	APP_USER_A_TOKEN: string;
	APP_USER_B_TOKEN: string;
	BLAZING_AGENTS_API_KEY: string;
	BLAZING_AGENTS_BASE_URL: string;
	BLAZING_AGENTS_MODEL: string;
	BLAZING_AGENTS_PROVIDER_ID: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const origin = request.headers.get("origin");
		if (!origin || !env.ALLOWED_ORIGINS.split(",").includes(origin)) {
			return Response.json({ error: "Origin not allowed." }, { status: 403 });
		}
		if (request.method === "OPTIONS") {
			return cors(new Response(null, { status: 204 }), origin);
		}

		const client = new BlazingAgents({
			apiKey: env.BLAZING_AGENTS_API_KEY,
			baseUrl: env.BLAZING_AGENTS_BASE_URL,
		});
		const abort = new AbortController();
		request.signal.addEventListener(
			"abort",
			() => abort.abort(request.signal.reason),
			{ once: true },
		);
		const relayRequest = new Request(request, { signal: abort.signal });
		/** Each signed-in user gets their own Agent, and with it their own Workspace. */
		const agentFor = async (userId: string) => {
			const user = client.forUser(userId);
			const [agent] = (await user.agents.list({ limit: 1 })).data;
			return (
				agent ??
				(await user.agents.create({
					name: "Chat assistant",
					providerId: env.BLAZING_AGENTS_PROVIDER_ID,
					model: env.BLAZING_AGENTS_MODEL,
				}))
			);
		};
		const resolveContext = async (relayRequest: Request) => {
			const token = relayRequest.headers
				.get("authorization")
				?.match(/^Bearer (.+)$/)?.[1];
			if (!token) return null;
			const userId =
				token === env.APP_USER_A_TOKEN
					? "user-a"
					: token === env.APP_USER_B_TOKEN
						? "user-b"
						: undefined;
			if (!userId) return null;
			const agent = await agentFor(userId);
			return {
				agentId: agent.id,
				metadata: { app: "cloudflare-worker" },
				userId,
			};
		};
		const relay =
			new URL(request.url).pathname === "/chat"
				? createChatRelay({ client, resolveContext })
				: new URL(request.url).pathname === "/completion"
					? createCompletionRelay({ client, resolveContext })
					: undefined;
		if (!relay || request.method !== "POST") {
			return cors(
				Response.json({ error: "Not found." }, { status: 404 }),
				origin,
			);
		}
		return cors(await relay(relayRequest), origin);
	},
} satisfies ExportedHandler<Env>;

function cors(response: Response, origin: string): Response {
	const headers = new Headers(response.headers);
	headers.set("access-control-allow-origin", origin);
	headers.set("access-control-allow-methods", "POST, OPTIONS");
	headers.set("access-control-allow-headers", "authorization, content-type");
	headers.set("access-control-expose-headers", "Location, X-Request-Id");
	headers.set("vary", "Origin");
	return new Response(response.body, { headers, status: response.status });
}
