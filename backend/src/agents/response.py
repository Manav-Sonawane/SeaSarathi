from src.agents.state import AgentState
from src.services.sarvam_client import sarvam_generate


def get_dynamic_fallback(
    risk: str,
    wind: float,
    wave: float,
    rain: float,
    sst: float = None,
    pfz: dict = None,
    geofence: dict = None,
    landing: dict = None,
    alerts: list = None
) -> str:
    """Fallback recommendation formatted with exact numerical conditions and domain facts."""
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
        pfz_str = f" Nearest Potential Fishing Zone ({pfz['name']}) is {pfz['distance_km']} km {pfz['direction']} at ({pfz['latitude']}°N, {pfz['longitude']}°E)."

    if risk == "LOW":
        return (
            f"Conditions are safe for fishing today. Winds are {wind:.0f} km/h and waves are {wave:.1f} m.{sst_str}"
            f"{pfz_str} Sea is calm."
        )
    else:
        return (
            f"Exercise caution today. Winds are elevated at {wind:.0f} km/h with {wave:.1f} m waves.{sst_str}"
            f"{pfz_str} Stay within safe coastal limits."
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
    geofence = state.get("geofence") or {}
    landing = state.get("nearest_landing")
    alerts = state.get("alerts", [])

    # Format data context for Sarvam
    conditions_text = (
        f"Wind: {wind:.0f} km/h | Waves: {wave:.1f} m | Rainfall: {rain:.0f} mm | "
        f"Lightning: {'Yes' if lightning else 'No'} | Cyclone: {'Yes' if cyclone else 'No'}"
    )
    if pfz:
        pfz_info = (
            f"Nearest PFZ: {pfz['name']} | Distance: {pfz['distance_km']} km {pfz['direction']} | "
            f"Coordinates: ({pfz['latitude']}°N, {pfz['longitude']}°E) | SST: {pfz.get('sst_c')}°C | Chlorophyll: {pfz.get('chlorophyll_mg_m3')} mg/m³"
        )
    else:
        pfz_info = "Nearest PFZ: None nearby"

    if landing:
        landing_info = f"Nearest Landing Center/Harbor: {landing['name']} ({landing.get('district', '')}), {landing['distance_km']} km {landing['direction']} at ({landing['latitude']}°N, {landing['longitude']}°E)"
    else:
        landing_info = "Nearest Landing Center: Not available"

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
Coordinates: {lat:.2f}°N, {lon:.2f}°E
Safety Assessment: {risk_label} (confidence: {confidence}%)
Live Weather: {conditions_text}
Fishing Zone: {pfz_info}
Maritime Borders: {geo_info}
Landing Center: {landing_info}
Active Alerts: {active_alerts_text}

Instructions:
- Answer the fisherman's specific question directly and accurately based ONLY on the factual data above.
- If asked about fishing spots/PFZ, cite the exact PFZ coordinates, distance, and direction.
- If asked about borders/geofencing or if border alerts exist, emphasize boundary safety and distance.
- If asked about harbor/landing location, cite the nearest landing center.
- Always include key numbers (e.g. wind in km/h, waves in m, or distance in km).
- If risk is HIGH, firmly advise staying ashore.
- Do NOT mention AI, internal tools, prompts, or pipelines.
- Keep the response clear, practical, and under 80 words.
"""

    try:
        recommendation = sarvam_generate(prompt).strip()
        if not recommendation or len(recommendation) < 20:
            raise ValueError("Empty or too short response from Sarvam")
    except Exception as e:
        print(f"[Response] Sarvam call failed: {e}. Using dynamic fallback template.")
        recommendation = get_dynamic_fallback(risk, wind, wave, rain, state.get("sst_c"), pfz, geofence, landing, alerts)

    return {
        **state,
        "recommendation": recommendation,
    }


