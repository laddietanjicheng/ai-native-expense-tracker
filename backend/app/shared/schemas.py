from typing import Any

from pydantic import BaseModel, ConfigDict


class CustomModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class ErrorPayload(CustomModel):
    code: str
    message: str
    details: dict[str, Any] = {}


class Envelope[T](CustomModel):
    success: bool
    data: T | None = None
    error: ErrorPayload | None = None
    meta: dict[str, Any] | None = None


def ok[T](data: T, meta: dict[str, Any] | None = None) -> Envelope[T]:
    return Envelope[T](success=True, data=data, meta=meta)
