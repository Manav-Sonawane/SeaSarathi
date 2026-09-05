import os
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

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
    yield
    print("SeaSarathi Backend shutting down...")


app = FastAPI(
    title="SeaSarathi API",
    description="Marine Intelligence Platform - India-specific agentic safety system for fishermen",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS: allow React Native and local dev origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8081",   # Expo Metro bundler
        "http://localhost:19006",  # Expo web
        "http://10.0.2.2:8000",   # Android emulator → host
        "*",                       # Allow all for hackathon dev (restrict in prod)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request / Response Models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str
    latitude: float = 8.5       # Default: Kochi
    longitude: float = 76.2
    language: str = "en"        # en | hi | ta


class ChatResponse(BaseModel):
    risk_level: str             # "LOW" | "MODERATE" | "HIGH"
    wind_speed_10m: float
    wave_height: float
    precipitation: float
    visibility: float
    wind_gusts_10m: float
    lightning: bool
    cyclone: bool
    recommendation: str
    confidence: int             # 0-100
    sources: list[str]


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
                "risk_level": "LOW",
                "wind_speed_10m": 0.0,
                "wave_height": 0.0,
                "precipitation": 0.0,
                "visibility": 0.0,
                "wind_gusts_10m": 0.0,
                "lightning": False,
                "cyclone": False,
                "recommendation": "",
                "confidence": 0,
                "sources": [],
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


# ─── GeoJSON Endpoints ─────────────────────────────────────────────────────────

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "static")


@app.get("/geojson/pfz", summary="PFZ Zones GeoJSON")
async def get_pfz_geojson():
    """Returns all 52 Potential Fishing Zones as GeoJSON FeatureCollection."""
    path = os.path.join(DATA_DIR, "pfz_zones.geojson")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="pfz_zones.geojson not found in /data/static/")
    with open(path) as f:
        return json.load(f)


@app.get("/geojson/boundaries", summary="Maritime Boundaries GeoJSON")
async def get_boundaries_geojson():
    """Returns India EEZ, international maritime boundaries, and MPAs."""
    path = os.path.join(DATA_DIR, "boundaries.geojson")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="boundaries.geojson not found in /data/static/")
    with open(path) as f:
        return json.load(f)


# ─── PFZ Endpoint ──────────────────────────────────────────────────────────────

@app.get("/pfz/nearest", summary="Nearest PFZ Zones")
async def get_nearest_pfz(latitude: float = 8.5, longitude: float = 76.2, limit: int = 5):
    """
    Returns the {limit} nearest PFZ zones to the given coordinates,
    sorted by Haversine distance (km). Adds mock SST + Chlorophyll.
    """
    from src.utils.geo import find_nearest_zones
    pfz_path = os.path.join(DATA_DIR, "pfz_zones.geojson")
    if not os.path.exists(pfz_path):
        raise HTTPException(status_code=404, detail="pfz_zones.geojson not found")
    with open(pfz_path) as f:
        pfz_geojson = json.load(f)
    nearest = find_nearest_zones(latitude, longitude, pfz_geojson, n=limit)
    # Augment with mock ocean data (real data added in Day 2 data agent)
    for zone in nearest:
        zone["sst"] = 27.2
        zone["chlorophyll"] = 0.85
        zone["confidence"] = max(30, 100 - int(zone["distance_km"] / 2))
    return {"zones": nearest, "query_lat": latitude, "query_lon": longitude}


# ─── Alerts Endpoint (Stub) ───────────────────────────────────────────────────

@app.get("/alerts", summary="Marine Safety Alerts")
async def get_alerts(latitude: float = 8.5, longitude: float = 76.2):
    """
    Returns active marine safety alerts for the given location.
    Stub implementation - real geofencing + weather logic added Day 4.
    """
    return {
        "alerts": [
            {
                "type": "INFO",
                "message": "Alerts endpoint active. Weather + geofence integration coming Day 4.",
                "source": "system",
            }
        ],
        "query_lat": latitude,
        "query_lon": longitude,
    }


# ─── Data Status Endpoint ──────────────────────────────────────────────────────

@app.get("/data/status", summary="Data Freshness Status")
async def data_status():
    """Check which static data files are present."""
    files = ["pfz_zones.geojson", "boundaries.geojson", "chlorophyll_historical.json", "sst_historical.json"]
    status = {}
    for f in files:
        path = os.path.join(DATA_DIR, f)
        status[f] = {
            "exists": os.path.exists(path),
            "size_bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        }
    return {"static_data": status}
