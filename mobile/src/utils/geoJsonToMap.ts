/**
 * geoJsonToMap.ts — shared GeoJSON → map-primitive conversion, used by both
 * the native (react-native-maps) and web (Google Maps JavaScript API)
 * rendering paths in MapScreen.tsx / GoogleMapContainer.tsx, so real PFZ
 * zone / maritime boundary geometry renders identically on both platforms
 * instead of two separately-maintained (and previously fabricated) copies.
 */

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

// GeoJSON geometry → arrays of points, one array per line segment.
// Handles line types directly; for Polygon/MultiPolygon (e.g. INDIA-EEZ's
// area, mixed into /geojson/boundaries alongside real boundary lines) draws
// each ring's outline as a line — there's no separate boundary-line geometry
// for the EEZ itself, so its polygon outline IS the boundary to show.
export function geometryToSegments(geometry: any): LatLngPoint[][] {
  if (!geometry) return [];
  const toPoints = (coords: number[][]): LatLngPoint[] =>
    coords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  if (geometry.type === 'LineString') return [toPoints(geometry.coordinates)];
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map(toPoints);
  if (geometry.type === 'Polygon') return geometry.coordinates.map(toPoints);
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates.flatMap((polygon: number[][][]) => polygon.map(toPoints));
  return [];
}

export interface NamedFeature {
  name: string;
  sector?: string;
  geometry: any;
}
