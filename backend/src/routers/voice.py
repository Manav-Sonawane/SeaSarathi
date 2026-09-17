"""voice.py — Sarvam-backed speech-to-text and text-to-speech endpoints."""
import asyncio
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    language: str = "en"         # App language code (see LANGUAGE_BCP47), not BCP-47 directly


@router.post("/voice/stt", summary="Speech to Text")
async def voice_stt(file: UploadFile = File(...), language: str | None = Form(None)):
    """
    Transcribes an uploaded audio clip via Sarvam's saaras:v3 STT.
    `language` is an app language code (e.g. "hi", "ml") used only as a
    recognition hint — omit it to let Sarvam auto-detect the spoken language.
    """
    from src.services.sarvam_client import sarvam_speech_to_text, LANGUAGE_BCP47

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    bcp47 = LANGUAGE_BCP47.get(language) if language else None
    try:
        result = await asyncio.to_thread(
            sarvam_speech_to_text, audio_bytes, file.filename or "audio.m4a", bcp47
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Speech-to-text failed: {e}")

    return result


@router.post("/voice/tts", summary="Text to Speech")
async def voice_tts(request: TTSRequest):
    """
    Synthesizes speech via Sarvam's bulbul:v3 TTS. Returns one or more
    base64-encoded WAV clips (multiple only if `text` exceeded the per-call
    character cap — see sarvam_client.py) for the client to play in order.
    """
    from src.services.sarvam_client import sarvam_text_to_speech, LANGUAGE_BCP47, SARVAM_TTS_MAX_CHARS

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    # Without a cap, an arbitrarily large request fans out into an
    # unbounded number of sequential Sarvam API calls (see
    # sarvam_client.py's chunking) — a real cost/quota exposure with no
    # legitimate client reason to ever send this much text at once. 4
    # chunks' worth is already far beyond any real advisory.
    max_chars = SARVAM_TTS_MAX_CHARS * 4
    if len(request.text) > max_chars:
        raise HTTPException(
            status_code=422,
            detail=f"text too long ({len(request.text)} chars) — max {max_chars} chars per request",
        )

    bcp47 = LANGUAGE_BCP47.get(request.language, "en-IN")
    try:
        audios = await asyncio.to_thread(sarvam_text_to_speech, request.text, bcp47)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Text-to-speech failed: {e}")

    return {"audios": audios, "language_code": bcp47}
