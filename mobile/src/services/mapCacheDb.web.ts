/**
 * mapCacheDb.web.ts — web build of mapCacheDb.ts.
 *
 * expo-sqlite's web implementation needs a wa-sqlite WASM asset wired into
 * Metro's resolver (extra asset extensions + COOP/COEP headers) that this
 * project doesn't have configured, and even with that set up, browsers have
 * no persistent native SQLite. Metro resolves platform-specific `.web.ts`
 * files instead of `.ts` when bundling for web, so this file replaces
 * mapCacheDb.ts on web WITHOUT ever importing 'expo-sqlite' — that import
 * alone (unreachable code or not) is what broke the web bundle, since Metro
 * bundles statically-found imports regardless of runtime Platform checks.
 *
 * Same exported shape as mapCacheDb.ts, all as honest no-ops: web falls back
 * to whatever offlineService.ts's AsyncStorage bundle already provides
 * (findNearestZonesOffline, etc.) — it just doesn't get the SQLite-backed
 * map cache. This mirrors the app's existing pattern (graceful degrade, no
 * fabricated data) rather than crashing or silently pretending to cache.
 */
import type { OfflineBundle } from './api';

export interface MapCacheMeta {
  syncedAt: string;
  pfzCount: number;
  boundaryCount: number;
  landingCount: number;
}

export interface CachedPfzZone {
  id: string;
  name: string;
  sector: string;
  centroid_lat: number;
  centroid_lon: number;
  geometry: any;
}

export interface CachedBoundary {
  id: string;
  name: string;
  line_type: string;
  geometry: any;
}

export interface CachedLandingCenter {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
}

export async function saveMapCacheFromBundle(_bundle: OfflineBundle): Promise<MapCacheMeta | null> {
  return null;
}

export async function getMapCacheMeta(): Promise<MapCacheMeta | null> {
  return null;
}

export async function getCachedPfzZonesDb(): Promise<CachedPfzZone[]> {
  return [];
}

export async function getCachedBoundariesDb(): Promise<CachedBoundary[]> {
  return [];
}

export async function getCachedLandingCentersDb(): Promise<CachedLandingCenter[]> {
  return [];
}

export async function clearMapCacheDb(): Promise<void> {}
