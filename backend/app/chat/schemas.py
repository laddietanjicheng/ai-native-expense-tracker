from typing import Literal, Self

from pydantic import Field, model_validator

from app.shared.dates import month_start, parse_month_param, today_sgt
from app.shared.schemas import CustomModel

MAX_MESSAGES = 20
MAX_MESSAGE_CHARS = 2_000


class ChatMessage(CustomModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatContext(CustomModel):
    path: str
    month: str = Field(pattern=r"^\d{4}-\d{2}$")

    @property
    def month_date(self):
        return parse_month_param(self.month)


class ChatRequest(CustomModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_MESSAGES)
    context: ChatContext

    @model_validator(mode="after")
    def last_message_is_from_user(self) -> Self:
        if self.messages[-1].role != "user":
            raise ValueError("the last message must be from the user")
        return self

    @model_validator(mode="after")
    def month_not_in_future(self) -> Self:
        if self.context.month_date > month_start(today_sgt()):
            raise ValueError("context.month cannot be in the future")
        return self
