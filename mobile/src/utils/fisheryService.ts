import coastalFisheryJson from '../constants/coastalFisheryData.json';

export interface SpeciesCatchInfo {
  id: string;
  name: string;
  localNames: Record<string, string>;
  totalCatchTonnes: number;
  catchPct: number;
  cpueKgHr: number;
  marketPricePerKg: number;
  gear: string;
  vessel: string;
  sst: string;
  chl: string;
  salinity: string;
  distance: string;
  depth: string;
  peakTime: string;
  peakSeason: string;
  recordCount: number;
  abundance: 'VERY HIGH' | 'HIGH' | 'MODERATE';
}

export interface LandingCentre {
  id: string;
  name: string;
  state: string;
  district: string;
  latitude: number;
  longitude: number;
  fishingZone: string;
  speciesList: SpeciesCatchInfo[];
  distanceKm?: number;
}

export interface NearbyFisheryResult {
  primaryCentre: LandingCentre;
  nearbyCentres: LandingCentre[];
  allCentres: LandingCentre[];
}

const ALL_LANDING_CENTRES: LandingCentre[] = (coastalFisheryJson.landingCentres as unknown) as LandingCentre[];

/**
 * Haversine formula to calculate geodesic distance in km between two lat/lon points.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Normalizes port name for fuzzy matching (removes parentheses, brackets, etc.)
 */
function cleanPortName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

/**
 * Finds the primary landing centre and any nearby landing centres in close proximity
 * to the given port coordinates or port name.
 * 
 * @param portLat Latitude of port or GPS
 * @param portLon Longitude of port or GPS
 * @param portName Optional port name (e.g. "Kochi", "Tuticorin (Thoothukudi)")
 * @param maxRadiusKm Radius to consider for nearby regions (default 180 km)
 */
export function getNearbyFisheryCentres(
  portLat: number,
  portLon: number,
  portName?: string,
  maxRadiusKm = 180
): NearbyFisheryResult {
  const cleanedPortName = portName ? cleanPortName(portName) : '';

  // Calculate distance from port to every landing centre
  const centresWithDistance: LandingCentre[] = ALL_LANDING_CENTRES.map((centre) => {
    const dist = calculateDistanceKm(portLat, portLon, centre.latitude, centre.longitude);
    return {
      ...centre,
      distanceKm: dist,
    };
  });

  // Sort by distance ascending
  centresWithDistance.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  // If a port name is provided, check if there is an exact/alias match within 80km
  // e.g., "Tuticorin (Thoothukudi)" -> "Thoothukudi"
  // "Mumbai (Sassoon Dock)" -> "Sassoon Dock"
  let primaryIndex = 0;
  if (cleanedPortName) {
    const nameMatchIdx = centresWithDistance.findIndex((c) => {
      const cNameClean = cleanPortName(c.name);
      return (
        (cleanedPortName.includes(cNameClean) || cNameClean.includes(cleanedPortName)) &&
        (c.distanceKm ?? 999) < 100
      );
    });
    if (nameMatchIdx >= 0) {
      primaryIndex = nameMatchIdx;
    }
  }

  const primaryCentre = centresWithDistance[primaryIndex];

  // Other centres within close proximity (excluding primary)
  const nearby = centresWithDistance
    .filter((c, idx) => idx !== primaryIndex && (c.distanceKm ?? 999) <= maxRadiusKm)
    .slice(0, 4); // Keep top 4 closest in the region

  // If none within maxRadiusKm, take the next 2 closest so user always has regional perspective
  const nearbyCentres =
    nearby.length > 0
      ? nearby
      : centresWithDistance.filter((c, idx) => idx !== primaryIndex).slice(0, 2);

  return {
    primaryCentre,
    nearbyCentres,
    allCentres: centresWithDistance,
  };
}

/**
 * Fetch a landing centre by its ID
 */
export function getLandingCentreById(id: string): LandingCentre | undefined {
  return ALL_LANDING_CENTRES.find((c) => c.id === id);
}
