from src.utils.geofence import check_geofence, is_in_indian_waters

test_cases = [
    (15.0, 72.5,  "Arabian Sea (safe Indian waters)"),
    (8.5,  77.5,  "Kochi offshore"),
    (23.5, 67.0,  "Near Pakistan maritime border"),
    (8.0,  76.5,  "Near Sri Lanka maritime border"),
    (10.0, 93.5,  "Andaman Sea (Indian EEZ)"),
    (5.0,  60.0,  "Deep Indian Ocean (outside EEZ)"),
]

print("Geofence Test Results")
print("=" * 60)
for lat, lon, label in test_cases:
    in_waters = is_in_indian_waters(lat, lon)
    alerts = check_geofence(lat, lon)
    print(f"\n{label} ({lat}N, {lon}E)")
    print(f"  In Indian waters: {in_waters}")
    if not alerts:
        print("  No alerts.")
    for a in alerts:
        icon = "DANGER" if a["severity"] == "HIGH" else "CAUTION"
        print(f"  [{icon}] {a['type']} | {a['message'][:70]}...")
