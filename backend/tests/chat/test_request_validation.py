BASE_CONTEXT = {"path": "/insights", "month": "2026-06"}


def _payload(messages):
    return {"messages": messages, "context": BASE_CONTEXT}


def test_rejects_more_than_20_messages(chat_client):
    messages = [{"role": "user", "content": "hi"} for _ in range(21)]
    response = chat_client.post("/api/v1/chat", json=_payload(messages))
    assert response.status_code == 422


def test_rejects_message_over_2000_chars(chat_client):
    messages = [{"role": "user", "content": "x" * 2001}]
    response = chat_client.post("/api/v1/chat", json=_payload(messages))
    assert response.status_code == 422


def test_accepts_message_of_exactly_2000_chars(chat_client, llm_holder):
    from core.llm.base import StreamStop, TextDelta

    llm_holder["client"] = type(llm_holder["client"])(
        stream_script=[[TextDelta(text="ok"), StreamStop(reason="end_turn")]]
    )
    messages = [{"role": "user", "content": "x" * 2000}]
    response = chat_client.post("/api/v1/chat", json=_payload(messages))
    assert response.status_code == 200


def test_rejects_last_message_not_from_user(chat_client):
    messages = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    response = chat_client.post("/api/v1/chat", json=_payload(messages))
    assert response.status_code == 422


def test_rejects_empty_messages_list(chat_client):
    response = chat_client.post("/api/v1/chat", json=_payload([]))
    assert response.status_code == 422


def test_rejects_future_month(chat_client):
    payload = {
        "messages": [{"role": "user", "content": "hi"}],
        "context": {"path": "/insights", "month": "2099-01"},
    }
    response = chat_client.post("/api/v1/chat", json=payload)
    assert response.status_code == 422


def test_rejects_malformed_month(chat_client):
    payload = {
        "messages": [{"role": "user", "content": "hi"}],
        "context": {"path": "/insights", "month": "2026/06"},
    }
    response = chat_client.post("/api/v1/chat", json=payload)
    assert response.status_code == 422
