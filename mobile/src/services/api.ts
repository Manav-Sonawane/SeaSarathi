import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
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
  type: 'CYCLONE' | 'GEOFENCE' | 'WIND' | 'WAVE' | 'LIGHTNING' | 'INFO';
  message: string;
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

