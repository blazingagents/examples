import { useChat, useCompletion } from "@ai-sdk/react";
import { BlazingAgentsChatTransport } from "@blazingagents/sdk";
import { type FormEvent, useMemo, useState } from "react";

const sessionKey = "blazing-agents-session";

export function App() {
	const [token, setToken] = useState("");
	const [chatInput, setChatInput] = useState("");
	const [sessionId, setSessionId] = useState<string | undefined>(
		() => localStorage.getItem(sessionKey) ?? undefined,
	);
	const headers = useMemo(
		() => ({ authorization: `Bearer ${token}` }),
		[token],
	);
	const transport = useMemo(
		() =>
			new BlazingAgentsChatTransport({
				api: "/api/chat",
				headers,
				sessionId,
				onSessionId(id) {
					localStorage.setItem(sessionKey, id);
					setSessionId(id);
				},
			}),
		[headers, sessionId],
	);
	const chat = useChat({ transport });
	const completion = useCompletion({
		api: "/api/completion",
		headers,
		streamProtocol: "text",
	});
	const chatBusy = chat.status === "submitted" || chat.status === "streaming";

	function submitChat(event: FormEvent) {
		event.preventDefault();
		if (!chatInput.trim()) return;
		void chat.sendMessage({ text: chatInput });
		setChatInput("");
	}

	function newSession() {
		chat.setMessages([]);
		chat.clearError();
		localStorage.removeItem(sessionKey);
		setSessionId(undefined);
	}

	return (
		<main
			style={{ fontFamily: "sans-serif", margin: "2rem auto", maxWidth: 720 }}
		>
			<h1>Blazing Agents + Vite + Hono</h1>
			<label>
				Application token{" "}
				<input
					value={token}
					onChange={(event) => setToken(event.target.value)}
				/>
			</label>
			<p>
				Session: {sessionId ?? "new"}{" "}
				<button type="button" onClick={newSession} disabled={chatBusy}>
					New session
				</button>
			</p>

			{chat.messages.map((message) => (
				<p key={message.id}>
					<strong>{message.role}:</strong>{" "}
					{message.parts
						.filter((part) => part.type === "text")
						.map((part) => part.text)
						.join("")}
				</p>
			))}
			<form onSubmit={submitChat}>
				<input
					value={chatInput}
					onChange={(event) => setChatInput(event.target.value)}
				/>
				<button type="submit" disabled={chatBusy}>
					Send
				</button>
				<button type="button" onClick={() => chat.stop()}>
					Cancel
				</button>
				<button
					type="button"
					onClick={() => void chat.regenerate()}
					disabled={!sessionId || chatBusy || chat.messages.length === 0}
				>
					Regenerate
				</button>
			</form>
			{chat.error && <p role="alert">{chat.error.message}</p>}

			<h2>Completion</h2>
			<form onSubmit={completion.handleSubmit}>
				<input
					value={completion.input}
					onChange={completion.handleInputChange}
				/>
				<button type="submit" disabled={completion.isLoading}>
					Complete
				</button>
				<button type="button" onClick={completion.stop}>
					Cancel
				</button>
			</form>
			<output>{completion.completion}</output>
			{completion.error && <p role="alert">{completion.error.message}</p>}
		</main>
	);
}
