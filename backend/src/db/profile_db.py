"""
profile_db.py — SQLite-backed storage for fisherman profiles.

Owner: MNV (Backend/AI) — the backend half of UPDATE.md Task 1.1 "Profile Building".
The mobile form (ProfileScreen.tsx) and its local Zustand store are ARP's territory
and are untouched here; this module + the /profile endpoints in main.py exist so a
profile survives an app reinstall / new device and can be read by the agent pipeline
(prompt injection, decision tree) instead of living only in phone-local storage.

Uses Python's stdlib sqlite3 — no new dependency, no server process to run.
Keyed by device_id: a client-generated identifier (UUID) persisted on-device.
There is no authentication layer in this hackathon build, so device_id is the
only identity — good enough for a single-user phone app, not for multi-tenant use.
"""

import os
import sqlite3
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "seasarathi.sqlite")

# Mirrors mobile/src/store/userStore.ts field names/values exactly so the JSON
# body a client sends needs no translation layer on either side.
VALID_VESSEL_TYPES = {"small", "medium", "large", "union"}
VALID_RISK_TOLERANCES = {"conservative", "moderate", "aggressive"}
VALID_ROLES = {"fisherman", "union_leader"}


def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                device_id TEXT PRIMARY KEY,
                vessel_type TEXT NOT NULL,
                risk_tolerance TEXT NOT NULL,
                operating_port TEXT NOT NULL,
                role TEXT NOT NULL,
                language TEXT NOT NULL,
                extra_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def upsert_profile(
    device_id: str,
    vessel_type: str,
    risk_tolerance: str,
    operating_port: str,
    role: str,
    language: str,
    extra: Optional[dict] = None,
) -> dict:
    """
    Create or fully replace a profile for device_id. Validation of the enum
    fields happens here (not just at the API layer) so any future caller of
    this module gets the same guarantees.
    """
    if vessel_type not in VALID_VESSEL_TYPES:
        raise ValueError(f"vessel_type must be one of {sorted(VALID_VESSEL_TYPES)}")
    if risk_tolerance not in VALID_RISK_TOLERANCES:
        raise ValueError(f"risk_tolerance must be one of {sorted(VALID_RISK_TOLERANCES)}")
    if role not in VALID_ROLES:
        raise ValueError(f"role must be one of {sorted(VALID_ROLES)}")
    if not operating_port.strip():
        raise ValueError("operating_port must not be empty")
    if not language.strip():
        raise ValueError("language must not be empty")

    now = datetime.now(timezone.utc).isoformat()
    extra_json = json.dumps(extra or {})

    with _connect() as conn:
        existing = conn.execute(
            "SELECT created_at FROM profiles WHERE device_id = ?", (device_id,)
        ).fetchone()
        created_at = existing["created_at"] if existing else now

        conn.execute(
            """
            INSERT INTO profiles
                (device_id, vessel_type, risk_tolerance, operating_port, role, language, extra_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                vessel_type = excluded.vessel_type,
                risk_tolerance = excluded.risk_tolerance,
                operating_port = excluded.operating_port,
                role = excluded.role,
                language = excluded.language,
                extra_json = excluded.extra_json,
                updated_at = excluded.updated_at
            """,
            (device_id, vessel_type, risk_tolerance, operating_port, role, language,
             extra_json, created_at, now),
        )

    return get_profile(device_id)


def get_profile(device_id: str) -> Optional[dict]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM profiles WHERE device_id = ?", (device_id,)
        ).fetchone()
    if row is None:
        return None
    return _row_to_dict(row)


def delete_profile(device_id: str) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM profiles WHERE device_id = ?", (device_id,))
    return cur.rowcount > 0


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "device_id": row["device_id"],
        "vessel_type": row["vessel_type"],
        "risk_tolerance": row["risk_tolerance"],
        "operating_port": row["operating_port"],
        "role": row["role"],
        "language": row["language"],
        "extra": json.loads(row["extra_json"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


_init_db()
