from src.agents.state import AgentState


def risk_agent(state: AgentState) -> AgentState:
    """
    Risk Agent: deterministic safety assessment engine.
    Rules override all LLM outputs. Safety decisions are never delegated to AI.

    Risk Levels:
      HIGH     → score < 40  (DO NOT VENTURE)
      MODERATE → score 40-69 (CAUTION)
      LOW      → score >= 70 (SAFE)
    """
    score = 100
    reasons = []

    # ── RULE 0: Cyclone = instant HIGH risk ──────────────────────────────────
    if state.get("cyclone"):
        return {
            **state,
            "risk_level": "HIGH",
            "confidence": 99,
        }

    # ── RULE 1: Lightning = instant HIGH risk ────────────────────────────────
    if state.get("lightning"):
        return {
            **state,
            "risk_level": "HIGH",
            "confidence": 98,
        }

    # ── RULE 2: Wind Speed (km/h) ────────────────────────────────────────────
    wind = state.get("wind_speed_10m", 0.0)
    if wind > 46:          # > 25 knots
        score -= 40
        reasons.append(f"High wind: {wind:.0f} km/h")
    elif wind > 28:        # > 15 knots
        score -= 15
        reasons.append(f"Moderate wind: {wind:.0f} km/h")
    else:
        reasons.append(f"Wind OK: {wind:.0f} km/h")

    # ── RULE 3: Wave Height (m) ──────────────────────────────────────────────
    wave = state.get("wave_height", 0.0)
    if wave > 3.5:
        score -= 35
        reasons.append(f"Dangerous waves: {wave:.1f} m")
    elif wave > 2.5:
        score -= 20
        reasons.append(f"High waves: {wave:.1f} m")
    elif wave > 1.5:
        score -= 10
        reasons.append(f"Moderate waves: {wave:.1f} m")
    else:
        reasons.append(f"Waves OK: {wave:.1f} m")

    # ── RULE 4: Heavy Rainfall ────────────────────────────────────────────────
    rain = state.get("precipitation", 0.0)
    if rain > 50:
        score -= 20
        reasons.append(f"Heavy rainfall: {rain:.0f} mm")
    elif rain > 15:
        score -= 8
        reasons.append(f"Moderate rainfall: {rain:.0f} mm")

    # ── Determine Risk Level ──────────────────────────────────────────────────
    score = max(0, min(100, score))
    if score >= 70:
        risk_level = "LOW"
    elif score >= 40:
        risk_level = "MODERATE"
    else:
        risk_level = "HIGH"

    # Confidence = how certain we are (based on data quality)
    # If all real data: high confidence; if mocks: lower
    sources = state.get("sources", [])
    has_real_data = any("open-meteo" in s for s in sources)
    confidence = score if has_real_data else max(30, score - 20)

    return {
        **state,
        "risk_level": risk_level,
        "confidence": int(confidence),
    }
