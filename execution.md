# 5-Day Execution Plan - Marine Intelligence Platform (React Native)

**Team:** MNV (Backend/Agents) + ARP (Mobile/Frontend)
**Platform:** React Native (Expo) + FastAPI Backend
**Duration:** 5 Days (40 hours per person)

---

## DAY 1: FOUNDATION & SETUP

### Morning (4 hours) - TEAM SYNC

**MNV + ARP Together:**

1. **Repository Setup** (30 min)
   - Create GitHub repo
   - Folder: `/backend`, `/mobile`, `/data`
   - README with setup & deployment instructions

2. **Environment Setup** (1 hour)
   ```env
   # Backend .env
   SARVAM_API_KEY=your_key
   COPERNICUS_KEY=optional
   IMD_API_KEY=check
   
   # Mobile .env
   REACT_APP_API_URL=http://localhost:8000
   ```

3. **Data Files Setup** (1.5 hours)
   - Download 52 PFZ zones → `/data/static/pfz_zones.geojson`
   - Download 1-year chlorophyll + SST historical data
   - Precompile into JSON grids for fast mobile loading

4. **Quick Test** (1 hour)
   - MNV: Test Sarvam SDK (`python -c "import sarvam"`)
   - ARP: Test React Native (`npx react-native --version`)
   - Both: Verify data files present

---

### Afternoon (4 hours)

**MNV (Backend Scaffold):**

1. **FastAPI Server Scaffold** (2 hours)
   ```bash
   python -m venv venv
   pip install fastapi uvicorn httpx pydantic python-dotenv
   # Create src/main.py with /health, /chat (stub), CORS enabled
   ```
   - Test: `curl http://localhost:8000/health` → OK

2. **Sarvam + LangGraph Setup** (1.5 hours)
   ```bash
   pip install langgraph langchain sarvam-sdk
   # Create src/agents/planner.py (stub - just echo input)
   # Create src/agents/response.py (stub - format JSON)
   ```

3. **Test Sarvam API** (30 min)
   - Initialize client, test simple prompt
   - Document any auth issues

---

**ARP (Mobile Scaffold):**

1. **React Native + Expo Setup** (1.5 hours)
   ```bash
   npx create-expo-app marine-app
   npm install
   npm install @react-navigation/native @react-navigation/bottom-tabs
   npm install axios zustand
   ```

2. **Basic Navigation** (1.5 hours)
   - Create 4 screen stubs: ChatScreen, MapScreen, PFZScreen, AlertsScreen
   - Bottom tab navigation (Chat, Map, PFZ, Alerts)
   - Test: `npm start` → Expo QR code works

3. **API Client Setup** (1 hour)
   ```typescript
   // src/services/api.ts
   import axios from 'axios';
   
   const api = axios.create({
     baseURL: 'http://localhost:8000'
   });
   
   export const chatAPI = {
     sendMessage: (query: string, lat: number, lon: number) =>
       api.post('/chat', { query, latitude: lat, longitude: lon })
   };
   ```

---

### EOD Checkpoint
- ✅ Backend FastAPI running :8000
- ✅ Mobile app (Expo) launching with 4 tabs
- ✅ Both can communicate via HTTP
- ✅ Data files staged locally

---

## DAY 2: CORE AGENTS & CHAT SCREEN

### Morning (4 hours)

**MNV (Agents):**

1. **Agent State Definition** (30 min)
   ```python
   from typing import TypedDict
   class AgentState(TypedDict):
       query: str
       latitude: float
       longitude: float
       risk_level: str  # "LOW", "MODERATE", "HIGH"
       wind_kmh: float
       wave_m: float
       rainfall_mm: float
       lightning: bool
       cyclone: bool
       recommendation: str
       confidence: int  # 0-100
       sources: list
   ```

2. **Planner Agent** (1 hour)
   ```python
   def planner_node(state: AgentState):
       prompt = f"""User: {state['query']}
       Return JSON: {{"intent": "SAFETY|PFZ|ALERT", "latitude": X, "longitude": Y}}"""
       response = sarvam_generate(prompt)
       return {...state, "intent": parsed_json["intent"]}
   ```

3. **Data Agent** (1 hour)
   ```python
   async def data_agent(state: AgentState):
       # Load static data: 1-year chlorophyll/SST baseline
       # Fetch dynamic: Today's weather from Open-Meteo, IMD
       # Mock if APIs down
       return {...state, "wind_kmh": 18, "wave_m": 1.8, "rainfall_mm": 0}
   ```

4. **Risk Agent** (1 hour 30 min)
   ```python
   def risk_agent(state: AgentState):
       score = 100
       if state['cyclone']: return {...state, "risk_level": "HIGH", "score": 0}
       if state['wind_kmh'] > 25: score -= 30
       if state['wave_m'] > 3: score -= 20
       risk_level = "LOW" if score >= 70 else "MODERATE" if score >= 40 else "HIGH"
       return {...state, "risk_level": risk_level, "score": score}
   ```

---

### Afternoon (4 hours)

**MNV (Response Agent + API Endpoint):**

1. **Response Agent** (1.5 hours)
   ```python
   def response_node(state: AgentState):
       prompt = f"""Risk: {state['risk_level']}, Wind: {state['wind_kmh']} km/h
       Generate natural language recommendation for fisherman."""
       recommendation = sarvam_generate(prompt)
       return {...state, "recommendation": recommendation}
   ```

2. **LangGraph Workflow** (1 hour)
   ```python
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
   ```

3. **POST /chat Endpoint** (1.5 hours)
   ```python
   @app.post("/chat")
   async def chat(query: str, latitude: float, longitude: float):
       state = AgentState(query=query, latitude=latitude, longitude=longitude, ...)
       result = agent.invoke(state)
       return {
           "risk_level": result["risk_level"],
           "wind_kmh": result["wind_kmh"],
           "wave_m": result["wave_m"],
           "recommendation": result["recommendation"],
           "confidence": result["confidence"],
           "sources": result["sources"]
       }
   ```

---

**ARP (Chat Screen):**

1. **Chat UI Layout** (1.5 hours)
   - Text input + Send button
   - Message list (bubbles: user vs system)
   - Risk level badge (color-coded: 🟢🟡🔴)
   - Conditions display (Wind, Waves, Rain, etc.)
   - [View Risk Map] button

2. **Connect to Backend** (1.5 hours)
   ```typescript
   // src/screens/ChatScreen.tsx
   const handleSend = async (query: string) => {
     setLoading(true);
     try {
       const response = await chatAPI.sendMessage(query, 8.5, 77.5);
       setMessages([...messages, {
         type: 'response',
         risk_level: response.risk_level,
         wind: response.wind_kmh,
         recommendation: response.recommendation
       }]);
     } catch (err) { ... }
     setLoading(false);
   };
   ```

3. **Test E2E** (1 hour)
   - Type query in app
   - See response from backend
   - Debug latency/CORS issues

---

### EOD Checkpoint
- ✅ Chat screen displays user input + system response
- ✅ Backend /chat endpoint returns risk level + conditions
- ✅ Response < 3 seconds (use mock data if APIs slow)
- ✅ Risk badge colors working (RED/YELLOW/GREEN)

**Test Query:** "Can I fish near Kochi tomorrow?"
**Expected Response:** MODERATE RISK, Wind 18 km/h, Waves 1.8m, etc.

---

## DAY 3: MAP SCREEN & PFZ SCREEN

### Morning (4 hours)

**ARP (Map Screen):**

1. **Map Integration** (2 hours)
   ```bash
   npm install react-native-maps
   ```
   ```typescript
   // src/screens/MapScreen.tsx
   import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
   
   export function MapScreen() {
     return (
       <MapView
         provider={PROVIDER_GOOGLE}
         style={{ flex: 1 }}
         initialRegion={{ latitude: 20, longitude: 80, latitudeDelta: 8, longitudeDelta: 8 }}
       >
         {/* Render PFZ zones as Polygon */}
         {pfzZones.map(zone => (
           <Polygon key={zone.id} coordinates={zone.coordinates} fillColor="rgba(0,200,0,0.3)" />
         ))}
       </MapView>
     );
   }
   ```

2. **Layer Toggles** (1 hour)
   ```typescript
   const [layers, setLayers] = useState({
     pfz: true,
     risk: false,
     sst: false,
     wind: false
   });
   
   // Render checkboxes to toggle each layer
   ```

3. **Load Static GeoJSON** (1 hour)
   - Load PFZ zones from AsyncStorage on app start
   - Display as map overlays

---

### Afternoon (4 hours)

**MNV (PFZ API Endpoint):**

1. **GET /pfz/nearest Endpoint** (1.5 hours)
   ```python
   @app.get("/pfz/nearest")
   async def get_nearest_pfz(latitude: float, longitude: float, limit: int = 5):
       # Load 52 PFZ zones from static data
       # Calculate Haversine distance
       nearest = sorted(zones, key=lambda z: haversine(latitude, longitude, z['lat'], z['lon']))[:limit]
       # Add SST, Chlorophyll, confidence score
       return [{"name": z['name'], "distance": d, "sst": 27.2, "chl": 0.85, "confidence": 87} ...]
   ```

2. **GET /geojson/pfz Endpoint** (1 hour)
   ```python
   @app.get("/geojson/pfz")
   async def get_pfz_geojson():
       with open('data/static/pfz_zones.geojson') as f:
           return json.load(f)
   ```

3. **Geofence Check** (1 hour)
   ```python
   def check_geofence(lat, lon):
       # Load boundaries from static data
       # Check if user point is inside restricted zones
       return alerts if inside else []
   ```

---

**ARP (PFZ Screen):**

1. **Nearest Zones Display** (2 hours)
   ```typescript
   // src/screens/PFZScreen.tsx
   useEffect(() => {
     fetchNearestPFZ(8.5, 77.5).then(zones => {
       setZones(zones);
     });
   }, []);
   
   return (
     <ScrollView>
       {zones.map(zone => (
         <Card key={zone.id}>
           <Text>{zone.name}</Text>
           <Text>Distance: {zone.distance} km</Text>
           <Text>SST: {zone.sst}°C</Text>
           <Text>Chlorophyll: {zone.chl} mg/m³</Text>
           <Text>Confidence: {zone.confidence}%</Text>
           <Button title="View on Map" onPress={() => centerMapOnZone(zone)} />
         </Card>
       ))}
     </ScrollView>
   );
   ```

2. **Evidence Bullets** (1.5 hours)
   - Display why each zone is recommended
   - Show historical productivity (from CMFRI data cached locally)

3. **Test** (30 min)
   - Fetch nearest zones via API
   - Render on screen with proper formatting

---

### EOD Checkpoint
- ✅ Map displays 52 PFZ zones (as polygons)
- ✅ Layer toggles work (performance issue? use lazy-loading)
- ✅ PFZ screen shows top 5 nearest zones with confidence
- ✅ Both screens load data from backend APIs

---

## DAY 4: ALERTS SCREEN & MAP HEATMAP

### Morning (4 hours)

**MNV (Alerts API + Risk Heatmap):**

1. **GET /alerts Endpoint** (2 hours)
   ```python
   @app.get("/alerts")
   async def get_alerts(latitude: float, longitude: float):
       alerts = []
       
       # Check geofencing
       if near_boundary(lat, lon):
           alerts.append({"type": "GEOFENCE", "message": "Near Pakistan border", "distance": 2.1})
       
       # Check weather
       weather = fetch_weather()
       if weather['wind'] > 25:
           alerts.append({"type": "WIND", "message": "High wind", "speed": weather['wind']})
       
       # Check cyclone
       if weather['cyclone']:
           alerts.append({"type": "CYCLONE", "message": "DO NOT VENTURE", "level": 3})
       
       return {"alerts": sorted(alerts, key=lambda a: URGENCY[a['type']], reverse=True)}
   ```

2. **Risk Heatmap Generation** (2 hours)
   ```python
   @app.get("/geojson/risk")
   async def get_risk_heatmap():
       # For each point in Indian waters grid:
       # Calculate risk score (0-100)
       # Return as GeoJSON with features colored by score
       # Tile-based for performance
       return geojson_heatmap
   ```

---

**ARP (Alerts Screen):**

1. **Alert Cards** (2 hours)
   ```typescript
   // src/screens/AlertsScreen.tsx
   useEffect(() => {
     fetchAlerts(lat, lon).then(data => setAlerts(data.alerts));
   }, []);
   
   return (
     <FlatList
       data={alerts}
       renderItem={({ item }) => (
         <AlertCard
           type={item.type}
           message={item.message}
           color={COLORS[item.type]}
           onDismiss={() => dismissAlert(item.id)}
         />
       )}
     />
   );
   ```

2. **Alert Styling** (1.5 hours)
   - RED cards for cyclone/geofence
   - YELLOW for high wind/waves
   - BLUE for info alerts

3. **Test** (30 min)

---

### Afternoon (4 hours)

**ARP (Map Heatmap):**

1. **Render Risk Heatmap** (1.5 hours)
   ```typescript
   // Add heatmap layer to map
   useEffect(() => {
     if (layers.risk) {
       fetchRiskHeatmap().then(geojson => {
         // Render GeoJSON with fillColor based on risk score
         geojson.features.forEach(feature => {
           const color = feature.properties.risk_score > 70 ? '#00AA00' : '#FFAA00' : '#DD0000';
           // Add to map
         });
       });
     }
   }, [layers.risk]);
   ```

2. **Performance Optimization** (1.5 hours)
   - Cluster zones for faster rendering
   - Lazy-load heatmap tiles
   - Cache locally

3. **Integration Test** (1 hour)
   - Toggle risk layer on/off
   - Verify colors match risk levels
   - Check for lag

---

### EOD Checkpoint
- ✅ Alerts screen displays weather + geofencing alerts
- ✅ Red/yellow/blue color coding working
- ✅ Map heatmap shows risk distribution
- ✅ All 4 screens functional

---

## DAY 5: INTEGRATION, POLISH & DEPLOYMENT

### Morning (4 hours)

**MNV + ARP (Integration Testing):**

1. **End-to-End Tests** (2 hours)
   - Chat query → Map shows relevant data
   - Click zone on PFZ screen → Centers map
   - Geofencing alert triggers correctly
   - All data displays match backend response

2. **Bug Fixes** (2 hours)
   - Fix CORS/timeout issues
   - Handle API failures gracefully (use mocks)
   - Optimize rendering (profile with React Native profiler)
   - Test on actual device (iPhone/Android)

---

### Afternoon (4 hours)

**MNV (Backend Deployment):**

1. **Production Build** (1 hour)
   ```bash
   # Dockerfile
   FROM python:3.10
   WORKDIR /app
   COPY requirements.txt .
   RUN pip install -r requirements.txt
   COPY . .
   CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]
   ```

2. **Database/Cache Setup** (1.5 hours)
   - Use SQLite for local dev (no PostgreSQL needed)
   - Pre-load static data
   - Test with mock data if APIs down

3. **API Testing** (30 min)
   - Verify all endpoints respond correctly
   - Test error handling

---

**ARP (Mobile Deployment):**

1. **Build APK/IPA** (1.5 hours)
   ```bash
   npm run build:ios
   npm run build:android
   # Or use Expo:
   eas build --platform ios
   eas build --platform android
   ```

2. **Polish UI** (1 hour)
   - Colors, spacing, fonts
   - Loading indicators
   - Error messages clear

3. **Demo Preparation** (1.5 hours)
   - Create demo script:
     ```
     0:00 - Open app, show 4 tabs
     0:30 - Ask "Can I fish tomorrow?" → Show chat response
     1:30 - Tap Map → Show zones + risk heatmap
     2:30 - Tap PFZ → Show nearest zones
     3:30 - Tap Alerts → Show weather + geofence warnings
     4:30 - Swipe through screens, show data sources
     5:00 - "This will help fishermen fish safer"
     ```

---

### EOD Checkpoint - FINAL DELIVERABLES
- ✅ Mobile app (APK/IPA) deployed or locally runnable
- ✅ All 4 screens working end-to-end
- ✅ Backend API responsive
- ✅ Chat, Map, PFZ, Alerts all integrated
- ✅ 5-minute demo script ready
- ✅ Data displays real/mock ocean conditions

---

## WHO DOES WHAT (Quick Reference)

| Component | Owner | Days | Dependencies |
|-----------|-------|------|--------------|
| FastAPI scaffold | MNV | 1-2 | None |
| Sarvam integration | MNV | 1-2 | SARVAM_API_KEY |
| LangGraph agents | MNV | 2-3 | FastAPI |
| /chat endpoint | MNV | 2-3 | Agents |
| /pfz/nearest endpoint | MNV | 3 | Static PFZ data |
| /geojson/* endpoints | MNV | 3-4 | Static GeoJSON |
| /alerts endpoint | MNV | 4 | Weather APIs |
| Backend deployment | MNV | 5 | Docker |
| React Native setup | ARP | 1 | None |
| Chat screen | ARP | 2-3 | /chat endpoint |
| Map screen | ARP | 3-4 | /geojson/* endpoints |
| PFZ screen | ARP | 3 | /pfz/nearest endpoint |
| Alerts screen | ARP | 4 | /alerts endpoint |
| Mobile deployment | ARP | 5 | npm build |

---

## SUCCESS METRICS (EOD Day 5)

- ✅ User asks "Can I fish?" → Gets risk level + conditions in < 3sec
- ✅ Map renders 52 zones with layer toggles
- ✅ PFZ screen shows 5 nearest zones with confidence
- ✅ Alerts display for geofencing + weather
- ✅ App works offline (uses cached data)
- ✅ Deployable APK/IPA or locally runnable
- ✅ 5-min demo video ready

**Stretch Goals:**
- Cyclone path visualization
- Historical chlorophyll comparison
- Route optimization to nearest zone

---

**Document Version:** 1.0
**Platform:** React Native (Expo)
**Backend:** FastAPI (Python)
**Status:** Ready for Execution

