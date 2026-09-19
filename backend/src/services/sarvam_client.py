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
SARVAM_STT_MODEL = "saaras:v3"
SARVAM_TTS_MODEL = "bulbul:v3"
SARVAM_TRANSLATE_MODEL = "sarvam-translate:v1"

# /translate request cap for sarvam-translate:v1 is 2000 chars per call; stay
# a little under it.
SARVAM_TRANSLATE_MAX_CHARS = 1800

# App language codes (see mobile/src/constants/portsAndLanguages.ts) -> Sarvam's
# BCP-47 codes. Sarvam's Indian-language coverage happens to match this app's
# language list exactly, except Odia is "od-IN" (not "or-IN").
LANGUAGE_BCP47 = {
    "en": "en-IN",
    "hi": "hi-IN",
    "ml": "ml-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "mr": "mr-IN",
    "or": "od-IN",
    "kn": "kn-IN",
}

# TTS request cap (bulbul:v3): 2500 chars per call. Longer text is split into
# chunks at sentence boundaries and synthesized as multiple audio clips rather
# than one combined file — concatenating raw WAV bytes correctly requires
# re-parsing/merging headers, which isn't worth it when the client can just
# play a short list of clips back to back.
SARVAM_TTS_MAX_CHARS = 2500


def sarvam_generate(prompt: str, max_tokens: int = 1024, temperature: float = 0.3) -> str:
    """
    Calls Sarvam-105B chat completion and returns the assistant message text.
    Raises an exception if the API call fails (caller handles fallback).

    Reasoning is disabled (reasoning_effort=None): sarvam-105b is a reasoning model
    that defaults to reasoning_effort="medium" server-side, which burns most of the
    token budget on a visible chain-of-thought dumped into `content` and adds several
    seconds of latency. We need a short, direct final answer, not the scratchpad.

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
        "reasoning_effort": None,
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


def sarvam_speech_to_text(audio_bytes: bytes, filename: str, language_code: str | None = None) -> dict:
    """
    Transcribes audio via Sarvam's /speech-to-text (saaras:v3).

    Args:
        audio_bytes: Raw audio file bytes (WAV/M4A/OGG/etc — whatever the
            client recorded; Sarvam accepts a broad range of codecs directly).
        filename: Original filename, used only to hint the content type.
        language_code: BCP-47 code (e.g. "hi-IN") to bias recognition, or
            None to let Sarvam auto-detect ("unknown").

    Returns:
        {"transcript": str, "language_code": str | None,
         "language_probability": float | None} — the probability is Sarvam's
        own confidence in its detected language_code (0.0-1.0), useful if a
        caller ever wants to show a confidence indicator or fall back to a
        hint when it's low.
    """
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set in backend/.env")

    headers = {"api-subscription-key": SARVAM_API_KEY}
    files = {"file": (filename, audio_bytes)}
    data = {
        "model": SARVAM_STT_MODEL,
        "language_code": language_code or "unknown",
    }

    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{SARVAM_BASE_URL}/speech-to-text",
            headers=headers,
            files=files,
            data=data,
        )
        response.raise_for_status()
        result = response.json()
        # Sarvam also returns per-word `timestamps`, but only when the
        # request sets with_timestamps=true (we don't — nothing to pass
        # through unless a caller actually wants word-level timing, e.g.
        # for a karaoke-style transcript highlight).
        return {
            "transcript": result.get("transcript", ""),
            "language_code": result.get("language_code"),
            "language_probability": result.get("language_probability"),
        }


def sarvam_text_to_speech(text: str, language_code: str, speaker: str = "shubh") -> list[str]:
    """
    Synthesizes speech via Sarvam's /text-to-speech (bulbul:v3).

    Splits text longer than SARVAM_TTS_MAX_CHARS into sentence-boundary
    chunks (each synthesized separately — see module-level comment on why
    chunks aren't merged into one file server-side).

    Args:
        text: The text to speak.
        language_code: BCP-47 code (e.g. "hi-IN").
        speaker: Sarvam voice name (lowercase).

    Returns:
        List of base64-encoded WAV strings, one per chunk, in playback order.
    """
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set in backend/.env")
    if not text.strip():
        return []

    chunks = _split_into_chunks(text, SARVAM_TTS_MAX_CHARS)

    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
    }

    audios: list[str] = []
    with httpx.Client(timeout=60.0) as client:
        for chunk in chunks:
            payload = {
                "text": chunk,
                "language_code": language_code,
                "model": SARVAM_TTS_MODEL,
                "speaker": speaker,
            }
            response = client.post(
                f"{SARVAM_BASE_URL}/text-to-speech",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            result = response.json()
            audios.extend(result.get("audios", []))
    return audios


def sarvam_translate(text: str, target_language: str, source_language: str = "en") -> str:
    """
    Translates text via Sarvam's /translate (sarvam-translate:v1) — a dedicated
    translation model, not the chat LLM, so it renders the source wording
    rather than paraphrasing it (which matters for safety warnings).

    Args:
        text: Text to translate. Longer than SARVAM_TRANSLATE_MAX_CHARS is
            split at sentence boundaries and translated piece by piece.
        target_language / source_language: this app's language codes ("hi",
            "ml", ...) — mapped to Sarvam's BCP-47 codes via LANGUAGE_BCP47.

    Raises if the API call fails or the language is unsupported (callers fall
    back to the original text).
    """
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not set in backend/.env")
    if target_language not in LANGUAGE_BCP47 or source_language not in LANGUAGE_BCP47:
        raise ValueError(f"Unsupported translation language: {source_language} -> {target_language}")
    if not text.strip():
        return text

    headers = {
        "api-subscription-key": SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    out: list[str] = []
    with httpx.Client(timeout=30.0) as client:
        for chunk in _split_into_chunks(text, SARVAM_TRANSLATE_MAX_CHARS):
            response = client.post(
                f"{SARVAM_BASE_URL}/translate",
                headers=headers,
                json={
                    "input": chunk,
                    "source_language_code": LANGUAGE_BCP47[source_language],
                    "target_language_code": LANGUAGE_BCP47[target_language],
                    "model": SARVAM_TRANSLATE_MODEL,
                },
            )
            response.raise_for_status()
            translated = response.json().get("translated_text")
            if not translated:
                raise ValueError(f"Empty translation from Sarvam: {response.text[:200]}")
            out.append(translated)
    return " ".join(out)


def _split_into_chunks(text: str, max_chars: int) -> list[str]:
    """Splits text into <=max_chars pieces, breaking at sentence ends where
    possible so each chunk is still natural to speak aloud."""
    if len(text) <= max_chars:
        return [text]

    import re
    sentences = re.split(r"(?<=[.!?।])\s+", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) > max_chars:
            if current:
                chunks.append(current)
            # A single sentence longer than max_chars: hard-split it.
            current = sentence[:max_chars]
            while len(current) == max_chars and len(sentence) > max_chars:
                sentence = sentence[max_chars:]
                chunks.append(current)
                current = sentence[:max_chars]
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


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
