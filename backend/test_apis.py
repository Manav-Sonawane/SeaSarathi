import json
import httpx

results = {}

def get_open_meteo():
    try:
        # General
        url = "https://api.open-meteo.com/v1/forecast?latitude=19.0&longitude=72.5&hourly=temperature_2m,precipitation,rain,visibility,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover&models=ecmwf_ifs&forecast_days=1"
        r = httpx.get(url, timeout=10)
        data = r.json()
        results["Open-Meteo_General"] = {
            "status": r.status_code,
            "hourly_units": data.get("hourly_units", {})
        }
        
        # Marine
        url_m = "https://marine-api.open-meteo.com/v1/marine?latitude=19.0&longitude=72.5&hourly=wave_height,wave_direction,wave_period,wind_wave_height,wind_wave_direction,wind_wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature&forecast_days=1"
        rm = httpx.get(url_m, timeout=10)
        dm = rm.json()
        results["Open-Meteo_Marine"] = {
            "status": rm.status_code,
            "hourly_units": dm.get("hourly_units", {})
        }
    except Exception as e:
        results["Open-Meteo_Error"] = str(e)

def get_imd():
    endpoints = {
        "Port Warning": "https://api.imd.gov.in/api/v1/portwarning",
        "Sea Area Bulletin": "https://api.imd.gov.in/api/v1/seabulletin",
        "Coastal Bulletin": "https://api.imd.gov.in/api/v1/coastalbulletin",
        "Cyclone Track": "https://api.imd.gov.in/api/v1/cyclone_track",
        "Cyclone Wind": "https://api.imd.gov.in/api/v1/cyclone_wind"
    }
    
    for name, url in endpoints.items():
        try:
            r = httpx.get(url, timeout=15)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list) and len(data) > 0:
                    sample = data[0]
                elif isinstance(data, dict):
                    sample = {k: str(type(v).__name__) for k, v in data.items()}
                else:
                    sample = data
                
                # Check if sample is a string instead of dict
                if isinstance(sample, str):
                    sample = {"value": "string data", "content": sample[:200]}

                if isinstance(sample, dict):
                    results[f"IMD_{name}"] = {"status": r.status_code, "sample_schema": {k: type(v).__name__ for k, v in sample.items()}, "sample_data": sample}
                else:
                    results[f"IMD_{name}"] = {"status": r.status_code, "sample_schema": "unknown", "sample_data": str(sample)[:200]}
            else:
                results[f"IMD_{name}"] = {"status": r.status_code, "text": r.text[:200]}
        except Exception as e:
            results[f"IMD_{name}"] = {"error": str(e)}

get_open_meteo()
get_imd()

with open("api_metadata_test.json", "w") as f:
    json.dump(results, f, indent=2)

print("Done API tests.")
