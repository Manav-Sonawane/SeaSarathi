from typing import TypedDict


class AgentState(TypedDict):
    query: str
    latitude: float
    longitude: float
    intent: str                  # "SAFETY" | "PFZ" | "ALERT" | "WEATHER"

    # Conditions
    risk_level: str              # "LOW" | "MODERATE" | "HIGH"
    wind_kmh: float
    wave_m: float
    rainfall_mm: float
    lightning: bool
    cyclone: bool

    # Results
    recommendation: str
    confidence: int              # 0-100
    sources: list[str]
