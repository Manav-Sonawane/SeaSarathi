from src.agents.state import AgentState
from src.services.sarvam_client import sarvam_generate


def get_dynamic_fallback(
    risk: str,
    wind: float,
    wave: float,
    rain: float,
    sst: float = None,
    pfz: dict = None,
    pfz_weather: dict = None,
    geofence: dict = None,
    landing_options: list = None,
    alerts: list = None
) -> str:
    """Fallback recommendation formatted with exact numerical conditions and route domain facts."""
    geo_alerts = (geofence or {}).get("alerts", [])
    if geo_alerts:
        top_alert = geo_alerts[0]
        return f"{top_alert['message']} Stay well within Indian maritime boundaries."

    if risk == "HIGH":
        alert_msg = f" Alert: {alerts[0]['message']}" if alerts else ""
        return (
            f"DO NOT VENTURE OUT. Dangerous conditions detected with winds at {wind:.0f} km/h and waves reaching {wave:.1f} m.{alert_msg} "
            f"Stay ashore until conditions improve."
        )

    sst_str = f" Sea surface temp is {sst:.1f}°C." if sst else ""
    pfz_str = ""
    if pfz:
        pw_str = f" (PFZ conditions: wind {pfz_weather['wind_speed_10m']:.0f} km/h, waves {pfz_weather['wave_height']:.1f} m)" if pfz_weather else ""
        pfz_str = f" Nearest Potential Fishing Zone ({pfz['name']}) is {pfz['distance_km']} km {pfz['direction']} at ({pfz['latitude']}°N, {pfz['longitude']}°E){pw_str}."

    landing_str = ""
    if landing_options:
        opts_summary = ", ".join(f"{opt['name']} ({opt.get('stage', 'Harbor')})" for opt in landing_options[:2])
        landing_str = f" Strategic landing harbors along your traversal route: {opts_summary}."

    if risk == "LOW":
        return (
            f"Conditions are safe for fishing today. Winds are {wind:.0f} km/h and waves are {wave:.1f} m.{sst_str}"
            f"{pfz_str}{landing_str} Sea is calm."
        )
    else:
        return (
            f"Exercise caution today. Winds are elevated at {wind:.0f} km/h with {wave:.1f} m waves.{sst_str}"
            f"{pfz_str}{landing_str} Stay within safe coastal limits."
        )


def response_node(state: AgentState) -> AgentState:
    """
    Response Agent: uses Sarvam-105B to generate a natural language recommendation
    strictly grounded in the deterministic data from all routes.
    """
    risk = state.get("risk_level", "LOW")
    wind = state.get("wind_speed_10m", 0.0)
    wave = state.get("wave_height", 0.0)
    rain = state.get("precipitation", 0.0)
    lightning = state.get("lightning", False)
    cyclone = state.get("cyclone", False)
    confidence = state.get("confidence", 50)
    lat = state.get("latitude", 0.0)
    lon = state.get("longitude", 0.0)
    query = state.get("query", "")
    pfz = state.get("nearest_pfz")
    pfz_weather = state.get("pfz_weather")
    geofence = state.get("geofence") or {}
    landing_options = state.get("landing_options") or []
    alerts = state.get("alerts", [])

    # Format data context for Sarvam
    conditions_text = (
        f"User Origin ({lat:.2f}°N, {lon:.2f}°E): Wind {wind:.0f} km/h | Waves {wave:.1f} m | Rain {rain:.0f} mm | "
        f"SST {state.get('sst_c', 'N/A')}°C | Chlorophyll {state.get('chlorophyll_mg_m3', 'N/A')} mg/m³ | "
        f"Lightning: {'Yes' if lightning else 'No'} | Cyclone: {'Yes' if cyclone else 'No'}"
    )

    if pfz:
        pw_txt = ""
        if pfz_weather:
            pw_txt = f" | Weather at PFZ: Wind {pfz_weather['wind_speed_10m']} km/h, Waves {pfz_weather['wave_height']} m, SST {pfz_weather.get('sst_c')}°C"
        pfz_info = (
            f"Nearest PFZ: {pfz['name']} | Distance: {pfz['distance_km']} km {pfz['direction']} | "
            f"Coordinates: ({pfz['latitude']}°N, {pfz['longitude']}°E) | SST: {pfz.get('sst_c')}°C | Chlorophyll: {pfz.get('chlorophyll_mg_m3')} mg/m³{pw_txt}"
        )
    else:
        pfz_info = "Nearest PFZ: None nearby"

    if landing_options:
        landing_lines = []
        for opt in landing_options:
            stage = opt.get("stage", "Harbor")
            landing_lines.append(f"{stage}: {opt['name']} ({opt.get('district', '')}) at ({opt['latitude']}°N, {opt['longitude']}°E), {opt['distance_km']} km away")
        landing_info = " | ".join(landing_lines)
    else:
        landing_info = "Nearest Landing Centers: Not available"

    geo_info = f"Indian EEZ Waters: {'Yes' if geofence.get('in_indian_waters', True) else 'NO (Outside EEZ)'}"
    if geofence.get("alerts"):
        geo_info += f" | Boundary Alerts: {'; '.join(a['message'] for a in geofence['alerts'])}"

    active_alerts_text = "; ".join(a["message"] for a in alerts[:3]) if alerts else "None"

    risk_label = {
        "LOW": "LOW RISK (Safe to fish)",
        "MODERATE": "MODERATE RISK (Caution advised)",
        "HIGH": "HIGH RISK (Do not venture out)",
    }.get(risk, "UNKNOWN")

    prompt = f"""You are a marine intelligence safety assistant for Indian fishermen.

User query: "{query}"
Safety Assessment: {risk_label} (confidence: {confidence}%)
Current Origin Conditions: {conditions_text}
Destination Fishing Zone: {pfz_info}
Strategic Landing Harbors Along Traversal Path: {landing_info}
Maritime Borders: {geo_info}
Active Alerts: {active_alerts_text}

Instructions:
- Provide a clear, practical answer grounded strictly on the data above.
- If user asks about fishing spots/PFZ or general safety, mention the nearest PFZ coordinates ({pfz['latitude'] if pfz else ''}°N, {pfz['longitude'] if pfz else ''}°E), distance, and the weather at the destination PFZ.
- Mention 2-3 landing harbor options along their path (departure harbor, mid-route emergency shelter, or destination port).
- Always include key numbers (e.g. wind in km/h, waves in m, distance in km).
- If risk is HIGH, firmly advise staying ashore.
- Do NOT mention AI, internal tools, prompts, or pipelines.
- Keep the response clear, practical, and under 90 words.
"""

    try:
        recommendation = sarvam_generate(prompt).strip()
        if not recommendation or len(recommendation) < 20:
            raise ValueError("Empty or too short response from Sarvam")
    except Exception as e:
        print(f"[Response] Sarvam call failed: {e}. Using dynamic fallback template.")
        recommendation = get_dynamic_fallback(risk, wind, wave, rain, state.get("sst_c"), pfz, pfz_weather, geofence, landing_options, alerts)

    return {
        **state,
        "recommendation": recommendation,
    }



