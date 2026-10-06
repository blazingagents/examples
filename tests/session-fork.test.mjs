import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

const agentId = "ag_0123456789abcdef";
const sessionId = "ss_0123456789abcdef";
const messageId = "accepted-assistant-1";
const forkedFrom = { sessionId, messageId };
const child = {
	id: "ss_child01234567890",
	messageCount: 2,
	lastMessagePreview: "Accepted reply",
	userId: "",
	metadata: {},
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	forkedFrom,
	agentConfig: {
		name: "Builder",
		model: "openrouter/test-model",
		providerId: "prv_0123456789abcdef",
		thinkingLevel: null,
		instructions: "Build carefully.",
		tools: [],
		mcpConnectionIds: [],
		approvalInChat: { default: "full", overrides: [] },
		approvalInTasks: { default: "full", overrides: [] },
		autoCompaction: true,
		compactionReserveTokens: 16384,
		memoryInjectionEnabled: false,
		metadata: {},
	},
};
const requests = [];
const children = [];
let server;
let temporary;
let env;

beforeAll(async () => {
	temporary = await mkdtemp(join(tmpdir(), "ba-session-fork-"));
	server = createServer(async (request, response) => {
		let data = "";
		for await (const chunk of request) data += chunk;
		requests.push({
			path: request.url,
			method: request.method,
			headers: request.headers,
			body: JSON.parse(data),
		});
		const failed = request.headers["idempotency-key"] === "unavailable";
		response.writeHead(failed ? 409 : requests.length === 1 ? 201 : 200, {
			"content-type": "application/json",
		});
		response.end(
			JSON.stringify(
				failed
					? {
							error: {
								code: "session_fork_unavailable",
								message: "Selected reply cannot be forked",
							},
						}
					: child,
			),
		);
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	env = {
		BLAZING_AGENTS_API_KEY: "ba_test_server_only",
		BLAZING_AGENTS_BASE_URL: `http://127.0.0.1:${server.address().port}`,
		BLAZING_AGENTS_AGENT_ID: agentId,
		BLAZING_AGENTS_SESSION_ID: sessionId,
		BLAZING_AGENTS_MESSAGE_ID: messageId,
		BLAZING_AGENTS_IDEMPOTENCY_KEY: "stable-fork-key",
	};
	await writeFile(
		join(temporary, ".env"),
		Object.entries(env)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n"),
	);
});

afterAll(async () => {
	for (const child of children) {
		if (child.exitCode !== null || child.signalCode !== null) continue;
		const exited = once(child, "exit");
		process.kill(-child.pid, "SIGKILL");
		await exited;
	}
	await new Promise((done) => server.close(done));
	await rm(temporary, { recursive: true, force: true });
});

async function run(command, args, overrides = {}) {
	const process = spawn(command, args, {
		cwd: resolve("session-fork"),
		detached: true,
		env: {
			...globalThis.process.env,
			...env,
			UV_CACHE_DIR: join(tmpdir(), "ba-fork-uv-cache"),
			...overrides,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	children.push(process);
	let stdout = "";
	let stderr = "";
	process.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	process.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	const [code] = await once(process, "exit");
	return { code, stdout, stderr };
}

for (const language of ["TypeScript", "Python"]) {
	it(`${language} runs the documented CLI, replays the selected fork, and propagates errors`, async () => {
		requests.length = 0;
		const command = language === "TypeScript" ? "npm" : "uv";
		const args =
			language === "TypeScript"
				? ["start", "--silent"]
				: [
						"run",
						"--no-project",
						"--env-file",
						join(temporary, ".env"),
						"--with",
						"./vendor/blazing_agents-0.15.0-py3-none-any.whl",
						"python",
						"main.py",
					];
		for (let replay = 0; replay < 2; replay++) {
			const result = await run(command, args);
			expect(result.code, result.stderr).toBe(0);
			expect(JSON.parse(result.stdout)).toEqual({ id: child.id, forkedFrom });
			expect(requests.at(-1)).toMatchObject({
				path: `/v1/agents/${agentId}/sessions/${sessionId}/fork`,
				method: "POST",
				headers: {
					authorization: "Bearer ba_test_server_only",
					"idempotency-key": "stable-fork-key",
				},
				body: { messageId },
			});
			expect(requests.at(-1).body).toEqual({ messageId });
		}
		const failed = await run(command, args, {
			BLAZING_AGENTS_IDEMPOTENCY_KEY: "unavailable",
		});
		expect(failed.code).not.toBe(0);
		expect(failed.stderr).toContain("Selected reply cannot be forked");
		expect(requests.at(-1).headers["idempotency-key"]).toBe("unavailable");
	}, 60000);
}
