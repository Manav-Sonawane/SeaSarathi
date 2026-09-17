"""
profile.py — fisherman profile CRUD + login (UPDATE.md Task 1.1's backend
half).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class ProfileRequest(BaseModel):
    device_id: str
    user_id: str | None = None
    name: str = "Fisherman"
    password: str = "SeaSarathi@2026"
    vessel_type: str            # "small" | "medium" | "large" | "union"
    risk_tolerance: str         # "conservative" | "moderate" | "aggressive"
    # The fisherman's deliberately-SELECTED official/home port — always one
    # of the ~20 curated major ports (Kochi, Mumbai Sassoon Dock, Veraval,
    # etc.), used for identity (Marine Fisher ID generation is keyed off
    # this). Distinct from the ephemeral GPS-derived "current location"
    # below, which can be any of India's ~1223 real landing locations.
    operating_port: str
    role: str                   # "fisherman" | "union_leader"
    language: str
    # Free-form bag, round-tripped as-is. Used by the mobile app to persist
    # current_location_latitude/longitude/name/district/sector — the
    # fisherman's real GPS-bound position (nearest of all 1223 landing
    # locations, not just the curated ~20), kept separate from
    # operating_port so a real-time location fix never overwrites the
    # fisherman's stable, registered home port. Explicit nulls (not simply
    # omitted) clear a stale binding, since extra_json is fully REPLACED —
    # not merged — on every save (see profile_db.py's upsert_profile).
    extra: dict | None = None


class LoginRequest(BaseModel):
    identifier: str
    password: str = ""


class ProfileResponse(BaseModel):
    device_id: str
    user_id: str
    name: str
    vessel_type: str
    risk_tolerance: str
    operating_port: str
    role: str
    language: str
    extra: dict
    created_at: str
    updated_at: str


@router.get("/profiles", response_model=list[ProfileResponse], summary="List All Fisherman Profiles")
async def list_registered_profiles():
    """Returns all registered fisherman profiles in the database (including preseeded accounts)."""
    from src.db.profile_db import list_profiles
    profiles = list_profiles()
    return [ProfileResponse(**p) for p in profiles]


@router.post("/profile", response_model=ProfileResponse, summary="Create or Update Fisherman Profile")
async def upsert_profile(request: ProfileRequest):
    """
    Upserts a fisherman profile keyed by device_id or user_id.
    Assigns a unique official Marine Fisher ID (e.g. USR-KOC-XXXX) if not provided.
    """
    from src.db.profile_db import upsert_profile as db_upsert_profile
    try:
        profile = db_upsert_profile(
            device_id=request.device_id,
            user_id=request.user_id,
            name=request.name,
            password=request.password,
            vessel_type=request.vessel_type,
            risk_tolerance=request.risk_tolerance,
            operating_port=request.operating_port,
            role=request.role,
            language=request.language,
            extra=request.extra,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ProfileResponse(**profile)


@router.post("/auth/login", response_model=ProfileResponse, summary="Fisherman Login Authentication")
async def login_fisherman(request: LoginRequest):
    """
    Authenticates a fisherman by user_id or device_id and password.
    """
    from src.db.profile_db import get_profile
    identifier = request.identifier.strip()
    profile = get_profile(identifier)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"No account found for User ID: '{identifier}'")

    stored_pwd = profile.get("password") or "SeaSarathi@2026"
    if request.password and stored_pwd and request.password.strip() != stored_pwd.strip():
        raise HTTPException(status_code=401, detail="Incorrect password. Please verify your credentials.")

    return ProfileResponse(**profile)


@router.get("/profile/{identifier}", response_model=ProfileResponse, summary="Fetch Fisherman Profile")
async def fetch_profile(identifier: str):
    """Returns the stored profile for user_id or device_id, or 404 if none exists yet."""
    from src.db.profile_db import get_profile
    profile = get_profile(identifier)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"No profile found for identifier={identifier}")
    return ProfileResponse(**profile)


@router.delete("/profile/{identifier}", summary="Delete Fisherman Profile")
async def remove_profile(identifier: str):
    """Deletes the stored profile for user_id or device_id."""
    from src.db.profile_db import delete_profile
    deleted = delete_profile(identifier)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No profile found for identifier={identifier}")
    return {"deleted": True, "identifier": identifier}
