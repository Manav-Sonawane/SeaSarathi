import os
import json
import re

from src.agents.state import AgentState
from src.services.sarvam_client import sarvam_generate


def planner_node(state: AgentState) -> AgentState:
    """
    Planner Agent: uses Sarvam-105B to detect user intent and confirm/extract location.
    Routes to SAFETY | PFZ | ALERT | WEATHER.
    Falls back gracefully if Sarvam is unavailable.
    """
    prompt = f"""You are a marine intelligence assistant for Indian fishermen.

User query: "{state['query']}"
User location: latitude {state['latitude']}, longitude {state['longitude']}

Classify this query and return ONLY a JSON object (no markdown, no extra text):
{{
  "intent": "SAFETY",
  "latitude": {state['latitude']},
  "longitude": {state['longitude']},
  "reasoning": "brief explanation"
}}

Intent must be exactly one of: SAFETY, PFZ, ALERT, WEATHER
If the query is about safety / can I fish / is it safe → SAFETY
If the query is about fishing zones / best spots / where to fish → PFZ
If the query is about warnings / alerts / cyclone → ALERT
If the query is about weather / wind / waves / rain → WEATHER
"""

    try:
        response_text = sarvam_generate(prompt)
        # Extract JSON from response (strip any extra text around it)
        match = re.search(r'\{.*?\}', response_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
            intent = parsed.get("intent", "SAFETY").upper()
            if intent not in ("SAFETY", "PFZ", "ALERT", "WEATHER"):
                intent = "SAFETY"
            lat = float(parsed.get("latitude", state["latitude"]))
            lon = float(parsed.get("longitude", state["longitude"]))
        else:
            intent = "SAFETY"
            lat = state["latitude"]
            lon = state["longitude"]
    except Exception as e:
        print(f"[Planner] Sarvam call failed: {e}. Defaulting to SAFETY intent.")
        intent = "SAFETY"
        lat = state["latitude"]
        lon = state["longitude"]

    return {
        **state,
        "intent": intent,
        "latitude": lat,
        "longitude": lon,
    }
