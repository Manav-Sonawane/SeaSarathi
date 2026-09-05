# 5-Day Execution Plan - Marine Intelligence Platform

**Team:** MNV (Backend/Agents) + ARP (Frontend/Integration)
**Duration:** 5 Days (40 hours total per person)
**Goal:** End-to-end demo: User Query → Agent Processing → Response + Interactive Map

---

## DAY 1: FOUNDATION & SCAFFOLD

### Morning (4 hours) - TEAM SYNC

**MNV + ARP Together:**
1. **Repository Setup** (30 min)
   - Create GitHub repo (or local git)
   - Folder structure: `/backend`, `/frontend`, `/data`
   - README with setup instructions

2. **Environment Setup** (1 hour)
   - Create `.env` files (DO NOT commit keys)
   ```env
   # Backend
   SARVAM_API_KEY=your_key
   SARVAM_LLM_MODEL=sarvam-105b
   COPERNICUS_KEY=your_key (or test without)
   DATABASE_URL=postgresql://user:pass@localhost/marine
   REDIS_URL=redis://localhost:6379
   IMD_API_KEY=check_with_team
   
   # Frontend
   VITE_API_URL=http://localhost:8000
   ```

3. **Data Files Setup** (1 hour 30 min)
   - Create `/data/static/` folder
   - Download/copy your 52 PFZ zones → `/data/static/pfz_zones.geojson`
   - Create placeholder for chlorophyll/SST historical (get from Copernicus or mock for now)
   - Create `/data/dynamic/` for daily updates

4. **Quick Test** (1 hour)
   - Both run: `python -c "import sarvam; print('Sarvam SDK ready')"` (or mock)
   - Both run: `npm install` (frontend) to check Node version
   - Both verify database connections (or skip if using SQLite locally)

---

### Afternoon (4 hours)

**MNV (Backend/Agents Scaffold):**
1. **FastAPI Server Scaffold** (2 hours)
   ```bash
   mkdir backend && cd backend
   python -m venv venv
   source venv/bin/activate
   pip install fastapi uvicorn httpx python-dotenv
   
   # Create main.py
   ```
   - Basic FastAPI server on `:8000`
   - `/health` endpoint (returns "OK")
   - `/chat` endpoint (stub - returns "Processing...")
   - CORS enabled for localhost:5173

2. **Test It** (30 min)
   ```bash
   python -m uvicorn main:app --reload
   curl http://localhost:8000/health
   # Should return {"status": "ok"}
   ```

3. **LangGraph + Sarvam Setup** (1.5 hours)
   ```bash
   pip install langgraph langchain pydantic
   
   # Create src/agents/planner.py (stub)
   # Create src/agents/response.py (stub)
   # Test: Can we call Sarvam API?
   ```
   - Initialize Sarvam client
   - Test simple prompt: "Hello" → Sarvam response
   - Document any API issues

---

**ARP (Frontend Scaffold):**
1. **React + Vite Setup** (1 hour)
   ```bash
   npm create vite@latest frontend -- --template react-ts
   cd frontend
   npm install
   npm install axios tailwindcss
   ```

2. **Basic Layout** (1.5 hours)
   - Create `src/components/Chat.tsx` (text input + send button)
   - Create `src/components/Map.tsx` (placeholder map container)
   - Create `src/App.tsx` with routing (Chat | Map tabs)
   - Test: `npm run dev` on localhost:5173

3. **API Client Setup** (1 hour)
   ```typescript
   // src/services/api.ts
   import axios from 'axios';
   
   const api = axios.create({
     baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000'
   });
   
   export const chatAPI = {
     sendMessage: (query: string, lat?: number, lon?: number) =>
       api.post('/chat', { query, latitude: lat, longitude: lon })
   };
   ```

---

### EOD Checkpoint
- ✅ Repo structure ready
- ✅ Backend FastAPI running on :8000
- ✅ Frontend React running on :5173
- ✅ Both can call Sarvam API (test with simple prompt)
- ✅ Communicate first API errors/blockers

---

## DAY 2: CORE AGENTS & DATA INTEGRATION

### Morning (4 hours) - AGENTS CORE

**MNV:**
1. **LangGraph State Definition** (1 hour)
   ```python
   # src/agents/state.py
   from typing import TypedDict
   from datetime import datetime
   
   class AgentState(TypedDict):
       query: str
       latitude: float
       longitude: float
       intent: str  # "pfz", "safety", "weather"
       
       # Data
       nearest_zones: list
       sst_today: float
       chlorophyll_today: float
       wind_knots: float
       cyclone_alert: bool
       
       # Results
       safety_level: str  # "SAFE", "CAUTION", "DO_NOT_VENTURE"
       response: str
       sources: list
   ```

2. **Planner Agent** (1.5 hours)
   ```python
   # src/agents/planner.py
   def planner_node(state: AgentState, config):
       """Use Sarvam to detect intent + extract location"""
       prompt = f"""
       User query: {state['query']}
       
       Return JSON:
       {{
         "intent": "pfz" | "safety" | "weather" | "route",
         "latitude": 8.5,
         "longitude": 77.5,
         "reasoning": "..."
       }}
       """
       
       response = sarvam_client.generate(prompt)
       # Parse JSON response
       state['intent'] = parsed['intent']
       state['latitude'] = parsed['latitude']
       state['longitude'] = parsed['longitude']
       return state
   ```
   - Test with: "Best fishing zone near Kochi?"

3. **Response Agent Stub** (1 hour)
   ```python
   # src/agents/response.py
   def response_node(state: AgentState, config):
       """Format response + explanations"""
       prompt = f"""
       Intent: {state['intent']}
       Zones: {state['nearest_zones']}
       Safety: {state['safety_level']}
       
       Write a clear response for fishermen in English.
       """
       response = sarvam_client.generate(prompt)
       state['response'] = response
       return state
   ```

4. **LangGraph Workflow** (30 min)
   ```python
   # src/agents/graph.py
   from langgraph.graph import StateGraph, START, END
   
   graph = StateGraph(AgentState)
   graph.add_node("planner", planner_node)
   graph.add_node("response", response_node)
   
   graph.add_edge(START, "planner")
   graph.add_edge("planner", "response")
   graph.add_edge("response", END)
   
   agent = graph.compile()
   ```

---

### Afternoon (4 hours) - DATA INTEGRATION

**MNV:**
1. **Data Agent Skeleton** (2 hours)
   ```python
   # src/agents/data_agent.py
   async def data_agent(state: AgentState, config):
       """Fetch PFZ zones + ocean data"""
       
       # 1. Load static PFZ zones
       with open('data/static/pfz_zones.geojson') as f:
           pfz_geojson = json.load(f)
       
       # 2. Find nearest 5 zones (Haversine distance)
       nearest = find_nearest_zones(
           state['latitude'], 
           state['longitude'],
           pfz_geojson,
           n=5
       )
       state['nearest_zones'] = nearest
       
       # 3. Try to fetch live data (or use mock)
       try:
           state['chlorophyll_today'] = await fetch_copernicus(...)
           state['sst_today'] = await fetch_copernicus(...)
       except Exception as e:
           print(f"API error: {e}, using cached data")
           state['chlorophyll_today'] = 0.5  # Mock
           state['sst_today'] = 27.2  # Mock
       
       # 4. Fetch weather
       try:
           state['wind_knots'] = await fetch_open_meteo(...)
           state['cyclone_alert'] = await fetch_imd(...)
       except:
           state['wind_knots'] = 12  # Mock
           state['cyclone_alert'] = False
       
       return state
   ```

2. **Helper: Nearest Zones** (1 hour)
   ```python
   # src/utils/geo.py
   from math import radians, cos, sin, asin, sqrt
   
   def haversine(lat1, lon1, lat2, lon2):
       """Distance in km"""
       ...
       return distance_km
   
   def find_nearest_zones(lat, lon, geojson, n=5):
       zones = []
       for feature in geojson['features']:
           geom = feature['geometry']
           if geom['type'] == 'Point':
               zone_lat = geom['coordinates'][1]
               zone_lon = geom['coordinates'][0]
               dist = haversine(lat, lon, zone_lat, zone_lon)
               zones.append({
                   'name': feature['properties']['name'],
                   'distance_km': dist,
                   'properties': feature['properties']
               })
       return sorted(zones, key=lambda x: x['distance_km'])[:n]
   ```

3. **Add to Graph** (30 min)
   ```python
   graph.add_node("data", data_agent)
   graph.add_edge("planner", "data")
   graph.add_edge("data", "response")
   ```

4. **Test It** (30 min)
   - Query: "Near Kochi"
   - Check: Does it find 5 nearest zones?
   - Check: Can it fetch from Copernicus? (If not, move to mock)

---

### Afternoon (4 hours) - FRONTEND INTEGRATION

**ARP:**
1. **Chat Component** (2 hours)
   ```typescript
   // src/components/Chat.tsx
   import { useState } from 'react';
   import { chatAPI } from '../services/api';
   
   export function Chat() {
     const [query, setQuery] = useState('');
     const [response, setResponse] = useState('');
     const [loading, setLoading] = useState(false);
   
     const handleSend = async () => {
       setLoading(true);
       try {
         const result = await chatAPI.sendMessage(query, 8.5, 77.5);
         setResponse(result.data.response);
       } catch (err) {
         setResponse('Error: ' + err.message);
       }
       setLoading(false);
     };
   
     return (
       <div className="p-4">
         <input
           value={query}
           onChange={(e) => setQuery(e.target.value)}
           placeholder="Ask about fishing zones..."
         />
         <button onClick={handleSend} disabled={loading}>
           {loading ? 'Thinking...' : 'Send'}
         </button>
         <div className="mt-4">{response}</div>
       </div>
     );
   }
   ```

2. **Connect to Backend** (1 hour)
   - Update FastAPI `/chat` endpoint to call agent graph
   ```python
   @app.post("/chat")
   async def chat(request: ChatRequest):
       initial_state = AgentState(
           query=request.query,
           latitude=request.latitude,
           longitude=request.longitude,
           ...
       )
       result = agent.invoke(initial_state)
       return {
           "response": result['response'],
           "nearest_zones": result['nearest_zones'],
           "sources": result.get('sources', [])
       }
   ```

3. **Test E2E** (1 hour)
   - Type query in React chat
   - See response from Sarvam agent
   - Debug any CORS/async issues

---

### EOD Checkpoint
- ✅ Planner agent extracts intent + location
- ✅ Data agent loads PFZ zones + fetches (or mocks) ocean data
- ✅ Response agent formats answer
- ✅ Frontend chat sends query → backend processes → response displayed
- ✅ At least 1 end-to-end query works

**Test Query:** "What are the best fishing zones near Kochi?"
**Expected:** Shows 3-5 nearest PFZ zones with distances

---

## DAY 3: SAFETY RULES & GEO OPERATIONS

### Morning (4 hours) - SAFETY ASSESSMENT

**MNV:**
1. **Safety Rules Engine** (2 hours)
   ```python
   # src/agents/risk_agent.py
   def risk_agent(state: AgentState, config):
       """Deterministic safety assessment"""
       
       score = 100
       reasons = []
       
       # Rule 1: Cyclone = instant FAIL
       if state['cyclone_alert']:
           return {
               **state,
               'safety_level': 'DO_NOT_VENTURE',
               'score': 0,
               'reasons': ['🔴 Cyclone alert active - DO NOT GO OUT']
           }
       
       # Rule 2: Wind check
       if state['wind_knots'] > 25:
           score -= 30
           reasons.append(f'⚠️ High wind: {state["wind_knots"]} knots')
       elif state['wind_knots'] > 15:
           score -= 10
           reasons.append(f'⚠️ Moderate wind: {state["wind_knots"]} knots')
       else:
           reasons.append(f'✅ Wind OK: {state["wind_knots"]} knots')
       
       # Rule 3: Chlorophyll (productivity)
       if state['chlorophyll_today'] > 0.8:
           score += 10
           reasons.append(f'✅ High productivity: {state["chlorophyll_today"]:.2f}')
       elif state['chlorophyll_today'] < 0.3:
           reasons.append(f'⚠️ Low productivity: {state["chlorophyll_today"]:.2f}')
       
       # Determine level
       if score >= 70:
           safety_level = 'SAFE'
       elif score >= 40:
           safety_level = 'CAUTION'
       else:
           safety_level = 'DO_NOT_VENTURE'
       
       return {
           **state,
           'safety_level': safety_level,
           'score': score,
           'reasons': reasons
       }
   ```

2. **Add to Graph** (1 hour)
   ```python
   graph.add_node("risk", risk_agent)
   graph.add_edge("data", "risk")
   graph.add_edge("risk", "response")
   ```

3. **Update Response Agent** (1 hour)
   ```python
   def response_node(state: AgentState, config):
       # Include safety info + reasons
       prompt = f"""
       Safety: {state['safety_level']} ({state['score']}/100)
       Reasons: {', '.join(state['reasons'])}
       Zones: {state['nearest_zones']}
       
       Write encouraging but safe response for fishermen.
       """
       ...
   ```

---

### Afternoon (4 hours) - GEO OPERATIONS & GEOFENCING

**MNV:**
1. **Geo Agent with Geofencing** (2 hours)
   ```python
   # src/agents/geo_agent.py
   def geo_agent(state: AgentState, config):
       """Distance, routing, geofencing"""
       
       # 1. Load boundaries
       with open('data/static/boundaries.geojson') as f:
           boundaries = json.load(f)
       
       # 2. Check if near Pakistan/Sri Lanka boundary
       alerts = []
       user_point = Point(state['longitude'], state['latitude'])
       
       for boundary in boundaries['features']:
           if boundary['properties']['type'] == 'Maritime_Boundary':
               boundary_geom = shape(boundary['geometry'])
               if user_point.distance(boundary_geom) < 0.5:  # 50km approx
                   alerts.append(f"⚠️ Near {boundary['properties']['name']}")
       
       # 3. Calculate ETA to nearest zone (assume 15 knots)
       nearest = state['nearest_zones'][0] if state['nearest_zones'] else None
       eta_hours = None
       if nearest:
           nautical_miles = nearest['distance_km'] / 1.852
           eta_hours = nautical_miles / 15
       
       state['geofence_alerts'] = alerts
       state['eta_hours'] = eta_hours
       
       return state
   ```

2. **Add to Graph** (30 min)
   ```python
   graph.add_node("geo", geo_agent)
   graph.add_edge("planner", "geo")
   graph.add_edge("geo", "risk")
   ```

3. **Test Geofencing** (1 hour)
   - Query: "Can I fish at [lat/lon near Pakistan border]?"
   - Expect: Alert about being near boundary

4. **Optional: Basic A* Routing** (30 min - if time)
   ```python
   # src/utils/routing.py
   # Stub for A* (implement if time permits)
   # For now: Just show straight-line distance
   ```

---

### EOD Checkpoint
- ✅ Safety assessment working (SAFE/CAUTION/DO_NOT_VENTURE)
- ✅ Safety score calculated with reasons
- ✅ Geofencing alerts (boundaries detected)
- ✅ ETA calculation

**Test Query:** "Is it safe to fish near Kochi today?"
**Expected:** "SAFE (78/100) - Wind 12kt OK, Chlorophyll 0.65 good"

---

## DAY 4: MAP & FRONTEND POLISH

### Morning (4 hours) - INTERACTIVE MAP

**ARP:**
1. **Map Integration** (2 hours)
   ```bash
   npm install leaflet react-leaflet
   ```
   
   ```typescript
   // src/components/Map.tsx
   import { MapContainer, TileLayer, GeoJSON, Popup } from 'react-leaflet';
   import { useEffect, useState } from 'react';
   
   export function Map() {
     const [pfzData, setPfzData] = useState(null);
     const [boundaryData, setBoundaryData] = useState(null);
   
     useEffect(() => {
       fetch('http://localhost:8000/geojson/pfz')
         .then(r => r.json())
         .then(setPfzData);
       
       fetch('http://localhost:8000/geojson/boundaries')
         .then(r => r.json())
         .then(setBoundaryData);
     }, []);
   
     return (
       <MapContainer center={[20, 80]} zoom={5} style={{ height: '100%' }}>
         <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
         {pfzData && <GeoJSON data={pfzData} />}
         {boundaryData && <GeoJSON data={boundaryData} style={{ color: 'red' }} />}
       </MapContainer>
     );
   }
   ```

2. **Backend GeoJSON Endpoints** (1 hour)
   **MNV:** Add endpoints
   ```python
   @app.get("/geojson/pfz")
   async def get_pfz_geojson():
       with open('data/static/pfz_zones.geojson') as f:
           return json.load(f)
   
   @app.get("/geojson/boundaries")
   async def get_boundaries_geojson():
       with open('data/static/boundaries.geojson') as f:
           return json.load(f)
   ```

3. **Layer Toggles** (1 hour)
   ```typescript
   // Add checkboxes in Map component
   <label>
     <input type="checkbox" checked={showPFZ} onChange={(e) => setShowPFZ(e.target.checked)} />
     PFZ Zones
   </label>
   <label>
     <input type="checkbox" checked={showBoundaries} onChange={(e) => setShowBoundaries(e.target.checked)} />
     Boundaries
   </label>
   ```

---

### Afternoon (4 hours) - FRONTEND POLISH & VOICE (Optional)

**ARP:**
1. **Chat + Map Layout** (1 hour)
   ```typescript
   // src/App.tsx
   export function App() {
     const [activeTab, setActiveTab] = useState('chat'); // chat | map
     return (
       <div className="flex h-screen">
         <div className="w-1/3">
           {activeTab === 'chat' && <Chat />}
         </div>
         <div className="w-2/3">
           {activeTab === 'map' && <Map />}
         </div>
       </div>
     );
   }
   ```

2. **Style & Responsiveness** (1.5 hours)
   - Tailwind CSS for clean design
   - Highlight safety level (RED for danger, YELLOW for caution, GREEN for safe)
   - Show zone recommendations in chat with map markers

3. **Voice Input (Optional)** (1.5 hours)
   ```typescript
   // src/components/VoiceInput.tsx
   import { useState } from 'react';
   
   const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
   
   export function VoiceInput({ onQuery }) {
     const [listening, setListening] = useState(false);
     const recognition = new SpeechRecognition();
     
     const startListening = () => {
       recognition.start();
       setListening(true);
       recognition.onresult = (event) => {
         const query = event.results[0][0].transcript;
         onQuery(query);
         setListening(false);
       };
     };
     
     return (
       <button onClick={startListening} disabled={listening}>
         {listening ? '🎤 Listening...' : '🎤 Speak'}
       </button>
     );
   }
   ```

---

### EOD Checkpoint
- ✅ Interactive map shows PFZ zones + boundaries
- ✅ Layer toggles work
- ✅ Chat + map side-by-side layout
- ✅ Safety level highlighted with colors
- ✅ Voice input (if done)

**Demo:** Ask "Best zone near Mumbai?" → Shows 5 zones on map, safety assessment in chat

---

## DAY 5: INTEGRATION, TESTING & DEPLOYMENT

### Morning (4 hours) - INTEGRATION & TESTING

**MNV + ARP Together:**

1. **Full Agent Flow Testing** (2 hours)
   Test each query type:
   ```
   Query 1: "Best fishing zone near Kochi?"
   Expected: 3-5 zones, distances, productivity info
   
   Query 2: "Is it safe today near Kochi?"
   Expected: SAFE/CAUTION + score + wind/wave/cyclone reasons
   
   Query 3: "Show me zones near [lat/lon near Pakistan border]"
   Expected: Geofencing alert + zone data
   
   Query 4: "Weather at Mangalore?"
   Expected: Wind, waves, SST, chlorophyll
   ```

2. **Bug Fixes** (2 hours)
   - Handle API failures gracefully (Copernicus/Open-Meteo down?)
   - Handle missing data (return mock values)
   - Timeout protection (if Sarvam is slow)
   - Frontend loading states

3. **Mock Data Fallback** (if APIs are unavailable)
   ```python
   # src/data/mock.py
   MOCK_OCEAN_DATA = {
       'sst': 27.2,
       'chlorophyll': 0.65,
       'wind_knots': 12,
       'cyclone_alert': False
   }
   ```

---

### Afternoon (4 hours) - DEMO PREP & DEPLOYMENT

**MNV:**
1. **Production Build** (1 hour)
   ```bash
   # Dockerfile
   FROM python:3.10
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install -r requirements.txt
   COPY . .
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
   ```
   
   ```bash
   docker build -t marine-platform-backend .
   docker run -p 8000:8000 marine-platform-backend
   ```

2. **Database (SQLite for demo)** (30 min)
   - Skip PostgreSQL for hackathon, use SQLite
   - Pre-load static data into SQLite for faster queries

3. **Environment File** (30 min)
   - Document all required API keys
   - Provide mock fallbacks if any API fails

---

**ARP:**
1. **Frontend Production Build** (1 hour)
   ```bash
   npm run build
   npm run preview  # Test production build locally
   ```

2. **Deployment** (1.5 hours)
   - Option A: Deploy to Vercel (frontend) + Railway/Render (backend)
   - Option B: Single server with both (nginx reverse proxy)
   - Option C: Local demo machine (simplest for hackathon)

3. **Demo Script** (1.5 hours)
   ```
   [ 5-MINUTE DEMO SCRIPT ]
   
   0:00-0:30: "This is a marine intelligence platform for Indian fishermen"
   
   0:30-2:00: Query 1: "Best fishing zones near Kochi?"
   - Show chat + agent processing
   - Show map with zones highlighted
   - Show zone distances + productivity
   
   2:00-3:30: Query 2: "Is it safe today?"
   - Show safety assessment
   - Show SAFE with score
   - Highlight wind/wave/chlorophyll factors
   
   3:30-4:30: Query 3: "Near boundary alert"
   - Show geofencing alert
   - Show boundary visualization
   
   4:30-5:00: "This will help fishermen make safer, better decisions"
   ```

---

### EOD Checkpoint - FINAL DELIVERABLES
- ✅ Full agentic system working end-to-end
- ✅ All 4 agent nodes (Planner, Data, Geo/Risk, Response) functioning
- ✅ Safety assessment with real rules
- ✅ Interactive map with layer toggles
- ✅ Deployed or locally runnable
- ✅ 5-minute demo ready

---

## DAILY STANDUPS (15 min each)

**End of each day:**
- What worked?
- What blocked you?
- What's the plan for tomorrow?
- Blockers MNV ↔ ARP (dependency check)

---

## COMMUNICATION CHECKLIST

- **Day 1 PM:** Both confirm "Hello world" API calls working
- **Day 2 PM:** Both confirm agent graph + chat working end-to-end (even with mock data)
- **Day 3 PM:** Both confirm safety rules + geofencing working
- **Day 4 PM:** Both confirm map + chat styled and functional
- **Day 5 PM:** Both confirm deployable + demo script ready

---

## QUICK REFERENCE: WHO DOES WHAT

| Component | Owner | Depends On | Status |
|-----------|-------|-----------|--------|
| FastAPI scaffold | MNV | Nothing | Day 1 |
| Sarvam integration | MNV | SARVAM_API_KEY | Day 1 |
| LangGraph setup | MNV | FastAPI | Day 2 |
| Data agent (PFZ fetch) | MNV | static GeoJSON | Day 2 |
| Risk agent (safety) | MNV | Data agent | Day 3 |
| Geo agent (geofence) | MNV | static boundaries | Day 3 |
| Backend endpoints | MNV | All agents | Day 4 |
| React scaffold | ARP | Nothing | Day 1 |
| Chat component | ARP | Backend API | Day 2 |
| Map component | ARP | Backend geojson endpoints | Day 4 |
| Frontend styling | ARP | Chat + Map | Day 4 |
| Voice input | ARP | Chat component | Day 4 (optional) |
| Frontend deployment | ARP | npm build | Day 5 |
| Backend deployment | MNV | Docker | Day 5 |

---

## SUCCESS METRICS

By EOD Day 5:
- User query → Agent processing → Response displayed
- Safety assessment working
- Map shows zones + boundaries
- Voice input (optional but nice)
- Deployed or locally executable
- 5-min demo video/script ready

**Stretch Goals:**
- Multilingual response (Sarvam translate)
- Route visualization (A* if time)
- Historical chlorophyll comparison

---

**Document Version:** 2.0
**Last Updated:** Planning Phase (Roles Swapped)
**Execution Start:** Day 1, Morning

