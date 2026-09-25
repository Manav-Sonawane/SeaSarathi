"""
forecast.py — GET /forecast/timeline: the next hours of wind, gusts, waves and
tide at a point, for the app's forecast chart. Same Open-Meteo hourly data (and
the same in-memory cache) the chat agent uses; nothing new is fetched.
"""
import asyncio

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from src.agents.tide import SEA_LEVEL_COLUMN

router = APIRouter()

MIN_HOURS, MAX_HOURS = 6, 72

# The same cut-offs the app's safety alerts use (see routers/alerts.py), so the
# chart's colours agree with the warnings shown elsewhere.
THRESHOLDS = {"wind_high_kmh": 46, "wind_moderate_kmh": 28, "wave_high_m": 3.5, "wave_moderate_m": 2.0}


def _num(x) -> float | None:
    return None if x is None or pd.isna(x) else round(float(x), 2)


def build_timeline(latitude: float, longitude: float, hours: int, now_utc: pd.Timestamp | None = None) -> dict:
    from src.services.weather_service import fetch_combined_forecasts_for_grid_cached, generate_grid_point_id

    combined = fetch_combined_forecasts_for_grid_cached(np.array([latitude]), np.array([longitude]))
    data = combined.get(generate_grid_point_id(latitude, longitude), {})
    weather, marine = data.get("general_weather_forecast"), data.get("marine_forecast")
    if weather is None or weather.empty:
        raise ValueError("no weather forecast available for this point")

    frame = weather[["date", "wind_speed_10m", "wind_gusts_10m"]]
    if marine is not None and not marine.empty:
        marine_cols = ["date", "wave_height"] + ([SEA_LEVEL_COLUMN] if SEA_LEVEL_COLUMN in marine.columns else [])
        frame = frame.merge(marine[marine_cols], on="date", how="left")
    for col in ("wave_height", SEA_LEVEL_COLUMN):
        if col not in frame.columns:
            frame[col] = np.nan

    now_utc = now_utc or pd.Timestamp.now(tz="UTC")
    start = now_utc.floor("h")
    frame = frame[(frame["date"] >= start) & (frame["date"] < start + pd.Timedelta(hours=hours))].sort_values("date")

    points = [
        {"t": row.date.isoformat(), "wind_kmh": _num(row.wind_speed_10m), "gust_kmh": _num(row.wind_gusts_10m),
         "wave_m": _num(row.wave_height), "tide_m": _num(getattr(row, SEA_LEVEL_COLUMN))}
        for row in frame.itertuples(index=False)
    ]
    return {
        "points": points,
        "hours": len(points),
        "tide_available": any(p["tide_m"] is not None for p in points),
        "thresholds": THRESHOLDS,
        "source": "open-meteo (model forecast)",
    }


@router.get("/forecast/timeline", summary="Hourly wind, waves and tide for the next 48 hours")
async def forecast_timeline(latitude: float = 8.5, longitude: float = 76.2, hours: int = 48):
    hours = max(MIN_HOURS, min(hours, MAX_HOURS))
    try:
        return await asyncio.to_thread(build_timeline, latitude, longitude, hours)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Forecast unavailable: {e}")
