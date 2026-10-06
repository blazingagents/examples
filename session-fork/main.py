import os

from blazing_agents import BlazingAgents

with BlazingAgents(
    api_key=os.environ["BLAZING_AGENTS_API_KEY"],
    base_url=os.environ["BLAZING_AGENTS_BASE_URL"],
) as client:
    child = client.sessions.fork(
        os.environ["BLAZING_AGENTS_AGENT_ID"],
        os.environ["BLAZING_AGENTS_SESSION_ID"],
        message_id=os.environ["BLAZING_AGENTS_MESSAGE_ID"],
        idempotency_key=os.environ["BLAZING_AGENTS_IDEMPOTENCY_KEY"],
    )
    print(child.model_dump_json(include={"id", "forked_from"}, by_alias=True, indent=2))
