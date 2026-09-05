"""
Sarvam AI client wrapper for SeaSarathi.
Supports:
  - sarvam-105b (primary LLM for planning + response)
  - sarvam-translate:v1 (translation, Phase 2)
  - saaras:v3 (STT, Phase 2)
  - bulbul:v3 (TTS, Phase 2)

API Key: loaded from SARVAM_API_KEY in backend/.env
Docs: https://docs.sarvam.ai
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_BASE_URL = "https://api.sarvam.ai"
SARVAM_LLM_MODEL = "sarvam-105b"


def sarvam_generate(prompt: str, max_tokens: int = 1024, temperature: float = 0.3) -> str:
    """
    Calls Sarvam-105B chat completion and returns the assistant message text.
    Raises an exception if the API call fails (caller handles fallback).

    Args:
        prompt: The full prompt string to send as a user message.
        max_tokens: Maximum tokens in the response.
        temperature: Sampling temperature (lower = more deterministic).

    Returns:
        The assistant's response as a string.
    """
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set in backend/.env")

    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "model": SARVAM_LLM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a precise marine safety assistant for Indian fishermen. "
                    "Always respond with accurate, grounded information. "
                    "Never fabricate safety data."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{SARVAM_BASE_URL}/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        message = data["choices"][0]["message"]
        # sarvam-105b is a reasoning model — content may be null during reasoning phase.
        # Fall back to reasoning_content if content is absent.
        content = message.get("content") or message.get("reasoning_content") or ""
        if not content:
            raise ValueError(f"Empty response from Sarvam. Full response: {data}")
        return content


def test_sarvam_connection() -> dict:
    """
    Quick connectivity test for the Sarvam API.
    Run this to verify the API key works.
    Returns a dict with success status and response or error.
    """
    try:
        response = sarvam_generate(
            "Reply with exactly: SARVAM_OK",
            max_tokens=10,
            temperature=0.0,
        )
        return {"success": True, "response": response.strip(), "model": SARVAM_LLM_MODEL}
    except Exception as e:
        return {"success": False, "error": str(e), "model": SARVAM_LLM_MODEL}


if __name__ == "__main__":
    print("Testing Sarvam API connection...")
    result = test_sarvam_connection()
    if result["success"]:
        print(f"[OK] Sarvam connected - Model: {result['model']} - Response: {result['response']}")
    else:
        print(f"[FAIL] Sarvam error: {result['error']}")
