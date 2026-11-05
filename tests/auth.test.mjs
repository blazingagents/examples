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
		vi.stubEnv("BLAZING_AGENTS_PROVIDER_ID", "prv_0123456789abcdef");
		vi.stubEnv("BLAZING_AGENTS_MODEL", "openrouter/test-model");
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
					BLAZING_AGENTS_PROVIDER_ID: "prv_0123456789abcdef",
					BLAZING_AGENTS_MODEL: "openrouter/test-model",
				},
			);
			expect(response.status).toBe(401);
		}
	});

	it("the Worker trims spaces around comma-separated ALLOWED_ORIGINS entries", async () => {
		const response = await worker.fetch(
			new Request("http://localhost/chat", {
				method: "OPTIONS",
				headers: { origin: "http://localhost:5173" },
			}),
			{
				ALLOWED_ORIGINS: " http://localhost:5173 , https://app.example ",
				BLAZING_AGENTS_API_KEY: "ba_test",
				BLAZING_AGENTS_BASE_URL: "http://127.0.0.1:1",
				BLAZING_AGENTS_PROVIDER_ID: "prv_0123456789abcdef",
				BLAZING_AGENTS_MODEL: "openrouter/test-model",
				APP_USER_A_TOKEN: "token-a",
				APP_USER_B_TOKEN: "token-b",
			},
		);
		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe(
			"http://localhost:5173",
		);
	});
});
