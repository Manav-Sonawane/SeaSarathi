from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _fake_combined(lat_arr, lon_arr):
    now = pd.Timestamp.now(tz="UTC").floor("h")
    dates = pd.date_range(now - pd.Timedelta(hours=1), now + pd.Timedelta(hours=5), freq="h")
    weather = pd.DataFrame({
        "date": dates,
        "wind_speed_10m": [30.0] * len(dates),
        "wind_direction_10m": [90.0] * len(dates),
    })
    from src.services.weather_service import generate_grid_point_id
    pid = generate_grid_point_id(lat_arr[0], lon_arr[0])
    return {pid: {"general_weather_forecast": weather, "marine_forecast": None}}


def test_drift_endpoint_returns_estimate():
    with patch("src.services.weather_service.fetch_combined_forecasts_for_grid_cached", side_effect=_fake_combined):
        resp = client.post(
            "/safety/drift-search-area",
            json={"latitude": 10.0, "longitude": 76.0, "last_seen_minutes_ago": 60, "object_type": "person_in_water"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "disclaimer" in body and "Coast Guard" in body["disclaimer"]
    assert body["wind_speed_kmh_used"] == 30.0
    assert body["drift_distance_km"] > 0


def test_drift_endpoint_rejects_negative_elapsed():
    resp = client.post(
        "/safety/drift-search-area",
        json={"latitude": 10.0, "longitude": 76.0, "last_seen_minutes_ago": -5},
    )
    assert resp.status_code == 400


def test_drift_endpoint_rejects_excessive_elapsed():
    resp = client.post(
        "/safety/drift-search-area",
        json={"latitude": 10.0, "longitude": 76.0, "last_seen_minutes_ago": 73 * 60},
    )
    assert resp.status_code == 400


def test_drift_endpoint_defaults_object_type_to_person_in_water():
    with patch("src.services.weather_service.fetch_combined_forecasts_for_grid_cached", side_effect=_fake_combined):
        resp = client.post(
            "/safety/drift-search-area",
            json={"latitude": 10.0, "longitude": 76.0, "last_seen_minutes_ago": 30},
        )
    assert resp.status_code == 200
    assert resp.json()["object_type"] == "person_in_water"


def test_drift_endpoint_503_when_no_weather_data():
    def _empty(lat_arr, lon_arr):
        from src.services.weather_service import generate_grid_point_id
        pid = generate_grid_point_id(lat_arr[0], lon_arr[0])
        return {pid: {"general_weather_forecast": pd.DataFrame(), "marine_forecast": None}}

    with patch("src.services.weather_service.fetch_combined_forecasts_for_grid_cached", side_effect=_empty):
        resp = client.post(
            "/safety/drift-search-area",
            json={"latitude": 10.0, "longitude": 76.0, "last_seen_minutes_ago": 30},
        )
    assert resp.status_code == 503
