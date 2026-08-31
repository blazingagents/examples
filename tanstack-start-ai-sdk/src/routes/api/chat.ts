import { createFileRoute } from "@tanstack/react-router";
import { relayChat } from "../../server/relay.server.ts";

export const Route = createFileRoute("/api/chat")({
	server: { handlers: { POST: ({ request }) => relayChat(request) } },
});
