import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

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
        } as ChatResponse;
      }),
};

export interface PFZZone {
  name: string;
  distance: number;
  sst: number;
  chl: number;
  confidence: number;
  bearing?: string;
}

export const pfzAPI = {
  getNearest: (latitude: number, longitude: number, limit = 5) =>
    api
      .get<{ zones?: any[] }>('/pfz/nearest', { params: { latitude, longitude, limit } })
      .then((res) => {
        const raw = res.data;
        const list = Array.isArray(raw) ? raw : raw?.zones || [];
        return list.map((z: any) => ({
          name: z.name || 'PFZ Zone',
          distance: z.distance ?? z.distance_km ?? 15,
          sst: z.sst ?? 28.2,
          chl: z.chl ?? z.chlorophyll ?? 1.6,
          confidence: z.confidence ?? 85,
          bearing: z.direction ?? z.bearing ?? '280° WNW',
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

export const geojsonAPI = {
  getPFZ: () => api.get('/geojson/pfz').then((res) => res.data),
  getRisk: () => api.get('/geojson/risk').then((res) => res.data),
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

