---
name: SeaSarathi Marine Intelligence
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daef'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e1e8fd'
  surface-container-highest: '#dce2f7'
  on-surface: '#141b2b'
  on-surface-variant: '#424751'
  inverse-surface: '#293040'
  inverse-on-surface: '#edf0ff'
  outline: '#727782'
  outline-variant: '#c2c6d3'
  surface-tint: '#225eab'
  primary: '#003670'
  on-primary: '#ffffff'
  primary-container: '#004d99'
  on-primary-container: '#9ec1ff'
  inverse-primary: '#a9c7ff'
  secondary: '#006e29'
  on-secondary: '#ffffff'
  secondary-container: '#75fe8b'
  on-secondary-container: '#00752c'
  tertiary: '#4e3100'
  on-tertiary: '#ffffff'
  tertiary-container: '#6d4600'
  on-tertiary-container: '#ffb02f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#a9c7ff'
  on-primary-fixed: '#001b3d'
  on-primary-fixed-variant: '#00468c'
  secondary-fixed: '#75fe8b'
  secondary-fixed-dim: '#57e072'
  on-secondary-fixed: '#002107'
  on-secondary-fixed-variant: '#00531d'
  tertiary-fixed: '#ffddb4'
  tertiary-fixed-dim: '#ffb952'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#633f00'
  background: '#f9f9ff'
  on-background: '#141b2b'
  surface-variant: '#dce2f7'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '800'
    lineHeight: 32px
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  telemetry-lg:
    fontFamily: JetBrains Mono
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 38px
  telemetry-md:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 26px
  label-tactical:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-compact:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  touch-target-min: 3.5rem
  touch-target-dense: 3rem
  gutter-mobile: 1rem
  gutter-tablet: 1.5rem
  card-pad-sm: 0.75rem
  card-pad-md: 1.125rem
  card-pad-lg: 1.5rem
  telemetry-gap: 0.5rem
  section-gap: 1.5rem
---

## Brand & Style

This design system serves Indian coastal artisanal fishers, mechanized trawler operators, port trust authorities, and disaster response forces (NDRF/Coast Guard). The environment demands extreme clarity: glaring tropical sunlight, wet touchscreens, salt spray, vibration, and rolling sea swells. The design language must project absolute authority, calm reliability, and urgent tactical clarity.

The aesthetic fuses **Modern Maritime Tactical** with **Utilitarian Field-Grade Instrument UI**. It avoids fragile decoration, gossamer lines, or low-contrast subtleties. Instead, it deploys high-contrast nautical surfaces, industrial-weight typography, oversized physical-feeling touch anchors, and instant chromatic risk signaling. 

Key aesthetic pillars:
- **Direct Glanceability:** Telemetry metrics, wind vectors, sea-state swell heights, and maritime border proximity must be decipherable in a 200-millisecond glance in full noon sunlight.
- **Physical Resilience:** Buttons mimic tactile bridge instruments—chunky, positive, and heavily padded for wet, calloused thumb interaction.
- **Nautical Precision:** Radar grids, heading compass roses, bathymetric depth markers, and sonar sweep motifs ground the operational context without creating cognitive clutter.

## Colors

The palette is anchored in high-visibility maritime safety codes:
- **Primary Navy (`#004D99` base, `#0066CC` interactive):** Represents deep oceanic depth, navigation authority, and operational state. Used for primary navigation headers, tracking paths, and standard action buttons.
- **Low Risk Safe Emerald (`#00AA44`):** Designates safe navigational zones, calm sea state, valid licenses, and verified landing harbors.
- **Moderate Risk Amber Alert (`#FFAA00`):** Alerts crews to incoming squalls, high swell warnings, advisory catch-zone limits, and low-fuel thresholds.
- **Critical Risk Red (`#DD0000`):** Reserved exclusively for International Maritime Boundary Line (IMBL) geofence breaches, cyclone evacuation orders, distress beacon (SOS) triggers, and engine/hull emergencies.
- **Surfaces & Atmosphere:** Backgrounds use a light slate ocean wash (`#F3F6F9` base canvas, `#EBF1F6` secondary tracks) to slash direct screen glare compared to harsh pure white, while tactical cards leverage pure optical white (`#FFFFFF`) with distinct structural borders (`#CBD5E1` and `#E2E8F0`). High-density tactical headers and readouts deploy deep graphite charcoal (`#1A1A1A` and `#111827`).

## Typography

The typographic hierarchy divides utility into situational comprehension and instrument telemetry:
- **Body & Headlines:** Rendered in **Inter** with tightened letter tracking on headings and generous stroke weight throughout. Regular body text uses minimum 15px to ensure micro-tremors and vessel engine vibrations do not render text illegible.
- **Telemetry & Numerical Data:** Rendered in **JetBrains Mono** to enforce tabular, monospaced alignment for coordinates (lat/long), GPS speed over ground (knots), depth fathoms/meters, distance-to-border, and time-to-return. Numbers never shift width dynamically as values fluctuate.
- All critical labels and geofence distance numbers are rendered with strict uppercase or bold tabular formatting.

## Layout & Spacing

Field operations require an ergonomic layout tailored for single-handed thumb operation on pitching decks:
- **Thumb Danger & Safe Zones:** All mission-critical controls (Emergency Broadcast, Safe Anchorage Return, Hazard Toggle) reside within the bottom 40% of the mobile viewport. Map navigation instruments use bottom floating action clusters.
- **Grid Structure:** A 4-column fluid mobile grid with 16px screen gutters expanding to 8 columns with 24px gutters on rugged marine tablets mounted at helm consoles.
- **Minimum Tap Boundaries:** Standard interactive buttons have a strict minimum target height of `56px` (`3.5rem`) to accommodate gloved or wet hands. Secondary chips never fall below `48px` (`3rem`).
- **Data Densification:** Telemetry modules use tight internal groupings (`8px`) nested within distinct structured cards (`18px` padding) to prevent erroneous reading across different data metrics (e.g., separating Wave Height from Wind Speed).

## Elevation & Depth

Marine screens cannot rely on soft, ethereal drop shadows, which wash out completely in broad tropical daylight:
- **Structural Outlines over Pure Shadows:** Elevation is established by sharp 1.5px and 2px borders (`#CBD5E1` and `#111827`) paired with crisp, high-density surface contrast.
- **Layer 0 (Ocean Bed):** Canvas background `#F3F6F9`.
- **Layer 1 (Deck Surfaces):** Pure `#FFFFFF` instrument cards with a 1.5px `#CBD5E1` containment border and an ambient, low-blur anchoring shadow (`0px 4px 0px 0px rgba(0, 77, 153, 0.08)`).
- **Layer 2 (Tactical Floating Clusters & Alerts):** Floating GPS compass pucks, telemetry heads-up displays, and critical IMBL warning sheets employ an intense high-visibility contrast border (`2px solid #111827` or `#DD0000`) with a solid directional block shadow (`0px 6px 12px rgba(17, 24, 39, 0.18)`).
- **Layer 3 (Modal Disaster Response):** Full-screen takeovers for cyclone warnings or distress beacon activation overlay a 75% dark tint (`rgba(17, 24, 39, 0.85)`) with high-pulsing amber or crimson frames.

## Shapes

The design system implements a **Soft Industrial** geometry (`roundedness: 1`).
- Base buttons, telemetry chips, and input frames feature a firm `4px` (`0.25rem`) to `8px` (`0.5rem`) corner radius. This conveys the engineered, rugged feel of physical marine electronics (transponders, echo sounders) rather than frivolous consumer app pills.
- Danger and Alert banners use stark `4px` corners with aggressive left-accent borders (`6px`) to anchor peripheral vision.
- Icon containers, radar indicators, and SOS triggers utilize circular forms only when representing radial physical phenomena (e.g., compass roses, satellite lock rings, sonar pings).

## Components

### 1. Tactical Telemetry Cards
- **Structure:** Solid `#FFFFFF` background, `1.5px solid #CBD5E1`, with a `4px` corner radius.
- **Header:** Uppercase 11px Inter bold tracking label in `#475569` accompanied by a micro marine icon (e.g., anemometer, wave buoy).
- **Metric:** Giant `JetBrains Mono` bold digits (`34px`) in `#111827`. Sub-unit (knots, meters, mbar) in 13px weight aligned to the metric baseline.
- **Status Indicator:** Integrated bottom color band (4px height) reflecting risk level (Emerald, Amber, Red).

### 2. Rugged Buttons
- **Primary Operational:** Deep Navy `#004D99` fill, active press state `#003366`. Text in pure white, 16px bold. Minimum height `56px`. Border: none.
- **SOS / Distress Action:** Critical Red `#DD0000` fill with 2px stroke of `#990000`. Dual-action long-press (3 seconds) with animated circular fill bar to avoid accidental triggers in turbulent water.
- **Secondary Outlined:** Pure `#FFFFFF` background, 2px solid `#004D99`, text in `#004D99`.

### 3. Geofence & Border Breach Banners
- **Visual Pattern:** High-urgency warning strip. For IMBL proximity (< 5 nautical miles), the banner turns `#DD0000` with high-contrast `#FFFFFF` text.
- **Pattern Infusion:** Top and bottom hazard diagonal micro-stripes (Red/Charcoal) for zero-literacy visual recognition.
- **Audio-Visual Strobe:** Pulsing 1-second cadence between `#DD0000` and `#990000` when crossing operational limits.

### 4. Marine Status Chips
- **Geometry:** Compact rectangular chips with 4px border radius, min height `36px`.
- **States:** 
  - *Safe Harbor:* `#E6F7ED` background, `#00AA44` border (1.5px), `#006629` bold text.
  - *Advisory Alert:* `#FFF6E5` background, `#FFAA00` border (1.5px), `#996600` bold text.
  - *Critical Hazard:* `#FDE8E8` background, `#DD0000` border (1.5px), `#990000` bold text.

### 5. Checkboxes & Radio Selectors
- **Hitbox:** Generous `48x48px` invisible tap target enclosing a `24x24px` physical square/circle.
- **Border:** 2.5px solid `#1E293B` ensuring high visibility on sunlit screens.
- **Checked Fill:** Navy `#004D99` with a crisp 3px white internal checkmark.

### 6. Specialized Components
- **Sonar / Radar Reticle Compass:** Circular heading display utilizing concentric nautical range rings (1 NM, 2 NM, 5 NM) with an overlay of bathymetric shallow-water warnings and potential fishing zone (PFZ) chlorophyll patches.
- **Offline Satellite Sync Status Bar:** Persistent top-docked 24px indicator strip showing GNSS signal strength (DGPS lock), satellite link health, and timestamp of last oceanographic bulletin cache.