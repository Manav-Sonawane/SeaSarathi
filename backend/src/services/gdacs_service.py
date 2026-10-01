"""
gdacs_service.py — supplementary cyclone/storm alerts from GDACS (Global
Disaster Alert and Coordination System, gdacs.org), a free no-auth RSS feed
run by the UN/EU joint research centre.

Why this exists: IMD's own cyclone bulletins (imd_alerts.py) are the
authoritative source for Indian waters and always take priority, but GDACS
tracks every active tropical cyclone worldwide with a geocoded centre point,
which lets this module do something IMD's text bulletins don't: filter to
"is any tracked cyclone within push-at-this-user range" using real
coordinates rather than a state/district name match. Treated as a
supplementary, lower-trust source — it never overrides or is merged into an
IMD fact, it only adds its own alert when IMD has nothing for the area.

Never raises on network/parse failure — returns an empty list so a GDACS
outage never breaks /chat or /alerts.
"""
import math
import time
import xml.etree.ElementTree as ET
from functools import lru_cache

import requests

GDACS_RSS_URL = "https://www.gdacs.org/xml/rss.xml"
_TIMEOUT_S = 6
_CACHE_TTL_S = 30 * 60  # GDACS updates a few times a day; 30 min is plenty fresh
_ALERT_RADIUS_KM = 1500.0  # a TC this far out is still relevant to plan around

_cache: dict = {"events": None, "fetched_at": 0.0}

_GEORSS_NS = "{http://www.georss.org/georss}"
_GDACS_NS = "{http://www.gdacs.org}"


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _parse_point(text: str) -> tuple[float, float] | None:
    # georss:point is "lat lon" (space-separated)
    try:
        parts = text.strip().split()
        if len(parts) != 2:
            return None
        return float(parts[0]), float(parts[1])
    except (ValueError, AttributeError):
        return None


def _fetch_events() -> list[dict]:
    """Parses the GDACS RSS feed into tropical-cyclone (TC) events only."""
    resp = requests.get(GDACS_RSS_URL, timeout=_TIMEOUT_S, headers={"User-Agent": "SeaSarathi/1.0"})
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    events = []
    for item in root.iter("item"):
        event_type = item.findtext(f"{_GDACS_NS}eventtype") or ""
        if event_type.strip().upper() != "TC":
            continue
        point_el = item.find(f"{_GEORSS_NS}point")
        point = _parse_point(point_el.text) if point_el is not None and point_el.text else None
        if not point:
            continue
        events.append({
            "title": (item.findtext("title") or "").strip(),
            "description": (item.findtext("description") or "").strip(),
            "link": (item.findtext("link") or "").strip(),
            "latitude": point[0],
            "longitude": point[1],
            "severity": (item.findtext(f"{_GDACS_NS}severity") or "").strip(),
            "alert_level": (item.findtext(f"{_GDACS_NS}alertlevel") or "").strip().upper(),
            "pub_date": (item.findtext("pubDate") or "").strip(),
        })
    return events


def _get_events_cached() -> list[dict]:
    now = time.monotonic()
    if _cache["events"] is not None and (now - _cache["fetched_at"]) < _CACHE_TTL_S:
        return _cache["events"]
    try:
        events = _fetch_events()
        _cache["events"] = events
        _cache["fetched_at"] = now
        return events
    except Exception as e:
        print(f"[GDACS] fetch failed: {e}")
        return _cache["events"] or []


def get_regional_cyclone_alerts(lat: float, lon: float, radius_km: float = _ALERT_RADIUS_KM) -> list[dict]:
    """Active tropical cyclones (any GDACS alert level) within `radius_km` of
    (lat, lon), formatted as the app's standard alert dict. Empty list on any
    failure or when nothing is within range — never raises."""
    try:
        events = _get_events_cached()
    except Exception as e:
        print(f"[GDACS] unexpected error: {e}")
        return []

    severity_map = {"RED": "HIGH", "ORANGE": "MODERATE", "GREEN": "LOW"}
    out = []
    for ev in events:
        dist_km = _haversine_km(lat, lon, ev["latitude"], ev["longitude"])
        if dist_km > radius_km:
            continue
        out.append({
            "type": "GDACS_CYCLONE_WATCH",
            "severity": severity_map.get(ev["alert_level"], "MODERATE"),
            "message": f"{ev['title']} tracked ~{round(dist_km)} km from your location.",
            "source": "gdacs",
            "metadata": {
                "distance_km": round(dist_km, 1),
                "alert_level": ev["alert_level"],
                "link": ev["link"],
                "pub_date": ev["pub_date"],
            },
        })
    out.sort(key=lambda a: a["metadata"]["distance_km"])
    return out
