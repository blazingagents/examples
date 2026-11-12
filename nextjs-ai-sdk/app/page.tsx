"use client";

import { useCompletion } from "@ai-sdk/react";
import { useBlazingAgentsChat } from "@blazingagents/sdk/react";
import { type FormEvent, useMemo, useState } from "react";

export default function Page() {
	const [token, setToken] = useState("");
	const [chatInput, setChatInput] = useState("");
	const headers = useMemo(
		() => ({ authorization: `Bearer ${token}` }),
		[token],
	);
	const chat = useBlazingAgentsChat({ api: "/api/chat", headers });
	const completion = useCompletion({
		api: "/api/completion",
		headers,
		streamProtocol: "text",
	});

	function submitChat(event: FormEvent) {
		event.preventDefault();
		const text = chatInput;
		if (!text.trim()) return;
		setChatInput("");
		void chat.send(text).then((stored) => {
			if (!stored)
				setChatInput((current) => [text, current].filter(Boolean).join(" "));
		});
	}
	return (
		<main
			style={{ fontFamily: "sans-serif", margin: "2rem auto", maxWidth: 720 }}
		>
			<h1>Blazing Agents + Next.js</h1>
			<label>
				Application token{" "}
				<input
					value={token}
					onChange={(event) => setToken(event.target.value)}
				/>
			</label>
			<p>
				Session: {chat.sessionId ?? "new"}{" "}
				<button type="button" onClick={chat.newSession}>
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
					onChange={(event) => setChatInput(event.target.value)}
				/>
				<button type="submit" disabled={!chatInput.trim()}>
					{chat.status === "running" ? "Steer" : "Send"}
				</button>
				<button
					type="button"
					onClick={chat.stop}
					disabled={chat.status !== "running"}
				>
					Stop
				</button>
				<button type="button" onClick={() => setChatInput("")}>
					Discard input
				</button>
				<button
					type="button"
					onClick={chat.regenerate}
					disabled={!chat.canRegenerate}
				>
					Regenerate
				</button>
			</form>
			{chat.error && <p role="alert">{chat.error.message}</p>}
			<p>
				A message that fails or is stopped returns to the input. Each resend is
				a new attempt and may repeat Tool effects.
			</p>
			<h2>Completion</h2>
			<form onSubmit={completion.handleSubmit}>
				<input
					aria-label="Completion prompt"
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
