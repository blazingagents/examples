import {
	BlazingAgents,
	createChatRelay,
	createCompletionRelay,
	type SessionOwnershipStore,
} from "@blazing-agents/sdk";

interface Env {
	ALLOWED_ORIGINS: string;
	APP_USER_A_TOKEN: string;
	APP_USER_B_TOKEN: string;
	BLAZING_AGENTS_AGENT_ID: string;
	BLAZING_AGENTS_API_KEY: string;
	BLAZING_AGENTS_BASE_URL: string;
	SESSIONS: D1Database;
}

class D1Sessions implements SessionOwnershipStore {
	constructor(private readonly database: D1Database) {}

	async ownerOf(sessionId: string) {
		const row = await this.database
			.prepare("SELECT user_id FROM sessions WHERE session_id = ?")
			.bind(sessionId)
			.first<{ user_id: string }>();
		return row?.user_id;
	}

	async recordOwner(sessionId: string, userId: string) {
		await this.database
			.prepare("INSERT INTO sessions (session_id, user_id) VALUES (?, ?)")
			.bind(sessionId, userId)
			.run();
	}
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
		const resolveContext = (relayRequest: Request) => {
			const token = relayRequest.headers
				.get("authorization")
				?.replace(/^Bearer /, "");
			const userId =
				token === env.APP_USER_A_TOKEN
					? "user-a"
					: token === env.APP_USER_B_TOKEN
						? "user-b"
						: undefined;
			return Promise.resolve(
				userId
					? {
							agentId: env.BLAZING_AGENTS_AGENT_ID,
							metadata: { app: "cloudflare-worker" },
							userId,
						}
					: null,
			);
		};
		const relay =
			new URL(request.url).pathname === "/chat"
				? createChatRelay({
						client,
						resolveContext,
						sessions: new D1Sessions(env.SESSIONS),
					})
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
