import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const agentId = "ag_0123456789abcdef";
const origin = "http://localhost:5173";
const requests = [];
const disconnected = new Set();
const functionCalls = new Map();
let sequence = 0;
let upstream;
let upstreamUrl;
let browser;
let temporary;
const children = [];

const message = (text = "Hello") => ({
	id: `user-${++sequence}`,
	role: "user",
	parts: [{ type: "text", text }],
});

async function freePort() {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const port = server.address().port;
	await new Promise((resolve) => server.close(resolve));
	return port;
}

function start(directory, args, env) {
	const child = spawn("npm", args, {
		cwd: resolve(directory),
		detached: true,
		env: { ...process.env, NODE_ENV: "development", ...env, CI: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk;
	});
	child.stderr.on("data", (chunk) => {
		output += chunk;
	});
	children.push(child);
	return { child, output: () => output };
}

async function stop({ child }) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = once(child, "exit");
	process.kill(-child.pid, "SIGTERM");
	await Promise.race([exited, delay(5000)]);
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch (error) {
		if (error.code !== "ESRCH") throw error;
	}
}

async function ready(url, process) {
	for (let attempt = 0; attempt < 240; attempt++) {
		if (process.child.exitCode !== null) throw new Error(process.output());
		try {
			await fetch(url, { signal: AbortSignal.timeout(1000) });
			return;
		} catch {
			await delay(250);
		}
	}
	throw new Error(`Server did not start at ${url}\n${process.output()}`);
}

beforeAll(async () => {
	temporary = await mkdtemp(join(tmpdir(), "ba-examples-"));
	upstream = createServer(async (request, response) => {
		let raw = "";
		for await (const chunk of request) raw += chunk;
		const body = JSON.parse(raw);
		requests.push({
			path: request.url,
			body,
			authorization: request.headers.authorization,
		});
		const functionRoute = request.url.match(
			/\/function-calls\/(fc_[A-Za-z0-9]{16})\/(claim|result)$/,
		);
		if (functionRoute) {
			const call = functionCalls.get(functionRoute[1]);
			response.setHeader("content-type", "application/json");
			if (
				!call ||
				(call.claimRequestId && call.claimRequestId !== body.claimRequestId)
			) {
				response.writeHead(409);
				response.end(
					JSON.stringify({
						error: {
							code: "function_call_conflict",
							message: "Call is unavailable.",
						},
					}),
				);
				return;
			}
			if (functionRoute[2] === "claim") {
				call.claimRequestId = body.claimRequestId;
				response.end(JSON.stringify({ claimed: true }));
				return;
			}
			if (!call.claimRequestId) {
				response.writeHead(409);
				response.end(
					JSON.stringify({
						error: {
							code: "function_call_conflict",
							message: "Claim required.",
						},
					}),
				);
				return;
			}
			response.end(JSON.stringify({ accepted: true }));
			call.finish(body.outcome);
			return;
		}
		const chatRoute = new RegExp(
			`^/v1/agents/${agentId}/sessions(?:/ss_[A-Za-z0-9]{16})?$`,
		).test(request.url);
		const continuationRoute = new RegExp(
			`^/v1/agents/${agentId}/sessions/ss_[A-Za-z0-9]{16}/tool-approvals/continue$`,
		).test(request.url);
		const generationRoute = request.url === `/v1/agents/${agentId}/generation`;
		if (
			(!chatRoute && !generationRoute && !continuationRoute) ||
			(chatRoute &&
				("message" in body ||
					!Array.isArray(body.messages) ||
					body.messages.length !== 1 ||
					body.messages.some(
						(item) =>
							item.role !== "user" || !item.id || !Array.isArray(item.parts),
					) ||
					Object.keys(body).some(
						(key) =>
							![
								"messages",
								"trigger",
								"messageId",
								"userId",
								"metadata",
								"functions",
							].includes(key),
					)))
		) {
			response.writeHead(400, { "content-type": "application/json" });
			response.end(
				JSON.stringify({
					error: {
						code: "validation_failed",
						message: "Unexpected upstream contract.",
					},
				}),
			);
			return;
		}
		if (continuationRoute) {
			if (
				!Array.isArray(body.decisions) ||
				!body.decisions.length ||
				Object.keys(body).some(
					(key) => !["decisions", "functions"].includes(key),
				)
			) {
				response.writeHead(400, { "content-type": "application/json" });
				response.end(
					JSON.stringify({
						error: {
							code: "validation_failed",
							message: "Invalid continuation.",
						},
					}),
				);
				return;
			}
			if (body.decisions[0].approvalId === "settled") {
				response.writeHead(409, { "content-type": "application/json" });
				response.end(
					JSON.stringify({
						error: {
							code: "tool_approval_continuation_settled",
							message: "Round already settled.",
						},
					}),
				);
				return;
			}
		}
		const prompt = body.prompt ?? body.messages?.[0]?.parts[0]?.text;
		if (prompt === "fail") {
			response.writeHead(422, {
				"content-type": "application/json",
				"x-request-id": "fixture-error",
			});
			response.end(
				JSON.stringify({
					error: {
						code: "invalid_request",
						message: "Fixture rejected input.",
					},
				}),
			);
			return;
		}
		if (prompt === "slow") {
			response.writeHead(200, {
				"content-type": "text/event-stream",
				"x-vercel-ai-ui-message-stream": "v1",
				location: `/v1/agents/${agentId}/sessions/ss_${String(++sequence).padStart(16, "0")}`,
			});
			response.write('data: {"type":"start","messageId":"slow-assistant"}\n\n');
			const heartbeat = setInterval(
				() => response.write(": heartbeat\n\n"),
				50,
			);
			const timer = setTimeout(() => response.end("data: [DONE]\n\n"), 30000);
			response.on("close", () => {
				clearInterval(heartbeat);
				clearTimeout(timer);
				disconnected.add(body.messages[0].id);
			});
			return;
		}
		if (request.url.endsWith("/generation")) {
			response.writeHead(200, {
				"content-type": "text/plain",
				"x-request-id": "fixture-completion",
			});
			response.end(
				body.output.type === "object"
					? JSON.stringify({
							category: prompt.includes("invalid-output")
								? "invalid"
								: "billing",
							summary: "Duplicate charge",
							urgent: true,
						})
					: "Completion from BA",
			);
			return;
		}
		const sessionId =
			request.url.split("/").at(-1) === "sessions"
				? `ss_${String(++sequence).padStart(16, "0")}`
				: continuationRoute
					? request.url.split("/").at(-3)
					: request.url.split("/").at(-1);
		response.writeHead(200, {
			"content-type": "text/event-stream",
			"x-vercel-ai-ui-message-stream": "v1",
			"x-request-id": "fixture-chat",
			location: `/v1/agents/${agentId}/sessions/${sessionId}`,
		});
		if (
			prompt === "shipping quote" ||
			(continuationRoute && body.functions?.shippingQuote)
		) {
			const id = `fc_${String(++sequence).padStart(16, "0")}`;
			const send = (event) =>
				response.write(`data: ${JSON.stringify(event)}\n\n`);
			const timer = setTimeout(() => response.destroy(), 5000);
			functionCalls.set(id, {
				finish(outcome) {
					send({
						type: "tool-output-available",
						toolCallId: id,
						output: outcome,
					});
					send({ type: "text-start", id: "quote" });
					send({
						type: "text-delta",
						id: "quote",
						delta: JSON.stringify(outcome),
					});
					send({ type: "text-end", id: "quote" });
					send({ type: "finish", finishReason: "stop" });
					response.end("data: [DONE]\n\n");
				},
			});
			response.on("close", () => {
				clearTimeout(timer);
				functionCalls.delete(id);
			});
			send({ type: "start", messageId: `assistant-${sequence}` });
			send({
				type: "data-ba-function-call",
				data: {
					id,
					name: "shippingQuote",
					input: { country: "US" },
					deadlineAt: new Date(Date.now() + 5000).toISOString(),
				},
				transient: true,
			});
			send({
				type: "tool-input-available",
				toolCallId: id,
				toolName: "shippingQuote",
				input: { country: "US" },
			});
			return;
		}
		const events = [
			{ type: "start", messageId: `assistant-${sequence}` },
			{ type: "text-start", id: "text-1" },
			{ type: "text-delta", id: "text-1", delta: "Reply from BA" },
			{ type: "text-end", id: "text-1" },
			{ type: "finish", finishReason: "stop" },
		];
		response.end(
			events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
				"data: [DONE]\n\n",
		);
	});
	upstream.listen(0, "127.0.0.1");
	await once(upstream, "listening");
	upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
	browser = await chromium.launch({ headless: true });
}, 120000);

afterAll(async () => {
	for (const child of children) await stop({ child });
	await browser?.close();
	if (upstream) {
		upstream.closeAllConnections();
		await new Promise((resolve) => upstream.close(resolve));
	}
	if (temporary) await rm(temporary, { recursive: true, force: true });
});

const examples = [
	["nextjs-ai-sdk", "/api", false],
	["tanstack-start-ai-sdk", "/api", false],
	["vite-express-ai-sdk", "", false],
	["vite-fastapi-ai-sdk", "/api", true],
	["vite-hono-ai-sdk", "/api", true],
	["cloudflare-worker-relay", "", false],
];

for (const [directory, prefix, separateFrontend] of examples) {
	describe(directory, () => {
		let url;
		let processes = [];
		let env;
		let sessionId;
		let frontendUrl;
		const worker = directory === "cloudflare-worker-relay";

		function post(path, body, token = "Bearer demo-a") {
			return fetch(`${url}${prefix}/${path}`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin,
					...(token ? { authorization: token } : {}),
				},
				body: typeof body === "string" ? body : JSON.stringify(body),
			});
		}

		beforeAll(async () => {
			const port = await freePort();
			url = `http://127.0.0.1:${port}`;
			env = {
				PORT: String(port),
				BLAZING_AGENTS_API_KEY: "ba_test_server_only",
				BLAZING_AGENTS_AGENT_ID: agentId,
				BLAZING_AGENTS_BASE_URL: upstreamUrl,
				APP_USER_A_TOKEN: "demo-a",
				APP_USER_B_TOKEN: "demo-b",
				ALLOWED_ORIGINS: origin,
				SESSION_DB: join(temporary, `${directory}.db`),
				WRANGLER_STATE_PATH: join(temporary, directory),
				WRANGLER_SEND_METRICS: "false",
			};
			const server = start(
				directory,
				["run", directory === "vite-express-ai-sdk" ? "dev" : "start:test"],
				env,
			);
			processes.push(server);
			await ready(url, server);
			frontendUrl = url;
			if (separateFrontend) {
				const frontendPort = await freePort();
				frontendUrl = `http://127.0.0.1:${frontendPort}`;
				const frontend = start(
					directory,
					[
						"exec",
						"--",
						"vite",
						"--host",
						"127.0.0.1",
						"--port",
						String(frontendPort),
						"--strictPort",
					],
					env,
				);
				processes.push(frontend);
				await ready(frontendUrl, frontend);
			}
		}, 120000);

		afterAll(async () => {
			for (const process of processes) await stop(process);
			processes = [];
		});

		it("requires a bearer token on both endpoints", async () => {
			const before = requests.length;
			for (const token of [null, "Bearer wrong", "demo-a"]) {
				expect((await post("chat", { message: message() }, token)).status).toBe(
					401,
				);
				expect(
					(await post("completion", { prompt: "Hello" }, token)).status,
				).toBe(401);
			}
			expect(requests).toHaveLength(before);
		});

		it("rejects malformed input before calling BA", async () => {
			const before = requests.length;
			for (const body of ["{", {}, { message: message(), sessionId: "bad" }]) {
				expect((await post("chat", body)).status).toBe(400);
			}
			expect((await post("completion", { prompt: " " })).status).toBe(400);
			expect(requests).toHaveLength(before);
		});

		it("streams a chat and records ownership from server authentication", async () => {
			const sentMessage = message();
			const response = await post("chat", {
				message: sentMessage,
				userId: "attacker",
				agentId: "attacker",
			});
			expect(response.status).toBe(200);
			expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
			expect(response.headers.get("x-request-id")).toBe("fixture-chat");
			sessionId = response.headers.get("location")?.split("/").at(-1);
			expect(sessionId).toMatch(/^ss_[A-Za-z0-9]{16}$/);
			expect(await response.text()).toContain("Reply from BA");
			expect(requests.at(-1)).toMatchObject({
				path: `/v1/agents/${agentId}/sessions`,
				authorization: "Bearer ba_test_server_only",
				body: {
					userId: "user-a",
					messages: [sentMessage],
				},
			});
		});

		it("resumes and regenerates an owned session", async () => {
			for (const trigger of ["submit-message", "regenerate-message"]) {
				const sentMessage = message();
				const response = await post("chat", {
					message: sentMessage,
					sessionId,
					trigger,
					messageId: "assistant-1",
				});
				expect(response.status).toBe(200);
				await response.text();
				expect(requests.at(-1)).toMatchObject({
					path: `/v1/agents/${agentId}/sessions/${sessionId}`,
					body: {
						trigger,
						messageId: "assistant-1",
						userId: "user-a",
						messages: [sentMessage],
					},
				});
			}
		});

		const approvalMessage = (approvalId = "current") => ({
			id: "assistant-approval",
			role: "assistant",
			parts: [
				{
					type: "tool-shippingQuote",
					toolCallId: "old-call",
					state: "approval-responded",
					input: { country: "US" },
					approval: { id: "old", approved: false },
				},
				{
					type: "tool-shippingQuote",
					toolCallId: "completed-call",
					state: "output-available",
					input: { country: "US" },
					output: { amountMinor: 1499 },
				},
				{ type: "reasoning", text: "Previous step" },
				{ type: "source-url", sourceId: "source", url: "https://example.com" },
				{ type: "step-start" },
				{
					type: "tool-shippingQuote",
					toolCallId: "current-call",
					state: "approval-responded",
					input: { country: "US" },
					approval: { id: approvalId, approved: true, reason: "Confirmed" },
				},
			],
		});

		it("continues only the current approval round with one streamed call", async () => {
			const before = requests.length;
			const approvedMessage = approvalMessage();
			if (directory === "vite-fastapi-ai-sdk")
				approvedMessage.parts.push({
					type: "text",
					text: "Unrelated",
					state: "approval-responded",
					approval: { id: "forged", approved: true },
				});
			const response = await post("chat", {
				message: approvedMessage,
				sessionId,
			});
			expect(response.status).toBe(200);
			expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
			const output = await response.text();
			const calls = requests.slice(before);
			expect(
				calls.filter((call) => call.path.endsWith("/tool-approvals/continue")),
			).toHaveLength(1);
			expect(calls[0].path).toBe(
				`/v1/agents/${agentId}/sessions/${sessionId}/tool-approvals/continue`,
			);
			expect(calls[0].body.decisions).toEqual([
				{ approvalId: "current", approved: true, reason: "Confirmed" },
			]);
			if (["vite-hono-ai-sdk", "vite-fastapi-ai-sdk"].includes(directory)) {
				expect(calls).toHaveLength(3);
				expect(calls[0].body.functions.shippingQuote.inputSchema.type).toBe(
					"object",
				);
				expect(output).toContain("amountMinor");
				expect(output).not.toContain("data-ba-function-call");
			} else {
				expect(calls).toHaveLength(1);
				expect(output).toContain("Reply from BA");
			}
		});

		it("rejects unowned or incomplete approvals without upstream work", async () => {
			const before = requests.length;
			for (const [body, token, status] of [
				[
					{
						message: {
							...approvalMessage(),
							parts: [
								...approvalMessage().parts,
								{ type: "step-start" },
								{
									type: "text",
									text: "No current decisions",
									state: "approval-responded",
									approval: { id: "forged", approved: true },
								},
							],
						},
						sessionId,
					},
					"Bearer demo-a",
					400,
				],

				[{ message: approvalMessage() }, "Bearer demo-a", 400],
				[
					{
						message: {
							id: "empty",
							role: "assistant",
							parts: [{ type: "text", text: "No decisions" }],
						},
						sessionId,
					},
					"Bearer demo-a",
					400,
				],
				[{ message: approvalMessage(), sessionId }, "Bearer demo-b", 403],
				[{ message: approvalMessage(), sessionId }, null, 401],
				[
					{
						message: {
							...approvalMessage(),
							parts: [
								{
									...approvalMessage().parts.at(-1),
									approval: { id: "bad", approved: "yes" },
								},
							],
						},
						sessionId,
					},
					"Bearer demo-a",
					400,
				],
			])
				expect((await post("chat", body, token)).status).toBe(status);
			expect(requests).toHaveLength(before);
		});

		it("returns a settled continuation conflict without retrying", async () => {
			const before = requests.length;
			const response = await post("chat", {
				message: approvalMessage("settled"),
				sessionId,
			});
			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({
				error: { code: "tool_approval_continuation_settled" },
			});
			await delay(250);
			expect(requests).toHaveLength(before + 1);
		});

		if (["vite-hono-ai-sdk", "vite-fastapi-ai-sdk"].includes(directory)) {
			it("executes a backend function and strips its private control event", async () => {
				const before = requests.length;
				const response = await post("chat", {
					message: message("shipping quote"),
					sessionId,
				});
				expect(response.status).toBe(200);
				const output = await response.text();
				expect(output).toContain('\\"amountMinor\\":1499');
				expect(output).not.toContain("data-ba-function-call");
				const calls = requests.slice(before);
				expect(calls).toHaveLength(3);
				expect(calls[0].body.functions.shippingQuote.inputSchema.type).toBe(
					"object",
				);
				expect(calls[1].path).toMatch(
					/\/function-calls\/fc_[A-Za-z0-9]{16}\/claim$/,
				);
				expect(calls[2].body).toEqual({
					claimRequestId: calls[1].body.claimRequestId,
					outcome: {
						kind: "output",
						value: { currency: "GBP", amountMinor: 1499 },
					},
				});
				for (const call of calls)
					expect(call.authorization).toBe("Bearer ba_test_server_only");
			});
		}

		it("retains session ownership after restarting the server", async () => {
			await stop(processes[0]);
			const server = start(
				directory,
				["run", directory === "vite-express-ai-sdk" ? "dev" : "start:test"],
				env,
			);
			processes[0] = server;
			await ready(url, server);
			const response = await post("chat", { message: message(), sessionId });
			expect(response.status).toBe(200);
			await response.text();
			expect(
				(await post("chat", { message: message(), sessionId }, "Bearer demo-b"))
					.status,
			).toBe(403);
		}, 120000);

		it("denies another user and unknown sessions without an upstream call", async () => {
			const before = requests.length;
			expect(
				(await post("chat", { message: message(), sessionId }, "Bearer demo-b"))
					.status,
			).toBe(403);
			expect(
				(
					await post("chat", {
						message: message(),
						sessionId: "ss_zzzzzzzzzzzzzzzz",
					})
				).status,
			).toBe(403);
			expect(requests).toHaveLength(before);
		});

		it("streams completion text and propagates upstream errors", async () => {
			const response = await post("completion", { prompt: "Hello" });
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("Completion from BA");
			for (const [path, body] of [
				["chat", { message: message("fail") }],
				["completion", { prompt: "fail" }],
			]) {
				const failed = await post(path, body);
				expect(failed.status).toBe(422);
				expect(failed.headers.get("x-request-id")).toBe("fixture-error");
				expect(await failed.json()).toMatchObject({
					error: { code: "invalid_request" },
				});
			}
		});

		it("closes the upstream chat stream when the caller disconnects", async () => {
			const controller = new AbortController();
			const slowMessage = message("slow");
			const response = await fetch(`${url}${prefix}/chat`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin,
					authorization: "Bearer demo-a",
				},
				body: JSON.stringify({ message: slowMessage }),
				signal: controller.signal,
			});
			expect(response.status).toBe(200);
			const reader = response.body.getReader();
			await reader.read();
			controller.abort();
			await reader.cancel().catch(() => {});
			await expect
				.poll(() => disconnected.has(slowMessage.id), { timeout: 5000 })
				.toBe(true);
		});

		if (worker) {
			it("allows configured origins and exposes the session header", async () => {
				const response = await fetch(`${url}/chat`, {
					method: "OPTIONS",
					headers: { origin },
				});
				expect(response.status).toBe(204);
				expect(response.headers.get("access-control-allow-origin")).toBe(
					origin,
				);
				expect(response.headers.get("access-control-expose-headers")).toContain(
					"Location",
				);
				expect(
					(
						await fetch(`${url}/chat`, {
							headers: { origin: "https://evil.example" },
						})
					).status,
				).toBe(403);
			});
		} else {
			it("sends, regenerates, reloads, starts a new session, and completes in a browser", async () => {
				const page = await browser.newPage();
				page.setDefaultTimeout(10000);
				const errors = [];
				page.on("pageerror", (error) => errors.push(error.message));
				page.on("console", (event) => {
					if (event.type() === "error") errors.push(event.text());
				});
				page.on("requestfailed", (request) =>
					errors.push(request.url() + ": " + request.failure()?.errorText),
				);
				try {
					await page.goto(frontendUrl);
					await page.getByLabel("Application token").fill("demo-a");
					await page.getByLabel("Message", { exact: true }).fill("Hello");
					await page.getByRole("button", { name: "Send / resend" }).click();
					await page.getByText("Reply from BA", { exact: false }).waitFor();
					await expect
						.poll(() => page.getByLabel("Message", { exact: true }).isEnabled())
						.toBe(true);
					await page
						.getByRole("button", { name: "Regenerate", exact: true })
						.click();
					await page.waitForFunction(
						() =>
							document.querySelector('input[aria-label="Message"]').disabled ===
							false,
					);
					const saved = await page.evaluate(() =>
						localStorage.getItem("blazing-agents-session"),
					);
					expect(saved).toMatch(/^ss_/);
					const beforeReload = requests.length;
					await page.reload();
					await delay(250);
					expect(requests).toHaveLength(beforeReload);
					await page.getByText(`Session: ${saved}`, { exact: false }).waitFor();
					await page.getByLabel("Application token").fill("demo-a");
					await page
						.getByLabel("Message", { exact: true })
						.fill("After reload");
					await page.getByRole("button", { name: "Send / resend" }).click();
					await page.getByText("Reply from BA", { exact: false }).waitFor();
					await expect
						.poll(() => page.getByLabel("Message", { exact: true }).isEnabled())
						.toBe(true);
					expect(requests.at(-1).path).toContain(saved);
					await page
						.getByRole("button", { name: "New Session", exact: false })
						.click();
					expect(
						await page.evaluate(() =>
							localStorage.getItem("blazing-agents-session"),
						),
					).toBeNull();
					const beforeFailure = requests.length;
					await page.getByLabel("Message", { exact: true }).fill("fail");
					await page.getByRole("button", { name: "Send / resend" }).click();
					await expect.poll(() => requests.length).toBe(beforeFailure + 1);
					await page
						.getByRole("alert")
						.filter({ hasText: "Fixture rejected input" })
						.waitFor();
					const afterFailure = requests.length;
					await delay(350);
					expect(requests).toHaveLength(afterFailure);
					expect(
						await page.getByLabel("Message", { exact: true }).inputValue(),
					).toBe("fail");
					await page.getByLabel("Message", { exact: true }).fill("Try again");
					await page.getByRole("button", { name: "Send / resend" }).click();
					await page.getByText("Reply from BA", { exact: false }).waitFor();
					await expect
						.poll(() => page.getByLabel("Message", { exact: true }).isEnabled())
						.toBe(true);
					expect(requests.at(-1).path).toBe(`/v1/agents/${agentId}/sessions`);
					expect(
						await page.evaluate(() =>
							localStorage.getItem("blazing-agents-session"),
						),
					).not.toBe(saved);
					const beforeSlow = requests.length;
					await page.getByLabel("Message", { exact: true }).fill("slow");
					await page.getByRole("button", { name: "Send / resend" }).click();
					await expect.poll(() => requests.length).toBe(beforeSlow + 1);
					await page.getByRole("button", { name: "Stop", exact: true }).click();
					await expect
						.poll(() => page.getByLabel("Message", { exact: true }).isEnabled())
						.toBe(true);
					expect(
						await page.getByLabel("Message", { exact: true }).inputValue(),
					).toBe("slow");
					await delay(350);
					expect(requests).toHaveLength(beforeSlow + 1);
					await page.reload();
					await delay(350);
					expect(requests).toHaveLength(beforeSlow + 1);
					await page.getByLabel("Application token").fill("demo-a");
					await page.getByLabel("Completion prompt").fill("Hello");
					await page
						.getByRole("button", { name: "Complete", exact: true })
						.click();
					await page.getByText("Completion from BA", { exact: true }).waitFor();
				} catch (error) {
					throw new Error(
						`${error.message}\nBrowser errors: ${errors.join("\n")}\nPage: ${await page.locator("body").innerText()}`,
					);
				} finally {
					await page.close();
				}
			}, 60000);
		}
	});
}

describe("structured-output", () => {
	it("runs the documented command and validates the returned object", async () => {
		const command = start(
			"structured-output",
			["start", "--", "Duplicate charge"],
			{
				BLAZING_AGENTS_API_KEY: "ba_test_server_only",
				BLAZING_AGENTS_AGENT_ID: agentId,
				BLAZING_AGENTS_BASE_URL: upstreamUrl,
			},
		);
		const [code] = await once(command.child, "exit");
		expect(code, command.output()).toBe(0);
		expect(command.output()).toContain('"category": "billing"');
		expect(requests.at(-1)).toMatchObject({
			path: `/v1/agents/${agentId}/generation`,
			body: {
				output: {
					type: "object",
					schema: { required: ["category", "summary", "urgent"] },
				},
			},
		});
	});
});

it("rejects structured output that does not match the schema", async () => {
	const command = start(
		"structured-output",
		["start", "--", "invalid-output"],
		{
			BLAZING_AGENTS_API_KEY: "ba_test_server_only",
			BLAZING_AGENTS_AGENT_ID: agentId,
			BLAZING_AGENTS_BASE_URL: upstreamUrl,
		},
	);
	const [code] = await once(command.child, "exit");
	expect(code).not.toBe(0);
	expect(command.output()).toContain("ZodError");
});
