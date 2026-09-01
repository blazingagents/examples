import { useChat, useCompletion } from "@ai-sdk/react";
import { BlazingAgentsChatTransport } from "@blazingagents/sdk";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/")({ component: App });

function App() {
	const [token, setToken] = useState("");
	const [chatInput, setChatInput] = useState("");
	const [sessionId, setSessionId] = useState<string>();
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
				onSessionId(id) {
					localStorage.setItem("blazing-agents-session", id);
					setSessionId(id);
				},
				sessionId,
			}),
		[headers, sessionId],
	);
	const {
		error,
		messages,
		regenerate,
		sendMessage,
		setMessages,
		status,
		stop,
	} = useChat({ transport });
	const chatActive = status === "submitted" || status === "streaming";
	const completion = useCompletion({
		api: "/api/completion",
		headers,
		streamProtocol: "text",
	});

	function submitChat(event: FormEvent) {
		event.preventDefault();
		if (chatInput.trim()) {
			void sendMessage({ text: chatInput });
			setChatInput("");
		}
	}

	function newSession() {
		localStorage.removeItem("blazing-agents-session");
		setSessionId(undefined);
		setMessages([]);
	}

	return (
		<main
			style={{ fontFamily: "sans-serif", margin: "2rem auto", maxWidth: 720 }}
		>
			<h1>Blazing Agents + TanStack Start</h1>
			<label>
				Application token
				<input
					value={token}
					onChange={(event) => setToken(event.target.value)}
				/>
			</label>
			<p>Session: {sessionId ?? "new"}</p>
			<button type="button" onClick={newSession} disabled={chatActive}>
				New session
			</button>

			{messages.map((message) => (
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
				<button type="submit" disabled={chatActive}>
					Send
				</button>
				<button type="button" onClick={() => stop()}>
					Cancel
				</button>
				<button
					type="button"
					onClick={() => void regenerate()}
					disabled={chatActive || !sessionId}
				>
					Regenerate
				</button>
			</form>
			{error && <p role="alert">{error.message}</p>}

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
