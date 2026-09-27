import os

# Tests never depend on a developer's backend/.env LLM settings; real env vars win over .env.
os.environ["LLM_PROVIDER"] = "fake"
os.environ["ANTHROPIC_API_KEY"] = ""
os.environ["GEMINI_API_KEY"] = ""
