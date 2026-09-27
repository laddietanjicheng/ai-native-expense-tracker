import json
from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.chat import service
from app.chat.schemas import ChatRequest
from app.dependencies import LLM, CurrentUserId, DbSession
from config.llm import get_llm_settings
from core.agents.tool_loop import DoneEvent, ErrorEvent, ProposalEvent, StatusEvent, TextEvent

router = APIRouter(prefix="/chat", tags=["chat"])

RESPONSES = {429: {"description": "Daily chat turn limit reached"}}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _to_sse(db, user_id, llm, request: ChatRequest) -> Iterator[str]:
    for event in service.run_chat_turn(db, user_id, llm, request):
        if isinstance(event, StatusEvent):
            yield _sse("status", {"text": event.text})
        elif isinstance(event, TextEvent):
            yield _sse("text", {"text": event.text})
        elif isinstance(event, ProposalEvent):
            yield _sse("proposal", event.proposal)
        elif isinstance(event, ErrorEvent):
            yield _sse("error", {"message": event.message})
        elif isinstance(event, DoneEvent):
            yield _sse("done", {})


@router.post("", responses=RESPONSES)
def chat(
    payload: ChatRequest, db: DbSession, user_id: CurrentUserId, llm: LLM
) -> StreamingResponse:
    settings = get_llm_settings()
    # Checked and recorded up front, before any streaming starts: a turn that fails or is
    # abandoned mid-stream still counts, and the window where concurrent requests could both
    # slip past the daily limit is as small as a single check-then-insert, not the whole stream.
    service.check_rate_limit(db, user_id, settings.chat_daily_limit)
    service.record_chat_turn(db, user_id)
    return StreamingResponse(_to_sse(db, user_id, llm, payload), media_type="text/event-stream")
