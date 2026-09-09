# SEASARATHI UPGRADE: 5-Day Sprint Enhancement Plan

**Objective:** Transform SeaSarathi from rule-based MVP to intelligent, personalized marine advisory system.

**Timeline:** 5 days (40 hours total)  
**Team:** MNV (Backend/AI) + ARP (Mobile/Frontend)  
**Last Updated:** September 2026

---

## 📊 Priority Matrix

| Priority | Component | Impact | Effort | Days | Owner | Blocker? |
|----------|-----------|--------|--------|------|-------|----------|
| **P0** | Profile Building (Zustand + Form) | 🔥🔥 | ⚡ | 1.5 | ARP + MNV | YES |
| **P0** | Language Pref + Prompt Injection | 🔥🔥 | ⚡ | 1 | MNV | YES |
| **P1** | Local Decision Tree (Boat Size) | 🔥🔥 | ⚡ | 2 | MNV | NO |
| **P1** | TTS-STT Integration (Sarvam) | 🔥🔥 | 🔥 | 2 | MNV + ARP | NO |
| **P1** | Chat UI + Profile Badge | 🔥 | 🔥 | 2 | ARP | NO |
| **P2** | Anomaly Detection (z-scores) | 🟡 | ⚡ | 1.5 | MNV | NO |
| **P2** | ML Models (Synthetic Data) | 🟡 | 🔥🔥 | 4–6 | MNV | NO (if time) |
| **P3** | Fallback Logic + Caching | 🟡 | ⚡ | 1 | MNV | NO |
| **P3** | Map/PFZ/Alerts UI Polish | 🟡 | 🔥 | 3 | ARP | NO |

---

## 🎯 PHASE 1: FOUNDATION (DAY 1 — 8 HOURS)

### Task 1.1: Profile Building — Zustand Store Setup
**Owner:** MNV  
**Duration:** 1 hour  
**Blocker Status:** YES (everything depends on this)  
**Deliverable:** `mobile/src/stores/profileStore.ts`

**Requirements:**
```typescript
Profile type with fields:
- vesselType: "small_boat" | "medium_boat" | "large_boat" | "union_fleet"
- operatingPort: "Kochi" | "Mumbai" | "Chennai" | "Visakhapatnam" | "Thiruvananthapuram" | "Mangalore"
- riskTolerance: "conservative" | "moderate" | "aggressive"
- language: "en" | "ml" | "ta" | "te"
- role: "individual" | "union_leader"
```

**Store Actions Needed:**
- `loadProfile()` — async load from AsyncStorage on app startup
- `updateProfile(updates)` — merge updates + persist to AsyncStorage
- `resetProfile()` — reset to defaults
- `getMaxRange()` — return km range based on vesselType (small: 15, medium: 35, large: 75, union: 100)
- `getProfileSummary()` — return human-readable string like "🚤 Small Boat | Kochi | Individual | Moderate"

**Error Handling:** Graceful fallback to defaults if AsyncStorage fails

**No Screen Changes Required Yet** (backend-only at this stage)

---

### Task 1.2: Onboarding Form Screen
**Owner:** ARP  
**Duration:** 1.5 hours  
**Screen:** NEW — `mobile/src/screens/OnboardingScreen.tsx`  
**Blocker Status:** YES (user needs to set profile first)

**Screen Structure:**
1. **Header** — "Welcome to SeaSarathi 🌊" + subtitle
2. **Vessel Type Section** — Radio/card buttons:
   - 🚤 Small Boat (15km max)
   - ⛵ Medium Boat (35km max)
   - 🛳️ Large Boat (75km max)
   - ⚓ Union Fleet (100km max)
3. **Operating Port Section** — Dropdown with 6 major ports (Kochi, Mumbai, Chennai, Visakhapatnam, Thiruvananthapuram, Mangalore)
4. **Role Section** — Toggle: Individual Fisherman | Union Leader
5. **Risk Tolerance Section** — Slider or 3-button toggle (Conservative / Moderate / Aggressive)
6. **Language Section** — Radio buttons (English, Malayalam, Tamil, Telugu) + auto-detect from device
7. **Action Buttons** — [Cancel] [Complete Setup]

**Validation:**
- All fields required before [Complete Setup] enabled
- Show inline error messages if validation fails

**Integration:**
- On form completion: save to `useProfileStore()` (triggers automatic AsyncStorage persist)
- Navigate to HomeStack (chat/map/pfz/alerts/profile tabs)
- If profile exists in AsyncStorage, skip OnboardingScreen entirely

**Styling:**
- Use react-native-paper for consistency
- Colors: Primary #0066CC, Success #10B981, Warning #F59E0B, Error #EF4444
- Consistent spacing (16px between sections)

---

### Task 1.3: Navigation Integration (Conditional Routing)
**Owner:** ARP  
**Duration:** 30 minutes  
**File:** `mobile/src/navigation/RootNavigator.tsx`  
**Blocker Status:** YES

**Logic:**
```typescript
On app launch:
IF profile exists in AsyncStorage → Show HomeStack (5 tabs: Chat, Map, PFZ, Alerts, Profile)
ELSE → Show OnboardingStack (non-dismissible, full-screen OnboardingScreen)
```

**Additional:**
- Add SplashScreen component while checking AsyncStorage (loading state)
- Make OnboardingStack non-dismissible (`gestureEnabled: false`)

---

### Task 1.4: Language Preference + Prompt Injection
**Owner:** MNV  
**Duration:** 1 hour  
**Blocker Status:** YES (TTS, Claude responses all depend on this)  
**Files Modified:** `backend/src/agents/chat_agent.py`

**What to Add:**

**Function:** `async def build_profile_context(profile: dict) -> str`
- Converts profile dict into Claude system prompt context
- Example output:
  ```
  USER PROFILE:
  - Vessel Type: small_boat (Maximum safe range: 15km from shore)
  - Operating Port: Kochi
  - Risk Tolerance: moderate
  - Role: individual
  - Preferred Language: ml (Malayalam)
  ```

**Modify:** `async def chat_with_profile(query: str, gps: tuple, profile: dict)`
- Accept profile dict in request
- Build profile context string (call `build_profile_context()`)
- Inject into Claude's system prompt BEFORE the query
- Ensure Claude generates response in requested language

**Example Prompt Injection:**
```python
system_prompt = f"""
You are SeaSarathi, a fishing advisory AI for Indian coastal fishermen.

{profile_context}  # ← Injected here

LANGUAGE INSTRUCTION:
Respond ONLY in {profile.get('language', 'en')}. 
Use simple, jargon-free language appropriate for fishermen.

DISTANCE FILTERING:
If recommended zone > {max_range}km from user's location, suggest nearby alternatives instead.

RISK FILTERING:
{risk_filtering_rules}  # Conservative/Moderate/Aggressive gates

VESSEL-AWARE ADVICE:
{vessel_advice}  # Small boat: fuel cost matters. Large boat: catch volume ROI.

...rest of system prompt...
"""
```

**API Endpoint Changes:**
- `/chat` request now includes:
  ```json
  {
    "query": str,
    "gps": [lat, lon],
    "profile": {
      "vesselType": str,
      "operatingPort": str,
      "riskTolerance": str,
      "language": str,
      "role": str
    }
  }
  ```
- Validate profile completeness; return 400 if missing fields

**No Database Changes Required** (profile is passed per-request, not stored in backend)

---

## 🎯 PHASE 2: CORE LOGIC (DAYS 2-3 — 16 HOURS)

### Task 2.1: Local Decision Tree (Boat Size Filtering)
**Owner:** MNV  
**Duration:** 2 hours  
**File:** `backend/src/agents/chat_agent.py` (new function)  
**Blocker Status:** NO (but adds major value)

**Function:** `async def filter_zones_by_vessel(pfz_list: list, profile: dict, gps: tuple) -> dict`

**Logic:**
```python
VESSEL_RANGES = {
    "small_boat": 15,
    "medium_boat": 35,
    "large_boat": 75,
    "union_fleet": 100
}
max_range = VESSEL_RANGES[profile["vesselType"]]

# Separate feasible vs. not feasible
feasible_zones = [z for z in pfz_list if z["distance"] <= max_range]
too_far_zones = [z for z in pfz_list if z["distance"] > max_range]

# If small boat and distant zone: suggest high-chlorophyll nearshore patch
if profile["vesselType"] == "small_boat" and too_far_zones:
    suggest_nearshore_patches(gps)

# If union leader: recommend split-team strategy
if profile["role"] == "union_leader" and len(feasible_zones) >= 2:
    suggest_crew_split(feasible_zones)

return {
    "feasible": feasible_zones,
    "too_far": too_far_zones,
    "recommendation": str
}
```

**Integration into `/chat`:**
- After fetching live data (SST, chlorophyll, wind)
- Filter zones by max_range BEFORE passing to Claude
- Pass filtered zones + too_far info to Claude for synthesis
- Claude response includes: "Zone X is 18km—within your range ✅" or "Zone X is 50km—too far ⚠️. Consider Zone Y at 12km instead."

**No Screen Changes Required** (logic only)

---

### Task 2.2: Fallback Logic + Caching
**Owner:** MNV  
**Duration:** 1 hour  
**File:** `backend/src/utils/cache_manager.py` (new file)  
**Blocker Status:** NO (but prevents API failures)

**What to Implement:**

**Function:** `async def fetch_with_fallback(api_call, cache_key, ttl=86400)`
- Try: Call Live API (Open-Meteo, Copernicus, NASA)
- Except (timeout, ConnectionError): Serve cached response from last 24h
- Return: `{data: dict, source: "live" | "cached", timestamp: str, confidence: float}`
- If cached: reduce confidence score by 20% (e.g., 85% → 65%)

**Cache Storage:**
- Use in-memory TTL cache (dict with expiry timestamps) OR Redis if available
- Cache keys: `sst_{lat}_{lon}`, `chlorophyll_{lat}_{lon}`, `wind_{lat}_{lon}`, etc.
- TTL: 86400 seconds (24 hours) for ocean data; 3600 (1 hour) for forecasts

**Error Handling:**
```python
# If all APIs fail and no cache:
return {
    "error": "Live data unavailable. Please check connectivity.",
    "fallback_advice": "Use last known good zones or contact local port authority."
}
```

**No Database Changes Required** (in-memory or Redis)

---

### Task 2.3: Chat Screen Integration + Profile Badge
**Owner:** ARP  
**Duration:** 2 hours  
**Screen:** Modified — `mobile/src/screens/ChatScreen.tsx`  
**Blocker Status:** NO (but critical for demo)

**Changes Required:**

1. **Import Profile Store:**
   ```typescript
   const { profile } = useProfileStore();
   const { gps } = useLocationContext();
   ```

2. **Add Profile Badge to Header:**
   - Display: "🚤 Small Boat | Kochi | 15km Range"
   - Make it tappable → navigate to ProfileScreen for quick edit
   - Color-code by vessel type (small=blue, medium=green, large=orange, union=purple)

3. **Modify sendMessage() to Pass Profile:**
   ```typescript
   const response = await api.post("/chat", {
     query: userMessage,
     gps: [gps.latitude, gps.longitude],
     profile: profile  // ← NEW
   });
   ```

4. **Enhanced Message Rendering (Assistant Messages):**
   - Show **Text Response** in bubble
   - Show **Confidence Badge:** "{confidence}%" with color:
     - ≥80%: Green (#10B981)
     - 50–79%: Amber (#F59E0B)
     - <50%: Red (#EF4444)
   - Show **Data Source Footer:** "Source: Copernicus, NASA | 2 hours ago" (small gray text)
   - Show **Primary Recommendation Card** (if available):
     - Zone Name | Distance (red if >maxRange, green if ≤maxRange) | SST | Chlorophyll
   - Show **Alerts Section** (if any): Color-coded by alert type
   - Show **Audio Play Button** (if audioUrl exists)

5. **Loading & Error States:**
   - Loading: Spinner in message bubble
   - Error: Show error message + retry button
   - GPS Unavailable: Banner "Enable location for personalized advice"

6. **Optional Quick-Action Prompts:**
   - Below input field: "Can I fish near {operatingPort} today?" | "Where are the zones?" | "What's the wind condition?"

**Database Changes:**
- **NONE** (profile stored locally in Zustand + AsyncStorage)

---

### Task 2.4: TTS-STT Integration (Sarvam)
**Owner:** MNV (backend) + ARP (mobile UI)  
**Duration:** 2 hours total  
**Blocker Status:** NO (but wow factor)

#### 2.4A: Backend (MNV) — 1 hour
**File:** `backend/src/agents/chat_agent.py` (modify `chat_with_profile()`)

**After Claude generates response:**
```python
# Call Sarvam TTS if language != "en"
if profile.get("language") != "en":
    audio_url = await sarvam.tts(
        text=response_text,
        language=profile["language"],  # ml, ta, te
        speaker="default"
    )
    return {
        "response": response_text,
        "audioUrl": audio_url,
        ...other_fields...
    }
```

**Sarvam API Integration:**
- Endpoint: `https://api.sarvam.ai/text-to-speech`
- Required: API key in `.env` → `SARVAM_API_KEY`
- Supported languages: `hi`, `ta`, `te`, `ml`, `kn`, `bn`, `gu`, `en`
- Fallback: If TTS fails, return response text only (no audio)

**No Database Changes Required**

#### 2.4B: Mobile (ARP) — 1 hour
**File:** Modified — `mobile/src/screens/ChatScreen.tsx`

**Add Audio Playback:**
```typescript
import * as Audio from 'expo-av';

// In assistant message bubble:
{response.audioUrl && (
  <TouchableOpacity onPress={() => playAudio(response.audioUrl)}>
    <Icon name="play-circle" size={32} color="#0066CC" />
    <Text>Play in {profile.language}</Text>
  </TouchableOpacity>
)}

async function playAudio(url: string) {
  const { sound } = await Audio.Sound.createAsync({ uri: url });
  await sound.playAsync();
}
```

**Screen Changes Needed:**
- Add play button in assistant message bubble
- Show "Playing..." state while audio plays
- Optional: Add stop button, playback speed control

---

### Task 2.5: Anomaly Detection (Z-Score Flagging)
**Owner:** MNV  
**Duration:** 1.5 hours  
**File:** `backend/src/utils/anomaly_detection.py` (new file)

**Function:** `def flag_anomalies(current_sst: float, current_chlorophyll: float, historical_data: list) -> str`

**Logic:**
```python
# Compute 30-day rolling mean + std
mean_sst = np.mean([d["sst"] for d in historical_data[-30:]])
std_sst = np.std([d["sst"] for d in historical_data[-30:]])

mean_chlorophyll = np.mean([d["chlorophyll"] for d in historical_data[-30:]])
std_chlorophyll = np.std([d["chlorophyll"] for d in historical_data[-30:]])

# Calculate z-scores
z_sst = (current_sst - mean_sst) / (std_sst + 1e-6)
z_chlorophyll = (current_chlorophyll - mean_chlorophyll) / (std_chlorophyll + 1e-6)

# Flag anomalies
anomalies = []
if abs(z_sst) > 1.5:
    anomalies.append(f"🔴 SST ANOMALY: {current_sst}°C is {abs(z_sst):.1f}σ from mean → {'warmer' if z_sst > 0 else 'cooler'} than seasonal average")
if abs(z_chlorophyll) > 1.5:
    anomalies.append(f"🔴 CHLOROPHYLL ANOMALY: {current_chlorophyll}mg/m³ is {abs(z_chlorophyll):.1f}σ from mean → {'higher' if z_chlorophyll > 0 else 'lower'} productivity signal")

return "\n".join(anomalies)  # Empty string if no anomalies
```

**Integration into `/chat`:**
- Fetch last 30 days of historical SST/chlorophyll from local cache
- Call `flag_anomalies()` before passing to Claude
- Inject anomaly string into Claude prompt:
  ```
  ANOMALY CONTEXT:
  {anomalies}
  ```
- Claude incorporates into response: "Chlorophyll 40% above normal → unusual productivity, recommend Zone X"

**No Screen Changes Required** (logic only)

**Database Changes:**
- **NONE** (uses existing cached ocean data)

---

## 🎯 PHASE 3: ENRICHMENT (DAY 4 — 8 HOURS)

### Task 3.1: ML Models (Synthetic Data + Training)
**Owner:** MNV  
**Duration:** 4–6 hours (stretch goal; do if time allows)  
**Files:** `backend/src/ml/data_generator.py`, `backend/src/ml/confidence_model.py`  
**Blocker Status:** NO (nice-to-have, not critical for demo)

**Phase 3.1A: Synthetic Data Generation — 2 hours**

**Function:** `def generate_synthetic_training_data(n_samples=1000) -> pd.DataFrame`

**Schema:**
```python
{
  "sst": float (20–32°C),
  "chlorophyll": float (0.1–2.0 mg/m³),
  "wind_speed": float (0–25 knots),
  "month": int (1–12),
  "distance_from_shore": float (0–100 km),
  "catch_outcome": int (0=low, 1=medium, 2=high)  # ← target
}
```

**Generation Strategy:**
- Use domain knowledge (seasonal patterns, SST-productivity correlation)
- Correlate: high chlorophyll + warm SST + low wind = high catch (label 2)
- Add noise to avoid overfitting
- Generate 1000 samples

**Output:** CSV file in `backend/data/synthetic_training_data.csv`

**Phase 3.1B: Model Training — 2 hours**

**Function:** `def train_confidence_model(df: pd.DataFrame) -> sklearn.model`

**Model Type:** Logistic Regression (lightweight, fast inference)
```python
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

X = df[["sst", "chlorophyll", "wind_speed", "month", "distance_from_shore"]]
y = df["catch_outcome"]

# Train
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
model = LogisticRegression(max_iter=1000)
model.fit(X_scaled, y)

# Save
joblib.dump(model, "backend/models/confidence_model.pkl")
joblib.dump(scaler, "backend/models/scaler.pkl")
```

**Phase 3.1C: Integration into `/chat` — 1.5 hours**

**Function:** `async def get_ml_confidence(current_data: dict, model) -> float`

**At End of `/chat` Logic:**
```python
# Extract features from current ocean data
features = np.array([[
    current_sst,
    current_chlorophyll,
    current_wind,
    current_month,
    distance_to_zone
]])

# Predict
confidence_score = model.predict_proba(features)[0][2]  # P(high catch)
return confidence_score  # 0.0–1.0
```

**Replace Rule-Based Score:**
- Old: `confidence = 50%` (hardcoded)
- New: `confidence = ml_model.predict(features)` (dynamic)

**Response Impact:**
```
OLD: "Confidence: 50%"
NEW: "Confidence: 87%" (from ML model based on current conditions)
```

**Database Changes:**
- **NEW:** `backend/data/synthetic_training_data.csv` (1000 samples)
- **NEW:** `backend/models/confidence_model.pkl` (trained model)
- **NEW:** `backend/models/scaler.pkl` (feature scaler)
- Store in git; no live DB needed

**⚠️ OPTIONAL:** Skip if running short on time. Decision tree + anomaly detection cover 80% of the "smart" feeling.

---

### Task 3.2: Map / PFZ / Alerts Screens UI Polish
**Owner:** ARP  
**Duration:** 3 hours  
**Screens:** Modified — `MapScreen.tsx`, `PFZScreen.tsx`, `AlertsScreen.tsx`

**3.2A: MapScreen Enhancements — 1 hour**
- Layer toggles working correctly:
  - ✅ PFZ zones (green polygons)
  - ✅ Landing centers (blue pins)
  - ✅ International boundaries (red lines)
  - ✅ SST heatmap (gradient overlay)
  - ✅ Chlorophyll heatmap (green-to-yellow gradient)
- User location (GPS) pinned with blue dot
- Recommended zones highlighted with special marker
- Geofence warnings: Highlight if approaching boundary (yellow border animation)
- **Database:** Uses `/geojson/risk` endpoint + static GeoJSON files (no new DB)

**3.2B: PFZScreen Enhancements — 1 hour**
- Ranked zone list (distance, SST, chlorophyll, confidence)
- Color-code zones:
  - 🟢 Green: Within vessel range + good conditions
  - 🟡 Yellow: Within range + moderate conditions
  - 🔴 Red: Beyond vessel range OR poor conditions
- Expandable card details: Historical productivity, seasonal patterns
- **Database:** Uses `/pfz/nearest` endpoint (no new DB)

**3.2C: AlertsScreen Enhancements — 1 hour**
- Stacked alert cards, color-coded:
  - 🔴 RED: Cyclone alerts, international boundary breaches
  - 🟡 YELLOW: High waves (>3.5m), strong wind (>15 knots)
  - 🔵 BLUE: Informational (seasonal trends, port status)
- Each alert card shows: Icon | Title | Description | Timestamp
- Sort by severity (RED → YELLOW → BLUE)
- **Database:** Uses `/alerts` endpoint (no new DB)

---

## 🎯 PHASE 4: INTEGRATION & DEMO (DAY 5 — 8 HOURS)

### Task 4.1: End-to-End Testing
**Owner:** Both  
**Duration:** 2 hours

**Checklist:**
- [ ] Mobile connects to backend (local IP or ngrok tunnel)
- [ ] GPS works on test device
- [ ] User can complete onboarding
- [ ] Profile persists across app restart
- [ ] `/chat` with profile returns personalized response
- [ ] Response includes data block + confidence + source
- [ ] Audio playback works in selected language
- [ ] Map renders with layers
- [ ] PFZ zones load and rank correctly
- [ ] Alerts display color-coded by severity
- [ ] Geofence check triggers when GPS near boundary
- [ ] Fallback logic activates if API fails
- [ ] Risk badges display correctly (LOW/MODERATE/HIGH)
- [ ] No crashes on any screen

**Test Scenarios:**
1. Small boat user queries zone 20km away → response says "within range ✅"
2. Small boat user queries zone 50km away → response says "too far, try Zone Y at 12km instead"
3. Union leader queries → response suggests crew split strategy
4. Conservative risk tolerance + cyclone alert → "DO NOT FISH" override
5. Language set to Malayalam → audio response in Malayalam
6. API timeout → fallback cached data with reduced confidence

---

### Task 4.2: Demo Rehearsal (60–90 seconds per screen)
**Owner:** Both  
**Duration:** 1 hour

**Demo Flow (5–6 minutes total):**

**1. ONBOARDING (30 sec)**
- Show profile setup: Vessel (Medium Boat), Port (Kochi), Risk (Moderate)
- Save profile
- Navigate to Home

**2. CHAT QUERY (60 sec)**
- User question: "Can I fish near Kochi tomorrow morning?"
- Show response: Data block (SST, chlorophyll, wind) + synthesis + audio playback in Malayalam
- Highlight: Confidence badge, data source footer

**3. MAP (60 sec)**
- Toggle layers: PFZ zones (green), SST heatmap, landing centers (blue pins)
- Show geofence warning near international boundary
- Zoom to user location

**4. PFZ ZONES (60 sec)**
- Show ranked zones: Zone A (18km, 28.5°C, 0.48 mg/m³, 92%) ✅ feasible
- Zone B (52km) ⚠️ too far for 35km medium boat range
- Tap Zone A to expand details

**5. ALERTS (60 sec)**
- Display stacked alerts:
  - 🔵 "Monsoon transition detected—mackerel migration expected"
  - 🟡 "Waves 2.8m—moderate conditions, OK for medium boats"
- Show all-clear status ✅

**6. SAFETY DEMO (60 sec)**
- Simulate GPS near international boundary → 🔴 Alert appears
- Message: "ALERT: Approaching international maritime boundary. Recommended to alter course."
- Show immediate geofence override (user cannot operate there)

**Talking Points:**
- "Profile → boat size → max range filtering" (personalization)
- "Data citations in every response" (non-chatbot, evidence-based)
- "Multilingual voice guidance" (accessibility for fishermen)
- "Deterministic safety layer" (cyclone/boundary alerts override all advice)

---

### Task 4.3: Docker Build + Deployment (Bonus)
**Owner:** MNV  
**Duration:** 1 hour (if time allows; not critical)

**What to Create:**

**File:** `backend/Dockerfile`
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**File:** `backend/docker-compose.yml`
```yaml
version: '3.8'
services:
  seasarathi:
    build: .
    ports:
      - "8000:8000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - SARVAM_API_KEY=${SARVAM_API_KEY}
    volumes:
      - ./backend/data:/app/data
      - ./backend/models:/app/models
```

**Testing:**
```bash
docker-compose up --build
curl http://localhost:8000/health
```

**Judges can then:**
```bash
docker-compose up
# Backend runs at http://localhost:8000
```

**No Database Changes Required** (self-contained)

---

## 🚀 CRITICAL PATH & DEPENDENCIES

```
DAY 1:
  ├─ Profile Building (Zustand) [1h] ──┬─→ REQUIRED FOR ALL
  ├─ Onboarding Screen (ARP) [1.5h] ────┤
  └─ Prompt Injection [1h] ─────────────┘

DAY 2:
  ├─ Decision Tree Logic [2h]
  ├─ Fallback + Caching [1h]
  ├─ Chat UI + Badge (ARP) [2h]
  └─ Navigation Integration [0.5h]

DAY 3:
  ├─ TTS Integration [2h]
  ├─ ML Training [4h] (if time)
  └─ Anomaly Detection [1.5h]

DAY 4:
  ├─ Map/PFZ/Alerts Polish (ARP) [3h]
  └─ ML Integration (if trained) [1h]

DAY 5:
  ├─ E2E Testing [2h]
  ├─ Demo Rehearsal [1h]
  └─ Docker (bonus) [1h]
```

---

## 📋 SKIP IF TIME IS SHORT

Priority for cuts (in order of least impact):

1. **❌ ML Model Training** (4–6h) → Keep decision tree + anomaly detection instead
   - Impact lost: Dynamic confidence scoring (use hardcoded 75% instead)
   - Time saved: 5 hours

2. **❌ Anomaly Detection** (1.5h) → Keep decision tree + TTS instead
   - Impact lost: "Chlorophyll 40% above average" context
   - Time saved: 1.5 hours

3. **❌ Docker Build** (1h) → Let judges run locally instead
   - Impact lost: Easy deployment for judging environment
   - Time saved: 1 hour

4. **❌ Map/PFZ/Alerts Polish** (3h) → Keep basic rendering, skip animations
   - Impact lost: Polished UI (still functional)
   - Time saved: 3 hours

**DO NOT SKIP:**
- Profile Building (everything depends on it)
- Prompt Injection (enables personalization + TTS)
- Decision Tree (most important differentiator)
- Chat UI + Badge (judges need to see profile integration)
- TTS (wow factor, accessibility)

---

## 📊 EFFORT SUMMARY

| Phase | Task | Owner | Hours | Status |
|-------|------|-------|-------|--------|
| 1 | Profile Store | MNV | 1 | 🟢 Ready |
| 1 | Onboarding Screen | ARP | 1.5 | 🟢 Ready |
| 1 | Navigation | ARP | 0.5 | 🟢 Ready |
| 1 | Prompt Injection | MNV | 1 | 🟢 Ready |
| **PHASE 1 TOTAL** | | | **4** | |
| 2 | Decision Tree | MNV | 2 | 🟢 Ready |
| 2 | Fallback Logic | MNV | 1 | 🟢 Ready |
| 2 | Chat UI + Badge | ARP | 2 | 🟢 Ready |
| 2 | TTS Integration | MNV + ARP | 2 | 🟢 Ready |
| **PHASE 2 TOTAL** | | | **7** | |
| 3 | Anomaly Detection | MNV | 1.5 | 🟡 If Time |
| 3 | ML Training | MNV | 4–6 | 🟡 If Time |
| 3 | UI Polish | ARP | 3 | 🟢 Ready |
| **PHASE 3 TOTAL** | | | **8–10** | |
| 4 | E2E Testing | Both | 2 | 🟢 Ready |
| 4 | Demo Rehearsal | Both | 1 | 🟢 Ready |
| 4 | Docker | MNV | 1 | 🟡 Bonus |
| **PHASE 4 TOTAL** | | | **4** | |
| | **GRAND TOTAL** | | **23–26 hours** | |

**Distribution:**
- MNV (Backend/AI): ~15–18 hours
- ARP (Mobile/Frontend): ~10–12 hours

---

## 🔑 SUCCESS CRITERIA

**By End of Day 5, Must Have:**

- ✅ All 5 screens (Chat, Map, PFZ, Alerts, Profile) functional
- ✅ Profile building complete + persists across restarts
- ✅ `/chat` responds with profile-aware, evidence-based advice
- ✅ Decision tree filtering working (boat size → max range)
- ✅ Risk badges displaying correctly (LOW/MODERATE/HIGH)
- ✅ TTS audio playback in user's language
- ✅ Geofence alerts when approaching boundaries
- ✅ Every response cites data source + timestamp + confidence
- ✅ Live demo on Expo/Android without crashes
- ✅ 5–6 minute demo walkthrough rehearsed

---

## 📞 QUICK REFERENCE: WHO BUILDS WHAT

| Component | Owner | Duration | Start |
|-----------|-------|----------|-------|
| Zustand Profile Store | MNV | 1h | Day 1 |
| Onboarding Screen UI | ARP | 1.5h | Day 1 |
| Navigation Integration | ARP | 0.5h | Day 1 |
| Prompt Injection | MNV | 1h | Day 1 |
| Decision Tree Logic | MNV | 2h | Day 2 |
| Fallback + Caching | MNV | 1h | Day 2 |
| Chat UI + Badge | ARP | 2h | Day 2 |
| TTS Backend | MNV | 1h | Day 3 |
| TTS Mobile UI | ARP | 1h | Day 3 |
| Anomaly Detection | MNV | 1.5h | Day 3 |
| ML Training | MNV | 4–6h | Day 3 |
| Map/PFZ/Alerts Polish | ARP | 3h | Day 4 |
| E2E Testing | Both | 2h | Day 5 |
| Demo Rehearsal | Both | 1h | Day 5 |
| Docker Setup | MNV | 1h | Day 5 |

---

## 🎯 NEXT STEPS

1. **MNV:** Start with Task 1.1 (Zustand store) + Task 1.4 (prompt injection)
2. **ARP:** Start with Task 1.2 (Onboarding screen) + Task 1.3 (navigation)
3. **Both:** Coordinate integration on Task 2.3 (Chat UI wiring)
4. **Standup:** Daily 9 AM (15 min) to sync blockers

---

**Document Last Updated:** September 2026  
**Prepared For:** Marine Intelligence Hackathon  
**Team:** MNV + ARP