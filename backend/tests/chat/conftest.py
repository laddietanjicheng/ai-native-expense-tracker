import uuid

import pytest

from app.categories.models import Category
from app.users.models import User
from core.llm.factory import get_llm_client
from core.llm.fake import FakeLLMClient


@pytest.fixture
def llm_holder():
    return {"client": FakeLLMClient()}


@pytest.fixture
def chat_client(client, llm_holder):
    client.app.dependency_overrides[get_llm_client] = lambda: llm_holder["client"]
    yield client
    client.app.dependency_overrides.pop(get_llm_client, None)


@pytest.fixture
def other_user(db_session) -> User:
    other = User(id=uuid.uuid4())
    db_session.add(other)
    db_session.flush()
    db_session.add(Category(user_id=other.id, name="Food"))
    db_session.commit()
    return other
