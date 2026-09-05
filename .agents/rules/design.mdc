# Design & Screens - Marine Intelligence Platform

## Color Palette

### Primary Safety Colors
- **🟢 GREEN (#00AA44)** - Low Risk / Safe (Score >= 70)
- **🟡 YELLOW (#FFAA00)** - Moderate Risk / Caution (Score 40-69)
- **🔴 RED (#DD0000)** - High Risk / Avoid (Score < 40)
- **⚫ BLACK (#1A1A1A)** - Text, backgrounds
- **⚪ WHITE (#FFFFFF)** - Cards, containers

### Secondary Colors
- **🔵 BLUE (#0066CC)** - Info/Informational alerts
- **OCEAN BLUE (#004D99)** - Map water
- **LIGHT GRAY (#F5F5F5)** - Backgrounds, dividers
- **DARK GRAY (#333333)** - Secondary text

### Data Visualization Colors
- **SST Gradient:** Blue (cold 20°C) → Red (hot 32°C)
- **Chlorophyll Gradient:** White (low 0) → Green (high 2 mg/m³)
- **Wind Arrows:** Light gray (#999999)

---

## Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Screen Title | System/Roboto | 24px | Bold (700) | Black |
| Card Title | System/Roboto | 18px | Bold (700) | Black |
| Body Text | System/Roboto | 14px | Regular (400) | Dark Gray |
| Small/Helper | System/Roboto | 12px | Regular (400) | Gray |
| Risk Badge | System/Roboto | 20px | Bold (700) | Color-coded |
| Metric Value | System/Roboto | 16px | Bold (700) | Black |

---

## Screen 1: HOME / AI CHAT

### Layout Structure
```
┌────────────────────────────────────────┐
│ [App Header: MARINE INTELLIGENCE]      │ (Height: 56px)
├────────────────────────────────────────┤
│                                        │
│  [Message List - Scrollable]           │ (Flex)
│  ┌──────────────────────────────────┐  │
│  │ User: "Can I fish tomorrow?"     │  │
│  │ [User bubble - light gray bg]    │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ System Response:                 │  │
│  │ ┌────────────────────────────────┤  │
│  │ │ RISK LEVEL: MODERATE 🟡       │  │
│  │ │ Score: 65/100                  │  │
│  │ ├────────────────────────────────┤  │
│  │ │ CONDITIONS:                    │  │
│  │ │ 💨 Wind: 18 km/h (Safe)       │  │
│  │ │ 🌊 Waves: 1.8 m (OK)         │  │
│  │ │ 🌧 Rainfall: 0 mm (Low)       │  │
│  │ │ ⚡ Lightning: No alert        │  │
│  │ │ 🌪 Cyclone: None              │  │
│  │ ├────────────────────────────────┤  │
│  │ │ RECOMMENDATION:                │  │
│  │ │ "Fishing is possible. Avoid    │  │
│  │ │  zones beyond 15 km offshore." │  │
│  │ │ Confidence: 87%                │  │
│  │ ├────────────────────────────────┤  │
│  │ │ SOURCE: Copernicus (6h ago)    │  │
│  │ │         Open-Meteo (live)      │  │
│  │ │         IMD (6h ago)           │  │
│  │ ├────────────────────────────────┤  │
│  │ │ [View Risk Map] [Dismiss]      │  │
│  │ └────────────────────────────────┘  │
│  │ [System bubble - color-coded bg]    │
│  └──────────────────────────────────────┘  │
│                                        │
├────────────────────────────────────────┤
│ [Text Input + Send Button]             │ (Height: 60px)
│ ┌──────────────────────────────┐ ┌────┐│
│ │ "Ask about fishing today..." │ │📤 ││
│ └──────────────────────────────┘ └────┘│
└────────────────────────────────────────┘
```

### Risk Badge Component (Standalone)
```
┌─────────────────────────┐
│  RISK LEVEL BADGE       │
├─────────────────────────┤
│   🟢 LOW        (80/100)│  ← Green background
│  or                     │
│   🟡 MODERATE   (65/100)│  ← Yellow background
│  or                     │
│   🔴 HIGH       (25/100)│  ← Red background
└─────────────────────────┘
```

### Styling Details
- **Message bubbles:** 12px border radius, 8px padding
- **System response card:** 16px border radius, 12px padding
- **Text input:** 8px border radius, 12px padding
- **Buttons:** 8px border radius, 12px padding, 16px height

### Interactions
- Tap [View Risk Map] → Navigate to Map screen + center on location
- Tap [Dismiss] → Remove message from chat
- Long-press system response → Copy to clipboard
- Bottom sheet: "Ask a fishing question..." prompts (optional)

---

## Screen 2: MARINE MAP

### Layout Structure
```
┌────────────────────────────────────────┐
│ [App Header: MARINE MAP]               │ (56px)
├────────────────────────────────────────┤
│                                        │
│  [Map View - MapView component]        │ (Flex)
│  ┌──────────────────────────────────┐  │
│  │   🟢 🟡        🔴                │  │
│  │                                  │  │
│  │    [Zones + Risk Heatmap]       │  │
│  │                                  │  │
│  │   ⚠ Cyclone Track              │  │
│  │                                  │  │
│  │ 🚫 Restricted (EEZ/Border)      │  │
│  │                                  │  │
│  │ [Current location marker: 📍]   │  │
│  └──────────────────────────────────┘  │
│                                        │
│ [Layer Toggles - Horizontal Scroll]   │ (60px)
│ ┌──────────────────────────────────┐  │
│ │ [🔲 PFZ]  [🔲 Risk]  [🔲 SST]   │  │
│ │ [🔲 Chl]  [🔲 Wind]  [🔲 Geo]   │  │
│ └──────────────────────────────────┘  │
│                                        │
│ [Legend - Fixed at Bottom]             │ (50px)
│ ┌──────────────────────────────────┐  │
│ │ 🟢 Low   🟡 Moderate   🔴 High  │  │
│ └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

### Layer Visualization

#### Risk Heatmap
- **GeoJSON features** colored by `risk_score` property
- Green (#00AA44) for low risk
- Yellow (#FFAA00) for moderate
- Red (#DD0000) for high risk
- Opacity: 60% (allows basemap to show through)

#### PFZ Zones
- Polygon overlays (52 zones)
- Light green fill (#00AA4466)
- Dark green stroke (2px)
- Tap to show zone details (popup/sheet)

#### SST Layer
- Raster tile layer
- Heatmap color: Blue → Red gradient
- Opacity: 50%

#### Chlorophyll Layer
- Raster tile layer
- Heatmap color: White → Green gradient
- Opacity: 50%

#### Wind Layer
- Arrow glyphs at grid points
- Color: Light gray (#999999)
- Length: Proportional to wind speed

#### Geofence Layer
- EEZ boundary: Thick red line (3px)
- Maritime limits: Dashed red line (2px)
- MPAs: Lighter red polygon (50% opacity)

### Interactions
- **Pan/Zoom:** Standard map controls
- **Tap Zone:** Show popup with zone name, distance, productivity
- **Toggle Layer:** Checkbox updates visibility
- **Long-press:** Center on that location
- **Pinch:** Zoom in/out

### Performance Optimization
- Use tile-based rendering for heatmaps
- Cluster PFZ zones at low zoom levels
- Lazy-load layers (only fetch when toggled)
- Cache GeoJSON in AsyncStorage

---

## Screen 3: FISHING ZONE INTELLIGENCE (PFZ)

### Layout Structure
```
┌────────────────────────────────────────┐
│ [Header: FISHING ZONES]                │ (56px)
├────────────────────────────────────────┤
│                                        │
│  [Nearest Zone - Featured Card]       │
│  ┌──────────────────────────────────┐  │
│  │ 📍 KOCHI BANK-A                  │  │
│  │ ├─ Distance: 18.4 km             │  │
│  │ ├─ SST: 27.2°C 🌊              │  │
│  │ ├─ Chlorophyll: 1.82 mg/m³ 🟢  │  │
│  │ ├─ Confidence: 87% ⭐          │  │
│  │ │                              │  │
│  │ ├─ WHY THIS ZONE?              │  │
│  │ │ ✓ High chlorophyll           │  │
│  │ │ ✓ Suitable SST (25-30°C)     │  │
│  │ │ ✓ Historical: 8500 ton/year  │  │
│  │ │ ✓ Low wind today             │  │
│  │ │                              │  │
│  │ ├─ [View on Map] [Get Route]   │  │
│  │ └──────────────────────────────┘  │
│  │ [White background, shadow, 12px padding]
│  │
│  [Scrollable List: Top 5 Other Zones]  │
│  ├─ Zone B: 24.1 km (81% conf)       │
│  ├─ Zone C: 31.2 km (76% conf)       │
│  ├─ Zone D: 42.5 km (69% conf)       │
│  └─ Zone E: 51.8 km (62% conf)       │
│                                        │
│ [Each zone as a smaller card - 70px height]
│
└────────────────────────────────────────┘
```

### Zone Card Component
```
┌────────────────────────────┐
│ 📍 Zone Name               │ (Bold 16px)
│                            │
│ Distance: 18.4 km          │ (Regular 14px)
│ SST: 27.2°C | Chl: 1.82   │ (Regular 14px, inline)
│ Confidence: 87% ⭐        │ (Regular 14px)
│                            │
│ ✓ High chlorophyll         │ (Green checkmark 12px)
│ ✓ Suitable temp            │
│                            │
│ [View on Map] [Get Route]  │ (Buttons 10px)
└────────────────────────────┘
```

### Styling Details
- **Featured zone card:** 16px border radius, 16px padding, white bg, shadow
- **Zone list cards:** 12px border radius, 12px padding, light gray bg
- **Icons:** 20px × 20px emoji or SF Symbols
- **Buttons:** 8px border radius, blue text, 10px font

### Interactions
- Tap zone → Show on Map (navigate to Map screen + center)
- Tap [Get Route] → Open route planning (mock for MVP)
- Swipe to refresh zone list
- Scroll for more zones

---

## Screen 4: SAFETY / ALERTS

### Layout Structure
```
┌────────────────────────────────────────┐
│ [Header: ALERTS]                       │ (56px)
├────────────────────────────────────────┤
│                                        │
│  [Alert Stack - Scrollable]            │ (Flex)
│  ┌──────────────────────────────────┐  │
│  │ 🔴 CYCLONE ALERT                │  │
│  │ ├─ DO NOT VENTURE OUT           │  │
│  │ ├─ Cyclone: Low Pressure System │  │
│  │ ├─ Movement: NW @ 15 km/h       │  │
│  │ ├─ ETA: 24 hours                │  │
│  │ ├─ Status: IMD Alert Level 3    │  │
│  │ └─ [More Info]  [Dismiss]       │  │
│  │ [RED background (#DD000044)]    │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ⚠ GEOFENCING ALERT              │  │
│  │ ├─ Restricted Marine Zone       │  │
│  │ ├─ Type: India-Pakistan Border  │  │
│  │ ├─ Distance: 2.1 km             │  │
│  │ ├─ Action: TURN BACK            │  │
│  │ └─ [View Boundary] [Get Route]  │  │
│  │ [ORANGE background (#FF880044)] │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ ⚠ HIGH WAVE ALERT               │  │
│  │ ├─ Wave Height: 3.4 m           │  │
│  │ ├─ Wind Speed: 42 km/h          │  │
│  │ ├─ Recommended: AVOID           │  │
│  │ ├─ Status: Updated 30 mins ago  │  │
│  │ └─ [View Map] [Dismiss]         │  │
│  │ [YELLOW background (#FFAA0044)] │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [More alerts below...]                │
│                                        │
└────────────────────────────────────────┘
```

### Alert Card Component

#### Cyclone Alert (🔴 Critical)
```
┌─────────────────────────────────────┐
│ 🔴 CYCLONE ALERT (RED)              │
├─────────────────────────────────────┤
│                                     │
│ 🔴 DO NOT VENTURE OUT 🔴           │
│                                     │
│ Cyclone: Low Pressure System        │
│ Movement: NW @ 15 km/h              │
│ ETA: 24 hours                       │
│ Status: IMD Alert Level 3           │
│                                     │
│ [More Info] [Dismiss]               │
└─────────────────────────────────────┘
```
**Background:** rgba(221, 0, 0, 0.1)
**Border:** 3px solid #DD0000
**Padding:** 16px
**Margin:** 12px

#### Geofencing Alert (⚠ Medium)
```
┌─────────────────────────────────────┐
│ ⚠ GEOFENCING ALERT (ORANGE)        │
├─────────────────────────────────────┤
│                                     │
│ Restricted Marine Zone              │
│ Type: India-Pakistan Border         │
│ Distance: 2.1 km                    │
│ Action: TURN BACK                   │
│                                     │
│ [View Boundary] [Get Safe Route]    │
└─────────────────────────────────────┘
```
**Background:** rgba(255, 136, 0, 0.1)
**Border:** 2px solid #FF8800

#### Weather Alert (⚠ Low)
```
┌─────────────────────────────────────┐
│ ⚠ HIGH WAVE ALERT (YELLOW)         │
├─────────────────────────────────────┤
│                                     │
│ Wave Height: 3.4 m                  │
│ Wind Speed: 42 km/h                 │
│ Recommended Action: AVOID           │
│                                     │
│ Status: Updated 30 mins ago         │
│ Source: Open-Meteo, IMD             │
│                                     │
│ [View Map] [Dismiss]                │
└─────────────────────────────────────┘
```
**Background:** rgba(255, 170, 0, 0.1)
**Border:** 2px solid #FFAA00

### Styling Details
- **Card Height:** Variable (auto), min 100px
- **Border radius:** 12px
- **Padding:** 16px
- **Margin:** 12px between cards
- **Title font:** Bold 16px
- **Body font:** Regular 14px
- **Button font:** Regular 12px

### Alert Priority Order
1. Cyclone (🔴 Red, always at top)
2. Geofencing (⚠ Orange)
3. High Wind (⚠ Yellow)
4. High Waves (⚠ Yellow)
5. Lightning (🔵 Blue)
6. Info (🔵 Blue)

### Interactions
- **Swipe left:** Quick dismiss
- **Tap [Dismiss]:** Remove alert
- **Tap [View Map]:** Navigate to Map screen + highlight alert zone
- **Long-press:** See detailed alert info
- **Pull to refresh:** Fetch latest alerts

---

## Global Design System

### Spacing Scale
```
4px   - xs (gaps, small padding)
8px   - sm (icon spacing)
12px  - md (card padding, input padding)
16px  - lg (screen padding, large gaps)
24px  - xl (screen sections)
32px  - 2xl (major sections)
```

### Border Radius
```
4px   - small buttons, minor elements
8px   - input fields, buttons
12px  - cards, containers
16px  - major cards, modals
```

### Shadows (React Native)
```
elevation: 4 (light shadow on cards)
shadowColor: "#000000"
shadowOffset: { width: 0, height: 2 }
shadowOpacity: 0.1
shadowRadius: 4
```

### Button Styling
```
Primary (Blue):
  Background: #0066CC
  Text: White
  Height: 48px
  Border radius: 8px

Secondary (Gray):
  Background: #F5F5F5
  Text: #0066CC
  Height: 48px
  Border radius: 8px

Danger (Red):
  Background: #DD0000
  Text: White
  Height: 48px
  Border radius: 8px
```

### Typography Hierarchy
```
H1: 28px Bold  (Screen titles)
H2: 24px Bold  (Card titles, major sections)
H3: 18px Bold  (Subsections)
Body: 14px Regular  (Body text)
Small: 12px Regular  (Helper text, captions)
```

### Iconography
- **Size:** 20px × 20px for inline icons, 24px for standalone
- **Style:** Emoji (simple) or SF Symbols (iOS) / Material Icons (Android)
- **Colors:** Match text color or use semantic color (green for positive, red for negative)

---

## Responsive Design Notes

### Mobile Screens (320px - 480px)
- Stack all elements vertically
- Cards: 90% width with 5% margin on each side
- Buttons: Full width below content
- Font sizes: Slightly reduced (12px body, 14px large)

### Large Screens (480px - 768px)
- Use 2-column layouts where appropriate
- Cards: 48% width in rows
- Buttons: 30% width
- Font sizes: Standard (14px body, 18px large)

### Tablet Screens (768px+)
- 3-column layouts
- Side panels for navigation
- Larger touch targets
- Font sizes: Larger (16px body, 20px large)

---

## Animation & Transitions

### Loading States
- Skeleton loaders: Gray pulse animation (1 second loop)
- Spinner: Rotating circle (1.5 second loop)

### Transitions
- Screen navigation: Slide in/out (300ms)
- Alert entrance: Slide down from top (200ms)
- Card tap: Scale 0.95 (100ms)

### Haptics (Optional)
- Tap alert dismiss: Light vibration (50ms)
- Cyclone alert: Strong vibration (100ms)

---

## Accessibility

- **Min font size:** 12px (never smaller)
- **Min touch target:** 48px × 48px
- **Color contrast:** WCAG AA (4.5:1 for text)
- **Alt text:** All icons have semantic labels
- **Focus indicator:** Visible on button tap

---

**Design Version:** 1.0
**Updated:** Ready for Frontend Build

