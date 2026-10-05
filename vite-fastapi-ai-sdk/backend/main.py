import json
import os
import re
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal, cast

from blazing_agents import (
    APIConnectionError,
    APIStatusError,
    AsyncBlazingAgents,
    AsyncChatStream,
    AsyncCompletionStream,
    BlazingAgentsError,
    FunctionContext,
    StreamError,
    ToolApprovalDecisionInput,
    define_function,
)
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

SESSION_ID = re.compile(r"^ss_[A-Za-z0-9]{16}$")
DATABASE = Path(os.getenv("SESSION_DB", "sessions.db"))


class ShippingInput(BaseModel):
    country: Literal["GB", "US"]


def shipping_quote(value: ShippingInput, context: FunctionContext) -> dict[str, object]:
    return {
        "currency": "GBP",
        "amountMinor": 499 if value.country == "GB" else 1499,
    }


FUNCTIONS = {
    "shippingQuote": define_function(
        description="Get the shipping price for a destination country.",
        input_schema=ShippingInput,
        execute=shipping_quote,
    ),
}


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
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    initialize_database()
    client = AsyncBlazingAgents(
        api_key=required("BLAZING_AGENTS_API_KEY"),
        base_url=required("BLAZING_AGENTS_BASE_URL").rstrip("/"),
    )
    app.state.blazing_agents = client
    try:
        yield
    finally:
        await client.aclose()


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


def relay_error(exc: BlazingAgentsError) -> JSONResponse:
    if isinstance(exc, APIStatusError):
        return error(exc.status_code, exc.code, str(exc), exc.request_id)
    if isinstance(exc, StreamError):
        return error(502, "stream_error", str(exc), exc.request_id)
    if isinstance(exc, APIConnectionError):
        return error(502, "network_error", "Unable to reach Blazing Agents.")
    return error(500, "internal_error", "Request failed.")


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
    if not isinstance(value, dict) or not isinstance(value.get("id"), str):
        return False
    if not value["id"] or value.get("role") not in ("user", "assistant"):
        return False
    parts = value.get("parts")
    if not isinstance(parts, list) or not parts:
        return False
    if value["role"] == "user":
        return all(valid_text_part(part) for part in parts)
    for part in parts:
        if not isinstance(part, dict):
            return False
        kind = part.get("type")
        if not isinstance(kind, str):
            return False
        if (
            not (kind.startswith("tool-") or kind == "dynamic-tool")
            or part.get("state") != "approval-responded"
        ):
            continue
        if not isinstance(part.get("toolCallId"), str) or "input" not in part:
            return False
        if kind == "dynamic-tool" and not isinstance(part.get("toolName"), str):
            return False
        approval = part.get("approval")
        if (
            not isinstance(approval, dict)
            or not isinstance(approval.get("id"), str)
            or not approval["id"]
        ):
            return False
        if not isinstance(approval.get("approved"), bool):
            return False
        if "reason" in approval and not isinstance(approval["reason"], str):
            return False
    return True


def approval_decisions(message: dict[str, Any]) -> list[ToolApprovalDecisionInput]:
    parts = message["parts"]
    last_step = max(
        (index for index, part in enumerate(parts) if part["type"] == "step-start"),
        default=-1,
    )
    decisions: list[ToolApprovalDecisionInput] = []
    for part in parts[last_step + 1 :]:
        if (
            part["type"].startswith("tool-") or part["type"] == "dynamic-tool"
        ) and part.get("state") == "approval-responded":
            decision: ToolApprovalDecisionInput = {
                "approval_id": part["approval"]["id"],
                "approved": part["approval"]["approved"],
            }
            if "reason" in part["approval"]:
                decision["reason"] = part["approval"]["reason"]
            decisions.append(decision)
    return decisions


def upstream_headers(
    stream: AsyncChatStream | AsyncCompletionStream,
) -> dict[str, str]:
    headers: dict[str, str] = {}
    if location := stream.headers.get("location"):
        headers["location"] = location
    if stream.request_id:
        headers["x-request-id"] = stream.request_id
    return headers


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
    kwargs: dict[str, Any] = {}
    if message_id is not None:
        kwargs["message_id"] = message_id
    if session_id is not None:
        kwargs["session_id"] = session_id
    client: AsyncBlazingAgents = request.app.state.blazing_agents
    try:
        if incoming["message"]["role"] == "assistant":
            if session_id is None:
                return error(
                    400,
                    "invalid_request",
                    "Tool approval requires an existing Session.",
                )
            decisions = approval_decisions(incoming["message"])
            if not decisions:
                return error(
                    400,
                    "invalid_request",
                    "The message has no tool approval responses.",
                )
            stream = await client.continue_chat(
                agent_id=agent_id,
                session_id=session_id,
                decisions=decisions,
                functions=FUNCTIONS,
            )
        else:
            stream = await client.chat(
                agent_id=agent_id,
                functions=FUNCTIONS,
                message=incoming["message"],
                trigger=trigger if session_id else "submit-message",
                user_id=owner,
                metadata={"app": "vite-fastapi"},
                **kwargs,
            )
    except BlazingAgentsError as exc:
        return relay_error(exc)

    if session_id is None:
        try:
            record_owner(cast(str, stream.session_id), owner)
        except sqlite3.Error:
            await stream.aclose()
            return error(500, "internal_error", "Request failed.")

    headers = upstream_headers(stream)
    headers["x-vercel-ai-ui-message-stream"] = "v1"
    headers["cache-control"] = "no-cache"
    return StreamingResponse(
        stream,
        status_code=stream.status_code,
        headers=headers,
        media_type="text/event-stream",
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
    client: AsyncBlazingAgents = request.app.state.blazing_agents
    try:
        stream = await client.completion_stream(
            agent_id=required("BLAZING_AGENTS_AGENT_ID"),
            prompt=prompt.strip(),
            user_id=owner,
            metadata={"app": "vite-fastapi"},
        )
    except BlazingAgentsError as exc:
        return relay_error(exc)
    return StreamingResponse(
        stream,
        status_code=stream.status_code,
        headers=upstream_headers(stream),
        media_type="text/plain",
    )
