"""AI providers — OpenAI compatible (主). Phase X+ 可加 anthropic / gemini 等。"""

from app.api.v1.ai.providers.openai_compatible import (
    AIClient,
    AIClientCallOptions,
    ChatMessage,
)

__all__ = [
    "AIClient",
    "AIClientCallOptions",
    "ChatMessage",
]
