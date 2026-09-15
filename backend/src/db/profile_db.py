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
import secrets
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional, List

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "seasarathi.sqlite")

# Mirrors mobile/src/store/userStore.ts field names/values exactly so the JSON
# body a client sends needs no translation layer on either side.
VALID_VESSEL_TYPES = {"small", "medium", "large", "union"}
VALID_RISK_TOLERANCES = {"conservative", "moderate", "aggressive"}
VALID_ROLES = {"fisherman", "union_leader"}


def generate_user_id(port: str = "") -> str:
    """
    Generates a unique, official-looking Indian Marine Fisher ID.
    Format: USR-<PORT_CODE>-<HEX4>, e.g. USR-KOC-7A82
    """
    clean_port = "".join(c for c in port if c.isalnum()).upper()
    prefix = clean_port[:3] if len(clean_port) >= 3 else "IND"
    suffix = secrets.token_hex(2).upper()
    return f"USR-{prefix}-{suffix}"


def _init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                device_id TEXT PRIMARY KEY,
                user_id TEXT UNIQUE,
                name TEXT NOT NULL DEFAULT 'Fisherman',
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
        # Ensure user_id, name, and password columns exist if table was already created in earlier versions
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(profiles)").fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE profiles ADD COLUMN user_id TEXT")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id)")
        if "name" not in cols:
            conn.execute("ALTER TABLE profiles ADD COLUMN name TEXT NOT NULL DEFAULT 'Fisherman'")
        if "password" not in cols:
            conn.execute("ALTER TABLE profiles ADD COLUMN password TEXT NOT NULL DEFAULT 'SeaSarathi@2026'")

        # Ensure preseeded demo profiles exist for quick testing and 1-tap logins
        _seed_preseeded_profiles_if_empty(conn)


def _seed_preseeded_profiles_if_empty(conn: sqlite3.Connection):
    exists = conn.execute("SELECT 1 FROM profiles WHERE user_id = 'USR-KOC-4821'").fetchone()
    if not exists:
        now = datetime.now(timezone.utc).isoformat()
        seeds = [
            (
                "device_ramesh_kerala_01",
                "USR-KOC-4821",
                "Ramesh Kumar",
                "SeaSarathi@2026",
                "medium",
                "moderate",
                "Kochi",
                "fisherman",
                "ml",
                json.dumps({"seeded": True, "notes": "Experienced gillnet operator"}),
                now,
                now,
            ),
            (
                "device_murugan_tn_02",
                "USR-CHE-9104",
                "Murugan Selvam",
                "SeaSarathi@2026",
                "large",
                "conservative",
                "Chennai",
                "fisherman",
                "ta",
                json.dumps({"seeded": True, "notes": "Deep-sea longliner operator"}),
                now,
                now,
            ),
            (
                "device_rajesh_guj_03",
                "USR-POR-2035",
                "Rajesh Patel",
                "SeaSarathi@2026",
                "union",
                "aggressive",
                "Porbandar",
                "union_leader",
                "gu",
                json.dumps({"seeded": True, "notes": "Saurashtra Fishermen Union President"}),
                now,
                now,
            ),
        ]
        conn.executemany(
            """
            INSERT OR IGNORE INTO profiles
                (device_id, user_id, name, password, vessel_type, risk_tolerance, operating_port, role, language, extra_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            seeds,
        )




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
    name: str = "Fisherman",
    user_id: Optional[str] = None,
    password: str = "SeaSarathi@2026",
    extra: Optional[dict] = None,
) -> dict:
    """
    Create or fully replace a profile for device_id.
    Guarantees a unique user_id is assigned and persisted.
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
            "SELECT created_at, user_id, name, password FROM profiles WHERE device_id = ?", (device_id,)
        ).fetchone()

        created_at = existing["created_at"] if existing else now

        # Determine user_id: use explicit arg, or existing stored ID, or generate brand new unique ID
        final_user_id = user_id or (existing["user_id"] if existing and existing["user_id"] else None)

        # Check for collision with a different device
        if final_user_id:
            collision = conn.execute(
                "SELECT device_id FROM profiles WHERE user_id = ? AND device_id != ?",
                (final_user_id, device_id),
            ).fetchone()
            if collision:
                final_user_id = None

        if not final_user_id:
            # Generate unique ID and ensure no collision
            for _ in range(10):
                candidate = generate_user_id(operating_port)
                dup = conn.execute("SELECT 1 FROM profiles WHERE user_id = ?", (candidate,)).fetchone()
                if not dup:
                    final_user_id = candidate
                    break
            if not final_user_id:
                final_user_id = generate_user_id(operating_port)


        final_name = name.strip() if name and name.strip() else (existing["name"] if existing else "Fisherman")
        final_password = password.strip() if password and password.strip() else (existing["password"] if existing and "password" in existing.keys() and existing["password"] else "SeaSarathi@2026")

        conn.execute(
            """
            INSERT INTO profiles
                (device_id, user_id, name, password, vessel_type, risk_tolerance, operating_port, role, language, extra_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                user_id = excluded.user_id,
                name = excluded.name,
                password = excluded.password,
                vessel_type = excluded.vessel_type,
                risk_tolerance = excluded.risk_tolerance,
                operating_port = excluded.operating_port,
                role = excluded.role,
                language = excluded.language,
                extra_json = excluded.extra_json,
                updated_at = excluded.updated_at
            """,
            (device_id, final_user_id, final_name, final_password, vessel_type, risk_tolerance, operating_port, role, language,
             extra_json, created_at, now),
        )

    return get_profile(device_id)


def get_profile(identifier: str) -> Optional[dict]:
    """
    Fetches profile matching either device_id OR user_id.
    """
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM profiles WHERE device_id = ? OR user_id = ?", (identifier, identifier)
        ).fetchone()
    if row is None:
        return None
    return _row_to_dict(row)


def list_profiles() -> List[dict]:
    """
    Returns all registered profiles ordered by latest update.
    """
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM profiles ORDER BY updated_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def delete_profile(identifier: str) -> bool:
    """
    Deletes profile matching either device_id OR user_id.
    """
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM profiles WHERE device_id = ? OR user_id = ?", (identifier, identifier)
        )
    return cur.rowcount > 0


def _row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "device_id": row["device_id"],
        "user_id": row["user_id"] if "user_id" in row.keys() and row["user_id"] else f"USR-{row['device_id'][-6:].upper()}",
        "name": row["name"] if "name" in row.keys() and row["name"] else "Fisherman",
        "password": row["password"] if "password" in row.keys() and row["password"] else "SeaSarathi@2026",
        "vessel_type": row["vessel_type"],
        "risk_tolerance": row["risk_tolerance"],
        "operating_port": row["operating_port"],
        "role": row["role"],
        "language": row["language"],
        "extra": json.loads(row["extra_json"]) if "extra_json" in row.keys() and row["extra_json"] else {},
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


_init_db()


