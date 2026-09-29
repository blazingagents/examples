import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../cloudflare-worker-relay/src/index.ts";
import { relayChat, relayCompletion } from "../nextjs-ai-sdk/lib/server.ts";

afterEach(() => vi.unstubAllEnvs());

describe("missing demo authentication configuration", () => {
	it("Next.js rejects missing credentials when neither application token is configured", async () => {
		vi.stubEnv("APP_USER_A_TOKEN", undefined);
		vi.stubEnv("APP_USER_B_TOKEN", undefined);
		vi.stubEnv("BLAZING_AGENTS_API_KEY", "ba_test");
		vi.stubEnv("BLAZING_AGENTS_BASE_URL", "http://127.0.0.1:1");
		vi.stubEnv("BLAZING_AGENTS_AGENT_ID", "ag_0123456789abcdef");
		for (const relay of [relayChat, relayCompletion]) {
			const response = await relay(
				new Request("http://localhost/api/chat", {
					method: "POST",
					body: "{}",
				}),
			);
			expect(response.status).toBe(401);
		}
	});

	it("the Worker rejects missing credentials when neither application token is configured", async () => {
		for (const path of ["chat", "completion"]) {
			const response = await worker.fetch(
				new Request(`http://localhost/${path}`, {
					method: "POST",
					headers: { origin: "http://localhost:5173" },
					body: "{}",
				}),
				{
					ALLOWED_ORIGINS: "http://localhost:5173",
					BLAZING_AGENTS_API_KEY: "ba_test",
					BLAZING_AGENTS_BASE_URL: "http://127.0.0.1:1",
					BLAZING_AGENTS_AGENT_ID: "ag_0123456789abcdef",
				},
			);
			expect(response.status).toBe(401);
		}
	});
});
