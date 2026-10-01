import math

import pytest

from src.agents.drift import estimate_drift, assemble, _destination_point, _LEEWAY_FACTOR


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def test_zero_wind_means_no_drift():
    est = estimate_drift(10.0, 76.0, elapsed_hours=2.0, wind_speed_kmh=0.0, wind_direction_from_deg=90)
    assert est.drift_distance_km == 0.0
    assert est.estimated_latitude == pytest.approx(10.0, abs=1e-6)
    assert est.estimated_longitude == pytest.approx(76.0, abs=1e-6)


def test_zero_elapsed_time_means_no_drift():
    est = estimate_drift(10.0, 76.0, elapsed_hours=0.0, wind_speed_kmh=40.0, wind_direction_from_deg=0)
    assert est.drift_distance_km == 0.0
    assert est.search_radius_km == pytest.approx(0.3)


def test_drift_moves_downwind_not_upwind():
    # Wind FROM the north (0 deg) blows TOWARD the south (180 deg) -> latitude decreases
    est = estimate_drift(10.0, 76.0, elapsed_hours=1.0, wind_speed_kmh=40.0, wind_direction_from_deg=0)
    assert est.drift_bearing_deg == pytest.approx(180.0)
    assert est.estimated_latitude < 10.0
    assert est.estimated_longitude == pytest.approx(76.0, abs=1e-3)


def test_wind_from_east_drifts_west():
    est = estimate_drift(10.0, 76.0, elapsed_hours=1.0, wind_speed_kmh=40.0, wind_direction_from_deg=90)
    assert est.drift_bearing_deg == pytest.approx(270.0)
    assert est.estimated_longitude < 76.0


def test_drift_distance_matches_leeway_formula():
    wind_speed = 50.0
    hours = 3.0
    est = estimate_drift(10.0, 76.0, elapsed_hours=hours, wind_speed_kmh=wind_speed,
                          wind_direction_from_deg=0, object_type="life_raft")
    expected_km = wind_speed * _LEEWAY_FACTOR["life_raft"] * hours
    assert est.drift_distance_km == pytest.approx(expected_km, rel=1e-3)

    actual_km = _haversine_km(10.0, 76.0, est.estimated_latitude, est.estimated_longitude)
    assert actual_km == pytest.approx(expected_km, rel=1e-2)


def test_object_types_have_distinct_leeway():
    kwargs = dict(last_latitude=10.0, last_longitude=76.0, elapsed_hours=2.0,
                  wind_speed_kmh=40.0, wind_direction_from_deg=45)
    person = estimate_drift(**kwargs, object_type="person_in_water")
    raft = estimate_drift(**kwargs, object_type="life_raft")
    vessel = estimate_drift(**kwargs, object_type="small_vessel")
    assert person.drift_distance_km < vessel.drift_distance_km < raft.drift_distance_km


def test_search_radius_grows_with_elapsed_time():
    short = estimate_drift(10.0, 76.0, elapsed_hours=1.0, wind_speed_kmh=20.0, wind_direction_from_deg=0)
    long = estimate_drift(10.0, 76.0, elapsed_hours=5.0, wind_speed_kmh=20.0, wind_direction_from_deg=0)
    assert long.search_radius_km > short.search_radius_km


def test_negative_elapsed_hours_rejected():
    with pytest.raises(ValueError):
        estimate_drift(10.0, 76.0, elapsed_hours=-1.0, wind_speed_kmh=20.0, wind_direction_from_deg=0)


def test_absurdly_long_elapsed_time_rejected():
    with pytest.raises(ValueError):
        estimate_drift(10.0, 76.0, elapsed_hours=200.0, wind_speed_kmh=20.0, wind_direction_from_deg=0)


def test_negative_wind_speed_rejected():
    with pytest.raises(ValueError):
        estimate_drift(10.0, 76.0, elapsed_hours=1.0, wind_speed_kmh=-5.0, wind_direction_from_deg=0)


def test_assemble_carries_disclaimer_and_all_fields():
    est = estimate_drift(10.0, 76.0, elapsed_hours=1.0, wind_speed_kmh=30.0, wind_direction_from_deg=180)
    out = assemble(est)
    assert "disclaimer" in out and "Coast Guard" in out["disclaimer"]
    assert out["object_type"] == "person_in_water"
    assert set(out.keys()) >= {
        "estimated_latitude", "estimated_longitude", "drift_bearing_deg",
        "drift_distance_km", "search_radius_km", "elapsed_hours", "leeway_factor",
    }


def test_destination_point_bearing_east_increases_longitude_near_equator():
    lat2, lon2 = _destination_point(0.0, 0.0, bearing_deg=90, distance_km=111.0)
    assert lat2 == pytest.approx(0.0, abs=1e-2)
    assert lon2 == pytest.approx(1.0, abs=0.05)
