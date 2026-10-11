import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tanstackStart(), react()],
	environments: {
		client: { build: { sourcemap: true } },
		ssr: { build: { sourcemap: true } },
	},
});
