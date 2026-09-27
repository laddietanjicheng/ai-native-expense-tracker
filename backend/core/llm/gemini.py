import logging
import uuid
from collections.abc import Iterator
from typing import Any

from google import genai
from google.genai import errors, types

from config.llm import LLMSettings
from core.llm.base import LLMEvent, StreamStop, TextDelta, ToolSpec, ToolUseRequest

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 1500

# JSON Schema keywords Gemini's `parameters_json_schema` rejects or ignores; stripped recursively
# before a schema is sent (spec: core/analytics/validation.py and app/chat/service.py tool specs
# only use plain object/array/string/enum schemas today, but this keeps new schemas safe too).
_UNSUPPORTED_SCHEMA_KEYS = {"additionalProperties", "$defs", "$ref", "$schema", "title", "default"}


def _sanitize_schema(schema: Any) -> Any:
    if isinstance(schema, dict):
        return {
            key: _sanitize_schema(value)
            for key, value in schema.items()
            if key not in _UNSUPPORTED_SCHEMA_KEYS
        }
    if isinstance(schema, list):
        return [_sanitize_schema(item) for item in schema]
    return schema


def _tool_declaration(tool: ToolSpec) -> types.Tool:
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=tool.name,
                description=tool.description,
                parameters_json_schema=_sanitize_schema(tool.input_schema),
            )
        ]
    )


def _map_finish_reason(reason: types.FinishReason | None, has_tool_calls: bool) -> str:
    """Gemini reports `STOP` even when the turn ends in a function call, unlike Anthropic's
    explicit `tool_use`; a tool call always takes priority so the tool loop keeps running."""
    if has_tool_calls:
        return "tool_use"
    if reason == types.FinishReason.STOP:
        return "end_turn"
    if reason == types.FinishReason.MAX_TOKENS:
        return "max_tokens"
    return "other"


class GeminiClient:
    """LLMClient backed by the google-genai SDK, using forced (ANY-mode) function calling for
    structured output. Automatic function calling is disabled: this app runs its own tool loop."""

    def __init__(self, settings: LLMSettings) -> None:
        api_key = settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else None
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=settings.request_timeout_seconds * 1000),
        )
        self._model = settings.insights_model_for_provider()
        self._chat_model = settings.chat_model_for_provider()

    def _map_error(self, exc: Exception) -> RuntimeError:
        status = getattr(exc, "code", None)
        logger.exception("Gemini API request failed (status=%s)", status)
        if status == 429:
            return RuntimeError("Gemini API quota exceeded (rate limited)")
        return RuntimeError(f"Gemini API request failed (status={status})")

    def generate_structured(
        self, system: str, prompt: str, schema: dict[str, Any], tool_name: str
    ) -> dict[str, Any]:
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=MAX_OUTPUT_TOKENS,
            tools=[
                _tool_declaration(
                    ToolSpec(
                        name=tool_name,
                        description="Return the structured result for this request.",
                        input_schema=schema,
                        status_text="",
                    )
                )
            ],
            tool_config=types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(
                    mode="ANY", allowed_function_names=[tool_name]
                )
            ),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        try:
            response = self._client.models.generate_content(
                model=self._model, contents=prompt, config=config
            )
        except errors.APIError as exc:
            raise self._map_error(exc) from exc
        except Exception as exc:  # noqa: BLE001 - normalise any SDK failure to RuntimeError
            logger.exception("Gemini request failed")
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        for candidate in response.candidates or []:
            if candidate.content is None:
                continue
            for part in candidate.content.parts or []:
                if part.function_call and part.function_call.name == tool_name:
                    return part.function_call.args or {}
        raise RuntimeError("Gemini response did not include the expected tool call")

    def _build_contents(self, messages: list[dict[str, Any]]) -> list[types.Content]:
        """Translate the provider-agnostic Anthropic-shaped message list (built by
        `core/agents/tool_loop.py`) into Gemini `Content`s. Gemini's `FunctionResponse` is
        matched to its call by name, not by id (`Part.from_function_response` has no id
        parameter), so tool_use ids seen in this history are tracked to recover the name a
        `tool_result` block only references by id."""
        id_to_name: dict[str, str] = {}
        contents: list[types.Content] = []
        for message in messages:
            role = message.get("role")
            content = message.get("content")
            blocks = content if isinstance(content, list) else [{"type": "text", "text": content}]
            parts: list[types.Part] = []
            for block in blocks:
                block_type = block.get("type")
                if block_type == "text":
                    parts.append(types.Part(text=block["text"]))
                elif block_type == "tool_use":
                    id_to_name[block["id"]] = block["name"]
                    parts.append(
                        types.Part(
                            function_call=types.FunctionCall(
                                id=block["id"], name=block["name"], args=block["input"]
                            )
                        )
                    )
                elif block_type == "tool_result":
                    tool_use_id = block.get("tool_use_id", "")
                    name = id_to_name.get(tool_use_id, "unknown")
                    result_content = block.get("content")
                    response = (
                        result_content
                        if isinstance(result_content, dict)
                        else {"result": result_content}
                    )
                    parts.append(
                        types.Part(
                            function_response=types.FunctionResponse(
                                id=tool_use_id, name=name, response=response
                            )
                        )
                    )
            gemini_role = "model" if role == "assistant" else "user"
            contents.append(types.Content(role=gemini_role, parts=parts))
        return contents

    def stream_turn(
        self,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> Iterator[LLMEvent]:
        contents = self._build_contents(messages)
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
            tools=[_tool_declaration(t) for t in tools] or None,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

        function_calls: list[types.FunctionCall] = []
        finish_reason: types.FinishReason | None = None
        try:
            for chunk in self._client.models.generate_content_stream(
                model=self._chat_model, contents=contents, config=config
            ):
                for candidate in chunk.candidates or []:
                    if candidate.finish_reason:
                        finish_reason = candidate.finish_reason
                    if candidate.content is None or not candidate.content.parts:
                        continue
                    for part in candidate.content.parts:
                        if part.text:
                            yield TextDelta(text=part.text)
                        if part.function_call:
                            function_calls.append(part.function_call)
        except errors.APIError as exc:
            raise self._map_error(exc) from exc
        except Exception as exc:  # noqa: BLE001 - normalise any SDK failure to RuntimeError
            logger.exception("Gemini stream failed")
            raise RuntimeError(f"Gemini request failed: {exc}") from exc

        for function_call in function_calls:
            call_id = function_call.id or f"gm_{uuid.uuid4().hex[:8]}"
            yield ToolUseRequest(
                id=call_id, name=function_call.name or "", input=function_call.args or {}
            )

        yield StreamStop(reason=_map_finish_reason(finish_reason, bool(function_calls)))
