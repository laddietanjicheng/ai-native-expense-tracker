import pytest

from core.llm.factory import get_llm_client
from core.llm.fake import FakeLLMClient


@pytest.fixture
def insights_client(client):
    client.app.dependency_overrides[get_llm_client] = lambda: FakeLLMClient()
    yield client
    client.app.dependency_overrides.pop(get_llm_client, None)
