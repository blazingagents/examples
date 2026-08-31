import { createFileRoute } from "@tanstack/react-router";
import { relayCompletion } from "../../server/relay.server.ts";

export const Route = createFileRoute("/api/completion")({
	server: { handlers: { POST: ({ request }) => relayCompletion(request) } },
});
