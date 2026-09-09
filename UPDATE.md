# SeaSarathi: Complete 5-Day Upgrade Plan
## All Enhancements + New Features Consolidated

**Objective:** Transform SeaSarathi from rule-based MVP to intelligent, personalized marine advisory system with live tracking and home screen widget.

**Timeline:** 5 days (40 hours total)  
**Team:** MNV (Backend/AI) + ARP (Mobile/Frontend)  
**Last Updated:** September 2026

---

## 📊 EXECUTIVE SUMMARY

This document consolidates ALL upgrade tasks including:
- ✅ Core MVP enhancements (personalization, voice, anomaly detection)
- ✅ **NEW Feature 1:** Live Location Tracking (GPS + geofencing)
- ✅ **NEW Feature 2:** Android Home Screen Widget
- ✅ ML models, fallback logic, Docker deployment

**Total Scope:** 40 hours across 5 phases  
**Critical Path:** Profile → Prompt Injection → Decision Tree → Location → Voice  
**Can ship in 32 hours** (without widget) or 40 hours (with widget)

---

## 🎯 PRIORITY MATRIX

| Priority | Component | Impact | Effort | Days | Owner | Skip If |
|----------|-----------|--------|--------|------|-------|---------|
| **P0** | Profile Building | 🔥🔥 | ⚡ | 1.5 | ARP+MNV | NO |
| **P0** | Prompt Injection | 🔥🔥 | ⚡ | 1 | MNV | NO |
| **P1** | Decision Tree | 🔥🔥 | ⚡ | 2 | MNV | NO |
| **P1** | TTS-STT | 🔥🔥 | 🔥 | 2 | MNV+ARP | NO |
| **P1** | Chat UI + Badge | 🔥 | 🔥 | 2 | ARP | NO |
| **P1** | Live Location Tracking | 🔥 | 🔥 | 3 | ARP+MNV | NO (Safety) |
| **P2** | Android Widget | 🔥 | 🔥🔥 | 4 | ARP | YES (First cut) |
| **P2** | Anomaly Detection | 🟡 | ⚡ | 1.5 | MNV | Maybe |
| **P2** | ML Models | 🟡 | 🔥🔥 | 4–6 | MNV | Maybe |
| **P3** | Fallback Logic | 🟡 | ⚡ | 1 | MNV | Maybe |
| **P3** | Map/PFZ/Alerts | 🟡 | 🔥 | 3 | ARP | Maybe |

---

# PHASE 1: FOUNDATION (DAY 1 — 8 HOURS)

## Task 1.1: Profile Building — Zustand Store
**Owner:** MNV  
**Duration:** 1 hour  
**Blocker Status:** YES (everything depends on this)

**File:** `mobile/src/stores/profileStore.ts`

**Requirements:**
```typescript
export interface Profile {
  vesselType: "small_boat" | "medium_boat" | "large_boat" | "union_fleet"
  operatingPort: "Kochi" | "Mumbai" | "Chennai" | "Visakhapatnam" | "Thiruvananthapuram" | "Mangalore"
  riskTolerance: "conservative" | "moderate" | "aggressive"
  language: "en" | "ml" | "ta" | "te"
  role: "individual" | "union_leader"
}

export const useProfileStore = create((set) => ({
  profile: {
    vesselType: "small_boat",
    operatingPort: "Kochi",
    riskTolerance: "moderate",
    language: "en",
    role: "individual"
  },
  
  updateProfile: (updates: Partial<Profile>) => 
    set((state) => ({ profile: { ...state.profile, ...updates } })),
  
  loadProfile: async () => {
    const saved = await AsyncStorage.getItem("seasarathi_profile")
    if (saved) set({ profile: JSON.parse(saved) })
  },
  
  resetProfile: () => {
    AsyncStorage.removeItem("seasarathi_profile")
    set({ profile: defaultProfile })
  },
  
  getMaxRange: () => {
    const ranges = { small_boat: 15, medium_boat: 35, large_boat: 75, union_fleet: 100 }
    return ranges[state.profile.vesselType]
  },
  
  getProfileSummary: () => 
    `🚤 ${state.profile.vesselType} | ${state.profile.operatingPort} | ${state.profile.riskTolerance}`
}))

// Auto-persist on every update
useProfileStore.subscribe(
  (state) => {
    AsyncStorage.setItem("seasarathi_profile", JSON.stringify(state.profile))
  },
  (state) => state.profile
)
```

**Screen Changes:** None (backend only at this stage)

---

## Task 1.2: Onboarding Form Screen
**Owner:** ARP  
**Duration:** 1.5 hours  
**Screen:** NEW — `mobile/src/screens/OnboardingScreen.tsx`

**Screen Structure:**
1. **Header** — "Welcome to SeaSarathi 🌊"
2. **Vessel Type** — Radio/card buttons (🚤 Small: 15km, ⛵ Medium: 35km, 🛳️ Large: 75km, ⚓ Union: 100km)
3. **Operating Port** — Dropdown (Kochi, Mumbai, Chennai, Visakhapatnam, Thiruvananthapuram, Mangalore)
4. **Role** — Toggle (Individual / Union Leader)
5. **Risk Tolerance** — Slider (Conservative / Moderate / Aggressive)
6. **Language** — Radio buttons (English, Malayalam, Tamil, Telugu)
7. **Actions** — [Cancel] [Complete Setup]

**Key Features:**
- Validation: All fields required before setup enabled
- Save: Triggers `useProfileStore.updateProfile()` + AsyncStorage persist
- Navigation: Completes → HomeStack (5 tabs)
- Styling: react-native-paper, colors (#0066CC primary, #10B981 success)

---

## Task 1.3: Navigation Integration
**Owner:** ARP  
**Duration:** 30 minutes  
**File:** `mobile/src/navigation/RootNavigator.tsx`

**Logic:**
```typescript
export const RootNavigator = () => {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null)

  useEffect(() => {
    const checkProfile = async () => {
      const profile = await AsyncStorage.getItem("seasarathi_profile")
      setHasProfile(!!profile)
    }
    checkProfile()
  }, [])

  return (
    <NavigationContainer>
      {hasProfile === null ? (
        <SplashScreen />
      ) : hasProfile ? (
        <HomeStack />  // ChatScreen, MapScreen, PFZScreen, AlertsScreen, ProfileScreen
      ) : (
        <OnboardingStack />  // OnboardingScreen (non-dismissible)
      )}
    </NavigationContainer>
  )
}
```

---

## Task 1.4: Language Preference + Prompt Injection
**Owner:** MNV  
**Duration:** 1 hour  
**File:** Modified — `backend/src/agents/chat_agent.py`

**Function:** `async def chat_with_profile(query: str, gps: tuple, profile: dict) → dict`

**System Prompt Template:**
```python
system_prompt = f"""
You are SeaSarathi, a fishing advisory AI for Indian coastal fishermen.

USER PROFILE:
- Vessel Type: {profile['vesselType']} (Maximum range: {VESSEL_RANGES[profile['vesselType']]}km)
- Operating Port: {profile['operatingPort']}
- Risk Tolerance: {profile['riskTolerance']}
- Role: {profile['role']}
- Language: {profile['language']}

RESPONSE RULES:

1. DISTANCE FILTERING:
   If zone > {max_range}km:
   - For small_boat: Suggest nearby high-chlorophyll patches within {max_range}km
   - For union_fleet + aggressive: Acknowledge primary zone as secondary option
   
2. RISK FILTERING:
   - conservative: Only recommend zones with wind < 12 knots, avoid cyclone alerts entirely
   - moderate: Standard filtering (IMD warnings override)
   - aggressive: Flag risks but still recommend if navigable

3. UNION LEADER BRANCHING:
   If role == "union_leader": Suggest crew coordination strategies

4. DATA CITATION (MANDATORY):
   ALWAYS include: SST (°C), Chlorophyll (mg/m³), Wind (knots), Source, Timestamp, Confidence (%)

5. LANGUAGE:
   Respond ONLY in {profile['language']}. Use simple language for fishermen.

6. EXPLANATION:
   Explain WHY each recommendation (seasonal patterns, current conditions, anomalies)

Current conditions:
{live_data_summary}

Nearby zones:
{pfz_ranked_list}

User query: "{query}"
"""

response = await claude.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    system=system_prompt,
    messages=[{"role": "user", "content": query}]
)
```

**API Endpoint Update:**
```python
@app.post("/chat")
async def chat(
    query: str,
    gps: list[float],  # [lat, lon]
    profile: dict  # NEW parameter
):
    """
    Args:
        profile: {
          "vesselType": str,
          "operatingPort": str,
          "riskTolerance": str,
          "language": str,
          "role": str
        }
    """
    # Validate profile
    if not all(k in profile for k in ["vesselType", "operatingPort", "riskTolerance", "language", "role"]):
        return {"error": "Incomplete profile", "status": 400}
    
    response = await chat_with_profile(query, tuple(gps), profile)
    return response
```

**Check:** User can complete onboarding → Profile persists → Claude responds in user's language ✅

---

# PHASE 2: CORE LOGIC (DAYS 2-3 — 16 HOURS)

## Task 2.1: Local Decision Tree (Boat Size Filtering)
**Owner:** MNV  
**Duration:** 2 hours  
**File:** `backend/src/agents/chat_agent.py` (new function)

**Function:** `async def filter_zones_by_vessel(pfz_list: list, profile: dict, gps: tuple) → dict`

```python
VESSEL_RANGES = {
    "small_boat": 15,
    "medium_boat": 35,
    "large_boat": 75,
    "union_fleet": 100
}

async def filter_zones_by_vessel(pfz_list: list, profile: dict, gps: tuple) -> dict:
    max_range = VESSEL_RANGES[profile["vesselType"]]
    
    feasible_zones = [z for z in pfz_list if z["distance"] <= max_range]
    too_far_zones = [z for z in pfz_list if z["distance"] > max_range]
    
    # For small boats: suggest nearshore high-chlorophyll patches
    nearshore_suggestions = []
    if profile["vesselType"] == "small_boat" and too_far_zones:
        nearshore_suggestions = await suggest_nearshore_alternatives(gps)
    
    # For union leaders: split-team strategy
    crew_strategy = ""
    if profile["role"] == "union_leader" and len(feasible_zones) >= 2:
        crew_strategy = suggest_crew_split(feasible_zones)
    
    return {
        "feasible_zones": feasible_zones,
        "too_far_zones": too_far_zones,
        "nearshore_suggestions": nearshore_suggestions,
        "crew_strategy": crew_strategy,
        "recommendation_text": f"You can safely fish in {len(feasible_zones)} zones within your {max_range}km range..."
    }
```

**Integration:** Pass filtered zones + strategy to Claude for synthesis

**Check:** Small boat query → "Zone too far ⚠️", Large boat → "Zone reachable ✅" ✅

---

## Task 2.2: Fallback Logic + Caching
**Owner:** MNV  
**Duration:** 1 hour  
**File:** NEW — `backend/src/utils/cache_manager.py`

```python
import time
from typing import Optional, Dict, Any

class CacheManager:
    def __init__(self, ttl_seconds: int = 86400):  # 24 hours
        self.cache: Dict[str, tuple[Any, float]] = {}
        self.ttl = ttl_seconds
    
    async def get(self, key: str) -> Optional[Any]:
        if key in self.cache:
            value, timestamp = self.cache[key]
            if time.time() - timestamp < self.ttl:
                return value
            else:
                del self.cache[key]
        return None
    
    async def set(self, key: str, value: Any):
        self.cache[key] = (value, time.time())
    
    async def fetch_with_fallback(self, api_call, cache_key: str) -> dict:
        """Try live API, fallback to cache if fails"""
        try:
            result = await api_call()
            await self.set(cache_key, result)
            return {
                "data": result,
                "source": "live",
                "timestamp": datetime.now().isoformat(),
                "confidence": 100.0
            }
        except (TimeoutError, ConnectionError, Exception) as e:
            cached = await self.get(cache_key)
            if cached:
                return {
                    "data": cached,
                    "source": "cached",
                    "timestamp": datetime.now().isoformat(),
                    "confidence": 65.0,  # Reduced confidence for cached data
                    "warning": "Live data unavailable, showing cached response"
                }
            else:
                return {
                    "error": "Data unavailable. Please check connectivity.",
                    "source": "fallback"
                }

cache_manager = CacheManager(ttl_seconds=86400)  # 24h TTL
```

**Screen Changes:** None (backend logic)

---

## Task 2.3: Chat Screen Integration + Profile Badge
**Owner:** ARP  
**Duration:** 2 hours  
**Screen:** Modified — `mobile/src/screens/ChatScreen.tsx`

**Changes:**

1. **Import Profile:**
```typescript
const { profile } = useProfileStore()
const { gps } = useLocationContext()
```

2. **Add Profile Badge (Header):**
```typescript
<View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
  <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
    <Text style={{ fontSize: 12, color: '#666' }}>
      🚤 {profile.vesselType} | {profile.operatingPort} | {profile.getMaxRange()}km
    </Text>
  </TouchableOpacity>
</View>
```

3. **Modify sendMessage():**
```typescript
const sendMessage = async (text: string) => {
  addMessage({ text, role: 'user' })
  
  const response = await api.post("/chat", {
    query: text,
    gps: [gps.latitude, gps.longitude],
    profile: profile  // ← NEW
  })
  
  // Rich message rendering
  addMessage({
    text: response.response,
    role: 'assistant',
    confidence: response.confidence,
    dataSource: response.dataSource,
    timestamp: response.timestamp,
    audioUrl: response.audioUrl,
    recommendation: response.primaryRecommendation,
    alerts: response.alerts
  })
}
```

4. **Assistant Message Rendering:**
- Show text bubble + confidence badge (🟢 ≥80%, 🟡 50–79%, 🔴 <50%)
- Show data source footer (small gray text)
- Show primary recommendation card (distance color-coded)
- Show alerts stacked by severity
- Show audio play button if audioUrl exists

**Screen Changes:** ChatScreen.tsx (header badge + message rendering)

---

## Task 2.4: Live Location Tracking — NEW FEATURE
**Owner:** ARP (Mobile) + MNV (Backend)  
**Duration:** 3 hours total  
**Blocker Status:** NO (but enables critical geofencing)

### 2.4A: Continuous GPS Service (ARP) — 1.5 hours
**File:** NEW — `mobile/src/services/LocationService.ts`

```typescript
import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'

const LOCATION_TASK_NAME = 'background-location-task'

export async function startLocationTracking() {
  // Request permissions
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status !== 'granted') {
    console.log('Location permission denied')
    return
  }

  // Start background tracking
  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,  // 50m accuracy
    timeInterval: 30000,  // Every 30 seconds
    distanceInterval: 50,  // Or 50m movement
    foregroundService: {
      notificationTitle: "SeaSarathi",
      notificationBody: "Tracking your location for safety alerts"
    }
  })
}

// Background task handler
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error)
    return
  }
  
  const { locations } = data
  const currentLocation = locations[0]
  
  // Update Zustand store
  useLocationStore.setState({
    latitude: currentLocation.coords.latitude,
    longitude: currentLocation.coords.longitude,
    timestamp: currentLocation.timestamp,
    accuracy: currentLocation.coords.accuracy,
    status: "active"
  })

  // Log to backend
  logLocationToBackend(currentLocation)
})

export async function stopLocationTracking() {
  await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
}
```

**Screen Changes:**
- RootNavigator.tsx: Call `startLocationTracking()` on app launch
- ChatScreen.tsx: Add GPS status badge ("🟢 Live: 50m accuracy" / "🔴 Disabled")

### 2.4B: Real-Time Geofence Monitoring (MNV) — 1 hour
**File:** NEW — `backend/src/routes/location.py`

```python
@app.post("/location/log")
async def log_location(
    latitude: float,
    longitude: float,
    timestamp: str,
    accuracy: float
):
    """
    Mobile sends continuous GPS updates.
    Returns immediate geofence check.
    """
    geofence_status = await check_geofence(latitude, longitude)
    
    if geofence_status["status"] == "DANGER":  # Crossed boundary
        return {
            "alert": True,
            "severity": "red",
            "message": "CRITICAL: You have crossed an international maritime boundary. Alter course immediately.",
            "boundary": geofence_status["boundary_name"],
            "distance": 0,
            "timestamp": timestamp
        }
    
    if geofence_status["status"] == "WARNING":  # 5km away
        return {
            "alert": True,
            "severity": "yellow",
            "message": f"Warning: {geofence_status['distance_to_boundary']}km from {geofence_status['boundary_name']}",
            "distance": geofence_status['distance_to_boundary'],
            "timestamp": timestamp
        }
    
    return { "alert": False, "timestamp": timestamp }

async def check_geofence(lat: float, lon: float) -> dict:
    """Check if GPS in EEZ, international boundaries, or MPAs"""
    point = Point(lon, lat)
    
    # Check boundaries
    for boundary in boundaries_geojson['features']:
        if shape(boundary['geometry']).contains(point):
            return {
                "status": "DANGER",
                "boundary_name": boundary['properties']['name'],
                "type": boundary['properties']['type']
            }
    
    # Check approaching (5km buffer)
    for boundary in boundaries_geojson['features']:
        distance = point.distance(shape(boundary['geometry'])) * 111  # approx km
        if distance < 5:
            return {
                "status": "WARNING",
                "boundary_name": boundary['properties']['name'],
                "distance_to_boundary": round(distance, 1)
            }
    
    return { "status": "SAFE" }
```

### 2.4C: Location Store + Auto-Refresh (ARP) — 0.5 hours
**File:** NEW — `mobile/src/stores/locationStore.ts`

```typescript
export const useLocationStore = create((set) => ({
  latitude: null,
  longitude: null,
  timestamp: null,
  accuracy: null,
  status: "searching",  // searching | active | disabled
  
  setLocation: (lat, lon, ts, acc) => 
    set({ latitude: lat, longitude: lon, timestamp: ts, accuracy: acc, status: "active" }),
  
  setStatus: (status) => set({ status })
}))
```

**Integration:** ChatScreen + MapScreen + PFZScreen all subscribe to location updates

```typescript
useEffect(() => {
  const unsubscribe = useLocationStore.subscribe(
    (state) => [state.latitude, state.longitude],
    async ([lat, lon]) => {
      if (lat && lon) {
        // Refresh nearby zones
        await refreshNearbyZones(lat, lon)
        // Refresh alerts
        await refreshAlerts(lat, lon)
      }
    }
  )
  return unsubscribe
}, [])
```

**Check:** GPS updates every 30 sec, location badge shows "Live", geofence alert appears when approaching boundary ✅

---

## Task 2.5: TTS-STT Integration (Sarvam)
**Owner:** MNV (backend) + ARP (mobile UI)  
**Duration:** 2 hours total

### 2.5A: Backend TTS (MNV) — 1 hour
**File:** Modified — `backend/src/agents/chat_agent.py`

```python
import httpx
import os

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_ENDPOINT = "https://api.sarvam.ai/text-to-speech"

async def generate_tts(text: str, language: str) -> Optional[str]:
    """
    Generate TTS audio via Sarvam API
    Returns audio URL or None if fails
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                SARVAM_ENDPOINT,
                headers={"Authorization": f"Bearer {SARVAM_API_KEY}"},
                json={
                    "text": text,
                    "language": language,  # hi, ml, ta, te, kn, bn, gu, en
                    "speaker": "default",
                    "format": "mp3"
                }
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("audio_url")
    except Exception as e:
        print(f"TTS generation failed: {e}")
    
    return None

# In chat_with_profile(), after Claude response:
response_text = claude_response.content[0].text

# Generate TTS if non-English
audio_url = None
if profile.get("language") != "en":
    audio_url = await generate_tts(response_text, profile["language"])

return {
    "response": response_text,
    "audioUrl": audio_url,
    "confidence": confidence,
    "dataSource": "Copernicus, NASA MODIS, IMD",
    "timestamp": datetime.now().isoformat(),
    ...
}
```

### 2.5B: Mobile Audio Playback (ARP) — 1 hour
**File:** Modified — `mobile/src/screens/ChatScreen.tsx`

```typescript
import * as Audio from 'expo-av'

const playAudio = async (url: string) => {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: url })
    setPlayingAudioId(messageId)
    await sound.playAsync()
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) {
        setPlayingAudioId(null)
      }
    })
  } catch (error) {
    console.error("Audio playback failed:", error)
  }
}

// In message bubble:
{response.audioUrl && (
  <TouchableOpacity 
    onPress={() => playAudio(response.audioUrl)}
    style={{ marginTop: 8 }}
  >
    <Icon name={playingAudioId === messageId ? "pause-circle" : "play-circle"} 
          size={32} color="#0066CC" />
    <Text style={{ fontSize: 12, color: "#0066CC" }}>
      Play in {profile.language}
    </Text>
  </TouchableOpacity>
)}
```

**Screen Changes:** ChatScreen.tsx (add play button in message bubble)

**Check:** Response plays as audio in fisherman's language ✅

---

# PHASE 3: ENRICHMENT (DAY 4 — 8–10 HOURS)

## Task 3.1: Anomaly Detection (Z-Score Flagging)
**Owner:** MNV  
**Duration:** 1.5 hours  
**File:** NEW — `backend/src/utils/anomaly_detection.py`

```python
import numpy as np
from typing import List, Dict

def flag_anomalies(
    current_sst: float,
    current_chlorophyll: float,
    historical_data: List[Dict]  # Last 30 days
) -> str:
    """
    Flag when current readings are anomalous vs. historical mean
    Returns formatted string for Claude prompt injection
    """
    if not historical_data or len(historical_data) < 5:
        return ""
    
    # Compute 30-day rolling stats
    sst_values = [d["sst"] for d in historical_data[-30:]]
    chlorophyll_values = [d["chlorophyll"] for d in historical_data[-30:]]
    
    mean_sst = np.mean(sst_values)
    std_sst = np.std(sst_values) + 1e-6  # Avoid division by zero
    
    mean_chlo = np.mean(chlorophyll_values)
    std_chlo = np.std(chlorophyll_values) + 1e-6
    
    # Calculate z-scores
    z_sst = (current_sst - mean_sst) / std_sst
    z_chlo = (current_chlorophyll - mean_chlo) / std_chlo
    
    anomalies = []
    
    # Flag SST anomaly
    if abs(z_sst) > 1.5:
        direction = "warmer" if z_sst > 0 else "cooler"
        percent_diff = abs(z_sst) * 100 / 3  # Rough %
        anomalies.append(
            f"🔴 SST ANOMALY: {current_sst}°C is {abs(z_sst):.1f}σ from mean → {direction} than seasonal average"
        )
    
    # Flag chlorophyll anomaly
    if abs(z_chlo) > 1.5:
        direction = "higher" if z_chlo > 0 else "lower"
        anomalies.append(
            f"🔴 CHLOROPHYLL ANOMALY: {current_chlorophyll}mg/m³ is {abs(z_chlo):.1f}σ from mean → {direction} productivity signal"
        )
    
    return "\n".join(anomalies)

# In chat_with_profile():
anomaly_text = flag_anomalies(current_sst, current_chlorophyll, historical_data)

system_prompt = f"""
...existing prompt...

ANOMALY CONTEXT (if applicable):
{anomaly_text}

...rest of prompt...
"""
```

**Screen Changes:** None (logic only)

**Check:** Response includes "Chlorophyll 40% above average" context ✅

---

## Task 3.2: Android Home Screen Widget — NEW FEATURE
**Owner:** ARP  
**Duration:** 4 hours total

### 3.2A: Native Android Widget (Kotlin) — 3 hours
**File:** NEW — `android/app/src/main/java/com/seasarathi/SeaSarathiWidget.kt`

```kotlin
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class SeaSarathiWidget : AppWidgetProvider() {
    
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            // Fetch from SharedPreferences (synced from React Native)
            val prefs = context.getSharedPreferences("seasarathi_widget", Context.MODE_PRIVATE)
            val riskLevel = prefs.getString("risk_level", "MODERATE") ?: "MODERATE"
            val nearestZone = prefs.getString("nearest_zone", "Zone A") ?: "Zone A"
            val distance = prefs.getFloat("nearest_distance", 0f)
            val alertCount = prefs.getInt("alert_count", 0)
            val lastUpdate = prefs.getString("last_update", "N/A") ?: "N/A"

            // Build widget view
            val views = RemoteViews(context.packageName, R.layout.widget_layout)
            
            // Set colors by risk level
            val riskColor = when (riskLevel) {
                "HIGH" -> context.getColor(android.R.color.holo_red_light)
                "MODERATE" -> context.getColor(android.R.color.holo_orange_light)
                else -> context.getColor(android.R.color.holo_green_light)
            }
            
            views.setTextColor(R.id.risk_badge, riskColor)
            views.setTextViewText(R.id.risk_badge, riskLevel)
            views.setTextViewText(R.id.zone_name, nearestZone)
            views.setTextViewText(R.id.distance, "$distance km")
            views.setTextViewText(R.id.alert_count, 
                if (alertCount > 0) "🔔 $alertCount alerts" else "✅ No alerts")
            views.setTextViewText(R.id.last_update, "Updated: $lastUpdate")

            // Intent to open app
            val intent = Intent(context, MainActivity::class.java)
            intent.setAction("com.seasarathi.OPEN_CHAT")
            val pendingIntent = PendingIntent.getActivity(context, 0, intent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
```

**Files to Create:**
- `android/app/src/main/res/layout/widget_layout.xml` (XML layout)
- `android/app/src/main/res/xml/widget_info.xml` (metadata)
- `android/app/src/main/res/drawable/widget_background.xml` (shape)
- `android/app/src/main/res/drawable/widget_*.xml` (5 drawables for colors)

**Modify:**
- `android/app/src/main/AndroidManifest.xml` (add widget receiver + permissions)

### 3.2B: React Native ↔ Native Bridge (ARP) — 1 hour
**File:** NEW — `android/app/src/main/java/com/seasarathi/WidgetBridge.kt`

```kotlin
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class WidgetBridge(reactContext: ReactContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "WidgetBridge"

    @ReactMethod
    fun updateWidget(data: ReadableMap) {
        val prefs = reactApplicationContext.getSharedPreferences("seasarathi_widget", Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString("risk_level", data.getString("riskLevel"))
            putString("nearest_zone", data.getString("nearestZone"))
            putFloat("nearest_distance", data.getDouble("distance").toFloat())
            putInt("alert_count", data.getInt("alertCount"))
            putString("last_update", data.getString("lastUpdate"))
            apply()
        }

        // Trigger widget update
        val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        intent.setClass(reactApplicationContext, SeaSarathiWidget::class.java)
        reactApplicationContext.sendBroadcast(intent)
    }
}
```

**Register in MainApplication.kt:**
```kotlin
override fun getPackages(): List<ReactPackage> {
    return listOf(MainReactPackage(), WidgetBridge())
}
```

**Usage in ChatScreen.tsx:**
```typescript
import { NativeModules } from 'react-native'
const { WidgetBridge } = NativeModules

async function updateWidget(response: any) {
  await WidgetBridge.updateWidget({
    riskLevel: response.riskLevel,  // LOW | MODERATE | HIGH
    nearestZone: response.primaryRecommendation.zoneName,
    distance: response.primaryRecommendation.distance,
    alertCount: response.alerts.length,
    lastUpdate: new Date().toLocaleTimeString()
  })
}
```

**Screen Changes:** ChatScreen.tsx (call updateWidget() after `/chat` response)

**Check:** Widget appears on home screen, shows risk level + zone + distance ✅

---

## Task 3.3: ML Models (Synthetic Data + Training) — OPTIONAL
**Owner:** MNV  
**Duration:** 4–6 hours (if time allows)

### 3.3A: Synthetic Data Generation — 2 hours
**File:** NEW — `backend/scripts/generate_training_data.py`

```python
import pandas as pd
import numpy as np

def generate_synthetic_data(n_samples=1000):
    """
    Generate training data: (SST, Chlorophyll, Wind, Month, Distance) → Catch Outcome
    """
    np.random.seed(42)
    
    # Seasonal patterns
    months = np.random.randint(1, 13, n_samples)
    
    # Physical features (with realistic constraints)
    sst = np.random.normal(26, 3, n_samples)  # 20-32°C typical
    sst = np.clip(sst, 18, 35)
    
    chlorophyll = np.random.exponential(0.3, n_samples)  # Log-normal dist
    chlorophyll = np.clip(chlorophyll, 0.05, 2.0)
    
    wind_speed = np.random.gamma(2, 2, n_samples)  # 0-25 knots
    wind_speed = np.clip(wind_speed, 0, 25)
    
    distance_from_shore = np.random.uniform(0, 100, n_samples)
    
    # Target: High catch if (high chlorophyll + warm SST + low wind + nearshore)
    catch_score = (
        chlorophyll * 0.5 +  # High productivity matters most
        (sst - 20) * 0.1 +   # Warm water is good
        (15 - wind_speed) * 0.1 +  # Calm water is good
        (50 - distance_from_shore) * 0.001  # Nearshore better
    )
    
    # Add noise
    catch_score += np.random.normal(0, 0.5, n_samples)
    
    # Discretize to catch outcome (low, medium, high)
    catch_outcome = np.where(catch_score < -1, 0, 
                            np.where(catch_score < 1, 1, 2))
    
    # Create dataframe
    df = pd.DataFrame({
        "sst": sst,
        "chlorophyll": chlorophyll,
        "wind_speed": wind_speed,
        "month": months,
        "distance_from_shore": distance_from_shore,
        "catch_outcome": catch_outcome
    })
    
    df.to_csv("backend/data/synthetic_training_data.csv", index=False)
    print(f"Generated {n_samples} synthetic samples")
    return df
```

### 3.3B: Model Training — 2 hours
**File:** NEW — `backend/scripts/train_confidence_model.py`

```python
import pandas as pd
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

# Load data
df = pd.read_csv("backend/data/synthetic_training_data.csv")

X = df[["sst", "chlorophyll", "wind_speed", "month", "distance_from_shore"]]
y = df["catch_outcome"]

# Scale features
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Train logistic regression (lightweight, fast inference)
model = LogisticRegression(max_iter=1000, multi_class='multinomial')
model.fit(X_scaled, y)

# Save
joblib.dump(model, "backend/models/confidence_model.pkl")
joblib.dump(scaler, "backend/models/scaler.pkl")

print("Model trained and saved")
```

### 3.3C: Integration — 1.5 hours
**File:** Modified — `backend/src/agents/chat_agent.py`

```python
def get_ml_confidence(current_data: dict) -> float:
    """
    Use ML model to predict confidence (0-100%)
    """
    import joblib
    import numpy as np
    
    model = joblib.load("backend/models/confidence_model.pkl")
    scaler = joblib.load("backend/models/scaler.pkl")
    
    features = np.array([[
        current_data["sst"],
        current_data["chlorophyll"],
        current_data["wind_speed"],
        current_data["month"],
        current_data["distance"]
    ]])
    
    features_scaled = scaler.transform(features)
    proba = model.predict_proba(features_scaled)[0]
    
    # Return probability of high catch (class 2)
    return proba[2] * 100.0
```

**Result:** Responses now show dynamic confidence (e.g., "Confidence: 87%") instead of static 50%

**Check:** Confidence score varies based on conditions ✅

---

## Task 3.4: Map/PFZ/Alerts UI Polish
**Owner:** ARP  
**Duration:** 3 hours

**MapScreen:** Layer toggles (PFZ zones, SST heatmap, landing centers), geofence visualization  
**PFZScreen:** Color-coded zones (green=feasible, red=too far), expandable details  
**AlertsScreen:** Stacked cards sorted by severity (🔴→🟡→🔵)

**Check:** All screens polished and functional ✅

---

# PHASE 4: INTEGRATION & DEMO (DAY 5 — 8 HOURS)

## Task 4.1: End-to-End Testing
**Owner:** Both  
**Duration:** 2 hours

**Checklist:**
- [ ] Mobile connects to backend
- [ ] Profile persists across app restart
- [ ] `/chat` returns personalized response (boat size aware)
- [ ] Response includes data block + confidence + source
- [ ] Audio playback works in selected language
- [ ] GPS tracks in background
- [ ] Geofence alert triggers at boundary
- [ ] Widget updates every 5 minutes
- [ ] No crashes on any screen

---

## Task 4.2: Demo Rehearsal
**Owner:** Both  
**Duration:** 1.5 hours

**Demo Flow (6 minutes):**

1. **Onboarding (30 sec)** — Profile setup (boat size, port, language)
2. **Chat (60 sec)** — "Can I fish?" → Response + data + audio
3. **Map (60 sec)** — Toggle layers, show geofence
4. **PFZ (60 sec)** — Ranked zones (green=feasible, red=too far)
5. **Alerts (60 sec)** — Stacked color-coded alerts
6. **Safety (60 sec)** — GPS near boundary → Alert

---

## Task 4.3: Docker Setup (OPTIONAL)
**Owner:** MNV  
**Duration:** 1 hour

**Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0"]
```

---

# 🚀 CRITICAL PATH & DEPENDENCIES

```
DAY 1 (8h):
  ├─ Profile Store (Zustand) [1h] ──────┐
  ├─ Onboarding Screen [1.5h] ──────────┤
  ├─ Navigation [0.5h] ──────────────────┼→ REQUIRED FOR ALL
  └─ Prompt Injection [1h] ──────────────┘

DAY 2 (10h):
  ├─ Decision Tree [2h]
  ├─ Chat UI + Badge [2h]
  ├─ Fallback + Caching [1h]
  ├─ Location Service [1.5h]
  ├─ Geofence Monitoring [1h]
  └─ Location Store [0.5h]

DAY 3 (10h):
  ├─ TTS Integration [2h]
  ├─ Anomaly Detection [1.5h]
  ├─ Android Widget [3h]
  ├─ Widget Bridge [1h]
  └─ ML Training [4–6h] (if time)

DAY 4 (6h):
  ├─ Map/PFZ/Alerts Polish [3h]
  ├─ Widget Automation [0.5h]
  └─ ML Integration [1h]

DAY 5 (8h):
  ├─ E2E Testing [2h]
  ├─ Demo Rehearsal [1.5h]
  ├─ Bug fixes [2h]
  └─ Docker [1h]
```

---

# 📋 SKIP IF TIME IS SHORT

**Priority for cuts:**

1. **❌ Android Widget (4.5h)** — Bonus feature
2. **❌ ML Training (4–6h)** — Use hardcoded 75% confidence
3. **❌ Anomaly Detection (1.5h)** — Still have decision tree
4. **❌ Docker (1h)** — Run locally

**NEVER SKIP:**
- Profile Building
- Prompt Injection
- Decision Tree
- Live Location Tracking
- TTS
- Chat UI

---

# 📊 EFFORT SUMMARY

| Phase | Task | Owner | Hours | Status |
|-------|------|-------|-------|--------|
| 1 | Profile Store | MNV | 1 | 🟢 Ready |
| 1 | Onboarding Screen | ARP | 1.5 | 🟢 Ready |
| 1 | Navigation | ARP | 0.5 | 🟢 Ready |
| 1 | Prompt Injection | MNV | 1 | 🟢 Ready |
| 2 | Decision Tree | MNV | 2 | 🟢 Ready |
| 2 | Fallback Logic | MNV | 1 | 🟢 Ready |
| 2 | Chat UI + Badge | ARP | 2 | 🟢 Ready |
| 2 | Location Service | ARP | 1.5 | 🟢 Ready |
| 2 | Geofence Monitoring | MNV+ARP | 1 | 🟢 Ready |
| 2 | Location Store | ARP | 0.5 | 🟢 Ready |
| 3 | TTS Backend | MNV | 1 | 🟢 Ready |
| 3 | TTS Mobile | ARP | 1 | 🟢 Ready |
| 3 | Anomaly Detection | MNV | 1.5 | 🟡 If Time |
| 3 | ML Training | MNV | 4–6 | 🟡 If Time |
| 3 | Android Widget | ARP | 4 | 🟡 If Time |
| 3 | UI Polish | ARP | 3 | 🟢 Ready |
| 4 | E2E Testing | Both | 2 | 🟢 Ready |
| 4 | Demo Rehearsal | Both | 1.5 | 🟢 Ready |
| 4 | Docker | MNV | 1 | 🟡 Bonus |
| | **TOTAL (Core)** | | **~32h** | |
| | **TOTAL (With Widget)** | | **~40h** | |

**Distribution:**
- MNV: 16–18 hours
- ARP: 16–18 hours

---

# ✅ SUCCESS CHECKLIST (Day 5 EOD)

- [ ] Profile onboarding works (Zustand + AsyncStorage persist)
- [ ] Prompt injection active (Claude responds in user's language)
- [ ] Decision tree filtering (boat size → max range)
- [ ] Real-time GPS tracking (background, updates every 30s)
- [ ] Geofence alerts (yellow at 5km, red on cross)
- [ ] TTS audio playback (responses in local language)
- [ ] Android widget (if implemented)
- [ ] All 5 screens functional (Chat, Map, PFZ, Alerts, Profile)
- [ ] Live demo with zero crashes
- [ ] Judges presentation ready

---

# 🎯 NEXT STEPS

1. **MNV:** Start Task 1.1 (Zustand store) + Task 1.4 (prompt injection)
2. **ARP:** Start Task 1.2 (Onboarding) + Task 1.3 (navigation)
3. **Both:** Daily 9 AM standup (15 min)

---

**Document Last Updated:** September 2026  
**Prepared For:** Marine Intelligence Hackathon  
**Team:** MNV + ARP  
**Mission:** Empower Indian coastal fishermen with AI-powered marine intelligence