import { DatabaseSync } from "node:sqlite";
import {
	BlazingAgents,
	createChatRelay,
	createCompletionRelay,
} from "@blazing-agents/sdk";

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

function resolveContext(request: Request) {
	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return Promise.resolve(null);
	const token = authorization.slice("Bearer ".length);
	const userId =
		token === env("APP_USER_A_TOKEN")
			? "user-a"
			: token === env("APP_USER_B_TOKEN")
				? "user-b"
				: undefined;
	return Promise.resolve(
		userId
			? {
					agentId: env("BLAZING_AGENTS_AGENT_ID"),
					metadata: { app: "tanstack-start" },
					userId,
				}
			: null,
	);
}

function client() {
	return new BlazingAgents({
		apiKey: env("BLAZING_AGENTS_API_KEY"),
		baseUrl: env("BLAZING_AGENTS_BASE_URL"),
	});
}

export const relayChat = (request: Request) =>
	createChatRelay({ client: client(), resolveContext, sessions })(request);

export const relayCompletion = (request: Request) =>
	createCompletionRelay({ client: client(), resolveContext })(request);
