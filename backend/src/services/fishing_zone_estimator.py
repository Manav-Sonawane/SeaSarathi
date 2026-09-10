"""
fishing_zone_estimator.py — Local high-probability fishing zone estimation for
small boats, from precomputed SST + Chlorophyll grid data.

Why this exists: INCOIS PFZ zones are sparse (52 nationwide) and often well
beyond a small boat's practical range. When that happens (see
src/agents/data_agent.py's PFZ_MAX_DISTANCE_KM check), this module estimates
the best nearby patch of water instead, using real SST/CHL data at every
candidate point within range — not a single guess at the user's own location.

No LLM, no fabricated precision — same "rules over AI for factual grounding"
philosophy as risk_agent.py. Every score is traceable to real numbers, and the
method degrades gracefully (never raises) when the grid can't support a
fine-grained comparison at a given spot.

HONESTY NOTE on resolution (see fetch_copernicus_grid.py's docstring):
  - SST is genuinely resolved at ~5-9km in the underlying product — real local
    variation, a legitimate proxy for thermal fronts where pelagic fish
    aggregate.
  - The configured chlorophyll product is a coarser ~27km model field. Nearby
    8-9km grid points frequently share the same source CHL value. Treating
    that as a fine "chlorophyll front" would be fabricating precision the data
    doesn't have. Instead, CHL sets an area-level productivity floor (same
    High/Moderate/Low thresholds already used in data_agent.py's older single-
    point fallback) and SST variation across the candidate points is what
    actually differentiates one nearby zone from another.
"""

import math
from src.services.copernicus_service import find_within_radius, lookup_nearest, grid_metadata

# Same thresholds as data_agent.py's local-area fallback — kept identical so a
# "High productivity" label means the same thing everywhere in the app.
CHL_HIGH = 1.0
CHL_MODERATE = 0.3


def _productivity_label(chl: float | None) -> str:
    if chl is None:
        return "Unknown productivity"
    if chl >= CHL_HIGH:
        return "High productivity"
    if chl >= CHL_MODERATE:
        return "Moderate productivity"
    return "Low productivity"


def _chl_score(chl: float | None) -> float:
    """0-100. Absolute productivity level — the area-level floor for the score."""
    if chl is None:
        return 40.0  # neutral, not zero — missing data shouldn't read as "bad"
    if chl >= CHL_HIGH:
        return 100.0
    if chl >= CHL_MODERATE:
        return 65.0
    return 30.0


def _bearing(lat1, lon1, lat2, lon2) -> str:
    d_lon = math.radians(lon2 - lon1)
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    x = math.sin(d_lon) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)
    angle = (math.degrees(math.atan2(x, y)) + 360) % 360
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return dirs[int((angle + 22.5) / 45) % 8]


def estimate_local_fishing_zones(lat: float, lon: float, radius_km: float = 9.0, top_n: int = 3) -> dict:
    """
    Ranks candidate fishing patches within radius_km of (lat, lon) using real
    cached SST + Chlorophyll. Always returns a usable result:
      - method="grid": >=2 grid points found in range — real SST-front
        comparison was possible, points are ranked and differentiated.
      - method="single_point": 0-1 grid points in range (grid too coarse for
        this exact spot, or right at the edge) — falls back to the one
        nearest reading, same as the old single-point behavior, clearly
        labeled so callers/response text don't overstate confidence.
      - method="unavailable": no grid file at all (not yet fetched).
    """
    candidates = find_within_radius(lat, lon, radius_km)
    meta = grid_metadata()

    if len(candidates) < 2:
        # Graceful degrade: not enough nearby grid points to compare —
        # fall back to whatever single reading is closest.
        single = lookup_nearest(lat, lon)
        if not single:
            return {
                "method": "unavailable",
                "note": "SST/Chlorophyll grid not available — run scripts/fetch_copernicus_grid.py",
                "zones": [],
                "radius_km": radius_km,
            }
        zone = {
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "distance_km": single["distance_km"],
            "direction": "—",
            "sst_c": single["sst_c"],
            "chlorophyll_mg_m3": single["chl_mg_m3"],
            "productivity": _productivity_label(single["chl_mg_m3"]),
            "score": round(_chl_score(single["chl_mg_m3"]), 1),
        }
        return {
            "method": "single_point",
            "note": f"Only one grid reading within {radius_km:.0f} km — showing nearest available data "
                    f"rather than a ranked comparison.",
            "zones": [zone],
            "radius_km": radius_km,
            "grid_generated_at": meta.get("generated_at") if meta else None,
        }

    # ── Real multi-point comparison ──────────────────────────────────────────
    sst_vals = [c["sst_c"] for c in candidates if c["sst_c"] is not None]
    mean_sst = sum(sst_vals) / len(sst_vals) if sst_vals else None
    # Population std-dev, guarded against a flat/degenerate field.
    if sst_vals and len(sst_vals) > 1:
        variance = sum((v - mean_sst) ** 2 for v in sst_vals) / len(sst_vals)
        std_sst = math.sqrt(variance)
    else:
        std_sst = 0.0

    scored = []
    for c in candidates:
        chl_score = _chl_score(c["chl_mg_m3"])

        # SST-front score: how much this point's SST deviates from the local
        # mean, normalized by local spread. A flat field (std_sst ~ 0) means
        # no detectable front anywhere nearby — front score contributes nothing,
        # not a fabricated tiebreaker.
        if c["sst_c"] is not None and mean_sst is not None and std_sst > 0.05:
            z = abs(c["sst_c"] - mean_sst) / std_sst
            front_score = max(0.0, min(100.0, z * 50.0))  # z>=2 saturates at 100
        else:
            front_score = 0.0

        combined = chl_score * 0.6 + front_score * 0.4

        scored.append({
            "latitude": round(c["lat"], 4),
            "longitude": round(c["lon"], 4),
            "distance_km": c["distance_km"],
            "direction": _bearing(lat, lon, c["lat"], c["lon"]),
            "sst_c": c["sst_c"],
            "chlorophyll_mg_m3": c["chl_mg_m3"],
            "sst_deviation_c": round(c["sst_c"] - mean_sst, 2) if (c["sst_c"] is not None and mean_sst is not None) else None,
            "productivity": _productivity_label(c["chl_mg_m3"]),
            "score": round(combined, 1),
        })

    scored.sort(key=lambda z: z["score"], reverse=True)

    return {
        "method": "grid",
        "note": (
            f"Ranked from {len(candidates)} cached grid points within {radius_km:.0f} km "
            f"({meta.get('resolution_deg') if meta else '?'}° spacing). "
            f"Chlorophyll marks overall productivity; SST variation marks likely local fronts."
        ),
        "zones": scored[:top_n],
        "candidate_count": len(candidates),
        "radius_km": radius_km,
        "grid_generated_at": meta.get("generated_at") if meta else None,
    }
