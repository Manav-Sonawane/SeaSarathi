import xml.etree.ElementTree as ET
from unittest.mock import patch

import pytest

from src.services import gdacs_service

_SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:georss="http://www.georss.org/georss" xmlns:gdacs="http://www.gdacs.org">
<channel>
  <item>
    <title>Tropical Cyclone ASANI-22</title>
    <description>Tropical cyclone near Bay of Bengal</description>
    <link>https://www.gdacs.org/report.aspx?eventid=1</link>
    <georss:point>15.0 85.0</georss:point>
    <gdacs:eventtype>TC</gdacs:eventtype>
    <gdacs:alertlevel>Orange</gdacs:alertlevel>
    <gdacs:severity>2</gdacs:severity>
    <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Flood somewhere</title>
    <description>Not a cyclone</description>
    <link>https://www.gdacs.org/report.aspx?eventid=2</link>
    <georss:point>20.0 80.0</georss:point>
    <gdacs:eventtype>FL</gdacs:eventtype>
    <gdacs:alertlevel>Red</gdacs:alertlevel>
    <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Tropical Cyclone FAR-AWAY</title>
    <description>Pacific cyclone</description>
    <link>https://www.gdacs.org/report.aspx?eventid=3</link>
    <georss:point>10.0 150.0</georss:point>
    <gdacs:eventtype>TC</gdacs:eventtype>
    <gdacs:alertlevel>Red</gdacs:alertlevel>
    <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate>
  </item>
</channel>
</rss>"""


@pytest.fixture(autouse=True)
def _reset_cache():
    gdacs_service._cache["events"] = None
    gdacs_service._cache["fetched_at"] = 0.0
    yield
    gdacs_service._cache["events"] = None
    gdacs_service._cache["fetched_at"] = 0.0


def _mock_response():
    class R:
        content = _SAMPLE_RSS.encode("utf-8")
        def raise_for_status(self):
            pass
    return R()


def test_parses_only_tc_events():
    with patch("requests.get", return_value=_mock_response()):
        events = gdacs_service._fetch_events()
    assert len(events) == 2
    assert all(e["title"].startswith("Tropical Cyclone") for e in events)


def test_filters_by_radius_and_formats_alert():
    with patch("requests.get", return_value=_mock_response()):
        alerts = gdacs_service.get_regional_cyclone_alerts(15.5, 85.5, radius_km=1500)
    assert len(alerts) == 1
    a = alerts[0]
    assert a["type"] == "GDACS_CYCLONE_WATCH"
    assert a["source"] == "gdacs"
    assert a["severity"] == "MODERATE"  # ORANGE -> MODERATE
    assert "ASANI" in a["message"]
    assert a["metadata"]["distance_km"] < 100


def test_far_away_cyclone_excluded_by_default_radius():
    with patch("requests.get", return_value=_mock_response()):
        alerts = gdacs_service.get_regional_cyclone_alerts(15.0, 85.0)
    # FAR-AWAY is on the other side of the globe, well outside 1500 km
    assert all("FAR-AWAY" not in a["message"] for a in alerts)


def test_no_events_within_range_returns_empty():
    with patch("requests.get", return_value=_mock_response()):
        alerts = gdacs_service.get_regional_cyclone_alerts(-30.0, -60.0, radius_km=500)
    assert alerts == []


def test_network_failure_returns_empty_list_not_raise():
    with patch("requests.get", side_effect=ConnectionError("boom")):
        alerts = gdacs_service.get_regional_cyclone_alerts(15.0, 85.0)
    assert alerts == []


def test_malformed_point_is_skipped():
    bad_rss = _SAMPLE_RSS.replace("<georss:point>15.0 85.0</georss:point>", "<georss:point>not-a-point</georss:point>")
    class R:
        content = bad_rss.encode("utf-8")
        def raise_for_status(self): pass
    with patch("requests.get", return_value=R()):
        events = gdacs_service._fetch_events()
    # the malformed TC item is dropped, the other TC item remains
    assert len(events) == 1
    assert "FAR-AWAY" in events[0]["title"]


def test_results_sorted_by_distance():
    rss = _SAMPLE_RSS.replace(
        '<gdacs:eventtype>FL</gdacs:eventtype>', '<gdacs:eventtype>TC</gdacs:eventtype>'
    ).replace(
        '<georss:point>20.0 80.0</georss:point>', '<georss:point>15.2 85.2</georss:point>'
    ).replace(
        '<gdacs:alertlevel>Red</gdacs:alertlevel>\n    <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate>\n  </item>\n  <item>\n    <title>Tropical Cyclone FAR-AWAY',
        '<gdacs:alertlevel>Red</gdacs:alertlevel>\n    <pubDate>Mon, 01 Sep 2026 12:00:00 GMT</pubDate>\n  </item>\n  <item>\n    <title>Tropical Cyclone FAR-AWAY',
    )
    class R:
        content = rss.encode("utf-8")
        def raise_for_status(self): pass
    with patch("requests.get", return_value=R()):
        alerts = gdacs_service.get_regional_cyclone_alerts(15.0, 85.0, radius_km=2000)
    dists = [a["metadata"]["distance_km"] for a in alerts]
    assert dists == sorted(dists)
