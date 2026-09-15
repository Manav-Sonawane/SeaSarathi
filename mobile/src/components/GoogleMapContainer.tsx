import { View, Text, StyleSheet, Platform, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PortInfo } from '../constants/portsAndLanguages';
import { colors } from '../theme/colors';
import { IndiaMapCanvas } from './IndiaMapCanvas';
import { WebGoogleMap } from './WebGoogleMap';
import { RiskHeatmapFeature } from '../services/api';
import { NamedFeature } from '../utils/geoJsonToMap';

export interface LandingSite {
  id: string;
  name: string;
  district: string;
  sector: string;
  latitude: number;
  longitude: number;
}

interface GoogleMapContainerProps {
  activePort: PortInfo;
  layers: {
    risk: boolean;
    pfz: boolean;
    geofence: boolean;
    landing: boolean;
  };
  onSelectZone: (zone: any) => void;
  zoom?: number;
  panOffset?: { x: number; y: number };
  // Risk heatmap overlay (backend/src/services/risk_heatmap.py via /geojson/risk)
  riskPoints?: RiskHeatmapFeature[];
  riskSummary?: { LOW: number; MODERATE: number; HIGH: number } | null;
  riskLoading?: boolean;
  riskError?: string;
  // Real PFZ zones / maritime boundaries (see MapScreen.tsx) — used on web to
  // draw genuine vector overlays via the Google Maps JavaScript API.
  pfzFeatures?: NamedFeature[];
  boundaryFeatures?: NamedFeature[];
  // Real fish landing centers (LANDING-LOCATIONS.geojson, see MapScreen.tsx) —
  // clickable pins on web, coords + SST/Chlorophyll on tap via onSelectLandingSite.
  landingFeatures?: LandingSite[];
  onSelectLandingSite?: (site: LandingSite) => void;
  // Satellite/vector map-style toggle — owned by MapScreen so its button can
  // live in one consolidated top-right control cluster instead of a second,
  // separately-positioned header bar (that second bar used to overlap
  // MapScreen's own compass/zoom controls at the top-left).
  mapMode: 'satellite' | 'vector';
}

const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export function GoogleMapContainer({
  activePort,
  layers,
  onSelectZone,
  zoom = 11,
  panOffset = { x: 0, y: 0 },
  riskPoints = [],
  riskSummary = null,
  riskLoading = false,
  riskError = '',
  pfzFeatures = [],
  boundaryFeatures = [],
  landingFeatures = [],
  onSelectLandingSite,
  mapMode,
}: GoogleMapContainerProps) {
  // Compute dynamic center latitude and longitude based on drag pan offset.
  // Only meaningful for the native Static Maps image path below — the real
  // web map (WebGoogleMap) handles its own pan/zoom via native map dragging.
  const latDelta = -panOffset.y * (0.005 / Math.pow(1.5, zoom - 11));
  const lonDelta = panOffset.x * (0.005 / Math.pow(1.5, zoom - 11));

  const centerLat = (activePort.latitude + latDelta).toFixed(4);
  const centerLon = (activePort.longitude + lonDelta).toFixed(4);

  // Risk heatmap overlay markers (real risk_heatmap.py data, capped upstream
  // in MapScreen.tsx to keep this URL well under Static Maps' length limit).
  // One `markers=` param per point so each can carry its own risk color —
  // Static Maps has no "circle with opacity" primitive, so a small colored
  // pin per grid point is the closest honest approximation this API allows.
  const riskMarkersParam = layers.risk
    ? riskPoints
      .map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const hex = f.properties.color.replace('#', '0x');
        return `&markers=color:${hex}%7Csize:small%7C${lat},${lon}`;
      })
      .join('')
    : '';

  // Google Maps Static Satellite Image with Port Marker
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLon}&zoom=${zoom}&size=640x480&scale=2&maptype=hybrid&markers=color:red%7Clabel:P%7C${activePort.latitude},${activePort.longitude}${riskMarkersParam}&key=${GOOGLE_MAPS_KEY}`;

  // Risk legend/summary — shared between the web (Embed API can't render
  // custom markers, so this is the ONLY risk info shown there) and native
  // (markers are on the image itself; this just adds the count/legend) paths.
  const renderRiskLegend = () => {
    if (!layers.risk) return null;
    if (riskLoading) {
      return (
        <View style={styles.riskLegendBox}>
          <ActivityIndicator size="small" color={colors.white} />
          <Text style={styles.riskLegendText}>Loading risk overlay…</Text>
        </View>
      );
    }
    if (riskError) {
      return (
        <View style={styles.riskLegendBox}>
          <Ionicons name="alert-circle-outline" size={13} color="#FCA5A5" />
          <Text style={styles.riskLegendText}>{riskError}</Text>
        </View>
      );
    }
    if (!riskSummary) return null;
    return (
      <View style={styles.riskLegendBox}>
        <View style={styles.riskLegendDot}>
          <View style={[styles.riskDot, { backgroundColor: '#00C853' }]} />
          <Text style={styles.riskLegendText}>{riskSummary.LOW} Safe</Text>
        </View>
        <View style={styles.riskLegendDot}>
          <View style={[styles.riskDot, { backgroundColor: '#FFB300' }]} />
          <Text style={styles.riskLegendText}>{riskSummary.MODERATE} Caution</Text>
        </View>
        <View style={styles.riskLegendDot}>
          <View style={[styles.riskDot, { backgroundColor: '#D50000' }]} />
          <Text style={styles.riskLegendText}>{riskSummary.HIGH} Danger</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Main Map Content Area */}
      <View style={styles.mapViewport}>
        {mapMode === 'vector' ? (
          <IndiaMapCanvas
            activePort={activePort}
            layers={layers}
            onSelectZone={onSelectZone}
            zoom={zoom}
            panOffset={panOffset}
            pfzFeatures={pfzFeatures}
            boundaryFeatures={boundaryFeatures}
            landingFeatures={layers.landing ? landingFeatures : []}
            onSelectLandingSite={onSelectLandingSite}
          />
        ) : Platform.OS === 'web' ? (
          <View style={styles.webEmbedContainer}>
            {/* Real Google Maps JavaScript API — genuine Polyline/Circle overlays,
                unlike the old Embed-API iframe this replaced (view-only, no
                custom vector overlays possible at all). */}
            <WebGoogleMap
              apiKey={GOOGLE_MAPS_KEY}
              center={{ lat: activePort.latitude, lng: activePort.longitude }}
              zoom={zoom}
              pfzFeatures={layers.pfz ? pfzFeatures : []}
              boundaryFeatures={layers.geofence ? boundaryFeatures : []}
              riskPoints={layers.risk ? riskPoints : []}
              landingFeatures={layers.landing ? landingFeatures : []}
              onSelectLandingSite={onSelectLandingSite}
              onSelectZone={onSelectZone}
            />

            {/* Port label + risk legend — offset clear of MapScreen's own
                top-left compass/zoom column (absolute, z-index 999 over this
                whole component) so the two control clusters never overlap.
                Always on-screen, including while panning/hovering. */}
            <View style={styles.overlayOverlay} pointerEvents="box-none">
              <View style={styles.gpsBanner}>
                <Ionicons name="location-sharp" size={14} color="#EA4335" />
                <Text style={styles.gpsBannerTitle} numberOfLines={1}>
                  {activePort.name.toUpperCase()} · {centerLat}°N, {centerLon}°E
                </Text>
              </View>

              {renderRiskLegend()}
            </View>
          </View>
        ) : (
          <View style={styles.nativeImageContainer}>
            <Image source={{ uri: staticMapUrl }} style={styles.staticImage} resizeMode="cover" />
            <View style={styles.gpsBanner}>
              <Ionicons name="location-sharp" size={14} color="#EA4335" />
              <Text style={styles.gpsBannerTitle} numberOfLines={1}>
                {activePort.name} · {centerLat}°N, {centerLon}°E
              </Text>
            </View>
            {renderRiskLegend()}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  mapViewport: {
    flex: 1,
    position: 'relative',
  },
  webEmbedContainer: {
    flex: 1,
    position: 'relative',
  },
  overlayOverlay: {
    position: 'absolute',
    top: 0,
    // Left padding clears MapScreen's own top-left compass/zoom column
    // (absolute, ~64px wide, anchored at x:14) so this component's own
    // in-map labels never sit underneath it.
    left: 78,
    right: 12,
    bottom: 0,
    paddingTop: 14,
    justifyContent: 'flex-start',
    gap: 8,
    pointerEvents: 'box-none',
  },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  gpsBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  riskLegendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  riskLegendDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  riskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  riskLegendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  nativeImageContainer: {
    flex: 1,
    position: 'relative',
  },
  staticImage: {
    width: '100%',
    height: '100%',
  },
  simplePortPinWrapper: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    zIndex: 888,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 8,
  },
});
