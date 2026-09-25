"""
conversation.py — multi-turn context for /chat.

The mobile app sends the last few messages with each question so a follow-up
("and the waves?", "what about tomorrow?") can be understood in context. The
history arrives from the client, so it is treated as untrusted text: it is
size-capped, whitespace-collapsed (so it can't fake extra "User query:" lines
in a prompt) and only ever used as context. It never touches the
deterministic risk data — the safety verdict for the current position always
comes from the current data, not from what was said earlier.
"""

MAX_MESSAGES = 6        # most recent messages kept (3 question/answer pairs)
MAX_CHARS = 300         # per message

# A query this short with no topic keyword is treated as a follow-up.
FOLLOWUP_MAX_WORDS = 6
FOLLOWUP_MAX_CHARS = 80


def clean_history(raw) -> list[dict]:
    """Validates and trims client-supplied history to [{"role", "text"}, ...],
    oldest first, at most MAX_MESSAGES long. Anything malformed is dropped."""
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        role, text = item.get("role"), item.get("text")
        if role not in ("user", "assistant") or not isinstance(text, str):
            continue
        text = " ".join(text.split())[:MAX_CHARS]
        if text:
            out.append({"role": role, "text": text})
    return out[-MAX_MESSAGES:]


def format_history(history: list[dict] | None) -> str:
    """History as prompt text, or "" when there is none."""
    if not history:
        return ""
    return "\n".join(
        f"{'Fisherman' if h['role'] == 'user' else 'Assistant'}: {h['text']}" for h in history
    )


def last_user_query(history: list[dict] | None) -> str | None:
    """The fisherman's most recent earlier question, if any."""
    for h in reversed(history or []):
        if h["role"] == "user":
            return h["text"]
    return None


def looks_like_followup(query: str) -> bool:
    q = (query or "").strip()
    return bool(q) and len(q.split()) <= FOLLOWUP_MAX_WORDS and len(q) <= FOLLOWUP_MAX_CHARS
