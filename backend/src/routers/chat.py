"""
chat.py — the primary /chat endpoint (LangGraph agent pipeline:
Planner -> Data -> Risk -> Response).

AGENT_AVAILABLE is detected here (not in main.py) since this is the only
router that actually needs the agent graph to run — health.py imports the
flag from here to report it, rather than main.py doing the detection and
every router that cares reaching back into main.py (which would make
main.py a dependency of its own routers instead of the other way around).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

try:
    from src.agents.graph import agent
    AGENT_AVAILABLE = True
except Exception as e:
    print(f"[WARN] Agent not available: {e}")
    AGENT_AVAILABLE = False

router = APIRouter()


class ChatRequest(BaseModel):
    query: str
    latitude: float = 8.5       # Default: Kochi
    longitude: float = 76.2
    language: str = "en"        # en | hi | ta
    profile: dict | None = None
    # Recent messages for multi-turn context: [{"role": "user"|"assistant", "text": "..."}],
    # oldest first. Cleaned and capped server-side (src/agents/conversation.py).
    history: list[dict] | None = None


class ChatResponse(BaseModel):
    risk_level: str             # "LOW" | "MODERATE" | "HIGH"
    wind_speed_10m: float
    wave_height: float
    precipitation: float
    visibility: float
    wind_gusts_10m: float
    lightning: bool
    cyclone: bool
    sst_c: float | None = None
    chlorophyll_mg_m3: float | None = None
    nearest_pfz: dict | None = None
    local_fishing_area: dict | None = None   # Populated when PFZ is >50 km away
    pfz_weather: dict | None = None
    geofence: dict | None = None
    nearest_landing: dict | None = None
    landing_options: list[dict] = []
    route_summary: dict | None = None
    alerts: list[dict] = []
    recommendation: str
    confidence: int             # 0-100
    sources: list[str]
    data_freshness: dict | None = None
    # Set when the question named a time ("tomorrow morning"): which period the
    # conditions above are for, and whether the forecast actually reaches it.
    forecast_window: dict | None = None
    # Current tide level/trend and the next highs and lows (model estimate) — see agents/tide.py.
    tide: dict | None = None


@router.post("/chat", response_model=ChatResponse, summary="Marine Intelligence Chat")
async def chat(request: ChatRequest):
    """
    Primary endpoint: accepts a natural language query about fishing / marine conditions.
    Routes through LangGraph agent pipeline:
      Planner → Data → Risk → Response
    Returns structured risk assessment + natural language recommendation.
    """
    if AGENT_AVAILABLE:
        try:
            from src.agents.graph import AgentState
            from src.agents.conversation import clean_history
            initial_state: AgentState = {
                "history": clean_history(request.history),
                "forecast_window": None,
                "tide": None,
                "query": request.query,
                "latitude": request.latitude,
                "longitude": request.longitude,
                "intent": "",
                "profile": request.profile,
                "risk_level": "LOW",
                "wind_speed_10m": 0.0,
                "wave_height": 0.0,
                "precipitation": 0.0,
                "visibility": 0.0,
                "wind_gusts_10m": 0.0,
                "lightning": False,
                "cyclone": False,
                "sst_c": None,
                "chlorophyll_mg_m3": None,
                "nearest_pfz": None,
                "local_fishing_area": None,
                "pfz_weather": None,
                "geofence": None,
                "nearest_landing": None,
                "landing_options": [],
                "route_summary": None,
                "alerts": [],
                "recommendation": "",
                "confidence": 0,
                "sources": [],
                "data_freshness": None,
            }
            result = await agent.ainvoke(initial_state)
            return ChatResponse(**result)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")
    else:
        # Stub response while agents are being built
        return ChatResponse(
            risk_level="LOW",
            wind_speed_10m=12.0,
            wave_height=1.2,
            precipitation=0.0,
            visibility=10000.0,
            wind_gusts_10m=15.0,
            lightning=False,
            cyclone=False,
            recommendation=(
                f"[STUB] Your query: '{request.query}'. "
                f"Conditions near ({request.latitude:.1f}, {request.longitude:.1f}) "
                f"look acceptable. Agents not yet fully initialized."
            ),
            confidence=50,
            sources=["stub-mock"],
        )
