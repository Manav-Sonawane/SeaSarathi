import os
import json
import asyncio
from contextlib import asynccontextmanager
from functools import lru_cache
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv


@lru_cache(maxsize=8)
def _load_geojson(path: str) -> dict:
    """
    Loads and parses a static GeoJSON file once per process, not on every
    request. These files (PFZ zones, EEZ/boundaries, landing centers) never
    change at runtime — re-reading and re-json.load()ing them on every
    /geojson/*, /landing/nearest, and /pfz/nearest call was pure waste, and
    synchronous disk I/O on the event loop besides. Mirrors the pattern
    already used for the Copernicus grid (copernicus_service._load_grid).
    """
    with open(path, encoding="utf-8") as f:
        return json.load(f)

# Load environment variables from backend/.env
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=_env_path)

# Import agent graph (lazy import to avoid startup crash if deps missing)
try:
    from src.agents.graph import agent
    AGENT_AVAILABLE = True
except Exception as e:
    print(f"[WARN] Agent not available: {e}")
    AGENT_AVAILABLE = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("SeaSarathi Backend starting up...")
    print(f"  SARVAM_API_KEY: {'SET' if os.getenv('SARVAM_API_KEY') else 'MISSING'}")
    print(f"  Agent available: {AGENT_AVAILABLE}")

    # Data freshness (backend/src/utils/data_freshness.py):
    #   1. Unconditional Copernicus grid fetch on every startup, backgrounded
    #      so it never delays the server becoming ready (~90s live fetch) —
    #      the server starts serving immediately on whatever grid is already
    #      on disk (or none, gracefully, if this is a first run).
    #   2. A periodic loop that re-checks every 30 min and re-fetches only
    #      once the grid crosses 6 hours old, for the rest of this process's
    #      uptime (not just at startup).
    from src.utils.data_freshness import refresh_grid_now, start_periodic_freshness_loop
    asyncio.create_task(refresh_grid_now())
    freshness_task = asyncio.create_task(start_periodic_freshness_loop())

    # IMD live-feed cache (backend/src/services/imd_cache.py) — same
    # backgrounded-startup-refresh + periodic-staleness-loop pattern as the
    # Copernicus grid above, applied to Phases 1/2/3/5's scrapers.
    from src.services.imd_cache import refresh_all_now, start_periodic_imd_refresh_loop
    asyncio.create_task(refresh_all_now())
    imd_refresh_task = asyncio.create_task(start_periodic_imd_refresh_loop())

    yield

    freshness_task.cancel()
    imd_refresh_task.cancel()
    print("SeaSarathi Backend shutting down...")


app = FastAPI(
    title="SeaSarathi API",
    description="Marine Intelligence Platform - India-specific agentic safety system for fishermen",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: intentionally wide open ("*") — the mobile app's dev-server host
# changes every time the phone switches networks (see api.ts's
# detectDevServerHost), so a fixed origin allowlist isn't practical here.
# This is safe specifically because the API has no cookie/session-based
# auth to leak: `device_id` travels as an explicit request body/query field,
# never a browser-managed credential. `allow_credentials=True` combined
# with a wildcard origin is what actually creates risk (it makes browsers
# send cookies/auth headers cross-origin to any site) — dropped since this
# API doesn't use cookies at all, so there's nothing for it to protect.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request / Response Models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str
    latitude: float = 8.5       # Default: Kochi
    longitude: float = 76.2
    language: str = "en"        # en | hi | ta
    profile: dict | None = None


class ProfileRequest(BaseModel):
    device_id: str
    user_id: str | None = None
    name: str = "Fisherman"
    password: str = "SeaSarathi@2026"
    vessel_type: str            # "small" | "medium" | "large" | "union"
    risk_tolerance: str         # "conservative" | "moderate" | "aggressive"
    operating_port: str
    role: str                   # "fisherman" | "union_leader"
    language: str


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



class OfflineBundleRequest(BaseModel):
    latitude: float = 8.5        # Default: Kochi
    longitude: float = 76.2
    trip_days: int = 5           # Clamped server-side to [1, 10]


class TTSRequest(BaseModel):
    text: str
    language: str = "en"         # App language code (see LANGUAGE_BCP47), not BCP-47 directly


class ChatResponse(BaseModel):
    risk_level: str             # "LOW" | "MODERATE" | "HIGH"
    wind_speed_10m: float
    wave_height: float
    precipitation: float
    visibility: float
    wind_gusts_10m: float
    lightning: bool
    cyclone: bool
    sst_c: float | None = None
    chlorophyll_mg_m3: float | None = None
    nearest_pfz: dict | None = None
    local_fishing_area: dict | None = None   # Populated when PFZ is >50 km away
    pfz_weather: dict | None = None
    geofence: dict | None = None
    nearest_landing: dict | None = None
    landing_options: list[dict] = []
    route_summary: dict | None = None
    alerts: list[dict] = []
    recommendation: str
    confidence: int             # 0-100
    sources: list[str]
    data_freshness: dict | None = None


# ─── Health Check ──────────────────────────────────────────────────────────────

@app.get("/health", summary="Health Check")
async def health():
    return {
        "status": "ok",
        "service": "SeaSarathi API",
        "version": "1.0.0",
        "sarvam_key_set": bool(os.getenv("SARVAM_API_KEY")),
        "agent_ready": AGENT_AVAILABLE,
    }


# ─── Chat Endpoint ─────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse, summary="Marine Intelligence Chat")
async def chat(request: ChatRequest):
    """
    Primary endpoint: accepts a natural language query about fishing / marine conditions.
    Routes through LangGraph agent pipeline:
      Planner → Data → Risk → Response
    Returns structured risk assessment + natural language recommendation.
    """
    if AGENT_AVAILABLE:
        try:
            from src.agents.graph import AgentState
            initial_state: AgentState = {
                "query": request.query,
                "latitude": request.latitude,
                "longitude": request.longitude,
                "intent": "",
                "profile": request.profile,
                "risk_level": "LOW",
                "wind_speed_10m": 0.0,
                "wave_height": 0.0,
                "precipitation": 0.0,
                "visibility": 0.0,
                "wind_gusts_10m": 0.0,
                "lightning": False,
                "cyclone": False,
                "sst_c": None,
                "chlorophyll_mg_m3": None,
                "nearest_pfz": None,
                "local_fishing_area": None,
                "pfz_weather": None,
                "geofence": None,
                "nearest_landing": None,
                "landing_options": [],
                "route_summary": None,
                "alerts": [],
                "recommendation": "",
                "confidence": 0,
                "sources": [],
                "data_freshness": None,
            }
            result = await agent.ainvoke(initial_state)
            return ChatResponse(**result)



        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")
    else:
        # Stub response while agents are being built
        return ChatResponse(
            risk_level="LOW",
            wind_speed_10m=12.0,
            wave_height=1.2,
            precipitation=0.0,
            visibility=10000.0,
            wind_gusts_10m=15.0,
            lightning=False,
            cyclone=False,
            recommendation=(
                f"[STUB] Your query: '{request.query}'. "
                f"Conditions near ({request.latitude:.1f}, {request.longitude:.1f}) "
                f"look acceptable. Agents not yet fully initialized."
            ),
            confidence=50,
            sources=["stub-mock"],
        )


# ─── Profile Endpoints (UPDATE.md Task 1.1 — backend half) ────────────────────

@app.get("/profiles", response_model=list[ProfileResponse], summary="List All Fisherman Profiles")
async def list_registered_profiles():
    """Returns all registered fisherman profiles in the database (including preseeded accounts)."""
    from src.db.profile_db import list_profiles
    profiles = list_profiles()
    return [ProfileResponse(**p) for p in profiles]


@app.post("/profile", response_model=ProfileResponse, summary="Create or Update Fisherman Profile")
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
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ProfileResponse(**profile)


@app.post("/auth/login", response_model=ProfileResponse, summary="Fisherman Login Authentication")
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



@app.get("/profile/{identifier}", response_model=ProfileResponse, summary="Fetch Fisherman Profile")
async def fetch_profile(identifier: str):
    """Returns the stored profile for user_id or device_id, or 404 if none exists yet."""
    from src.db.profile_db import get_profile
    profile = get_profile(identifier)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"No profile found for identifier={identifier}")
    return ProfileResponse(**profile)


@app.delete("/profile/{identifier}", summary="Delete Fisherman Profile")
async def remove_profile(identifier: str):
    """Deletes the stored profile for user_id or device_id."""
    from src.db.profile_db import delete_profile
    deleted = delete_profile(identifier)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No profile found for identifier={identifier}")
    return {"deleted": True, "identifier": identifier}



# ─── Deep Sea Connectivity / Offline Bundle (UPDATE.md Improvement 3) ─────────
# Backend half only. See src/services/offline_cache.py's module docstring for
# exactly what mobile (ARP) still needs to build on top of this endpoint.

@app.post("/offline/sync-bundle", summary="Build Offline Bundle for Deep-Sea Trips")
async def offline_sync_bundle(request: OfflineBundleRequest):
    """
    Fetches everything the app needs to answer chat/map/PFZ/landing queries
    with no live network connection: static geometry (PFZ zones, maritime
    boundaries, landing centers), a multi-day Open-Meteo forecast, current
    Copernicus SST/chlorophyll, a 30-day historical baseline, and geofence
    status for the departure point. Meant to be called once before sailing,
    not on a hot path — this does real, sometimes-slow upstream fetches
    (Open-Meteo + Copernicus), so expect this to take longer than /chat.
    """
    from src.services.offline_cache import sync_offline_bundle
    try:
        return sync_offline_bundle(request.latitude, request.longitude, request.trip_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Offline bundle error: {str(e)}")


# ─── GeoJSON Endpoints ─────────────────────────────────────────────────────────

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "static")


@app.get("/geojson/pfz", summary="PFZ Zones GeoJSON")
async def get_pfz_geojson():
    """Returns all 52 Potential Fishing Zones as GeoJSON FeatureCollection."""
    path = os.path.join(DATA_DIR, "PFZ.geojson")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="PFZ.geojson not found in /data/static/")
    return _load_geojson(path)

@app.get("/geojson/landing", summary="Landing Centers GeoJSON")
async def get_landing_geojson():
    """Returns all 1223 fish landing centers as a GeoJSON FeatureCollection, for map pins."""
    path = os.path.join(DATA_DIR, "LANDING-LOCATIONS.geojson")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="LANDING-LOCATIONS.geojson not found in /data/static/")
    return _load_geojson(path)

@app.get("/geojson/boundaries", summary="Maritime Boundaries GeoJSON")
async def get_boundaries_geojson():
    """Returns India EEZ + international maritime boundaries as one FeatureCollection."""
    eez_path = os.path.join(DATA_DIR, "INDIA-EEZ.geojson")
    boundaries_path = os.path.join(DATA_DIR, "INDIAN-WATER-BOUNDARIES.geojson")
    if not os.path.exists(eez_path) or not os.path.exists(boundaries_path):
        raise HTTPException(status_code=404, detail="INDIA-EEZ.geojson or INDIAN-WATER-BOUNDARIES.geojson not found in /data/static/")
    eez = _load_geojson(eez_path)
    boundaries = _load_geojson(boundaries_path)
    return {
        "type": "FeatureCollection",
        "features": eez.get("features", []) + boundaries.get("features", []),
    }


# ─── PFZ Endpoint ──────────────────────────────────────────────────────────────────

@app.get("/pfz/nearest", summary="Nearest PFZ Zones")
async def get_nearest_pfz(latitude: float = 8.5, longitude: float = 76.2, limit: int = 5):
    """
    Returns the {limit} nearest Potential Fishing Zones sorted by Haversine distance (km).
    Each zone includes name, distance, compass direction, confidence score,
    and SST/Chlorophyll placeholders (Copernicus integration pending).
    """
    # The zone search + per-zone Copernicus grid lookups are synchronous CPU
    # work (a numpy scan over 30K+ grid points, up to `limit` times) — run
    # off the event loop so one request doesn't stall every other concurrent
    # request for the duration.
    return await asyncio.to_thread(_compute_nearest_pfz, latitude, longitude, limit)


def _compute_nearest_pfz(latitude: float, longitude: float, limit: int) -> dict:
    from src.utils.geo import find_nearest_zones
    from src.services.copernicus_service import lookup_nearest as lookup_sst_chl
    import math

    pfz_path = os.path.join(DATA_DIR, "PFZ.geojson")
    if not os.path.exists(pfz_path):
        raise HTTPException(status_code=404, detail="PFZ.geojson not found in /data/static/")
    pfz_geojson = _load_geojson(pfz_path)

    nearest = find_nearest_zones(latitude, longitude, pfz_geojson, n=limit)

    def bearing(lat1, lon1, lat2, lon2) -> str:
        d_lon = math.radians(lon2 - lon1)
        lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
        x = math.sin(d_lon) * math.cos(lat2_r)
        y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)
        angle = (math.degrees(math.atan2(x, y)) + 360) % 360
        dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
        return dirs[int((angle + 22.5) / 45) % 8]

    for zone in nearest:
        d = zone["distance_km"]
        zone["direction"] = bearing(latitude, longitude, zone["centroid_lat"], zone["centroid_lon"])

        sst_chl = lookup_sst_chl(zone["centroid_lat"], zone["centroid_lon"])
        confidence = max(20, min(100, int(100 - d * 1.5)))
        if sst_chl:
            zone["sst"] = sst_chl["sst_c"]
            zone["chlorophyll"] = sst_chl["chl_mg_m3"]
            zone["data_note"] = f"SST/Chlorophyll from Copernicus grid ({sst_chl['sst_time'][:10]}), " \
                                 f"~{sst_chl['distance_km']} km from zone centroid"
            # Slightly discount confidence if the nearest grid cell is far from the zone.
            if sst_chl["distance_km"] > 60:
                confidence = max(20, confidence - 10)
        else:
            zone["sst"] = None
            zone["chlorophyll"] = None
            zone["data_note"] = "SST/Chlorophyll grid unavailable — run scripts/fetch_copernicus_grid.py"
        zone["confidence"] = confidence

    return {"zones": nearest, "count": len(nearest), "query_lat": latitude, "query_lon": longitude}


@app.get("/pfz/local-grid", summary="Estimated Local Fishing Zones (small-boat range)")
async def get_local_fishing_grid(latitude: float = 8.5, longitude: float = 76.2, radius_km: float = 9.0):
    """
    For when the nearest official INCOIS PFZ is too far to be practical (small
    boats especially): ranks real cached SST/Chlorophyll grid points within
    radius_km, using local SST variation as a thermal-front proxy and
    chlorophyll as an area-level productivity floor. See
    src/services/fishing_zone_estimator.py for the scoring and its honesty
    notes on data resolution. Degrades gracefully — always returns a usable
    result, never a 500, even if the grid can't support a fine comparison
    at this exact spot.
    """
    from src.services.fishing_zone_estimator import estimate_local_fishing_zones
    result = estimate_local_fishing_zones(latitude, longitude, radius_km=radius_km, top_n=5)
    return {**result, "query_lat": latitude, "query_lon": longitude}


# ─── Landing Locations Endpoint ─────────────────────────────────────────────────────────────

@app.get("/landing/nearest", summary="Nearest Landing Locations")
async def get_nearest_landing(latitude: float = 8.5, longitude: float = 76.2, limit: int = 5):
    """
    Returns the {limit} nearest fish landing centers to the given coordinates.
    Data from LANDING-LOCATIONS.geojson (1223 locations across India).
    Each result includes name, district, sector, and distance in km.
    """
    from src.utils.geo import find_nearest_landing_sites
    landing_path = os.path.join(DATA_DIR, "LANDING-LOCATIONS.geojson")
    if not os.path.exists(landing_path):
        raise HTTPException(status_code=404, detail="LANDING-LOCATIONS.geojson not found")
    landing_geojson = _load_geojson(landing_path)
    sites = find_nearest_landing_sites(latitude, longitude, landing_geojson, n=limit)
    return {"sites": sites, "count": len(sites), "query_lat": latitude, "query_lon": longitude}


@app.get("/ocean/point", summary="SST & Chlorophyll at a Point")
async def get_ocean_point(latitude: float = 8.5, longitude: float = 76.2):
    """
    Returns the nearest Copernicus grid cell's SST/chlorophyll for an arbitrary
    point — used for on-tap lookups (e.g. a landing-center pin) rather than
    bulk-enriching every point in a GeoJSON layer up front.
    """
    from src.services.copernicus_service import lookup_nearest as lookup_sst_chl
    result = lookup_sst_chl(latitude, longitude)
    if not result:
        return {
            "available": False,
            "sst_c": None,
            "chlorophyll_mg_m3": None,
            "query_lat": latitude,
            "query_lon": longitude,
        }
    return {
        "available": True,
        "sst_c": result["sst_c"],
        "chlorophyll_mg_m3": result["chl_mg_m3"],
        "grid_distance_km": result["distance_km"],
        "sst_time": result["sst_time"],
        "chl_time": result["chl_time"],
        "query_lat": latitude,
        "query_lon": longitude,
    }


@app.get("/geofence/check", summary="Maritime Boundary Geofence Check")
async def geofence_check(latitude: float = 8.5, longitude: float = 76.2):
    """
    Checks if the given coordinates are near or crossing international maritime
    boundaries or outside the India EEZ. Returns severity-sorted alerts.
    Alert types: GEOFENCE_DANGER | GEOFENCE_WARNING | INTERNATIONAL_WATERS
    """
    from src.utils.geofence import check_geofence, is_in_indian_waters
    alerts = check_geofence(latitude, longitude)
    return {
        "latitude": latitude,
        "longitude": longitude,
        "in_indian_waters": is_in_indian_waters(latitude, longitude),
        "alert_count": len(alerts),
        "alerts": alerts,
    }


# ─── IMD Fisherman Warnings Endpoint ──────────────────────────────────────────────────
# Phase 1 of IMD_IMPLEMENTATION_PLAN.md (src/services/imd_fisherman_scraper.py). Always
# live-scrapes on every call (~10-20s) — kept that way deliberately rather than reading
# from Phase 6's cache, since this is the "give me the truth right now" endpoint. For a
# fast, cached, always-current snapshot of this same data alongside the other three live
# feeds, see GET /alerts/imd/all (src/services/imd_cache.py).

@app.get("/imd/fisherman-warnings", summary="IMD Fisherman Warnings (live scrape)")
async def imd_fisherman_warnings():
    from src.services.imd_fisherman_scraper import scrape_fisherman_warnings
    try:
        return await scrape_fisherman_warnings()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD fisherman-warnings scrape failed: {e}")


# ─── IMD Sea Area Bulletins Endpoint ──────────────────────────────────────────────────
# Phase 2 of IMD_IMPLEMENTATION_PLAN.md (src/services/imd_sea_area_scraper.py). Always
# live-scrapes (see the Fisherman Warnings endpoint's comment above for why, and
# GET /alerts/imd/all for the cached alternative). The safety-critical TTT (cyclone/storm)
# warning field is parsed deterministically, not via the LLM — see that module's docstring.

@app.get("/imd/sea-area-bulletins", summary="IMD Sea Area Bulletins (live scrape)")
async def imd_sea_area_bulletins():
    from src.services.imd_sea_area_scraper import scrape_sea_area_bulletins
    try:
        return await scrape_sea_area_bulletins()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD sea-area-bulletins scrape failed: {e}")


# ─── IMD Cyclone/Fishermen Warning Archive Endpoint ───────────────────────────────────
# Phase 3 of IMD_IMPLEMENTATION_PLAN.md (src/services/imd_cyclone_warning_scraper.py).
# Always live-scrapes — this one takes date/days params for arbitrary historical queries,
# which Phase 6's cache (today's data only) can't serve anyway. 15 regions x `days` dates
# fetched concurrently (~10-15s for days=1). For today's data cached, see GET /alerts/imd/all.

@app.get("/imd/cyclone-warnings", summary="IMD Cyclone/Fishermen Warning Archive (live scrape)")
async def imd_cyclone_warnings(date: str | None = None, days: int = 1):
    """
    `date`: YYYY-MM-DD, defaults to today. `days`: how many days back from
    `date` to include (1-3, see imd_cyclone_warning_scraper.MAX_DAYS).
    """
    from src.services.imd_cyclone_warning_scraper import scrape_cyclone_warnings
    try:
        return await scrape_cyclone_warnings(date_str=date, days=days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD cyclone-warnings scrape failed: {e}")


# ─── IMD Sea Area Bulletin Archive Endpoint ───────────────────────────────────────────
# Phase 4 of IMD_IMPLEMENTATION_PLAN.md (src/services/imd_sea_area_archive_scraper.py).
# Live scrape on every call — no caching/scheduler yet (Phase 6, not implemented).
# `limit` archived PDFs per sea area get their divisions parsed (default 5, max 20) —
# fetching/parsing every historical entry would be slow and pointless for a live feed.
# Expect ~15-20s per parsed entry pair (both sea areas fetched together, one LLM call).

@app.get("/imd/sea-area-archive", summary="IMD Sea Area Bulletin Archive (live scrape)")
async def imd_sea_area_archive(limit: int = 5):
    from src.services.imd_sea_area_archive_scraper import scrape_sea_area_archive
    try:
        return await scrape_sea_area_archive(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD sea-area-archive scrape failed: {e}")


# ─── IMD Port Warning Archive Endpoint ────────────────────────────────────────────────
# Phase 5 of IMD_IMPLEMENTATION_PLAN.md (src/services/imd_port_warning_scraper.py). Always
# live-scrapes — takes date/days params like Phase 3's endpoint, for the same reason. 120
# ports (not the plan's assumed ~8) x `days` dates, concurrency-capped at
# MAX_CONCURRENT_REQUESTS (~8-10s for days=1). `severity` is classified from IMD's own
# published port-signal taxonomy (DC1/DW2/LC3/LW4/D5-D7/GD8-GD10/XI) — see that module's
# docstring. For today's data cached, see GET /alerts/imd/all.

@app.get("/imd/port-warnings", summary="IMD Port Warning Archive (live scrape)")
async def imd_port_warnings(date: str | None = None, days: int = 1):
    """
    `date`: YYYY-MM-DD, defaults to today. `days`: how many days back from
    `date` to include (1-3, see imd_port_warning_scraper.MAX_DAYS).
    """
    from src.services.imd_port_warning_scraper import scrape_port_warnings
    try:
        return await scrape_port_warnings(date_str=date, days=days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"IMD port-warnings scrape failed: {e}")


# ─── IMD Unified Cached Endpoint ───────────────────────────────────────────────────────
# Phase 6 of IMD_IMPLEMENTATION_PLAN.md (src/services/imd_cache.py). Reads from the
# in-memory cache kept warm by main.py's lifespan (startup refresh + periodic staleness
# loop, same pattern as the Copernicus grid) instead of live-scraping — normally
# near-instant. Falls back to a synchronous scrape only if a source has genuinely never
# been cached yet (e.g. a request landing before the startup refresh finished).

@app.get("/alerts/imd/all", summary="All IMD Live Feeds (cached)")
async def imd_all_cached():
    from src.services.imd_cache import get_all
    return await get_all()


@app.get("/alerts/imd/status", summary="IMD Cache Status")
async def imd_cache_status():
    from src.services.imd_cache import cache_status
    return cache_status()


# ─── Alerts Endpoint ───────────────────────────────────────────────────────────────────

@app.get("/alerts", summary="Marine Safety Alerts")
async def get_alerts(latitude: float = 8.5, longitude: float = 76.2):
    """
    Unified marine safety alerts combining geofence + weather + IMD live-feed
    checks (src/services/imd_alerts.py, cache-backed — never blocks on a
    live IMD scrape). Returns alerts sorted by severity (HIGH first).
    """
    # fetch_combined_forecasts_for_grid uses a synchronous HTTP client
    # (openmeteo_requests, retry-wrapped — up to 5 retries with backoff) plus
    # synchronous pandas processing, run directly here before this fix —
    # network I/O blocking the event loop is worse than the disk-I/O
    # blocking fixed elsewhere (see /pfz/nearest), since it can take seconds
    # and stalls every other concurrent request meanwhile.
    base = await asyncio.to_thread(_compute_alerts, latitude, longitude)

    from src.services.imd_alerts import get_location_imd_alerts
    from src.utils.geo import find_nearest_landing_sites
    state_name = None
    try:
        landing_path = os.path.join(DATA_DIR, "LANDING-LOCATIONS.geojson")
        if os.path.exists(landing_path):
            nearest = find_nearest_landing_sites(latitude, longitude, _load_geojson(landing_path), n=1)
            if nearest:
                state_name = nearest[0]["sector"]
    except Exception as e:
        print(f"[Alerts] Nearest-state lookup for IMD alerts failed: {e}")

    imd_alerts = await get_location_imd_alerts(state_name)
    all_alerts = base["alerts"] + imd_alerts
    sev_rank = {"HIGH": 0, "MODERATE": 1, "INFO": 2}
    all_alerts.sort(key=lambda a: sev_rank.get(a["severity"], 99))

    return {
        **base,
        "alerts": all_alerts,
        "alert_count": len(all_alerts),
        "has_high_severity": any(a["severity"] == "HIGH" for a in all_alerts),
    }


def _compute_alerts(latitude: float, longitude: float) -> dict:
    from src.utils.geofence import check_geofence
    from src.services.weather_service import fetch_combined_forecasts_for_grid, generate_grid_point_id
    import numpy as np
    import pandas as pd

    alerts = []

    # 1. Geofence alerts
    try:
        for a in check_geofence(latitude, longitude):
            alerts.append({
                "type": a["type"], "severity": a["severity"],
                "message": a["message"], "source": "geofence",
                "metadata": {"boundary": a.get("boundary"), "distance_km": a.get("distance_km")}
            })
    except Exception as e:
        print(f"[Alerts] Geofence error: {e}")

    # 2. Weather alerts
    try:
        combined = fetch_combined_forecasts_for_grid(np.array([latitude]), np.array([longitude]))
        point_id = generate_grid_point_id(latitude, longitude)
        data = combined.get(point_id, {})
        now_utc = pd.Timestamp.now(tz="UTC")

        weather_df = data.get("general_weather_forecast")
        if weather_df is not None and not weather_df.empty:
            w = weather_df[weather_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if w.empty: w = weather_df.head(12)
            max_wind = float(w["wind_speed_10m"].max())
            max_gust = float(w["wind_gusts_10m"].max())
            total_rain = float(w["precipitation"].sum())
            min_vis = float(w["visibility"].min())
            max_code = int(w["weather_code"].dropna().max()) if not w["weather_code"].dropna().empty else 0

            if max_wind > 46:
                alerts.append({"type": "HIGH_WIND", "severity": "HIGH",
                    "message": f"Dangerous winds: {max_wind:.0f} km/h (gusts {max_gust:.0f} km/h). Do not venture out.",
                    "source": "open-meteo", "metadata": {"wind_speed_10m": max_wind, "wind_gusts_10m": max_gust}})
            elif max_wind > 28:
                alerts.append({"type": "MODERATE_WIND", "severity": "MODERATE",
                    "message": f"Elevated winds: {max_wind:.0f} km/h. Exercise caution at sea.",
                    "source": "open-meteo", "metadata": {"wind_speed_10m": max_wind}})
            if total_rain > 50:
                alerts.append({"type": "HEAVY_RAIN", "severity": "HIGH",
                    "message": f"Heavy rainfall: {total_rain:.0f} mm in 12 hrs. Conditions will deteriorate.",
                    "source": "open-meteo", "metadata": {"precipitation_mm": total_rain}})
            if min_vis < 1000:
                alerts.append({"type": "LOW_VISIBILITY", "severity": "MODERATE",
                    "message": f"Low visibility: {min_vis/1000:.1f} km. Navigation risk increased.",
                    "source": "open-meteo", "metadata": {"visibility_m": min_vis}})
            if max_code >= 95:
                alerts.append({"type": "THUNDERSTORM", "severity": "HIGH",
                    "message": "Thunderstorm with lightning forecast. Do NOT go out to sea.",
                    "source": "open-meteo", "metadata": {"weather_code": max_code}})

        marine_df = data.get("marine_forecast")
        if marine_df is not None and not marine_df.empty:
            m = marine_df[marine_df["date"] <= now_utc + pd.Timedelta(hours=12)]
            if m.empty: m = marine_df.head(12)
            max_wave = float(m["wave_height"].max())
            if max_wave > 3.5:
                alerts.append({"type": "DANGEROUS_WAVES", "severity": "HIGH",
                    "message": f"Dangerous waves: {max_wave:.1f} m. Small vessels must stay ashore.",
                    "source": "open-meteo-marine", "metadata": {"wave_height_m": max_wave}})
            elif max_wave > 2.0:
                alerts.append({"type": "HIGH_WAVES", "severity": "MODERATE",
                    "message": f"High waves: {max_wave:.1f} m. Avoid smaller vessels.",
                    "source": "open-meteo-marine", "metadata": {"wave_height_m": max_wave}})
    except Exception as e:
        print(f"[Alerts] Weather error: {e}")
        alerts.append({"type": "SYSTEM", "severity": "INFO",
            "message": "Weather data unavailable. Check IMD for latest advisories.",
            "source": "system", "metadata": {}})

    sev_rank = {"HIGH": 0, "MODERATE": 1, "INFO": 2}
    alerts.sort(key=lambda a: sev_rank.get(a["severity"], 99))

    return {
        "alert_count": len(alerts),
        "has_high_severity": any(a["severity"] == "HIGH" for a in alerts),
        "alerts": alerts,
        "latitude": latitude,
        "longitude": longitude,
    }


# ─── Risk Heatmap Endpoint (Day 4) ──────────────────────────────────────────────────

@app.get("/geojson/risk", summary="Risk Heatmap GeoJSON")
async def get_risk_heatmap(resolution: float = 1.0):
    """
    Returns a GeoJSON FeatureCollection of Point features covering the India EEZ,
    each scored LOW / MODERATE / HIGH based on real Open-Meteo weather data.
    Each feature includes:
      - risk_score (0-100), risk_level, color (#00C853 / #FFB300 / #D50000)
      - wind_speed_10m, wave_height, precipitation, lightning, cyclone
      - sst_c, chlorophyll (from Copernicus precomputed grid)
    Results are cached for 30 minutes. Use /geojson/risk/refresh to force update.

    Query params:
      resolution: Grid spacing in degrees (default 1.0). Use 0.5 for higher density.
    """
    from src.services.risk_heatmap import generate_risk_heatmap
    if resolution not in (0.25, 0.5, 1.0):
        resolution = 1.0   # clamp to supported values
    return generate_risk_heatmap(resolution_deg=resolution)


@app.get("/geojson/risk/refresh", summary="Force-refresh Risk Heatmap Cache")
async def refresh_risk_heatmap(resolution: float = 1.0):
    """Bypass the 30-minute cache and regenerate the risk heatmap immediately."""
    from src.services.risk_heatmap import generate_risk_heatmap
    if resolution not in (0.25, 0.5, 1.0):
        resolution = 1.0
    result = generate_risk_heatmap(resolution_deg=resolution, force_refresh=True)
    return {
        "refreshed": True,
        "total_points": result["metadata"]["total_points"],
        "generation_time_s": result["metadata"]["generation_time_s"],
        "risk_counts": result["metadata"]["risk_counts"],
        "generated_at": result["metadata"]["generated_at"],
    }


# ─── Data Status Endpoint ────────────────────────────────────────────────────────────

DYNAMIC_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "dynamic")


@app.get("/data/status", summary="Data Freshness Status")
async def data_status():
    """Check which static and dynamic data files are present and their sizes."""
    static_files = [
        "PFZ.geojson",
        "INDIA-EEZ.geojson",
        "INDIAN-WATER-BOUNDARIES.geojson",
        "LANDING-LOCATIONS.geojson",
    ]
    status_static = {}
    for f in static_files:
        path = os.path.join(DATA_DIR, f)
        status_static[f] = {
            "exists": os.path.exists(path),
            "size_bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        }

    dynamic_files = ["sst_chl_grid.json"]
    status_dynamic = {}
    for f in dynamic_files:
        path = os.path.join(DYNAMIC_DIR, f)
        status_dynamic[f] = {
            "exists": os.path.exists(path),
            "size_bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        }

    return {"static_data": status_static, "dynamic_data": status_dynamic}


async def _grid_status(refresh_if_stale: bool) -> dict:
    """
    Shared "check age/staleness, optionally refresh, check again" logic
    behind both /data/freshness and /data/refresh below — those two
    endpoints used to duplicate this same sequence with slightly different
    variable names. Each endpoint still shapes its own response (their
    field names are both live-depended-on by the mobile app's
    freshnessAPI — see mobile/src/services/api.ts — so the response
    contracts stay exactly as they were; only the underlying logic is now
    written once).
    """
    from src.utils.data_freshness import get_grid_age_hours, is_grid_stale, get_grid_metadata, refresh_grid_if_stale

    age = get_grid_age_hours()
    stale = is_grid_stale()
    refreshed = False
    if refresh_if_stale and stale:
        res = await refresh_grid_if_stale()
        refreshed = res.get("refreshed", False)
        age = get_grid_age_hours()
        stale = is_grid_stale()
    return {"age": age, "stale": stale, "refreshed": refreshed, "metadata": get_grid_metadata()}


@app.get("/data/freshness", summary="Copernicus Grid Freshness")
async def data_freshness(auto_refresh: bool = False):
    """
    Age of the precomputed SST/Chlorophyll grid and whether it's due for a
    refresh (see src/utils/data_freshness.py). If auto_refresh=True and the data
    is stale (>6 hours old or missing), triggers an automatic background re-fetch.
    """
    from src.utils.data_freshness import DEFAULT_MAX_AGE_HOURS

    status = await _grid_status(refresh_if_stale=auto_refresh)
    return {
        "grid_age_hours": round(status["age"], 2) if status["age"] is not None else None,
        "stale": status["stale"],
        "max_age_hours": DEFAULT_MAX_AGE_HOURS,
        "grid_exists": status["age"] is not None,
        "refreshed": status["refreshed"],
        "metadata": status["metadata"],
    }


# ─── Voice (STT / TTS) Endpoints ────────────────────────────────────────────────

@app.post("/voice/stt", summary="Speech to Text")
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


@app.post("/voice/tts", summary="Text to Speech")
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


@app.post("/data/refresh", summary="Trigger Data Refresh")
async def data_refresh(force: bool = False):
    """
    Refreshes the SST/Chlorophyll grid.
    If force=False, only refreshes if current data is older than 6 hours (or missing).
    If force=True, forces an immediate unconditional re-fetch.
    """
    from src.utils.data_freshness import get_grid_age_hours, refresh_grid_now

    prev_age = get_grid_age_hours()

    if force:
        # Genuinely distinct from _grid_status's "only if stale" logic —
        # force means unconditional, so it stays its own path.
        ok = await refresh_grid_now()
        status = await _grid_status(refresh_if_stale=False)
    else:
        status = await _grid_status(refresh_if_stale=True)
        ok = status["refreshed"]

    new_age = status["age"]
    return {
        "success": ok,
        "previous_age_hours": round(prev_age, 2) if prev_age is not None else None,
        "new_age_hours": round(new_age, 2) if new_age is not None else None,
        "stale": status["stale"],
        "metadata": status["metadata"],
        "message": (
            "Data successfully re-fetched and updated."
            if ok
            else "Data is already fresh (< 6 hours old). Set force=true to override."
        ),
    }

