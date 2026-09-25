"""
main.py — FastAPI app entrypoint: lifespan (background data refresh),
CORS, and wiring together the per-domain routers in src/routers/.

Endpoint logic itself lives in src/routers/*.py, one file per feature area
(chat, profile, pfz, alerts, imd, voice, ...) — this file used to hold all
32 endpoints directly (1000+ lines), which meant every unrelated feature
edit touched the same file and made blast radius hard to reason about.
Splitting by router doesn't change any endpoint's behavior; it only changes
which file you open to touch one feature without brushing against another.
"""
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables from backend/.env
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=_env_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("SeaSarathi Backend starting up...")
    print(f"  SARVAM_API_KEY: {'SET' if os.getenv('SARVAM_API_KEY') else 'MISSING'}")
    from src.routers.chat import AGENT_AVAILABLE
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

# Shared-secret gate for a PUBLIC deployment. The API has no user auth, and
# several endpoints (chat, voice, translation) spend the server's Sarvam
# credits, so anyone who finds the URL could run up the bill. When API_KEY is
# set every request except /health* (used by the app's startup check and
# uptime monitors) and CORS preflights must carry a matching `x-api-key`
# header. The key ships inside the app (EXPO_PUBLIC_API_KEY), so it is a
# speed bump against casual abuse, not real authentication — rotate it by
# changing the env var and rebuilding the app. Unset (local dev) = no check.
_API_KEY = os.getenv("API_KEY", "")
if _API_KEY:
    import hmac
    from fastapi.responses import JSONResponse

    @app.middleware("http")
    async def require_api_key(request, call_next):
        if request.method == "OPTIONS" or request.url.path.startswith("/health"):
            return await call_next(request)
        if not hmac.compare_digest(request.headers.get("x-api-key", ""), _API_KEY):
            return JSONResponse({"detail": "Missing or invalid API key"}, status_code=401)
        return await call_next(request)

from src.routers import (
    health,
    chat,
    profile,
    offline,
    geojson,
    pfz,
    landing,
    ocean,
    geofence,
    imd,
    news,
    alerts,
    data,
    voice,
    forecast,
)

for module in (health, chat, profile, offline, geojson, pfz, landing, ocean, geofence, imd, news, alerts, data, voice, forecast):
    app.include_router(module.router)
