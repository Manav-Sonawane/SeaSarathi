/**
 * offlineService.ts — Deep Sea Connectivity (UPDATE.md Improvement 3), mobile half.
 *
 * IMPORTANT: this module is a FALLBACK ONLY. Every screen must attempt its normal
 * live API call first (chatAPI, pfzAPI, ...) and only reach for the functions in
 * this file inside that call's `catch` block. Backend responses are always more
 * accurate (real Sarvam LLM answers, real deterministic risk_agent scoring on the
 * freshest data) — nothing here should ever run, or be shown, ahead of a
 * successful live response. Every value this module produces is tagged
 * `offline: true` / `source: 'offline-cache'` so the UI can never present it as
 * if it came from the backend.
 *
 * What this covers (mirrors backend/src/services/offline_cache.py's bundle):
 *   - Downloading + persisting the offline bundle (AsyncStorage)
 *   - Local nearest-PFZ-zone / nearest-landing-center lookup (ports geo.py's
 *     centroid + haversine logic to TypeScript)
 *   - Local risk scoring (ports risk_agent.py's exact thresholds — same rules,
 *     run on cached data instead of live data)
 *   - A plain templated recommendation (no LLM available offline — this does
 *     NOT try to imitate Sarvam's dynamic phrasing, it's intentionally
 *     distinguishable as a cached/offline answer)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineAPI, OfflineBundle } from './api';

const BUNDLE_KEY = 'seasarathi_offline_bundle';
const BUNDLE_META_KEY = 'seasarathi_offline_bundle_meta';

export interface BundleMeta {
  createdAt: string;
  validUntil: string;
  sizeMb: number;
  latitude: number;
  longitude: number;
  tripDays: number;
}

// ── Bundle download / storage ────────────────────────────────────────────────

export async function downloadOfflineBundle(
  latitude: number,
  longitude: number,
  tripDays: number = 5
): Promise<BundleMeta> {
  const { bundle, size_mb, valid_until } = await offlineAPI.syncBundle(latitude, longitude, tripDays);

  const meta: BundleMeta = {
    createdAt: bundle.metadata.created,
    validUntil: valid_until,
    sizeMb: size_mb,
    latitude,
    longitude,
    tripDays,
  };

  await AsyncStorage.setItem(BUNDLE_KEY, JSON.stringify(bundle));
  await AsyncStorage.setItem(BUNDLE_META_KEY, JSON.stringify(meta));
  return meta;
}

export async function getBundleMeta(): Promise<BundleMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(BUNDLE_META_KEY);
    return raw ? (JSON.parse(raw) as BundleMeta) : null;
  } catch {
    return null;
  }
}

export async function isBundleValid(): Promise<boolean> {
  const meta = await getBundleMeta();
  if (!meta) return false;
  return new Date(meta.validUntil).getTime() > Date.now();
}

export async function getCachedBundleForOffline(): Promise<OfflineBundle | null> {
  try {
    const raw = await AsyncStorage.getItem(BUNDLE_KEY);
    return raw ? (JSON.parse(raw) as OfflineBundle) : null;
  } catch {
    return null;
  }
}

export async function clearOfflineBundle(): Promise<void> {
  await AsyncStorage.multiRemove([BUNDLE_KEY, BUNDLE_META_KEY]);
}

// ── Geo helpers (port of backend/src/utils/geo.py) ──────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function geometryCentroid(geom: any): { lat: number; lon: number } | null {
  if (!geom) return null;
  const type = geom.type;
  const coords = geom.coordinates;

  const centroidOfCoords = (pts: number[][]): { lat: number; lon: number } | null => {
    if (!pts.length) return null;
    const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    return { lat, lon };
  };

  if (type === 'Point') return { lat: coords[1], lon: coords[0] };
  if (type === 'LineString') return centroidOfCoords(coords);
  if (type === 'MultiLineString') return centroidOfCoords(coords.flat());
  if (type === 'Polygon') return coords.length ? centroidOfCoords(coords[0]) : null;
  if (type === 'MultiPolygon') return centroidOfCoords(coords.map((poly: number[][][]) => poly[0]).flat());
  return null;
}

export interface OfflineZoneResult {
  name: string;
  distance_km: number;
  centroid_lat: number;
  centroid_lon: number;
}

export function findNearestZonesOffline(
  bundle: OfflineBundle,
  lat: number,
  lon: number,
  limit = 5
): OfflineZoneResult[] {
  const features = bundle.static?.pfz_zones?.features || [];
  const zones: OfflineZoneResult[] = [];

  for (const feature of features) {
    const centroid = geometryCentroid(feature.geometry);
    if (!centroid) continue;
    const props = feature.properties || {};
    const sector = (props.SECTORNAME || '').trim();
    const name = sector || `PFZ-${props.UID ?? zones.length + 1}`;
    zones.push({
      name,
      distance_km: Math.round(haversineKm(lat, lon, centroid.lat, centroid.lon) * 100) / 100,
      centroid_lat: centroid.lat,
      centroid_lon: centroid.lon,
    });
  }

  return zones.sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);
}

export interface OfflineLandingResult {
  name: string;
  district: string;
  distance_km: number;
}

export function findNearestLandingOffline(
  bundle: OfflineBundle,
  lat: number,
  lon: number,
  limit = 3
): OfflineLandingResult[] {
  const features = bundle.static?.landing_centers?.features || [];
  const sites: OfflineLandingResult[] = [];

  for (const feature of features) {
    const centroid = geometryCentroid(feature.geometry);
    if (!centroid) continue;
    const props = feature.properties || {};
    sites.push({
      name: props.LC_NAME || 'Landing Center',
      district: props.DIST_NAME || '',
      distance_km: Math.round(haversineKm(lat, lon, centroid.lat, centroid.lon) * 100) / 100,
    });
  }

  return sites.sort((a, b) => a.distance_km - b.distance_km).slice(0, limit);
}

// ── Forecast window (nearest 12h from cached hourly series) ─────────────────

interface ForecastWindow {
  windSpeed10m: number;
  windGusts10m: number;
  waveHeight: number;
  precipitation: number;
  visibility: number;
  lightning: boolean;
  forecastTime: string | null;
}

function getForecastWindowOffline(bundle: OfflineBundle): ForecastWindow {
  const hourly = bundle.dynamic?.forecast?.hourly || [];
  if (!hourly.length) {
    return {
      windSpeed10m: 12,
      windGusts10m: 15,
      waveHeight: 1.2,
      precipitation: 0,
      visibility: 10000,
      lightning: false,
      forecastTime: null,
    };
  }

  const now = Date.now();
  // Nearest-future (or nearest overall) entry, then a 12h window from there.
  let startIdx = hourly.findIndex((h) => new Date(h.time).getTime() >= now);
  if (startIdx === -1) startIdx = 0;
  const window = hourly.slice(startIdx, startIdx + 12);
  const source = window.length ? window : hourly.slice(0, 12);

  const nums = (key: keyof (typeof source)[number]) =>
    source.map((h) => h[key]).filter((v): v is number => typeof v === 'number');

  const windVals = nums('wind_speed_10m');
  const gustVals = nums('wind_gusts_10m');
  const waveVals = nums('wave_height');
  const rainVals = nums('precipitation');
  const visVals = nums('visibility');
  const codeVals = nums('weather_code');

  return {
    windSpeed10m: windVals.length ? Math.max(...windVals) : 12,
    windGusts10m: gustVals.length ? Math.max(...gustVals) : 15,
    waveHeight: waveVals.length ? Math.max(...waveVals) : 1.2,
    precipitation: rainVals.length ? rainVals.reduce((a, b) => a + b, 0) : 0,
    visibility: visVals.length ? Math.min(...visVals) : 10000,
    lightning: codeVals.length ? Math.max(...codeVals) >= 95 : false,
    forecastTime: source[0]?.time ?? null,
  };
}

// ── Risk scoring (exact port of backend/src/agents/risk_agent.py) ───────────

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

function scoreRiskOffline(w: ForecastWindow): { riskLevel: RiskLevel; confidence: number } {
  if (w.lightning) return { riskLevel: 'HIGH', confidence: 98 };

  let score = 100;
  if (w.windSpeed10m > 46) score -= 40;
  else if (w.windSpeed10m > 28) score -= 15;

  if (w.waveHeight > 3.5) score -= 35;
  else if (w.waveHeight > 2.5) score -= 20;
  else if (w.waveHeight > 1.5) score -= 10;

  if (w.precipitation > 50) score -= 20;
  else if (w.precipitation > 15) score -= 8;

  score = Math.max(0, Math.min(100, score));
  const riskLevel: RiskLevel = score >= 70 ? 'LOW' : score >= 40 ? 'MODERATE' : 'HIGH';
  // Cached data is inherently staler than a live fetch — reflect that in confidence.
  const confidence = Math.max(30, score - 15);
  return { riskLevel, confidence };
}

// ── Offline chat-equivalent answer ───────────────────────────────────────────

export interface OfflineChatAnswer {
  risk_level: RiskLevel;
  wind_kmh: number;
  wave_m: number;
  rainfall_mm: number;
  lightning: boolean;
  cyclone: boolean;
  recommendation: string;
  confidence: number;
  sources: string[];
  sst_c: number | null;
  chlorophyll_mg_m3: number | null;
  alerts: OfflineAlert[];
  offline: true;
  cached_forecast_time: string | null;
  bundle_created_at: string;
}

/**
 * Builds a ChatResponse-shaped answer entirely from the cached bundle, for use
 * ONLY when the live /chat call has already failed. This intentionally does
 * NOT try to answer arbitrary free-text queries the way Sarvam does — there is
 * no LLM available offline — it gives the same risk/condition snapshot the
 * backend's deterministic risk_agent would, plus the nearest cached PFZ zone
 * and landing center, in a plain template clearly marked as cached.
 */
export function buildOfflineChatAnswer(
  bundle: OfflineBundle,
  lat: number,
  lon: number,
  portName: string
): OfflineChatAnswer {
  const w = getForecastWindowOffline(bundle);
  const { riskLevel, confidence } = scoreRiskOffline(w);
  const nearestZone = findNearestZonesOffline(bundle, lat, lon, 1)[0];
  const nearestLanding = findNearestLandingOffline(bundle, lat, lon, 1)[0];

  let recommendation: string;
  if (riskLevel === 'HIGH') {
    recommendation = `[Offline cached data] Do not venture out from ${portName} — wind ${Math.round(
      w.windSpeed10m
    )} km/h, waves ${w.waveHeight.toFixed(1)} m from the last downloaded forecast.`;
  } else {
    const zoneText = nearestZone
      ? ` Nearest cached fishing zone: ${nearestZone.name} (${nearestZone.distance_km} km).`
      : '';
    const landingText = nearestLanding ? ` Nearest landing: ${nearestLanding.name}.` : '';
    recommendation =
      `[Offline cached data] Conditions from your last download: wind ${Math.round(
        w.windSpeed10m
      )} km/h, waves ${w.waveHeight.toFixed(1)} m.${zoneText}${landingText} ` +
      `Reconnect for a live, personalized answer.`;
  }

  const sstChl = bundle.dynamic?.sst_chlorophyll_current;

  return {
    risk_level: riskLevel,
    wind_kmh: Math.round(w.windSpeed10m),
    wave_m: Number(w.waveHeight.toFixed(1)),
    rainfall_mm: Number(w.precipitation.toFixed(1)),
    lightning: w.lightning,
    cyclone: false, // never fabricated offline — see offline_cache.py's cyclone_alerts_note
    recommendation,
    confidence,
    sources: ['offline-cache'],
    sst_c: typeof sstChl?.sst_c === 'number' ? sstChl.sst_c : null,
    chlorophyll_mg_m3: typeof sstChl?.chl_mg_m3 === 'number' ? sstChl.chl_mg_m3 : null,
    alerts: buildOfflineAlerts(bundle, lat, lon),
    offline: true,
    cached_forecast_time: w.forecastTime,
    bundle_created_at: bundle.metadata.created,
  };
}

// ── Offline alerts (exact port of the /alerts thresholds in backend/main.py) ─

export interface OfflineAlert {
  type: string;
  severity: 'HIGH' | 'MODERATE' | 'INFO';
  message: string;
  source: string;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Builds the same shape of alert list as GET /alerts, from cached data only.
 * Used ONLY when the live /alerts call has already failed. Geofence alerts
 * come straight from the bundle (computed server-side at download time);
 * weather alerts are recomputed from the cached forecast window using the
 * exact same thresholds the backend's /alerts endpoint uses.
 */
export function buildOfflineAlerts(bundle: OfflineBundle, lat: number, lon: number): OfflineAlert[] {
  const alerts: OfflineAlert[] = [];

  for (const a of bundle.dynamic?.geofence_alerts || []) {
    alerts.push({
      type: a.type,
      severity: a.severity,
      message: a.message,
      source: 'geofence-cache',
      metadata: { boundary: a.boundary, distance_km: a.distance_km },
    });
  }

  const w = getForecastWindowOffline(bundle);

  if (w.windSpeed10m > 46) {
    alerts.push({
      type: 'HIGH_WIND',
      severity: 'HIGH',
      message: `Dangerous winds: ${Math.round(w.windSpeed10m)} km/h (gusts ${Math.round(w.windGusts10m)} km/h). Do not venture out. [cached]`,
      source: 'offline-cache',
      metadata: { wind_speed_10m: w.windSpeed10m, wind_gusts_10m: w.windGusts10m },
    });
  } else if (w.windSpeed10m > 28) {
    alerts.push({
      type: 'MODERATE_WIND',
      severity: 'MODERATE',
      message: `Elevated winds: ${Math.round(w.windSpeed10m)} km/h. Exercise caution at sea. [cached]`,
      source: 'offline-cache',
      metadata: { wind_speed_10m: w.windSpeed10m },
    });
  }

  if (w.precipitation > 50) {
    alerts.push({
      type: 'HEAVY_RAIN',
      severity: 'HIGH',
      message: `Heavy rainfall: ${Math.round(w.precipitation)} mm in 12 hrs. Conditions will deteriorate. [cached]`,
      source: 'offline-cache',
      metadata: { precipitation_mm: w.precipitation },
    });
  }

  if (w.visibility < 1000) {
    alerts.push({
      type: 'LOW_VISIBILITY',
      severity: 'MODERATE',
      message: `Low visibility: ${(w.visibility / 1000).toFixed(1)} km. Navigation risk increased. [cached]`,
      source: 'offline-cache',
      metadata: { visibility_m: w.visibility },
    });
  }

  if (w.lightning) {
    alerts.push({
      type: 'THUNDERSTORM',
      severity: 'HIGH',
      message: 'Thunderstorm with lightning forecast. Do NOT go out to sea. [cached]',
      source: 'offline-cache',
      metadata: {},
    });
  }

  if (w.waveHeight > 3.5) {
    alerts.push({
      type: 'DANGEROUS_WAVES',
      severity: 'HIGH',
      message: `Dangerous waves: ${w.waveHeight.toFixed(1)} m. Small vessels must stay ashore. [cached]`,
      source: 'offline-cache',
      metadata: { wave_height_m: w.waveHeight },
    });
  } else if (w.waveHeight > 2.0) {
    alerts.push({
      type: 'HIGH_WAVES',
      severity: 'MODERATE',
      message: `High waves: ${w.waveHeight.toFixed(1)} m. Avoid smaller vessels. [cached]`,
      source: 'offline-cache',
      metadata: { wave_height_m: w.waveHeight },
    });
  }

  const sevRank: Record<string, number> = { HIGH: 0, MODERATE: 1, INFO: 2 };
  return alerts.sort((a, b) => (sevRank[a.severity] ?? 99) - (sevRank[b.severity] ?? 99));
}
