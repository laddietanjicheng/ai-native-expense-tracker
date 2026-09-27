from pydantic import Field

from app.shared.schemas import CustomModel


class PageParams(CustomModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class PageMeta(CustomModel):
    page: int
    page_size: int
    total_count: int
    total_amount_cents: int
    category_count: int
