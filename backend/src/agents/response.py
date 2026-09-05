from src.agents.state import AgentState
from src.services.sarvam_client import sarvam_generate


# Fallback templates when Sarvam is unavailable
FALLBACK_RECOMMENDATIONS = {
    "LOW": (
        "Conditions look good for fishing today. Wind and wave levels are within safe limits. "
        "Always carry safety equipment and inform someone of your trip details before heading out."
    ),
    "MODERATE": (
        "Conditions are marginal. Exercise caution — winds and waves are elevated. "
        "Consider staying closer to shore and monitor updates every 2-3 hours. "
        "Avoid zones beyond 20 km from the coast."
    ),
    "HIGH": (
        "DO NOT VENTURE OUT. Current conditions are dangerous for fishing. "
        "High winds, waves, or severe weather detected. Stay ashore until conditions improve. "
        "Check IMD updates regularly."
    ),
}


def response_node(state: AgentState) -> AgentState:
    """
    Response Agent: uses Sarvam-105B to generate a natural language recommendation
    grounded in the deterministic risk assessment. LLM explains, rules decide.
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

    # Format data context for Sarvam
    conditions_text = (
        f"Wind: {wind:.0f} km/h | Waves: {wave:.1f} m | Rainfall: {rain:.0f} mm | "
        f"Lightning: {'Yes' if lightning else 'No'} | Cyclone: {'Yes' if cyclone else 'No'}"
    )

    risk_label = {
        "LOW": "LOW RISK (Safe to fish)",
        "MODERATE": "MODERATE RISK (Caution advised)",
        "HIGH": "HIGH RISK (Do not venture out)",
    }.get(risk, "UNKNOWN")

    prompt = f"""You are a marine safety assistant for Indian fishermen.

User query: "{query}"
Location: {lat:.2f}°N, {lon:.2f}°E
Risk Assessment: {risk_label} (confidence: {confidence}%)
Current Conditions: {conditions_text}

Write a 2-3 sentence practical recommendation for the fisherman in plain English.
- Be direct and clear about whether it is safe to fish.
- Reference the specific conditions (wind, waves) in your answer.
- If risk is HIGH, be firm about not going out.
- Do NOT mention AI, models, or data pipelines.
- Keep it under 60 words.
"""

    try:
        recommendation = sarvam_generate(prompt).strip()
        if not recommendation or len(recommendation) < 20:
            raise ValueError("Empty or too short response from Sarvam")
    except Exception as e:
        print(f"[Response] Sarvam call failed: {e}. Using fallback template.")
        recommendation = FALLBACK_RECOMMENDATIONS.get(risk, FALLBACK_RECOMMENDATIONS["MODERATE"])

    return {
        **state,
        "recommendation": recommendation,
    }
