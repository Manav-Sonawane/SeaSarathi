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
  // An IPv6 literal host is bracketed, e.g. "[::1]:8081" — naively
  // splitting on ':' would return just "[" instead of the host. Expo dev
  // hosts are practically always IPv4 LAN addresses, but this keeps a
  // theoretical IPv6 host from silently producing a broken API URL.
  if (hostUri.startsWith('[')) {
    const end = hostUri.indexOf(']');
    if (end !== -1) return hostUri.slice(0, end + 1);
  }
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
//
// Release/preview APKs (`!__DEV__`) have NO dev server to detect and
// 'localhost'/'10.0.2.2' can never reach a real backend from an installed
// app (and cleartext http is blocked there unless the build was configured
// for it — see app.config.js). EXPO_PUBLIC_API_URL is inlined at build time,
// so a release build without it is misconfigured: fail loudly (splash screen
// shows the resolved URL) instead of quietly talking to a dead address.
// `||` not `??` so an empty-string env var (unset in EAS) counts as unset.
export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEFAULT_API_URL : '');

if (!API_BASE_URL) {
  console.error(
    '[api] EXPO_PUBLIC_API_URL was not set when this build was created — every backend call will fail. ' +
      'Rebuild with EXPO_PUBLIC_API_URL pointing at your backend (see ANDROID_BUILD.md).'
  );
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

export interface DataFreshnessInfo {
  grid_age_hours: number | null;
  stale: boolean;
  max_age_hours: number;
  grid_exists: boolean;
  refreshed?: boolean;
  metadata?: {
    generated_at?: string;
    source?: string;
    point_count?: number;
    sst_dataset_id?: string;
    chl_dataset_id?: string;
  } | null;
}

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
  data_freshness?: DataFreshnessInfo | null;
}

// Process-alive vs. data-ready are different questions (see backend
// main.py's /health vs /health/ready) — this is the latter, used by
// StartupSplashScreen to know when the Copernicus grid (and therefore
// real SST/chlorophyll/PFZ numbers) is actually available, instead of the
// app silently rendering null/zero data during the backend's ~90s cold
// start.
export interface ReadinessInfo {
  ready: boolean;
  grid: { ready: boolean; point_count: number | null; generated_at: string | null };
  imd: { sources_cached: number; sources_total: number };
  agent_ready: boolean;
}

export const healthAPI = {
  getReadiness: () => api.get<ReadinessInfo>('/health/ready', { timeout: 8000 }).then((res) => res.data),
};

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
          data_freshness: raw.data_freshness ?? null,
        } as ChatResponse;
      }),
};

export const freshnessAPI = {
  getFreshness: (autoRefresh = false) =>
    api
      .get<DataFreshnessInfo>('/data/freshness', { params: { auto_refresh: autoRefresh } })
      .then((res) => res.data),

  refreshData: (force = false) =>
    api
      .post<{
        success: boolean;
        previous_age_hours: number | null;
        new_age_hours: number | null;
        stale: boolean;
        metadata?: any;
        message: string;
      }>('/data/refresh', null, { params: { force } })
      .then((res) => res.data),
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
          distance: typeof (z.distance ?? z.distance_km) === 'number' ? Number(Number(z.distance ?? z.distance_km).toFixed(1)) : (z.distance ?? z.distance_km),
          sst: typeof z.sst === 'number' ? Number(Number(z.sst).toFixed(1)) : null,
          chl: typeof (z.chl ?? z.chlorophyll) === 'number' ? Number(Number(z.chl ?? z.chlorophyll).toFixed(2)) : null,
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

// How current the IMD data behind /alerts is (backend routers/alerts.py). Lets
// the UI say WHEN IMD was last checked and which bulletin the alerts come from,
// and warn when the backend could not reach IMD.
export interface ImdBulletinInfo {
  region_label: string | null;
  issued_at_text: string;
  valid_until_text: string | null;
  validity_note: string | null;
  status: 'current' | 'expired' | 'unknown';
}

export interface ImdStatus {
  checked_at: string | null; // when the backend last fetched IMD's fisherman PDFs
  age_minutes: number | null;
  stale: boolean | null; // older than its refresh interval
  last_error: string | null; // set if the latest attempt to reach IMD failed
  server_time_utc?: string;
  bulletin: ImdBulletinInfo | null;
}

export const alertsAPI = {
  getAlerts: (latitude: number, longitude: number) =>
    api
      .get<{ alerts: Alert[] }>('/alerts', { params: { latitude, longitude } })
      .then((res) => res.data.alerts || []),

  getAlertsWithStatus: (latitude: number, longitude: number) =>
    api
      .get<{ alerts: Alert[]; imd_status?: ImdStatus }>('/alerts', { params: { latitude, longitude } })
      .then((res) => ({ alerts: res.data.alerts || [], imdStatus: res.data.imd_status ?? null })),
};

// Zonal news feed (backend/src/services/imd_news_feed.py) — the same IMD
// live-feed data behind /alerts, grouped into coastal zones and rewritten
// as short news-style bulletins for the Alerts screen's zonal feed.
export interface ZoneBulletin {
  zone_id: string;
  zone_label: string;
  severity: 'HIGH' | 'MODERATE' | 'NORMAL';
  headline: string;
  body: string;
  alert_count: number;
  generated_at: string;
  imd_checked_at?: string | null; // when the IMD data this bulletin was built from was last fetched
}

export const newsAPI = {
  getFeed: () => api.get<{ zones: ZoneBulletin[]; generated_at: string }>('/news/feed').then((res) => res.data),
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
  getLanding: () => api.get<GeoJsonFeatureCollection>('/geojson/landing').then((res) => res.data),
  getRisk: (resolution = 1.0) =>
    api
      .get<RiskHeatmapResponse>('/geojson/risk', { params: { resolution } })
      .then((res) => res.data),
};

export interface NearestLandingSite {
  name: string;
  district: string;
  sector: string;
  unique_id: string;
  status: string;
  latitude: number;
  longitude: number;
  distance_km: number;
}

export const landingAPI = {
  // Searches all 1223 points in LANDING-LOCATIONS.geojson (see
  // backend/src/utils/geo.py's find_nearest_landing_sites), not just the
  // ~20 curated major ports — used to bind a fisherman's real GPS position
  // to their actual nearest landing location.
  getNearest: (latitude: number, longitude: number, limit = 1) =>
    api
      .get<{ sites: NearestLandingSite[]; count: number }>('/landing/nearest', { params: { latitude, longitude, limit } })
      .then((res) => res.data.sites),
};

export interface OceanPointResponse {
  available: boolean;
  sst_c: number | null;
  chlorophyll_mg_m3: number | null;
  grid_distance_km?: number;
  sst_time?: string;
  chl_time?: string;
  query_lat: number;
  query_lon: number;
}

export const oceanAPI = {
  getPoint: (latitude: number, longitude: number) =>
    api
      .get<OceanPointResponse>('/ocean/point', { params: { latitude, longitude } })
      .then((res) => res.data),
};

export interface ProfilePayload {
  device_id: string;
  user_id?: string;
  name?: string;
  password?: string;
  vessel_type: string;
  risk_tolerance: string;
  operating_port: string;
  role: string;
  language: string;
  extra?: Record<string, any>;
}

export interface ProfileResponseData {
  device_id: string;
  user_id: string;
  name: string;
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

  getProfile: (identifier: string) =>
    api.get<ProfileResponseData>(`/profile/${identifier}`).then((res) => res.data),

  listProfiles: () =>
    api.get<ProfileResponseData[]>('/profiles').then((res) => res.data),

  login: (identifier: string, password?: string) =>
    api
      .post<ProfileResponseData>('/auth/login', { identifier, password: password || '' })
      .then((res) => res.data),

  deleteProfile: (identifier: string) =>
    api.delete<{ deleted: boolean; identifier: string }>(`/profile/${identifier}`).then((res) => res.data),
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

export interface SttResponse {
  transcript: string;
  language_code: string | null;
  language_probability: number | null; // Sarvam's own confidence in language_code (0.0-1.0)
}

export interface TtsResponse {
  audios: string[]; // base64 WAV clips, in playback order
  language_code: string;
}

export const voiceAPI = {
  // `fileUri` is a local file:// (or blob: on web) URI from an expo-audio
  // recording — uploaded as multipart/form-data, matching the backend's
  // /voice/stt (Sarvam saaras:v3). `language` is this app's language code
  // (e.g. "hi"), used only as a recognition hint.
  stt: (fileUri: string, filename: string, mimeType: string, language?: string) => {
    const form = new FormData();
    form.append('file', { uri: fileUri, name: filename, type: mimeType } as any);
    if (language) form.append('language', language);
    return api
      .post<SttResponse>('/voice/stt', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      .then((res) => res.data);
  },
  // Longer than STT's timeout above: the backend chunks text over Sarvam's
  // per-call character cap into multiple SEQUENTIAL API calls (see
  // sarvam_client.py) — a long advisory's total round-trip could plausibly
  // exceed 30s server-side even though each individual chunk is fast, which
  // used to surface as a client-side timeout the user just saw as "nothing
  // happened."
  tts: (text: string, language: string) =>
    api.post<TtsResponse>('/voice/tts', { text, language }, { timeout: 60000 }).then((res) => res.data),
};

