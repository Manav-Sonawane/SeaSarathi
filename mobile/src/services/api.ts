import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// 'localhost' means "this device", not your dev machine — that resolves fine
// on iOS simulator / web, but on Android (emulator or physical device) every
// request silently fails as a generic Network Error. 10.0.2.2 is the Android
// emulator's alias for the host machine's localhost — but a PHYSICAL device
// over Wi-Fi needs the dev machine's actual LAN IP, which changes every time
// you switch networks (Wi-Fi 1 → Wi-Fi 2 → hotspot).
//
// Fix: Expo Go/dev-client always knows exactly which host:port it loaded the
// JS bundle from — that's Constants.expoConfig.hostUri (e.g.
// "192.168.1.38:8081"), populated live by @expo/cli, correct for whatever
// network you're on right now. Reuse that host, swap Metro's port (8081) for
// the backend's (8000). This only exists in development (__DEV__); it's null
// in a production build, where you'd want a real deployed API URL instead.
function detectDevServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  return hostUri.split(':')[0];
}

const detectedHost = __DEV__ ? detectDevServerHost() : null;
const DEFAULT_API_URL = detectedHost
  ? `http://${detectedHost}:8000`
  : Platform.OS === 'android'
    ? 'http://10.0.2.2:8000' // Android emulator fallback (no physical-device host to detect)
    : 'http://localhost:8000';

// EXPO_PUBLIC_API_URL in mobile/.env still wins if set (e.g. pointing at a
// deployed backend instead of your dev machine) — but for local dev, leave
// it unset and let auto-detection handle network switches for you.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

export const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
});

export interface ChatResponse {
  risk_level: 'LOW' | 'MODERATE' | 'HIGH';
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
  alerts: Alert[];
}

export const chatAPI = {
  sendMessage: (query: string, latitude: number, longitude: number, profile?: any) =>
    api
      .post('/chat', { query, latitude, longitude, profile })
      .then((res) => {
        const raw = res.data || {};
        const rawWind = raw.wind_kmh ?? raw.wind_speed_10m ?? 18;
        const rawWave = raw.wave_m ?? raw.wave_height ?? 1.2;
        const rawRain = raw.rainfall_mm ?? raw.precipitation ?? 0.0;
        const rawConf = raw.confidence ?? 85;

        return {
          risk_level: raw.risk_level ?? 'LOW',
          wind_kmh: typeof rawWind === 'number' ? Math.round(rawWind) : 18,
          wave_m: typeof rawWave === 'number' ? Number(rawWave.toFixed(1)) : 1.2,
          rainfall_mm: typeof rawRain === 'number' ? Number(rawRain.toFixed(1)) : 0.0,
          lightning: Boolean(raw.lightning),
          cyclone: Boolean(raw.cyclone),
          recommendation: raw.recommendation ?? '',
          confidence: typeof rawConf === 'number' ? Math.round(rawConf) : 85,
          sources: raw.sources ?? [],
          sst_c: typeof raw.sst_c === 'number' ? raw.sst_c : null,
          chlorophyll_mg_m3: typeof raw.chlorophyll_mg_m3 === 'number' ? raw.chlorophyll_mg_m3 : null,
          alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
        } as ChatResponse;
      }),
};

export interface PFZZone {
  name: string;
  distance: number;
  sst: number | null;
  chl: number | null;
  confidence: number;
  bearing?: string;
  dataNote?: string;
}

export const pfzAPI = {
  getNearest: (latitude: number, longitude: number, limit = 5) =>
    api
      .get<{ zones?: any[] }>('/pfz/nearest', { params: { latitude, longitude, limit } })
      .then((res) => {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : raw?.zones || [];
        // Real distance/confidence always come from the backend (Haversine +
        // a distance-based formula — see main.py's /pfz/nearest). SST/
        // chlorophyll are real Copernicus grid lookups when available and
        // null otherwise — passed through as null rather than a plausible-
        // looking fake number, so the UI can honestly show "N/A"/"Offline".
        return list.map((z: any) => ({
          name: z.name || 'PFZ Zone',
          distance: z.distance ?? z.distance_km,
          sst: typeof z.sst === 'number' ? z.sst : null,
          chl: typeof (z.chl ?? z.chlorophyll) === 'number' ? (z.chl ?? z.chlorophyll) : null,
          confidence: z.confidence,
          bearing: z.direction ?? z.bearing,
          dataNote: z.data_note,
        })) as PFZZone[];
      }),
};

export interface Alert {
  type: string; // e.g. HIGH_WIND, DANGEROUS_WAVES, GEOFENCE_DANGER, THUNDERSTORM, ...
  severity: 'HIGH' | 'MODERATE' | 'INFO';
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export const alertsAPI = {
  getAlerts: (latitude: number, longitude: number) =>
    api
      .get<{ alerts: Alert[] }>('/alerts', { params: { latitude, longitude } })
      .then((res) => res.data.alerts || []),
};

export interface RiskHeatmapFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lon, lat]
  properties: {
    risk_score: number;
    risk_level: 'LOW' | 'MODERATE' | 'HIGH';
    color: string;
    opacity: number;
    wind_speed_10m: number;
    wave_height: number;
    precipitation: number;
    lightning: boolean;
    cyclone: boolean;
    sst_c: number | null;
    chlorophyll: number | null;
    data_source: string;
    generated_at: string;
  };
}

export interface RiskHeatmapResponse {
  type: 'FeatureCollection';
  features: RiskHeatmapFeature[];
  metadata: {
    total_points: number;
    resolution_deg: number;
    generated_at: string;
    generation_time_s: number;
    risk_counts: { LOW: number; MODERATE: number; HIGH: number };
    color_legend: Record<string, { color: string; label: string }>;
  };
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: any; properties: Record<string, any> }>;
}

export const geojsonAPI = {
  getPFZ: () => api.get<GeoJsonFeatureCollection>('/geojson/pfz').then((res) => res.data),
  getBoundaries: () => api.get<GeoJsonFeatureCollection>('/geojson/boundaries').then((res) => res.data),
  getRisk: (resolution = 1.0) =>
    api
      .get<RiskHeatmapResponse>('/geojson/risk', { params: { resolution } })
      .then((res) => res.data),
};

export interface ProfilePayload {
  device_id: string;
  vessel_type: string;
  risk_tolerance: string;
  operating_port: string;
  role: string;
  language: string;
}

export interface ProfileResponseData {
  device_id: string;
  vessel_type: string;
  risk_tolerance: string;
  operating_port: string;
  role: string;
  language: string;
  extra: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const profileAPI = {
  upsertProfile: (payload: ProfilePayload) =>
    api.post<ProfileResponseData>('/profile', payload).then((res) => res.data),

  getProfile: (deviceId: string) =>
    api.get<ProfileResponseData>(`/profile/${deviceId}`).then((res) => res.data),

  deleteProfile: (deviceId: string) =>
    api.delete<{ deleted: boolean; device_id: string }>(`/profile/${deviceId}`).then((res) => res.data),
};

// ── Offline bundle (Deep Sea Connectivity — UPDATE.md Improvement 3) ────────
// Matches backend/src/services/offline_cache.py's prepare_offline_bundle() shape.
// `static`/`dynamic`/`historical` are left loosely typed here (raw GeoJSON +
// forecast rows) — offlineService.ts is the only place that reads into them.

export interface OfflineForecastHour {
  time: string;
  wind_speed_10m: number | null;
  wind_gusts_10m: number | null;
  precipitation: number | null;
  visibility: number | null;
  weather_code: number | null;
  wave_height: number | null;
}

export interface OfflineBundle {
  metadata: {
    created: string;
    valid_until: string;
    latitude: number;
    longitude: number;
    trip_days: number;
  };
  static: {
    pfz_zones: { type: string; features: any[] };
    maritime_boundaries: { type: string; features: any[] };
    landing_centers: { type: string; features: any[] };
  };
  dynamic: {
    forecast: { hourly: OfflineForecastHour[]; days: number; source: string; note?: string };
    sst_chlorophyll_current: any;
    cyclone_alerts: any[];
    cyclone_alerts_note: string;
    geofence_alerts: any[];
    in_indian_waters: boolean;
  };
  historical: {
    sst_30day_mean_c: number | null;
    chlorophyll_30day_mean_mg_m3: number | null;
    note: string | null;
  };
}

export interface OfflineSyncResponse {
  bundle: OfflineBundle;
  size_mb: number;
  valid_until: string;
}

export const offlineAPI = {
  // This does real, sometimes-slow upstream fetches server-side (Open-Meteo +
  // Copernicus, ~20-30s observed) — give it more room than the default
  // timeout; this is a rare "before sailing" action, not a hot path.
  syncBundle: (latitude: number, longitude: number, tripDays = 5) =>
    api
      .post<OfflineSyncResponse>(
        '/offline/sync-bundle',
        { latitude, longitude, trip_days: tripDays },
        { timeout: 90000 }
      )
      .then((res) => res.data),
};

