"""
drift.py — indicative man-overboard / drifting-vessel search-area estimate
from wind leeway alone (no ocean-current data source in this project).

This is NOT a substitute for an official Search and Rescue (SAR) leeway
calculation (e.g. USCG/IAMSAR tables, which also factor in sea-surface
current, object-specific leeway angle/divergence, and measured drift
trials). It exists to give a fisherman or a coordinating rescuer a rough
first push direction and a growing uncertainty radius in the minutes right
after someone goes overboard or a vessel is reported missing, before any
official SAR asset is on scene. Every output is labelled "indicative" for
exactly this reason — see `assemble()`.

Leeway speed = wind_speed_kmh * leeway_factor. Factors below are rough
midpoints of published open-water leeway ranges for an unballasted object
with no current data to add — real leeway also has a downwind-angle
divergence (left/right of the drift vector) that widens with time; this
model approximates that by widening `search_radius_km` instead of
splitting the search into two divergence cones, since a single growing
circle is what a fisherman can actually act on without SAR training.
"""
import math
from dataclasses import dataclass
from typing import Literal

ObjectType = Literal["person_in_water", "life_raft", "small_vessel"]

# Indicative leeway as a fraction of wind speed (open water, no current factored in).
_LEEWAY_FACTOR = {
    "person_in_water": 0.03,
    "life_raft": 0.05,
    "small_vessel": 0.04,
}

# Search radius grows with elapsed time to express compounding position
# uncertainty (drift direction/speed estimate error, sea state, etc.) — not
# a measured value, a conservative planning margin.
_BASE_RADIUS_KM = 0.3
_RADIUS_GROWTH_KM_PER_HOUR = 0.8


@dataclass
class DriftEstimate:
    estimated_latitude: float
    estimated_longitude: float
    drift_bearing_deg: float
    drift_distance_km: float
    search_radius_km: float
    elapsed_hours: float
    object_type: ObjectType
    leeway_factor: float


def _destination_point(lat: float, lon: float, bearing_deg: float, distance_km: float) -> tuple[float, float]:
    """Great-circle destination point given a start, bearing and distance."""
    R = 6371.0
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    brng = math.radians(bearing_deg)
    d_r = distance_km / R

    lat2 = math.asin(math.sin(lat1) * math.cos(d_r) + math.cos(lat1) * math.sin(d_r) * math.cos(brng))
    lon2 = lon1 + math.atan2(
        math.sin(brng) * math.sin(d_r) * math.cos(lat1),
        math.cos(d_r) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), (math.degrees(lon2) + 540) % 360 - 180  # normalize to [-180, 180]


def estimate_drift(
    last_latitude: float,
    last_longitude: float,
    elapsed_hours: float,
    wind_speed_kmh: float,
    wind_direction_from_deg: float,
    object_type: ObjectType = "person_in_water",
) -> DriftEstimate:
    """
    `wind_direction_from_deg` is the meteorological convention (direction the
    wind is blowing FROM, 0=N/90=E/180=S/270=W — what Open-Meteo's
    `wind_direction_10m` reports). An object drifts in the direction the wind
    blows TOWARD, i.e. 180 degrees from that.

    `elapsed_hours` must be >= 0. Negative or absurd (>72h, beyond which
    leeway-only drift is not a meaningful estimate at all) inputs raise
    ValueError rather than silently returning a number someone could act on.
    """
    if elapsed_hours < 0:
        raise ValueError("elapsed_hours must be >= 0")
    if elapsed_hours > 72:
        raise ValueError("elapsed_hours > 72h: leeway-only drift is no longer a meaningful estimate")
    if wind_speed_kmh < 0:
        raise ValueError("wind_speed_kmh must be >= 0")

    leeway_factor = _LEEWAY_FACTOR[object_type]
    drift_speed_kmh = wind_speed_kmh * leeway_factor
    drift_distance_km = drift_speed_kmh * elapsed_hours
    drift_bearing_deg = (wind_direction_from_deg + 180) % 360

    est_lat, est_lon = _destination_point(last_latitude, last_longitude, drift_bearing_deg, drift_distance_km)
    search_radius_km = _BASE_RADIUS_KM + _RADIUS_GROWTH_KM_PER_HOUR * elapsed_hours

    return DriftEstimate(
        estimated_latitude=round(est_lat, 5),
        estimated_longitude=round(est_lon, 5),
        drift_bearing_deg=round(drift_bearing_deg, 1),
        drift_distance_km=round(drift_distance_km, 2),
        search_radius_km=round(search_radius_km, 2),
        elapsed_hours=round(elapsed_hours, 2),
        object_type=object_type,
        leeway_factor=leeway_factor,
    )


def assemble(estimate: DriftEstimate) -> dict:
    """JSON-serializable form with the mandatory indicative-estimate caveat attached."""
    return {
        "estimated_latitude": estimate.estimated_latitude,
        "estimated_longitude": estimate.estimated_longitude,
        "drift_bearing_deg": estimate.drift_bearing_deg,
        "drift_distance_km": estimate.drift_distance_km,
        "search_radius_km": estimate.search_radius_km,
        "elapsed_hours": estimate.elapsed_hours,
        "object_type": estimate.object_type,
        "leeway_factor": estimate.leeway_factor,
        "disclaimer": (
            "Indicative wind-leeway estimate only — does not account for sea current. "
            "Contact the Indian Coast Guard (1554) immediately; do not delay rescue "
            "action to wait on this estimate."
        ),
    }
