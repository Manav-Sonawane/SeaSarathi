"""
geojson_store.py — single shared loader for the static GeoJSON files under
data/static/ (PFZ zones, EEZ/boundaries, landing centers).

Pulled out of main.py during the router split so every router that needs a
static GeoJSON file (geojson, pfz, alerts, landing) shares one lru_cache
instance instead of each importing its own copy of this helper — these
files never change at runtime, so re-parsing them per-router would just be
duplicated startup-adjacent work for no benefit.
"""
import os
import json
from functools import lru_cache

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data", "static")


@lru_cache(maxsize=8)
def load_geojson(path: str) -> dict:
    """Loads and parses a static GeoJSON file once per process, not on
    every request. Synchronous disk I/O — fine here since it only ever
    runs once per distinct path for the life of the process."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)
