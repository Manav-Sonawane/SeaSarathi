import json, os, sys
sys.path.insert(0, '.')

print("=== Testing geo.py with real PFZ data ===")
from src.utils.geo import find_nearest_zones, find_nearest_landing_sites

with open('../data/static/PFZ.geojson', encoding='utf-8') as f:
    pfz = json.load(f)
results = find_nearest_zones(15.0, 72.5, pfz, n=3)
print(f"Nearest PFZ zones to (15N, 72.5E) - {len(results)} returned:")
for r in results:
    print(f"  [{r['distance_km']} km {r.get('direction','')}] {r['name']} | UID={r['uid']} | {r['centroid_lat']}N, {r['centroid_lon']}E")

print()
print("=== Testing find_nearest_landing_sites ===")
with open('../data/static/LANDING-LOCATIONS.geojson', encoding='utf-8') as f:
    landing = json.load(f)
sites = find_nearest_landing_sites(19.0, 72.8, landing, n=3)
print(f"Nearest landing sites to (19N, 72.8E) - {len(sites)} returned:")
for s in sites:
    print(f"  [{s['distance_km']} km] {s['name']} | {s['district']} | {s['sector']}")

print()
print("=== Testing geofence.py with real data ===")
from src.utils.geofence import check_geofence, is_in_indian_waters

test_cases = [
    (15.0, 72.5, "Arabian Sea"),
    (23.5, 67.0, "Near Pakistan border"),
    (5.0,  60.0, "Deep Indian Ocean (outside EEZ)"),
]
for lat, lon, label in test_cases:
    in_waters = is_in_indian_waters(lat, lon)
    alerts = check_geofence(lat, lon)
    status = "INSIDE EEZ" if in_waters else "OUTSIDE EEZ"
    print(f"  {label} ({lat}N, {lon}E) -> {status} | {len(alerts)} alert(s)")
    for a in alerts:
        print(f"    [{a['severity']}] {a['type']}: {a['message'][:80]}...")

print()
print("=== Testing /data/status file presence ===")
files = ["PFZ.geojson", "INDIA-EEZ.geojson", "INDIAN-WATER-BOUNDARIES.geojson", "LANDING-LOCATIONS.geojson"]
for f in files:
    path = os.path.join('../data/static', f)
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    print(f"  {f}: {'OK' if exists else 'MISSING'} ({size:,} bytes)")
