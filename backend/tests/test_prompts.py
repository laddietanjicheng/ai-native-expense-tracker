from core.prompts.chat import CHAT_SYSTEM_PROMPT_TEMPLATE
from core.prompts.insights import INSIGHTS_SYSTEM_PROMPT


def test_chat_prompt_warns_against_following_tool_result_content():
    assert "untrusted data" in CHAT_SYSTEM_PROMPT_TEMPLATE
    assert "not instructions" in CHAT_SYSTEM_PROMPT_TEMPLATE
    assert "category" in CHAT_SYSTEM_PROMPT_TEMPLATE.lower()


def test_insights_prompt_warns_against_following_fact_content():
    assert "untrusted data" in INSIGHTS_SYSTEM_PROMPT
    assert "not instructions" in INSIGHTS_SYSTEM_PROMPT
    assert "category" in INSIGHTS_SYSTEM_PROMPT.lower()
