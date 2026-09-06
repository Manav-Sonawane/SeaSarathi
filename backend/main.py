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
    sst_c: float | None = None
    chlorophyll_mg_m3: float | None = None
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
                "sst_c": None,
                "chlorophyll_mg_m3": None,
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
    path = os.path.join(DATA_DIR, "PFZ.geojson")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="PFZ.geojson not found in /data/static/")
    with open(path) as f:
        return json.load(f)

@app.get("/geojson/boundaries", summary="Maritime Boundaries GeoJSON")
async def get_boundaries_geojson():
    """Returns India EEZ + international maritime boundaries as one FeatureCollection."""
    eez_path = os.path.join(DATA_DIR, "INDIA-EEZ.geojson")
    boundaries_path = os.path.join(DATA_DIR, "INDIAN-WATER-BOUNDARIES.geojson")
    if not os.path.exists(eez_path) or not os.path.exists(boundaries_path):
        raise HTTPException(status_code=404, detail="INDIA-EEZ.geojson or INDIAN-WATER-BOUNDARIES.geojson not found in /data/static/")
    with open(eez_path) as f:
        eez = json.load(f)
    with open(boundaries_path) as f:
        boundaries = json.load(f)
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
    from src.utils.geo import find_nearest_zones
    from src.services.copernicus_service import lookup_nearest as lookup_sst_chl
    import math

    pfz_path = os.path.join(DATA_DIR, "PFZ.geojson")
    if not os.path.exists(pfz_path):
        raise HTTPException(status_code=404, detail="PFZ.geojson not found in /data/static/")
    with open(pfz_path) as f:
        pfz_geojson = json.load(f)

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
    with open(landing_path) as f:
        landing_geojson = json.load(f)
    sites = find_nearest_landing_sites(latitude, longitude, landing_geojson, n=limit)
    return {"sites": sites, "count": len(sites), "query_lat": latitude, "query_lon": longitude}


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


# ─── Alerts Endpoint ───────────────────────────────────────────────────────────────────

@app.get("/alerts", summary="Marine Safety Alerts")
async def get_alerts(latitude: float = 8.5, longitude: float = 76.2):
    """
    Unified marine safety alerts combining geofence + weather checks.
    Returns alerts sorted by severity (HIGH first).
    """
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
