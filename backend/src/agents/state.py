from typing import TypedDict

class AgentState(TypedDict):
    query: str
    latitude: float
    longitude: float
    intent: str

    # Conditions
    risk_level: str
    wind_speed_10m: float
    wave_height: float
    precipitation: float
    visibility: float
    wind_gusts_10m: float
    lightning: bool
    cyclone: bool
    sst_c: float | None
    chlorophyll_mg_m3: float | None

    # Results
    recommendation: str
    confidence: int
    sources: list[str]
