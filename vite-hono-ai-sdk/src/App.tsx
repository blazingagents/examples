import { useChat, useCompletion } from "@ai-sdk/react";
import { BlazingAgentsChatTransport } from "@blazingagents/sdk";
import { generateId, type UIMessage } from "ai";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

export function App() {
	const [token, setToken] = useState("");
	const [chatInput, setChatInput] = useState("");
	const [sessionId, setSessionId] = useState<string>();
	const active = useRef(false);
	const regenerating = useRef(false);
	const completedMessages = useRef<UIMessage[]>([]);
	useEffect(() => {
		setSessionId(localStorage.getItem("blazing-agents-session") ?? undefined);
	}, []);
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
					localStorage.setItem("blazing-agents-session", id);
					setSessionId(id);
				},
			}),
		[headers, sessionId],
	);
	const chat = useChat({
		transport,
		onError() {
			active.current = false;
			chat.setMessages(completedMessages.current);
		},
		onFinish({ isAbort, isError, isDisconnect, finishReason, messages }) {
			active.current = false;
			if (
				!(isAbort || isError || isDisconnect) &&
				finishReason &&
				finishReason !== "error"
			) {
				completedMessages.current = messages;
				// biome-ignore lint/suspicious/noUnnecessaryConditions: Submit and regenerate handlers update this ref before completion.
				if (!regenerating.current) setChatInput("");
			} else {
				chat.setMessages(completedMessages.current);
			}
		},
	});
	const completion = useCompletion({
		api: "/api/completion",
		headers,
		streamProtocol: "text",
	});
	const busy = chat.status === "submitted" || chat.status === "streaming";

	function submitChat(event: FormEvent) {
		event.preventDefault();
		// biome-ignore lint/suspicious/noUnnecessaryConditions: Stream callbacks update the synchronous duplicate-submit guard.
		if (active.current || !chatInput.trim()) return;
		active.current = true;
		regenerating.current = false;
		chat.clearError();
		void chat.sendMessage({
			id: generateId(),
			role: "user",
			parts: [{ type: "text", text: chatInput }],
		});
	}
	async function stopChat() {
		await chat.stop();
		active.current = false;
		chat.setMessages(completedMessages.current);
	}
	function regenerate() {
		if (
			// biome-ignore lint/suspicious/noUnnecessaryConditions: Stream callbacks update the synchronous duplicate-submit guard.
			active.current ||
			!completedMessages.current.some((message) => message.role === "assistant")
		)
			return;
		active.current = true;
		regenerating.current = true;
		chat.clearError();
		void chat.regenerate();
	}
	function newSession() {
		localStorage.removeItem("blazing-agents-session");
		setSessionId(undefined);
		completedMessages.current = [];
		chat.setMessages([]);
		chat.clearError();
		setChatInput("");
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
				<button type="button" onClick={newSession} disabled={busy}>
					New Session
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
					aria-label="Message"
					value={chatInput}
					disabled={busy}
					onChange={(event) => setChatInput(event.target.value)}
				/>
				<button type="submit" disabled={busy || !chatInput.trim()}>
					Send / resend
				</button>
				<button type="button" onClick={stopChat} disabled={!busy}>
					Stop
				</button>
				<button type="button" onClick={() => setChatInput("")} disabled={busy}>
					Discard input
				</button>
				<button
					type="button"
					onClick={regenerate}
					disabled={
						busy ||
						!sessionId ||
						!completedMessages.current.some(
							(message) => message.role === "assistant",
						)
					}
				>
					Regenerate
				</button>
			</form>
			{chat.error && <p role="alert">{chat.error.message}</p>}
			<p>
				After an error or Stop, edit or resend your input. Each send is a new
				attempt and may repeat Tool effects. A lost response may already be
				saved.
			</p>
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
