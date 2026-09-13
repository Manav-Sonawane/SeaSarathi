import os
import json
import re

from src.agents.state import AgentState
from src.services.sarvam_client import sarvam_generate


def classify_intent_rule_based(query: str) -> str:
    """Deterministic intent classifier based on keywords across English and Indian regional languages."""
    q = (query or "").lower()

    # 1. Data Freshness / Age / Re-fetch / Refresh
    if any(k in q for k in [
        "fresh", "freshness", "purana", "kitna purana", "how old", "re-fetch", "refetch", "refresh", "stale", "sync",
        "data age", "update data", "last update", "cache",
        "पुराना", "कितना पुराना", "ताज़ा", "री-फ़ेच", "रिफ्रेश",
        "பழைய", "புதிய", "புதுப்பி",
        "పాత", "తాజా", "రీఫ్రెష్",
        "പഴയത്", "പുതുക്കുക",
    ]):
        return "FRESHNESS"

    # 2. Storm / Cyclone / Rain / Lightning / Threat / Warnings
    if any(k in q for k in [
        "storm", "cyclone", "rain", "lightning", "threat", "warning", "thunder", "tempest", "alert", "danger",
        "ചുഴലിക്കാറ്റ്", "മിന്നൽ", "മഴ", "മുന്നറിയിപ്പ്",
        "புயல்", "மின்னல்", "மழை", "எச்சரிக்கை",
        "తుఫాను", "మెరుపు", "వర్షం", "హెచ్చరిక",
        "तूफान", "चक्रवात", "बारिश", "बिजली", "चेतावनी",
        "ঝড়", "ঘূর্ণিঝড়", "বৃষ্টি", "সতর্কতা",
        "વાવાઝોડું", "તોફાન", "ચેતવણી",
        "वादळ", "चक्रीवादळ", "इशारा",
        "ବାତ୍ୟା", "ତୋଫାନ", "ଚେତାବନୀ",
        "ಚಂಡಮಾರುತ", "ಬಿರುಗಾಳಿ", "ಎಚ್ಚರಿಕೆ",
    ]):
        return "ALERT"

    # 3. Wind & Wave / Weather / Sea Conditions
    if any(k in q for k in [
        "wind", "wave", "weather", "sea", "ocean current", "sea current", "swell", "breeze", "rough", "speed", "temp", "temperature",
        "കാറ്റ്", "തിരമാല", "കാലാവസ്ഥ",
        "காற்று", "அலை", "வானிலை",
        "గాలి", "అలల", "వాతావరణం",
        "हवा", "लहर", "मौसम",
        "বাতাস", "ঢেউ", "আবহাওয়া",
        "પવન", "મોજા", "હવામાન",
        "વાતಾವરણ", "লাటా", "हवामान",
        "ପବନ", "ଢେଉ", "ପାଣିପାଗ",
        "ಗಾಳಿ", "ಅಲೆ", "ಹವಾಮಾನ",
    ]):
        return "WEATHER"

    # 3. Fish / PFZ / Catch / Shoals / Fishing Locations
    if any(k in q for k in [
        "fish", "pfz", "catch", "sardine", "tuna", "mackerel", "shoal", "zone", "where", "spot", "hunt",
        "മീൻ", "മത്സ്യം",
        "மீன்", "மண்டலம்",
        "చేపల", "వేట",
        "मछली", "पकड़",
        "মাছ",
        "માછલી",
        "मासे",
        "ମାଛ",
        "ಮೀನು",
    ]):
        return "PFZ"

    # 4. Port / Harbor / Landing / Emergency Shelter
    if any(k in q for k in [
        "port", "harbor", "harbour", "landing", "shelter", "return", "dock", "emergency",
        "തുറമുഖം",
        "துறைமுகம்",
        "రేవు", "నౌకాశ్రయం",
        "बंदरगाह",
        "বন্দর",
        "બંદર",
        "बंदर",
        "ବନ୍ଦର",
        "ಬಂದರು",
    ]):
        return "PORT"

    # 5. Data Freshness / Age / Re-fetch / Refresh
    if any(k in q for k in [
        "fresh", "freshness", "purana", "kitna purana", "how old", "re-fetch", "refetch", "refresh", "stale", "sync",
        "data age", "update data", "last update", "cache",
        "पुराना", "कितना पुराना", "ताज़ा", "री-फ़ेच", "रिफ्रेश",
        "பழைய", "புதிய", "புதுப்பி",
        "పాత", "తాజా", "రీఫ్రెష్",
        "പഴയത്", "പുതുക്കുക",
    ]):
        return "FRESHNESS"

    # 6. Default Safety Assessment
    return "SAFETY"


def planner_node(state: AgentState) -> AgentState:
    """
    Planner Agent: uses Sarvam-105B to detect user intent and confirm/extract location.
    Routes to SAFETY | PFZ | ALERT | WEATHER | PORT | FRESHNESS.
    Falls back gracefully to deterministic rule-based classifier if Sarvam is unavailable.
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

Intent must be exactly one of: SAFETY, PFZ, ALERT, WEATHER, PORT, FRESHNESS
If the query is about safety / can I fish / is it safe → SAFETY
If the query is about fishing zones / best spots / where to fish → PFZ
If the query is about warnings / alerts / cyclone / storm → ALERT
If the query is about weather / wind / waves / rain → WEATHER
If the query is about harbor / landing center / shelter / port → PORT
If the query is about data freshness / age / re-fetching / refreshing → FRESHNESS
"""

    try:
        response_text = sarvam_generate(prompt)
        # Extract JSON from response (strip any extra text around it)
        match = re.search(r'\{.*?\}', response_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
            intent = parsed.get("intent", "").upper()
            valid_intents = {"SAFETY", "PFZ", "ALERT", "WEATHER", "PORT", "FRESHNESS"}
            if intent not in valid_intents:
                intent = classify_intent_rule_based(state.get("query", ""))
            lat = float(parsed.get("latitude", state["latitude"]))
            lon = float(parsed.get("longitude", state["longitude"]))
        else:
            intent = classify_intent_rule_based(state.get("query", ""))
            lat = state["latitude"]
            lon = state["longitude"]
    except Exception as e:
        intent = classify_intent_rule_based(state.get("query", ""))
        print(f"[Planner] Sarvam call failed: {e}. Detected rule-based intent: {intent}")
        lat = state["latitude"]
        lon = state["longitude"]

    return {
        **state,
        "intent": intent,
        "latitude": lat,
        "longitude": lon,
    }
