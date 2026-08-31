import asyncio
import json
import os
import re
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

SESSION_ID = re.compile(r"^ss_[A-Za-z0-9]{16}$")
DATABASE = Path(os.getenv("SESSION_DB", "sessions.db"))


def required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def user_id(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    token = (
        authorization.removeprefix("Bearer ")
        if authorization.startswith("Bearer ")
        else None
    )
    if token and token == os.getenv("APP_USER_A_TOKEN"):
        return "user-a"
    if token and token == os.getenv("APP_USER_B_TOKEN"):
        return "user-b"
    return None


def initialize_database() -> None:
    with sqlite3.connect(DATABASE) as database:
        database.execute(
            "CREATE TABLE IF NOT EXISTS sessions "
            "(session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL)"
        )


def owner_of(session_id: str) -> str | None:
    with sqlite3.connect(DATABASE) as database:
        row = database.execute(
            "SELECT user_id FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    return row[0] if row else None


def record_owner(session_id: str, owner: str) -> None:
    with sqlite3.connect(DATABASE) as database:
        database.execute(
            "INSERT INTO sessions (session_id, user_id) VALUES (?, ?)",
            (session_id, owner),
        )


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_database()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["POST"],
    allow_headers=["authorization", "content-type"],
    expose_headers=["Location", "X-Request-Id"],
)


def error(
    status: int, code: str, message: str, request_id: str | None = None
) -> JSONResponse:
    headers = {"x-request-id": request_id} if request_id else None
    return JSONResponse(
        {"error": {"code": code, "message": message}},
        status_code=status,
        headers=headers,
    )


async def body(request: Request) -> dict[str, Any] | None:
    try:
        value = await request.json()
        return value if isinstance(value, dict) else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


def valid_text_part(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and value.get("type") == "text"
        and isinstance(value.get("text"), str)
    )


def valid_message(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if value.get("role") != "user" or not isinstance(value.get("id"), str):
        return False
    parts = value.get("parts")
    return (
        isinstance(parts, list)
        and bool(parts)
        and all(valid_text_part(part) for part in parts)
    )


async def upstream_error(response: httpx.Response) -> JSONResponse:
    request_id = response.headers.get("x-request-id")
    try:
        payload = await response.aread()
        parsed = json.loads(payload[:65_536])
        detail = parsed.get("error", {})
        if (
            isinstance(detail, dict)
            and isinstance(detail.get("code"), str)
            and isinstance(detail.get("message"), str)
        ):
            return error(
                response.status_code, detail["code"], detail["message"], request_id
            )
    except (json.JSONDecodeError, UnicodeDecodeError):
        pass
    return error(
        response.status_code,
        "upstream_error",
        "Blazing Agents request failed.",
        request_id,
    )


async def relay(
    request: Request,
    path: str,
    payload: dict[str, Any],
    chat: bool,
    new_session_owner: str | None = None,
):
    client = httpx.AsyncClient(timeout=None)
    try:
        upstream_request = client.build_request(
            "POST",
            f"{required('BLAZING_AGENTS_BASE_URL').rstrip('/')}{path}",
            headers={"authorization": f"Bearer {required('BLAZING_AGENTS_API_KEY')}"},
            json=payload,
        )
        send = asyncio.create_task(client.send(upstream_request, stream=True))
        disconnect = asyncio.create_task(wait_for_disconnect(request))
        await asyncio.wait((send, disconnect), return_when=asyncio.FIRST_COMPLETED)
        if disconnect.done() and not send.done():
            send.cancel()
            await asyncio.gather(send, return_exceptions=True)
            await client.aclose()
            return error(499, "request_aborted", "Request was cancelled.")
        disconnect.cancel()
        await asyncio.gather(disconnect, return_exceptions=True)
        response = await send
    except httpx.HTTPError:
        await client.aclose()
        return error(502, "network_error", "Unable to reach Blazing Agents.")

    if not response.is_success:
        result = await upstream_error(response)
        await response.aclose()
        await client.aclose()
        return result

    if new_session_owner is not None:
        location = response.headers.get("location", "")
        created_session_id = location.rsplit("/", 1)[-1]
        if not SESSION_ID.fullmatch(created_session_id):
            await response.aclose()
            await client.aclose()
            return error(
                502,
                "stream_error",
                "Blazing Agents returned an invalid Session Location.",
            )
        try:
            record_owner(created_session_id, new_session_owner)
        except sqlite3.Error:
            await response.aclose()
            await client.aclose()
            return error(500, "internal_error", "Request failed.")

    async def stream() -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_bytes():
                if await request.is_disconnected():
                    break
                yield chunk
        finally:
            await response.aclose()
            await client.aclose()

    headers: dict[str, str] = {}
    for name in ("location", "x-request-id"):
        if value := response.headers.get(name):
            headers[name] = value
    if chat:
        headers["x-vercel-ai-ui-message-stream"] = "v1"
        headers["cache-control"] = "no-cache"
    return StreamingResponse(
        stream(),
        status_code=response.status_code,
        headers=headers,
        media_type="text/event-stream" if chat else "text/plain",
    )


async def wait_for_disconnect(request: Request) -> None:
    while not await request.is_disconnected():
        await asyncio.sleep(0.01)


@app.post("/api/chat")
async def chat(request: Request):
    owner = user_id(request)
    if not owner:
        return error(401, "unauthorized", "Authentication required.")
    incoming = await body(request)
    if not incoming or not valid_message(incoming.get("message")):
        return error(400, "invalid_request", "Invalid chat message.")
    session_id = incoming.get("sessionId")
    if session_id is not None and (
        not isinstance(session_id, str) or not SESSION_ID.fullmatch(session_id)
    ):
        return error(400, "invalid_request", "Invalid request body.")
    if session_id is not None and owner_of(session_id) != owner:
        return error(403, "forbidden", "Session is not available.")
    trigger = incoming.get("trigger", "submit-message")
    if trigger not in ("submit-message", "regenerate-message"):
        return error(400, "invalid_request", "Invalid request body.")
    message_id = incoming.get("messageId")
    if message_id is not None and (not isinstance(message_id, str) or not message_id):
        return error(400, "invalid_request", "Invalid request body.")

    agent_id = required("BLAZING_AGENTS_AGENT_ID")
    payload = {
        "message": incoming["message"],
        "trigger": trigger if session_id else "submit-message",
        "userId": owner,
        "metadata": {"app": "vite-fastapi"},
    }
    if message_id is not None:
        payload["messageId"] = message_id
    if session_id is None and (version := os.getenv("BLAZING_AGENTS_AGENT_VERSION")):
        payload["version"] = int(version)
    path = f"/v1/agents/{agent_id}/sessions"
    if session_id:
        path += f"/{session_id}"
    return await relay(
        request,
        path,
        payload,
        chat=True,
        new_session_owner=owner if session_id is None else None,
    )


@app.post("/api/completion")
async def completion(request: Request):
    owner = user_id(request)
    if not owner:
        return error(401, "unauthorized", "Authentication required.")
    incoming = await body(request)
    prompt = incoming.get("prompt") if incoming else None
    if not isinstance(prompt, str) or not prompt.strip():
        return error(400, "invalid_request", "Invalid request body.")
    payload: dict[str, Any] = {
        "output": {"type": "text"},
        "prompt": prompt.strip(),
        "userId": owner,
        "metadata": {"app": "vite-fastapi"},
    }
    if version := os.getenv("BLAZING_AGENTS_AGENT_VERSION"):
        payload["version"] = int(version)
    return await relay(
        request,
        f"/v1/agents/{required('BLAZING_AGENTS_AGENT_ID')}/generation",
        payload,
        chat=False,
    )
