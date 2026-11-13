import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Literal

from blazing_agents import (
    APIConnectionError,
    APIStatusError,
    AsyncBlazingAgents,
    AsyncChatRelay,
    AsyncUserClient,
    FunctionContext,
    RelayContext,
    define_function,
)
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel


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


async def agent_for(user: AsyncUserClient) -> str:
    """Return the signed-in user's own Agent, which comes with its own Workspace."""
    provider_id = required("BLAZING_AGENTS_PROVIDER_ID")
    model = required("BLAZING_AGENTS_MODEL")
    page = await user.agents.list(limit=1)
    if page.data:
        return page.data[0].id
    agent = await user.agents.create(
        name="Chat assistant", provider_id=provider_id, model=model
    )
    return agent.id


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = AsyncBlazingAgents(
        api_key=required("BLAZING_AGENTS_API_KEY"),
        base_url=required("BLAZING_AGENTS_BASE_URL").rstrip("/"),
    )
    app.state.blazing_agents = client
    app.state.relay = AsyncChatRelay(client=client, resolve_context=resolve_context)
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


async def body(request: Request) -> dict[str, Any] | None:
    try:
        value = await request.json()
        return value if isinstance(value, dict) else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


async def resolve_context(request: Request) -> RelayContext | None:
    owner = user_id(request)
    if not owner:
        return None
    client: AsyncBlazingAgents = request.app.state.blazing_agents
    return RelayContext(
        agent_id=await agent_for(client.for_user(owner)),
        user_id=owner,
        functions=FUNCTIONS,
        metadata={"app": "vite-fastapi"},
    )


@app.post("/api/chat")
async def chat(request: Request):
    relay: AsyncChatRelay[Request] = request.app.state.relay
    answer = await relay.handle(request, await request.body())
    return StreamingResponse(
        answer, status_code=answer.status_code, headers=answer.headers
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
    user = client.for_user(owner)
    try:
        stream = await user.completion_stream(
            agent_id=await agent_for(user),
            prompt=prompt.strip(),
            metadata={"app": "vite-fastapi"},
        )
    except APIStatusError as exc:
        return error(exc.status_code, exc.code, str(exc), exc.request_id)
    except APIConnectionError:
        return error(502, "network_error", "Unable to reach Blazing Agents.")
    return StreamingResponse(
        stream,
        status_code=stream.status_code,
        headers={"x-request-id": stream.request_id} if stream.request_id else None,
        media_type="text/plain",
    )
