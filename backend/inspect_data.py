import json

files = [
    ('../data/static/INDIA-EEZ.geojson', 'EEZ'),
    ('../data/static/INDIAN-WATER-BOUNDARIES.geojson', 'Boundaries'),
    ('../data/static/PFZ.geojson', 'PFZ'),
    ('../data/static/LANDING-LOCATIONS.geojson', 'Landing'),
]

for path, label in files:
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    features = d.get('features', [])
    print(f"=== {label} ===")
    print(f"  Total features : {len(features)}")
    print(f"  GeoJSON type   : {d.get('type')}")
    if features:
        f0 = features[0]
        geom = f0.get('geometry', {})
        print(f"  Geom type [0]  : {geom.get('type') if geom else None}")
        props = f0.get('properties', {})
        print(f"  Properties [0] : {dict(list(props.items())[:10])}")
        # Show all unique property keys across all features
        all_keys = set()
        for feat in features:
            all_keys.update(feat.get('properties', {}).keys())
        print(f"  All prop keys  : {sorted(all_keys)}")
    print()
