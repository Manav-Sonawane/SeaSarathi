"""
fetch_copernicus_grid.py — Precompute a current SST + Chlorophyll grid for SeaSarathi.

Per COPERNICUS_DATA_ACCESS.md:
  - Current SST:  COPERNICUS_SST_DATASET_ID          (variable: analysed_sst, Kelvin)
  - Current CHL:  COPERNICUS_CHLOROPHYLL_DATASET_ID  (variable: chl, mg/m3)

Strategy (per Section 10, Method A — remote Xarray access for large gridded data):
  1. Reuse the same India-EEZ-filtered coordinate grid as Open-Meteo (src/services/marine_grid.py)
     so all environmental datasets share one point set.
  2. open_dataset() each product lazily over the India bounding envelope (65-100E, 4-25N).
  3. Take the latest available time slice and do ONE vectorized nearest-neighbor
     selection at every grid point (not a per-point API call).
  4. Save the result as data/dynamic/sst_chl_grid.json for fast local lookups
     (see src/services/copernicus_service.py).

Run manually / on a daily schedule:
    backend/venv/Scripts/python.exe backend/scripts/fetch_copernicus_grid.py
"""

import os
import sys
import json
import datetime

import numpy as np
import xarray as xr
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import copernicusmarine
from src.services.marine_grid import generate_eez_grid

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "dynamic", "sst_chl_grid.json"
)

LAT_MIN, LAT_MAX = 4.0, 25.0
LON_MIN, LON_MAX = 65.0, 100.0


def _fetch_latest_slice(dataset_id: str, variable: str, username: str, password: str) -> xr.DataArray:
    ds = copernicusmarine.open_dataset(
        dataset_id=dataset_id,
        variables=[variable],
        minimum_longitude=LON_MIN,
        maximum_longitude=LON_MAX,
        minimum_latitude=LAT_MIN,
        maximum_latitude=LAT_MAX,
        username=username,
        password=password,
    )
    # Some products (e.g. the BGC analysis-and-forecast dataset) carry a time axis
    # that extends ~10 days into the future. ds.time.max() would grab a forecast
    # day instead of "today" — select the slice nearest to now instead.
    now = np.datetime64(datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None))
    nearest_time = ds.time.sel(time=now, method="nearest").values
    da = ds[variable].sel(time=nearest_time)
    # Some BGC products carry a depth dimension — take the shallowest level (surface).
    if "depth" in da.dims:
        da = da.sel(depth=da.depth.min())
    return da, nearest_time


def main():
    username = os.getenv("COPERNICUS_USERNAME")
    password = os.getenv("COPERNICUS_PASSWORD")
    sst_dataset_id = os.getenv("COPERNICUS_SST_DATASET_ID")
    chl_dataset_id = os.getenv("COPERNICUS_CHLOROPHYLL_DATASET_ID")

    if not (username and password and sst_dataset_id and chl_dataset_id):
        raise SystemExit(
            "Missing Copernicus credentials or dataset IDs in backend/.env "
            "(COPERNICUS_USERNAME, COPERNICUS_PASSWORD, COPERNICUS_SST_DATASET_ID, "
            "COPERNICUS_CHLOROPHYLL_DATASET_ID)"
        )

    print("[fetch_copernicus_grid] Building India-EEZ grid (0.5 deg)...")
    lats, lons = generate_eez_grid(resolution_deg=0.5)
    print(f"[fetch_copernicus_grid] Grid has {len(lats)} points.")

    lat_da = xr.DataArray(lats, dims="points")
    lon_da = xr.DataArray(lons, dims="points")

    print("[fetch_copernicus_grid] Fetching current SST...")
    sst_slice, sst_time = _fetch_latest_slice(sst_dataset_id, "analysed_sst", username, password)
    sst_vals = sst_slice.sel(latitude=lat_da, longitude=lon_da, method="nearest").values
    sst_celsius = np.round(sst_vals - 273.15, 2)

    print("[fetch_copernicus_grid] Fetching current chlorophyll...")
    chl_slice, chl_time = _fetch_latest_slice(chl_dataset_id, "chl", username, password)
    chl_vals = chl_slice.sel(latitude=lat_da, longitude=lon_da, method="nearest").values
    chl_rounded = np.round(chl_vals, 4)

    points = []
    for lat, lon, sst, chl in zip(lats, lons, sst_celsius, chl_rounded):
        points.append({
            "lat": float(lat),
            "lon": float(lon),
            "sst_c": None if np.isnan(sst) else float(sst),
            "chl_mg_m3": None if np.isnan(chl) else float(chl),
        })

    output = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sst_time": str(sst_time),
        "chl_time": str(chl_time),
        "sst_dataset_id": sst_dataset_id,
        "chl_dataset_id": chl_dataset_id,
        "resolution_deg": 0.5,
        "point_count": len(points),
        "points": points,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f)

    print(f"[fetch_copernicus_grid] Wrote {len(points)} points to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
