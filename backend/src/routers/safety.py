"""
safety.py — GET /safety/drift-search-area: an indicative wind-leeway drift
estimate for a man-overboard or missing-vessel report, using the same
Open-Meteo wind forecast data already fetched for /chat and /forecast (no new
data source). See src/agents/drift.py for the model and its limits — this is
a first-minutes planning aid, never a substitute for contacting the Indian
Coast Guard.
"""
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.agents.drift import estimate_drift, assemble, ObjectType

router = APIRouter()


class DriftRequest(BaseModel):
    latitude: float
    longitude: float
    last_seen_minutes_ago: float  # time since the person/vessel was last seen at (latitude, longitude)
    object_type: ObjectType = "person_in_water"


@router.post("/safety/drift-search-area")
async def drift_search_area(req: DriftRequest):
    if req.last_seen_minutes_ago < 0:
        raise HTTPException(400, "last_seen_minutes_ago must be >= 0")
    if req.last_seen_minutes_ago > 72 * 60:
        raise HTTPException(400, "last_seen_minutes_ago > 72h is beyond what a wind-leeway-only estimate can usefully cover")

    from src.services.weather_service import fetch_combined_forecasts_for_grid_cached, generate_grid_point_id

    try:
        combined = fetch_combined_forecasts_for_grid_cached(np.array([req.latitude]), np.array([req.longitude]))
        data = combined.get(generate_grid_point_id(req.latitude, req.longitude), {})
        weather = data.get("general_weather_forecast")
        if weather is None or weather.empty:
            raise ValueError("no weather forecast available for this point")
        now_utc = pd.Timestamp.now(tz="UTC")
        nearest_row = weather.iloc[(weather["date"] - now_utc).abs().argsort().iloc[0]]
        wind_speed_kmh = float(nearest_row["wind_speed_10m"])
        wind_direction_deg = float(nearest_row["wind_direction_10m"])
    except Exception as e:
        raise HTTPException(503, f"wind data unavailable: {e}")

    estimate = estimate_drift(
        last_latitude=req.latitude,
        last_longitude=req.longitude,
        elapsed_hours=req.last_seen_minutes_ago / 60.0,
        wind_speed_kmh=wind_speed_kmh,
        wind_direction_from_deg=wind_direction_deg,
        object_type=req.object_type,
    )
    result = assemble(estimate)
    result["wind_speed_kmh_used"] = round(wind_speed_kmh, 1)
    result["wind_direction_from_deg_used"] = round(wind_direction_deg, 1)
    result["last_known_latitude"] = req.latitude
    result["last_known_longitude"] = req.longitude
    return result
