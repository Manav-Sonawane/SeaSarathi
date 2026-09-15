"""
OpenRouter LLM client for SeaSarathi — used by the revised (LLM-based)
IMD scraping strategy (see IMD_IMPLEMENTATION_PLAN.md) to turn messy,
format-inconsistent scraped text into structured JSON, instead of a
growing pile of per-region regex patterns.

API key: loaded from OPENROUTER_API_KEY in backend/.env.
Docs: https://openrouter.ai/docs

Model choice: `openai/gpt-4o-mini` — picked because it's a genuinely
lightweight/cheap model (this task doesn't need a large reasoning model,
just reliable text-to-JSON extraction) with well-established native JSON
`response_format` support on OpenRouter, which matters more here than raw
capability. Overridable via OPENROUTER_MODEL if this stops being the best
lightweight choice.
"""
import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")


class OpenRouterError(Exception):
    pass


async def chat_json(
    system_prompt: str,
    user_content: str,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 4000,
    temperature: float = 0.1,
) -> dict | list:
    """
    Sends a system+user prompt to OpenRouter and parses the response as
    JSON (using the model's native JSON response_format where supported,
    so this doesn't depend on the model remembering to skip prose).
    Raises OpenRouterError on any failure (missing key, HTTP error,
    invalid JSON) — callers should catch this and fall back to a
    non-LLM path rather than let a scrape endpoint 500 outright.
    """
    if not OPENROUTER_API_KEY:
        raise OpenRouterError("OPENROUTER_API_KEY not set in backend/.env")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        # OpenRouter-recommended attribution headers (optional but polite,
        # and required for some free-tier rate-limit accounting).
        "HTTP-Referer": "https://github.com/",
        "X-Title": "SeaSarathi",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(OPENROUTER_BASE_URL, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        raise OpenRouterError(f"OpenRouter request failed: {e}") from e

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise OpenRouterError(f"Unexpected OpenRouter response shape: {data}") from e

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise OpenRouterError(f"Model did not return valid JSON: {content[:500]}") from e
