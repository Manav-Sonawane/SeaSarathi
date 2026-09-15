"""
imd_http.py — shared HTTP fetch helper for the IMD scrapers, with retry and
exponential backoff.

Phase 7 of IMD_IMPLEMENTATION_PLAN.md ("Error Handling & Testing"). Applied
at the one point every Phase 1/2/3/4/5 scraper already funnels its network
I/O through (each module's own fetch-text/fetch-bytes function), instead of
duplicating retry logic five times. A single IMD page fetch failing outright
was already handled gracefully by every scraper (recorded per-region/port/
date, doesn't crash the whole scrape) — this adds a retry BEFORE that
per-item failure is recorded, so a transient blip (one dropped connection,
one 503) doesn't need to wait for the next scheduled refresh to resolve
itself.

IMPORTANT — only retries what's actually worth retrying. Connection-level
failures (dropped connection, timeout) and a specific allowlist of HTTP
statuses (429 rate-limited, 5xx server errors) are retried; everything else
(404, 401, 403, ...) raises immediately on the first attempt. Found live
while testing this module: a naive `except aiohttp.ClientError` catches
`ClientResponseError` too (it's a subclass), which would otherwise retry a
permanent 404 three times for no benefit — wasted time and requests against
IMD's server for an error retrying can never fix.
"""
import asyncio
import aiohttp

DEFAULT_RETRIES = 3
DEFAULT_BACKOFF_BASE_SECONDS = 1.0  # 1s, 2s, 4s between attempts
USER_AGENT = "SeaSarathi/1.0 (+https://github.com/; marine safety app for Indian fishermen)"

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def _request(session: aiohttp.ClientSession, url: str, method: str, data: dict | None):
    headers = {"User-Agent": USER_AGENT}
    if method == "POST":
        return session.post(url, data=data, headers=headers)
    return session.get(url, headers=headers)


async def _fetch(session: aiohttp.ClientSession, url: str, method: str, data: dict | None, retries: int, read_bytes: bool):
    last_error: Exception | None = None
    for attempt in range(retries):
        is_last_attempt = attempt == retries - 1
        try:
            async with _request(session, url, method, data) as resp:
                if resp.status >= 400:
                    if resp.status in _RETRYABLE_STATUS and not is_last_attempt:
                        last_error = aiohttp.ClientResponseError(
                            resp.request_info, resp.history, status=resp.status,
                            message=f"Retryable status {resp.status}",
                        )
                    else:
                        # Non-retryable status (404/401/403/...), or a
                        # retryable one that's out of attempts — raise now,
                        # never retried further either way.
                        resp.raise_for_status()
                else:
                    return await (resp.read() if read_bytes else resp.text())
        except (aiohttp.ClientConnectionError, asyncio.TimeoutError) as e:
            # Connection-level failures (never got an HTTP response at all)
            # are always worth retrying, regardless of status-code policy.
            last_error = e
            if is_last_attempt:
                raise

        delay = DEFAULT_BACKOFF_BASE_SECONDS * (2 ** attempt)
        print(f"[imd_http] {method} {url} failed (attempt {attempt + 1}/{retries}): {last_error} — retrying in {delay:.0f}s")
        await asyncio.sleep(delay)
    raise last_error


async def fetch_text(session: aiohttp.ClientSession, url: str, method: str = "GET", data: dict | None = None, retries: int = DEFAULT_RETRIES) -> str:
    return await _fetch(session, url, method, data, retries, read_bytes=False)


async def fetch_bytes(session: aiohttp.ClientSession, url: str, retries: int = DEFAULT_RETRIES) -> bytes:
    return await _fetch(session, url, "GET", None, retries, read_bytes=True)
