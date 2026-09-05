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
  sendMessage: (query: string, latitude: number, longitude: number) =>
    api
      .post<ChatResponse>('/chat', { query, latitude, longitude })
      .then((res) => res.data),
};

export interface PFZZone {
  name: string;
  distance: number;
  sst: number;
  chl: number;
  confidence: number;
}

export const pfzAPI = {
  getNearest: (latitude: number, longitude: number, limit = 5) =>
    api
      .get<PFZZone[]>('/pfz/nearest', { params: { latitude, longitude, limit } })
      .then((res) => res.data),
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
      .then((res) => res.data.alerts),
};

export const geojsonAPI = {
  getPFZ: () => api.get('/geojson/pfz').then((res) => res.data),
  getRisk: () => api.get('/geojson/risk').then((res) => res.data),
};
