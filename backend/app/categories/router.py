from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.categories import service
from app.categories.schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryRename,
    CategoryTreeParams,
)
from app.dependencies import CurrentUserId, DbSession, ValidCategory
from app.shared.schemas import Envelope, ok

router = APIRouter(prefix="/categories", tags=["categories"])

RESPONSES = {
    404: {"description": "Category not found"},
    409: {"description": "Duplicate name or category in use"},
    422: {"description": "Validation error, max depth exceeded, or limit reached"},
}


@router.get("", response_model=Envelope[list[CategoryOut]], responses=RESPONSES)
def list_categories(
    params: Annotated[CategoryTreeParams, Query()], db: DbSession, user_id: CurrentUserId
):
    return ok(service.get_category_tree(db, user_id, params))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=Envelope[CategoryOut],
    responses=RESPONSES,
)
def create_category(payload: CategoryCreate, db: DbSession, user_id: CurrentUserId):
    category = service.create_category(db, user_id, payload.name, payload.parent_id)
    return ok(CategoryOut.model_validate(category))


@router.patch("/{category_id}", response_model=Envelope[CategoryOut], responses=RESPONSES)
def rename_category(payload: CategoryRename, category: ValidCategory, db: DbSession):
    return ok(CategoryOut.model_validate(service.rename_category(db, category, payload.name)))


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT, responses=RESPONSES)
def delete_category(category: ValidCategory, db: DbSession, user_id: CurrentUserId):
    service.delete_category(db, user_id, category)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
