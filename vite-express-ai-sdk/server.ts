import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { relayChat, relayCompletion } from "./server/relay.ts";

const app = express();
app.use(express.raw({ type: "application/json", limit: "1mb" }));

function relay(
	handler: (request: globalThis.Request) => Promise<globalThis.Response>,
) {
	return async (request: Request, response: Response, next: NextFunction) => {
		const controller = new AbortController();
		response.once("close", () => {
			if (!response.writableEnded) controller.abort();
		});

		try {
			const upstream = await handler(
				new globalThis.Request(
					`${request.protocol}://${request.get("host")}${request.originalUrl}`,
					{
						body: request.body,
						headers: request.headers as HeadersInit,
						method: request.method,
						signal: controller.signal,
					},
				),
			);
			response.status(upstream.status);
			upstream.headers.forEach((value, name) => {
				response.setHeader(name, value);
			});
			if (!upstream.body) return response.end();
			await pipeline(
				Readable.fromWeb(
					upstream.body as unknown as import("node:stream/web").ReadableStream,
				),
				response,
			);
		} catch (error) {
			if (response.headersSent) response.destroy(error as Error);
			else next(error);
		}
	};
}

app.get("/health", (_request, response) => response.sendStatus(204));
app.post("/chat", relay(relayChat));
app.post("/completion", relay(relayCompletion));

if (process.env.NODE_ENV === "production") {
	app.use(express.static(fileURLToPath(new URL("dist", import.meta.url))));
	app.use((_request, response) =>
		response.sendFile(
			fileURLToPath(new URL("dist/index.html", import.meta.url)),
		),
	);
} else if (process.env.NODE_ENV !== "test") {
	const { createServer } = await import("vite");
	const vite = await createServer({ server: { middlewareMode: true } });
	app.use(vite.middlewares);
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "127.0.0.1", () => {
	console.log(`Vite + Express listening on http://127.0.0.1:${port}`);
});
