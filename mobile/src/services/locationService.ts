/**
 * locationService.ts — GPS position + compass heading via expo-location.
 *
 * React Native has no `navigator.geolocation` (it was removed from core), so the
 * old `navigator.geolocation` calls in CompassScreen/ProfileScreen silently
 * did nothing on Android and iOS — the app just looked like it had no GPS.
 * expo-location also works on web (it delegates to navigator.geolocation
 * there), so this one module serves every platform.
 *
 * Foreground-only by design: nothing in the app needs location while it is
 * closed (see the permission strings in app.config.js).
 */
import * as Location from 'expo-location';

export type LocationFailure = 'permission_denied' | 'services_disabled' | 'timeout' | 'unavailable';

export type LocationFix = {
  ok: true;
  latitude: number;
  longitude: number;
  // GPS course-over-ground in degrees (only meaningful while moving), or null.
  heading: number | null;
};

export type LocationResult = LocationFix | { ok: false; reason: LocationFailure };

export interface Subscription {
  remove: () => void;
}

const CURRENT_POSITION_TIMEOUT_MS = 15000;
// A fix this recent is good enough to show immediately while a fresh one is acquired.
const LAST_KNOWN_MAX_AGE_MS = 60000;

async function ensureForegroundPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Location.requestForegroundPermissionsAsync();
  return requested.granted;
}

function toFix(pos: Location.LocationObject): LocationFix {
  const h = pos.coords.heading;
  return {
    ok: true,
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    heading: h != null && !Number.isNaN(h) && h >= 0 ? h : null,
  };
}

/** One-shot position. Never throws — failures come back as `{ ok: false, reason }`. */
export async function getCurrentCoords(): Promise<LocationResult> {
  try {
    if (!(await ensureForegroundPermission())) return { ok: false, reason: 'permission_denied' };
    if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: 'services_disabled' };

    const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (lastKnown) return toFix(lastKnown);

    // getCurrentPositionAsync can wait forever without sky view (indoors, cold
    // start) — bound it so callers can show a real error instead of spinning.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), CURRENT_POSITION_TIMEOUT_MS);
    });
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timeout,
    ]);
    if (timer) clearTimeout(timer);
    return result === 'timeout' ? { ok: false, reason: 'timeout' } : toFix(result);
  } catch (err) {
    console.warn('[locationService] getCurrentCoords failed:', err);
    return { ok: false, reason: 'unavailable' };
  }
}

/** Continuous position updates. Resolves to null if permission is denied or the watch can't start. */
export async function watchPosition(onFix: (fix: LocationFix) => void): Promise<Subscription | null> {
  try {
    if (!(await ensureForegroundPermission())) return null;
    return await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      (pos) => onFix(toFix(pos))
    );
  } catch (err) {
    console.warn('[locationService] watchPosition failed:', err);
    return null;
  }
}

/**
 * Compass heading (degrees clockwise from north) from the device's
 * magnetometer/orientation sensors — works with no signal. Prefers true north
 * when the OS can compute it, else magnetic. Resolves to null when unavailable
 * (no sensor, permission denied, or web, where the caller has its own
 * DeviceOrientation path).
 */
export async function watchHeading(onHeading: (degrees: number) => void): Promise<Subscription | null> {
  try {
    if (!(await ensureForegroundPermission())) return null;
    return await Location.watchHeadingAsync((h) => {
      const degrees = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (degrees != null && !Number.isNaN(degrees)) onHeading(((degrees % 360) + 360) % 360);
    });
  } catch (err) {
    console.warn('[locationService] watchHeading failed:', err);
    return null;
  }
}
