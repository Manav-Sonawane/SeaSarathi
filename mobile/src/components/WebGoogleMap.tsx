/**
 * WebGoogleMap.tsx — real Google Maps JavaScript API map for the web build,
 * replacing the old Google Maps Embed API iframe in GoogleMapContainer.tsx.
 *
 * Why this exists: the Embed API is view-only — it renders a map inside an
 * iframe with zero way to draw a custom Polygon/Polyline/Circle on top of
 * it. That's why PFZ zones, maritime boundaries, and the risk heatmap never
 * showed anything on web no matter what data was fed in — the rendering
 * surface itself couldn't display it. The JS API is a real map instance
 * living in our own DOM node, so it supports genuine vector overlays.
 *
 * Web-only by construction (raw `document`/`window` DOM APIs) — never
 * imported or rendered outside GoogleMapContainer's `Platform.OS === 'web'`
 * branch.
 */
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { colors } from '../theme/colors';
import { geometryToSegments, NamedFeature } from '../utils/geoJsonToMap';
import { RiskHeatmapFeature } from '../services/api';

interface WebGoogleMapProps {
  apiKey: string;
  center: { lat: number; lng: number };
  zoom: number;
  pfzFeatures: NamedFeature[];
  boundaryFeatures: NamedFeature[];
  riskPoints: RiskHeatmapFeature[];
  onSelectZone: (zone: any) => void;
}

// Module-level singleton so the script tag is only ever injected once, no
// matter how many times this component mounts/unmounts (tab switches, etc.).
let mapsApiLoadPromise: Promise<void> | null = null;

// IMPORTANT: `loading=async` (Google's newer recommended pattern) only loads
// a bootstrap stub on script `onload` — google.maps.Map/Polyline/Circle don't
// actually exist yet until you separately call google.maps.importLibrary().
// Waiting on `onload` alone throws "google.maps.Map is not a constructor"
// (confirmed live in-browser). The classic `callback=` pattern below is
// synchronous and guaranteed: by the time the named callback fires, every
// core class is genuinely available — no importLibrary() dance needed.
let mapsApiCallbackCounter = 0;

function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if ((window as any).google?.maps?.Map) return Promise.resolve();
  if (mapsApiLoadPromise) return mapsApiLoadPromise;

  mapsApiLoadPromise = new Promise((resolve, reject) => {
    const callbackName = `__seasarathi_gmaps_init_${mapsApiCallbackCounter++}`;
    (window as any)[callbackName] = () => {
      delete (window as any)[callbackName];
      resolve();
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps JavaScript API'));
    document.head.appendChild(script);
  });
  return mapsApiLoadPromise;
}

export function WebGoogleMap({
  apiKey,
  center,
  zoom,
  pfzFeatures,
  boundaryFeatures,
  riskPoints,
  onSelectZone,
}: WebGoogleMapProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Load the API once and create the map instance once.
  useEffect(() => {
    let cancelled = false;
    if (!apiKey) {
      setStatus('error');
      return;
    }
    loadGoogleMapsApi(apiKey)
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const google = (window as any).google;
        mapInstanceRef.current = new google.maps.Map(mapDivRef.current, {
          center,
          zoom,
          mapTypeId: 'satellite',
          disableDefaultUI: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setStatus('ready');
      })
      .catch((err) => {
        console.error('[WebGoogleMap] Failed to load Google Maps JS API:', err);
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // Intentionally only on mount — center/zoom updates are handled below
    // without recreating the map instance (that would reset user panning).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Sync port changes / the +/-/recenter buttons in MapScreen to the live map.
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.panTo(center);
    mapInstanceRef.current.setZoom(zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, zoom]);

  // Redraw overlays whenever the underlying data or layer toggles change.
  useEffect(() => {
    if (status !== 'ready' || !mapInstanceRef.current) return;
    const google = (window as any).google;
    const map = mapInstanceRef.current;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    // Maritime boundaries — real INDIA-EEZ / INDIAN-WATER-BOUNDARIES geometry.
    boundaryFeatures.forEach((b) => {
      geometryToSegments(b.geometry).forEach((segment) => {
        const line = new google.maps.Polyline({
          path: segment.map((p) => ({ lat: p.latitude, lng: p.longitude })),
          strokeColor: '#D50000',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          map,
        });
        line.addListener('click', () =>
          onSelectZone({ name: b.name, title: 'Maritime Boundary', distance: '—', bearing: '—', confidence: null, sst: '—', chl: '—' })
        );
        overlaysRef.current.push(line);
      });
    });

    // PFZ zones — real PFZ.geojson transects.
    pfzFeatures.forEach((z) => {
      geometryToSegments(z.geometry).forEach((segment) => {
        const line = new google.maps.Polyline({
          path: segment.map((p) => ({ lat: p.latitude, lng: p.longitude })),
          strokeColor: '#00C853',
          strokeOpacity: 1,
          strokeWeight: 3,
          map,
        });
        line.addListener('click', () =>
          onSelectZone({ name: z.name, title: z.sector || 'PFZ Sector', distance: '—', bearing: '—', confidence: null, sst: '—', chl: '—' })
        );
        overlaysRef.current.push(line);
      });
    });

    // Risk heatmap — real semi-transparent circles, matching risk_heatmap.py's
    // own color/opacity exactly (the JS API supports this natively, unlike
    // the Static Maps image path, which can only place colored pins).
    riskPoints.forEach((f) => {
      const circle = new google.maps.Circle({
        center: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
        radius: 18000,
        fillColor: f.properties.color,
        fillOpacity: f.properties.opacity,
        strokeColor: f.properties.color,
        strokeOpacity: 0.9,
        strokeWeight: 1,
        map,
      });
      overlaysRef.current.push(circle);
    });
  }, [status, pfzFeatures, boundaryFeatures, riskPoints]);

  if (status === 'error') {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.errorText}>Could not load Google Maps.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* @ts-ignore — raw DOM element, web-only file */}
      <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
      {status === 'loading' && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  errorText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
});
