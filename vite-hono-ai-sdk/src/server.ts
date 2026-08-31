import { DatabaseSync } from "node:sqlite";
import {
	BlazingAgents,
	createChatRelay,
	createCompletionRelay,
} from "@blazing-agents/sdk";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

function env(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

const database = new DatabaseSync(process.env.SESSION_DB ?? "sessions.db");
database.exec(
	"CREATE TABLE IF NOT EXISTS sessions (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL)",
);

const sessions = {
	async ownerOf(sessionId: string) {
		const row = database
			.prepare("SELECT user_id FROM sessions WHERE session_id = ?")
			.get(sessionId) as { user_id: string } | undefined;
		return row?.user_id;
	},
	async recordOwner(sessionId: string, userId: string) {
		database
			.prepare("INSERT INTO sessions (session_id, user_id) VALUES (?, ?)")
			.run(sessionId, userId);
	},
};

const client = new BlazingAgents({
	apiKey: env("BLAZING_AGENTS_API_KEY"),
	baseUrl: env("BLAZING_AGENTS_BASE_URL"),
});
const userAToken = env("APP_USER_A_TOKEN");
const userBToken = env("APP_USER_B_TOKEN");

function resolveContext(request: Request) {
	const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
	const userId =
		token === userAToken
			? "user-a"
			: token === userBToken
				? "user-b"
				: undefined;
	return Promise.resolve(
		userId
			? {
					agentId: env("BLAZING_AGENTS_AGENT_ID"),
					metadata: { app: "vite-hono" },
					userId,
				}
			: null,
	);
}

const relayChat = createChatRelay({ client, resolveContext, sessions });
const relayCompletion = createCompletionRelay({ client, resolveContext });
const app = new Hono();

app.post("/api/chat", (context) => relayChat(context.req.raw));
app.post("/api/completion", (context) => relayCompletion(context.req.raw));

serve({
	fetch: app.fetch,
	hostname: "127.0.0.1",
	port: Number(process.env.PORT ?? 8787),
});
