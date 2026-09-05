# Marine Intelligence Platform - PRD & Architecture

## Executive Summary
A 5-day hackathon build of an India-specific agentic marine intelligence system for fishermen and coastal stakeholders. Real-time safety assessment, PFZ discovery, and decision support using multilingual chat/voice, satellite ocean data (Copernicus), weather (Open-Meteo + IMD), and geospatial reasoning.

**Team:** MNV (Backend/Agents) + ARP (Backend/Frontend)
**Scope:** Core agentic system with deterministic marine tools. ML/Vision optional (Phase 5).

---

## 1. PRODUCT REQUIREMENTS

### 1.1 Core Features (MVP - Must Have)

#### A. Multilingual Chat Interface
- **Input:** Text query in EN/HI/TA (auto-detect)
- **Processing:** Sarvam-105B agentic planning
- **Output:** Structured response + explanations
- **Languages:** English, Hindi, Tamil (Sarvam Translate)

#### B. Safety Assessment (Real-Time)
- **Rules-Based Engine:** IMD/INCOIS warnings override all
- **Inputs:** 
  - Wind (knots) from Open-Meteo
  - Cyclone alerts from IMD
  - Waves/Swell from Open-Meteo
  - Visibility, lightning from IMD
- **Output:** SAFE / CAUTION / DO NOT VENTURE + score (0-100) + reasons
- **Data Freshness:** Updated 6-hourly from APIs

#### C. PFZ (Potential Fishing Zone) Recommendation
- **Data:** 52 zones (static GeoJSON) + historical chlorophyll/SST
- **Query:** "Best zone near [lat/lon] today?"
- **Logic:**
  - Find nearest 5 zones
  - Compare today's chlorophyll vs historical avg
  - Flag if chlorophyll > 0.8 mg/m³ (high productivity)
  - Filter by safety status
  - Rank by accessibility + productivity
- **Output:** Top 3 zones with distance, ETA, reasons

#### D. Marine Weather Dashboard
- **Metrics:**
  - SST (Copernicus)
  - Chlorophyll (Copernicus)
  - Wind speed/direction (Open-Meteo)
  - Wave height/swell (Open-Meteo)
  - Cyclone track (IMD)
  - Lightning risk (IMD)
- **Format:** Interactive map with layer toggles
- **Update Frequency:** 6-hourly

#### E. Geofencing Alerts
- **Boundaries:**
  - India EEZ (200 nm)
  - Pakistan-India boundary (alert if < 50 km)
  - Sri Lanka-India boundary
  - Marine Protected Areas (MPAs)
  - Port restricted zones
- **Alert:** "You are near [boundary name]"

#### F. Route Optimization
- **Input:** Current position + target PFZ
- **Algorithm:** A* over marine cost grid
- **Constraints:** Avoid high wave zones, cyclone cones, restricted areas
- **Output:** Waypoints + distance + ETA

#### G. Explainable Results
- **Every response shows:**
  - Data sources (Copernicus, IMD, Open-Meteo, INCOIS)
  - Timestamp of data
  - Confidence level
  - Reasoning chain (why this zone / why not safe)

### 1.2 Optional/Phase 2 Features

- Voice I/O (Sarvam STT + Bulbul TTS)
- Analytics mode (CMFRI correlation)
- LightGBM PFZ prediction
- Vision-based image analysis (Qwen2.5-VL)

---

## 2. ARCHITECTURE

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │   Chat   │  │   Map    │  │  Voice   │  │Settings  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│            FastAPI Server (Python) - Port 8000               │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              LangGraph Agent Orchestration            │  │
│  │                                                       │  │
│  │  ┌────────────┐      ┌────────────┐                 │  │
│  │  │  Planner   │─────→│ Router →   │                 │  │
│  │  │(Sarvam-105B)      │Intent→Agent│                 │  │
│  │  └────────────┘      └────────────┘                 │  │
│  │        ↓        ↓        ↓        ↓                  │  │
│  │  ┌────────┐ ┌────┐ ┌────────┐ ┌────────┐           │  │
│  │  │ Data   │ │Geo │ │ Risk   │ │Response│           │  │
│  │  │ Agent  │ │Agent│ │ Agent  │ │ Agent  │           │  │
│  │  └────────┘ └────┘ └────────┘ └────────┘           │  │
│  │     ↓        ↓        ↓           ↓                  │  │
│  │  Tools:   Tools:   Rules:     Format:               │  │
│  │  - APIs   - Geo    - Safety   - Response            │  │
│  │  - Cache  - Routing- ML       - Explain             │  │
│  │           - Buffer           - Translate           │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              External Data Services                   │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │  │
│  │  │ Copernicus │  │Open-Meteo  │  │ IMD API    │    │  │
│  │  │(SST/Chl)   │  │(Wind/Wave) │  │(Cyclone)   │    │  │
│  │  └────────────┘  └────────────┘  └────────────┘    │  │
│  │                                                      │  │
│  │  ┌────────────┐  ┌────────────┐                    │  │
│  │  │PostgreSQL+ │  │   Redis    │                    │  │
│  │  │  PostGIS   │  │   Cache    │                    │  │
│  │  └────────────┘  └────────────┘                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Backend Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **API** | FastAPI | REST endpoints, async handlers |
| **Agents** | LangGraph | Multi-agent orchestration, state |
| **LLM** | Sarvam-105B | Planning, explanation, translation |
| **Geospatial** | GeoPandas, Shapely | PFZ lookup, geofencing, routing |
| **Routing** | Custom A* | Marine cost grid pathfinding |
| **Database** | PostgreSQL + PostGIS | Spatial queries, PFZ/boundaries |
| **Cache** | Redis | Session data, API responses |
| **Marine APIs** | Copernicus, Open-Meteo, IMD | Real-time ocean/weather data |

### 2.3 Frontend Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React 18 + TypeScript | UI components, state |
| **Build** | Vite | Fast bundling |
| **Maps** | MapLibre GL JS or Leaflet | Interactive map |
| **Styling** | Tailwind CSS | Responsive design |
| **API Client** | Axios or Fetch | FastAPI communication |
| **Voice** | Web Speech API | STT (fallback) |

### 2.4 Data Architecture

#### Static (Save Locally - 88.6 MB)
```
/data/static/
├── pfz_zones.geojson            (0.5 MB) - 52 zones
├── chlorophyll_historical.json   (50 MB) - 1 year daily
├── sst_historical.json           (30 MB) - 1 year daily
├── fish_catch_history.csv        (5 MB) - 10 years
├── boundaries.geojson            (3 MB) - EEZ, limits
└── landing_centres.geojson       (0.1 MB)
```

#### Dynamic (Fetch & Auto-Delete - 130 MB)
```
/data/dynamic/
├── chlorophyll_YYYY-MM-DD.json   (2 MB) - Keep 30 days
├── sst_YYYY-MM-DD.json           (2 MB) - Keep 30 days
└── weather_YYYY-MM-DD_HH00.json  (100 KB) - Keep 24 hours
```

### 2.5 Agent Workflow

```
User Query (Text/Voice)
    ↓
[1. PLANNER AGENT]
├─ Parse intent (PFZ? Safety? Weather? Route?)
├─ Detect location (lat/lon from query or user context)
└─ Route to specialized agent(s)
    ↓
[2. DATA AGENT]
├─ Load static PFZ zones from PostGIS
├─ Fetch today's chlorophyll (Copernicus API)
├─ Fetch today's SST (Copernicus API)
├─ Fetch weather (Open-Meteo, IMD)
└─ Compare with historical baseline
    ↓
[3. GEO AGENT]
├─ Calculate distances (Haversine)
├─ Check geofence boundaries
├─ Identify nearest zones
└─ Plan routes (A* if needed)
    ↓
[4. RISK AGENT]
├─ Load safety rules (deterministic)
├─ Check IMD/INCOIS warnings (OVERRIDE)
├─ Evaluate wind, waves, cyclone
├─ Calculate safety score (0-100)
└─ Flag anomalies
    ↓
[5. RESPONSE AGENT]
├─ Format structured response
├─ Add explanations + data sources
├─ Translate to user language
├─ Prepare map data (GeoJSON)
└─ Send to frontend
    ↓
User Response + Map
```

### 2.6 Safety-First Design

**Principle:** IMD/INCOIS warnings are law. LLM explains, rules decide.

```python
# Pseudocode
def assess_safety(weather_data, rules, warnings):
    # Step 1: Check official warnings (non-negotiable)
    if warnings.cyclone_active:
        return "DO NOT VENTURE"  # Override everything
    
    if warnings.lightning_high:
        return "DO NOT VENTURE"  # Override everything
    
    # Step 2: Apply deterministic rules
    if weather_data.wind_knots > 25:
        return "CAUTION"
    
    if weather_data.wave_height_m > 3:
        return "CAUTION"
    
    # Step 3: If all clear
    return "SAFE"

# LLM never overrides safety decisions
# LLM only explains *why* (show reasons + sources)
```

### 2.7 API Endpoints

#### Core Endpoints
```
POST   /chat                      Chat + voice input
GET    /health                    Server status
GET    /pfz/nearest              5 nearest zones
GET    /safety/assess            Current safety level
GET    /ocean/current            SST + Chlorophyll
GET    /geojson/pfz             All zones (map)
GET    /geojson/boundaries      EEZ + limits (map)
```

#### Admin/Debug
```
GET    /data/status             Data freshness
POST   /data/refresh            Manual refresh
GET    /agents/trace            Agent execution trace
```

---

## 3. DESIGN DECISIONS

### 3.1 Why Sarvam-105B?
- **Pros:** Fast, multilingual, open deployment
- **Cons:** May need fallback for very long contexts
- **Risk Mitigation:** Test with actual PFZ/weather data early

### 3.2 Why Copernicus + Open-Meteo + IMD?
- **Copernicus:** Free, daily SST/chlorophyll for Indian waters
- **Open-Meteo:** Free, no API key needed, 6-hour forecast
- **IMD:** Official Indian weather/cyclone source (trust > accuracy tradeoff)
- **Alternative:** NASA earthaccess if Copernicus fails

### 3.3 Why PostgreSQL + PostGIS?
- **PFZ geofencing:** Native spatial queries
- **Boundaries:** Fast polygon-in-point checks
- **Scaling:** Ready for future analytics
- **Alternative:** SQLite for local dev (faster to start)

### 3.4 Why A* for Routing?
- **Cost Grid:** Incorporate wave height, cyclone zones, restricted areas
- **Deterministic:** No ML uncertainty for safety
- **Performance:** ~100ms for Indian EEZ
- **Alternative:** Dijkstra if A* is overkill

### 3.5 Why Not ML in MVP?
- **Phase 1 Goal:** Prove agentic system works with rules
- **Phase 2 Goal:** Add LightGBM PFZ prediction
- **Reason:** Safety-critical decisions should be transparent first

---

## 4. DATA SOURCES & INTEGRATION

### 4.1 Static Data Sources

| Data | Source | Format | Size | Update |
|------|--------|--------|------|--------|
| PFZ Zones | INCOIS (you have) | GeoJSON | 0.5 MB | Yearly |
| Boundaries | UNCLOS/Govt data | GeoJSON | 3 MB | Rarely |
| Landing Centers | CMFRI/Manual | GeoJSON | 0.1 MB | Yearly |
| Chlorophyll (1yr) | Copernicus API | JSON grid | 50 MB | Once |
| SST (1yr) | Copernicus API | JSON grid | 30 MB | Once |
| Fish Catch (10yr) | CMFRI/Manual | CSV | 5 MB | Quarterly |

### 4.2 Live Data APIs

| Data | API | Frequency | Latency | Auth |
|------|-----|-----------|---------|------|
| SST/Chlorophyll | Copernicus | Daily | +1 day | Free |
| Wind/Wave/Swell | Open-Meteo | 6-hourly | Real-time | No |
| Cyclone/Weather | IMD | 6-hourly | Real-time | Check |
| Lightning | IMD | Real-time | Real-time | Check |

---

## 5. DEPLOYMENT MODEL

### 5.1 Local Dev (Week 1)
- FastAPI on localhost:8000
- SQLite for quick dev (migrate to PostgreSQL later)
- Mock API responses if slow
- Frontend on localhost:5173 (Vite dev server)

### 5.2 Demo/Hackathon (End of Week 1)
- Single server (AWS EC2 or local)
- PostgreSQL + PostGIS
- Real API calls to Copernicus/Open-Meteo/IMD
- HTTPS (self-signed cert OK for demo)

### 5.3 Production (Post-Hackathon)
- Docker containers (FastAPI + PostgreSQL)
- Kubernetes or simple Docker Compose
- Environment variables for all secrets
- Error tracking (Sentry optional)

---

## 6. SUCCESS CRITERIA

### By End of Day 2
- ✅ Planner + Data + Response agents working
- ✅ Real data flowing (Copernicus/Open-Meteo/IMD)
- ✅ Chat endpoint responds with PFZ recommendations

### By End of Day 4
- ✅ Safety assessment (rules-based)
- ✅ Geofencing checks
- ✅ Interactive map with layers
- ✅ Voice input (optional STT)

### By End of Day 5
- ✅ End-to-end demo: Query → Agent → Response + Map
- ✅ Multilingual (EN/HI/TA working)
- ✅ Deployable to single server
- ✅ 5-min demo video ready

---

## 7. RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| Copernicus API slow/down | Use cached data, fallback to static |
| Sarvam-105B latency | Cache responses, batch requests |
| PostGIS setup complex | Start with SQLite, migrate later |
| Geofencing accuracy | Pre-test with known points |
| IMD API unreliable | Mock responses for dev, fallback logic |
| Routing algorithm slow | Pre-compute routes, A* with heuristics |

---

## 8. TEAM ALLOCATION (MNV + ARP)

### MNV (Backend/Agents)
- **Days 1-2:** FastAPI scaffold + Sarvam-105B setup + LangGraph core
- **Days 2-3:** Data agent + safety rules + risk agent
- **Days 4-5:** Integration + API polish + deployment

### ARP (Frontend/Integration)
- **Days 1-2:** React scaffold + map integration + API client
- **Days 2-3:** Chat interface + layer toggles + voice (optional)
- **Days 4-5:** Styling + demo flow + production build

---

## 9. BUILD PHILOSOPHY

1. **Deterministic First:** Rules over ML for safety
2. **Data-Driven:** Real APIs over mocks ASAP
3. **Agent-Centric:** LangGraph orchestration, not monolithic code
4. **Explainability:** Every decision shows source + timestamp
5. **India-Specific:** IMD/INCOIS trust, boundaries matter
6. **Lean MVP:** Core features work, nice-to-haves in Phase 2

---

**Document Version:** 2.0
**Last Updated:** Planning Phase (Roles Swapped)
**Next Review:** End of Day 2 (Progress Check)

