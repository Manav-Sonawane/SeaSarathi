from langgraph.graph import StateGraph, START, END

from src.agents.state import AgentState
from src.agents.planner import planner_node
from src.agents.data_agent import data_agent
from src.agents.risk_agent import risk_agent
from src.agents.response import response_node


# ─── Build LangGraph Workflow ──────────────────────────────────────────────────
#
#  START → planner → data → risk → response → END
#
# planner : Sarvam-105B detects intent (SAFETY/PFZ/ALERT/WEATHER)
# data    : Fetches real-time weather + ocean data (Open-Meteo, Copernicus)
# risk    : Deterministic safety rules engine (cyclone/wind/wave thresholds)
# response: Sarvam-105B generates natural language explanation

graph = StateGraph(AgentState)

graph.add_node("planner", planner_node)
graph.add_node("data", data_agent)
graph.add_node("risk", risk_agent)
graph.add_node("response", response_node)

graph.add_edge(START, "planner")
graph.add_edge("planner", "data")
graph.add_edge("data", "risk")
graph.add_edge("risk", "response")
graph.add_edge("response", END)

agent = graph.compile()
