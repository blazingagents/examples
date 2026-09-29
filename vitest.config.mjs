import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.mjs"],
		reporters: ["verbose"],
		fileParallelism: false,
		testTimeout: 15000,
		hookTimeout: 120000,
	},
});
