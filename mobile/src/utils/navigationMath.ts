/**
 * navigationMath.ts — Marine Navigation and Geodetic Calculation Utilities
 * 
 * Provides 100% offline Great Circle calculations for fishermen navigating
 * back to shore during storms/emergencies without cellular or internet connectivity:
 *   - Initial Forward Azimuth (Bearing)
 *   - Haversine Distance (km and Nautical Miles)
 *   - Steering / Rudder Deviation (Port/Starboard course corrections)
 *   - Cardinal & Intercardinal direction mapping
 *   - Standard Maritime VHF Radio coordinate formatting (Degrees-Minutes)
 *   - Vessel ETA estimation
 */

/**
 * Calculates the Great Circle initial forward azimuth (bearing) from Point 1 to Point 2.
 * Output: Bearing in degrees (0° to 359.9°), where 0° = North, 90° = East, etc.
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const initialBearingRad = Math.atan2(y, x);
  const initialBearingDeg = (toDeg(initialBearingRad) + 360) % 360;

  return Math.round(initialBearingDeg * 10) / 10;
}

/**
 * Calculates the Haversine distance between two coordinates in kilometers.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371.0; // Earth's mean radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Converts kilometers to Nautical Miles (1 NM = 1.852 km).
 */
export function kmToNauticalMiles(km: number): number {
  return Math.round((km / 1.852) * 10) / 10;
}

export type RudderDirection = 'KEEP_STEADY' | 'STEER_STARBOARD' | 'STEER_PORT';

export interface SteeringGuidance {
  direction: RudderDirection;
  degreesOff: number; // Absolute degrees off course (0° to 180°)
  rawDifference: number; // Signed: positive = Starboard (Right), negative = Port (Left)
  isOnCourse: boolean; // True if within tolerance (e.g. +/- 5°)
}

/**
 * Calculates heading deviation between current boat heading and target bearing.
 * Returns required steering correction:
 *   - positive difference: target is to the Right -> Steer Starboard
 *   - negative difference: target is to the Left  -> Steer Port
 *   - |difference| <= tolerance: On Course (Keep Steady)
 */
export function calculateHeadingDifference(
  currentHeading: number,
  targetBearing: number,
  tolerance = 5.0
): SteeringGuidance {
  // Normalize both to [0, 360)
  const normHeading = ((currentHeading % 360) + 360) % 360;
  const normBearing = ((targetBearing % 360) + 360) % 360;

  // Shortest angular difference from current heading to target bearing
  let diff = normBearing - normHeading;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  const absDiff = Math.round(Math.abs(diff) * 10) / 10;
  const isOnCourse = absDiff <= tolerance;

  let direction: RudderDirection = 'KEEP_STEADY';
  if (!isOnCourse) {
    direction = diff > 0 ? 'STEER_STARBOARD' : 'STEER_PORT';
  }

  return {
    direction,
    degreesOff: absDiff,
    rawDifference: Math.round(diff * 10) / 10,
    isOnCourse,
  };
}

/**
 * Converts a 0° - 360° heading into 16-wind compass cardinal directions.
 */
export function getCardinalDirection(heading: number): string {
  const norm = ((heading % 360) + 360) % 360;
  const cardinals = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const index = Math.round(norm / 22.5) % 16;
  return cardinals[index];
}

/**
 * Formats coordinates into standard Maritime VHF distress format (Degrees & Decimal Minutes).
 * Example: 09° 58.24' N, 076° 14.18' E
 * This is the exact international standard format read over VHF Channel 16 during MAYDAY.
 */
export function formatVhfCoordinates(lat: number, lon: number): string {
  const formatComponent = (val: number, posChar: string, negChar: string, degDigits: number) => {
    const dirChar = val >= 0 ? posChar : negChar;
    const absVal = Math.abs(val);
    const deg = Math.floor(absVal);
    const min = (absVal - deg) * 60;
    const degStr = deg.toString().padStart(degDigits, '0');
    const minStr = min.toFixed(2).padStart(5, '0');
    return `${degStr}° ${minStr}' ${dirChar}`;
  };

  const latStr = formatComponent(lat, 'N', 'S', 2);
  const lonStr = formatComponent(lon, 'E', 'W', 3);

  return `${latStr}, ${lonStr}`;
}

/**
 * Estimates remaining time to reach port in hours and minutes.
 * Default boat speed: 9 knots (~16.6 km/h) for typical mechanized fishing boat.
 */
export function estimateTimeToArrival(
  distanceKm: number,
  speedKnots = 9
): { hours: number; minutes: number; totalMinutes: number; formatted: string } {
  const speedKmh = Math.max(1.0, speedKnots * 1.852);
  const totalHours = distanceKm / speedKmh;
  const totalMinutes = Math.round(totalHours * 60);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  let formatted = '';
  if (hours > 0) {
    formatted = `${hours}h ${minutes}m`;
  } else {
    formatted = `${minutes}m`;
  }

  return { hours, minutes, totalMinutes, formatted };
}
