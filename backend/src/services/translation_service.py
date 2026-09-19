"""
translation_service.py — cached Sarvam translation for the dynamic English
text the backend produces (IMD bulletins, zone news). The app's fixed UI
strings are NOT translated here — those ship bundled in the app so they work
offline (mobile/src/constants/translations/).

Translation is always best-effort: any failure returns None and the caller
keeps the original English, which the app shows next to the translation
anyway. IMD warnings are safety text, so a translation must never be able to
block or replace the source.
"""
import asyncio
import time

from src.services.sarvam_client import LANGUAGE_BCP47, sarvam_translate

_CACHE: dict[tuple[str, str], str] = {}
_CACHE_MAX_ENTRIES = 2000
_CALL_TIMEOUT_S = 10.0          # total wait per request before falling back to English
_MAX_PARALLEL_CALLS = 4
_COOLDOWN_S = 60.0              # after a failure, skip Sarvam this long instead of stalling every request

_down_until = 0.0
_semaphore = asyncio.Semaphore(_MAX_PARALLEL_CALLS)
_background: set[asyncio.Future] = set()


def is_translatable(lang: str | None) -> bool:
    """True for a supported non-English app language code."""
    return bool(lang) and lang != "en" and lang in LANGUAGE_BCP47


async def _translate_one(text: str, lang: str) -> str | None:
    global _down_until
    key = (lang, text)
    if key in _CACHE:
        return _CACHE[key]
    if time.monotonic() < _down_until:
        return None
    try:
        async with _semaphore:
            translated = await asyncio.to_thread(sarvam_translate, text, lang)
    except Exception as e:
        print(f"[translation] {lang} translate failed, using original text: {e}")
        _down_until = time.monotonic() + _COOLDOWN_S
        return None
    if len(_CACHE) >= _CACHE_MAX_ENTRIES:
        _CACHE.pop(next(iter(_CACHE)))      # drop the oldest entry
    _CACHE[key] = translated
    return translated


async def translate_many(texts: list[str], lang: str) -> list[str | None]:
    """
    Translates each text to `lang` (an app language code, e.g. "hi"), in
    parallel and de-duplicated. Returns a list aligned with `texts`; an entry
    is None where translation was unavailable (unsupported language, Sarvam
    error or timeout, empty text).
    """
    if not is_translatable(lang):
        return [None] * len(texts)
    unique = list(dict.fromkeys(t for t in texts if t and t.strip()))
    if not unique:
        return [None] * len(texts)

    tasks = {t: asyncio.ensure_future(_translate_one(t, lang)) for t in unique}
    _, pending = await asyncio.wait(tasks.values(), timeout=_CALL_TIMEOUT_S)
    # Slow translations keep running and land in the cache, so the next
    # request (e.g. the app's next refresh) gets them instantly. Hold a
    # reference so they aren't garbage-collected mid-flight.
    for task in pending:
        _background.add(task)
        task.add_done_callback(_background.discard)
    result = {t: (task.result() if task.done() else None) for t, task in tasks.items()}
    return [result.get(t) for t in texts]
