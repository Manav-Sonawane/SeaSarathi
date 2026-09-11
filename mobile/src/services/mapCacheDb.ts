/**
 * mapCacheDb.ts — SQLite persistence for cached map geometry (completes the
 * "Offline Storage & Grid Caching" item: backend tile/grid caching and the
 * offline bundle fallback logic already existed; this is the missing
 * client-side SQLite persistence layer specifically for the MAP data —
 * PFZ zone boundaries, maritime boundary lines, and landing centers —
 * pulled out of the offline bundle into real on-device tables instead of
 * living only inside one large JSON blob in AsyncStorage.
 *
 * Division of responsibility vs. offlineService.ts's AsyncStorage bundle:
 *   - AsyncStorage bundle (offlineService.ts): the FULL bundle, including
 *     things SQLite doesn't need to index — forecast hours, current
 *     SST/chlorophyll, historical baseline, geofence alerts. Small enough
 *     (one JSON blob) that read/write-whole is fine, and it's what
 *     buildOfflineChatAnswer/buildOfflineAlerts/findNearestZonesOffline
 *     already consume — untouched here.
 *   - SQLite (this file): the map geometry specifically — PFZ zones,
 *     maritime boundaries, landing centers — as real rows, so MapScreen can
 *     query them directly instead of parsing a multi-MB JSON string on every
 *     render, and so this data persists and stays queryable independent of
 *     the rest of the bundle's freshness/validity window.
 *
 * Web has no native SQLite. expo-sqlite ships a web shim, but it's not the
 * reliable path here — every function in this file is wrapped so a failure
 * (or web) degrades to "no cached map data," never a crash. Screens must
 * treat every function here as best-effort, same as offlineService.ts.
 */
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import type { OfflineBundle } from './api';

const DB_NAME = 'seasarathi_maps.db';
const SQLITE_SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase | null> {
  if (!SQLITE_SUPPORTED) return null;
  try {
    if (!dbPromise) {
      dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;

          CREATE TABLE IF NOT EXISTS pfz_zones (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            sector TEXT,
            centroid_lat REAL NOT NULL,
            centroid_lon REAL NOT NULL,
            geometry_json TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS maritime_boundaries (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            line_type TEXT,
            geometry_json TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS landing_centers (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            district TEXT,
            lat REAL NOT NULL,
            lon REAL NOT NULL
          );

          CREATE TABLE IF NOT EXISTS map_cache_meta (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          );
        `);
        return db;
      });
    }
    return await dbPromise;
  } catch (e) {
    console.error('[mapCacheDb] Failed to open/init database:', e);
    dbPromise = null;
    return null;
  }
}

// ── Geometry helpers (same centroid logic as offlineService.ts) ─────────────

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

// ── Write: populate from a downloaded offline bundle ─────────────────────────

export interface MapCacheMeta {
  syncedAt: string;
  pfzCount: number;
  boundaryCount: number;
  landingCount: number;
}

/**
 * Called from offlineService.ts's downloadOfflineBundle() right after a
 * bundle downloads successfully — parses the static GeoJSON once here and
 * stores it as real rows, rather than leaving MapScreen to re-parse the raw
 * FeatureCollection out of the AsyncStorage blob on every visit.
 */
export async function saveMapCacheFromBundle(bundle: OfflineBundle): Promise<MapCacheMeta | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const pfzFeatures = bundle.static?.pfz_zones?.features || [];
    const boundaryFeatures = bundle.static?.maritime_boundaries?.features || [];
    const landingFeatures = bundle.static?.landing_centers?.features || [];

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM pfz_zones');
      await db.runAsync('DELETE FROM maritime_boundaries');
      await db.runAsync('DELETE FROM landing_centers');

      for (let i = 0; i < pfzFeatures.length; i++) {
        const f = pfzFeatures[i];
        const centroid = geometryCentroid(f.geometry);
        if (!centroid) continue;
        const props = f.properties || {};
        const sector = (props.SECTORNAME || '').trim();
        const name = sector || `PFZ-${props.UID ?? i + 1}`;
        await db.runAsync(
          'INSERT INTO pfz_zones (id, name, sector, centroid_lat, centroid_lon, geometry_json) VALUES (?, ?, ?, ?, ?, ?)',
          [String(props.UID ?? i), name, sector, centroid.lat, centroid.lon, JSON.stringify(f.geometry)]
        );
      }

      for (let i = 0; i < boundaryFeatures.length; i++) {
        const f = boundaryFeatures[i];
        const props = f.properties || {};
        const name = props.LINE_NAME || props.GEONAME || `Boundary ${i + 1}`;
        await db.runAsync(
          'INSERT INTO maritime_boundaries (id, name, line_type, geometry_json) VALUES (?, ?, ?, ?)',
          [String(i), name, props.LINE_TYPE || props.POL_TYPE || '', JSON.stringify(f.geometry)]
        );
      }

      for (let i = 0; i < landingFeatures.length; i++) {
        const f = landingFeatures[i];
        const centroid = geometryCentroid(f.geometry);
        if (!centroid) continue;
        const props = f.properties || {};
        await db.runAsync(
          'INSERT INTO landing_centers (id, name, district, lat, lon) VALUES (?, ?, ?, ?, ?)',
          [
            String(props.LC_UNIQUE_ ?? i),
            props.LC_NAME || 'Landing Center',
            props.DIST_NAME || '',
            centroid.lat,
            centroid.lon,
          ]
        );
      }

      const meta: MapCacheMeta = {
        syncedAt: new Date().toISOString(),
        pfzCount: pfzFeatures.length,
        boundaryCount: boundaryFeatures.length,
        landingCount: landingFeatures.length,
      };
      await db.runAsync(
        'INSERT OR REPLACE INTO map_cache_meta (key, value) VALUES (?, ?)',
        ['meta', JSON.stringify(meta)]
      );
    });

    return getMapCacheMeta();
  } catch (e) {
    console.error('[mapCacheDb] Failed to save map cache:', e);
    return null;
  }
}

// ── Read ──────────────────────────────────────────────────────────────────

export async function getMapCacheMeta(): Promise<MapCacheMeta | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM map_cache_meta WHERE key = ?',
      ['meta']
    );
    return row ? (JSON.parse(row.value) as MapCacheMeta) : null;
  } catch (e) {
    console.error('[mapCacheDb] Failed to read map cache meta:', e);
    return null;
  }
}

export interface CachedPfzZone {
  id: string;
  name: string;
  sector: string;
  centroid_lat: number;
  centroid_lon: number;
  geometry: any; // parsed GeoJSON geometry (MultiLineString for real PFZ data)
}

export async function getCachedPfzZonesDb(): Promise<CachedPfzZone[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.getAllAsync<{
      id: string; name: string; sector: string; centroid_lat: number; centroid_lon: number; geometry_json: string;
    }>('SELECT * FROM pfz_zones');
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sector: r.sector,
      centroid_lat: r.centroid_lat,
      centroid_lon: r.centroid_lon,
      geometry: JSON.parse(r.geometry_json),
    }));
  } catch (e) {
    console.error('[mapCacheDb] Failed to read PFZ zones:', e);
    return [];
  }
}

export interface CachedBoundary {
  id: string;
  name: string;
  line_type: string;
  geometry: any;
}

export async function getCachedBoundariesDb(): Promise<CachedBoundary[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.getAllAsync<{ id: string; name: string; line_type: string; geometry_json: string }>(
      'SELECT * FROM maritime_boundaries'
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      line_type: r.line_type,
      geometry: JSON.parse(r.geometry_json),
    }));
  } catch (e) {
    console.error('[mapCacheDb] Failed to read maritime boundaries:', e);
    return [];
  }
}

export interface CachedLandingCenter {
  id: string;
  name: string;
  district: string;
  lat: number;
  lon: number;
}

export async function getCachedLandingCentersDb(): Promise<CachedLandingCenter[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.getAllAsync<CachedLandingCenter>('SELECT * FROM landing_centers');
  } catch (e) {
    console.error('[mapCacheDb] Failed to read landing centers:', e);
    return [];
  }
}

export async function clearMapCacheDb(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM pfz_zones');
      await db.runAsync('DELETE FROM maritime_boundaries');
      await db.runAsync('DELETE FROM landing_centers');
      await db.runAsync('DELETE FROM map_cache_meta');
    });
  } catch (e) {
    console.error('[mapCacheDb] Failed to clear map cache:', e);
  }
}
