import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Image, Animated, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { PortInfo } from '../constants/portsAndLanguages';
import { colors } from '../theme/colors';
import { IndiaMapCanvas } from './IndiaMapCanvas';
import { RiskHeatmapFeature } from '../services/api';

interface GoogleMapContainerProps {
  activePort: PortInfo;
  layers: {
    risk: boolean;
    pfz: boolean;
    geofence: boolean;
    wind: boolean;
  };
  onSelectZone: (zone: any) => void;
  zoom?: number;
  panOffset?: { x: number; y: number };
  isMapHovered?: boolean;
  // Risk heatmap overlay (backend/src/services/risk_heatmap.py via /geojson/risk)
  riskPoints?: RiskHeatmapFeature[];
  riskSummary?: { LOW: number; MODERATE: number; HIGH: number } | null;
  riskLoading?: boolean;
  riskError?: string;
}

const GOOGLE_MAPS_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyDAipJLXbPfmpSdi91j_4mcWHbFSfmjq4c';

export function GoogleMapContainer({
  activePort,
  layers,
  onSelectZone,
  zoom = 11,
  panOffset = { x: 0, y: 0 },
  isMapHovered = false,
  riskPoints = [],
  riskSummary = null,
  riskLoading = false,
  riskError = '',
}: GoogleMapContainerProps) {
  const [mapMode, setMapMode] = useState<'satellite' | 'vector'>('satellite');
  const isFocused = useIsFocused();
  const alertAnim = React.useRef(new Animated.Value(1)).current;

  // Re-trigger alert visibility and slow fade-out transition every time the Marine Map tab is focused
  React.useEffect(() => {
    if (isFocused) {
      alertAnim.setValue(1);
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(alertAnim, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isFocused]);

  // Compute dynamic center latitude and longitude based on drag pan offset
  const latDelta = -panOffset.y * (0.005 / Math.pow(1.5, zoom - 11));
  const lonDelta = panOffset.x * (0.005 / Math.pow(1.5, zoom - 11));

  const centerLat = (activePort.latitude + latDelta).toFixed(4);
  const centerLon = (activePort.longitude + lonDelta).toFixed(4);

  // Debounce iframe center coordinates to prevent rapid iframe reloads during 60fps pan dragging
  const [stableLat, setStableLat] = React.useState((activePort.latitude).toFixed(4));
  const [stableLon, setStableLon] = React.useState((activePort.longitude).toFixed(4));

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setStableLat(centerLat);
      setStableLon(centerLon);
    }, 150);
    return () => clearTimeout(timer);
  }, [centerLat, centerLon]);

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

  // Google Maps Interactive Embed iframe URL with debounced center
  const embedUrl = `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_KEY}&center=${stableLat},${stableLon}&zoom=${zoom}&maptype=satellite`;

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
      {/* Map Switcher Header Strip (Hides during map hover/drag) */}
      {!isMapHovered && (
        <View style={styles.switcherHeader}>
          <View style={styles.portLabelGroup}>
            <MaterialCommunityIcons name="google-maps" size={18} color="#EA4335" />
            <Text style={styles.portLabelText}>
              PORT: <Text style={styles.boldText}>{activePort.name.toUpperCase()}</Text> ({centerLat}° N, {centerLon}° E)
            </Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mapMode === 'satellite' && styles.modeBtnActive]}
              onPress={() => setMapMode('satellite')}
            >
              <Ionicons
                name="earth"
                size={13}
                color={mapMode === 'satellite' ? colors.white : colors.onSurfaceVariant}
              />
              <Text style={[styles.modeBtnText, mapMode === 'satellite' && styles.modeBtnTextActive]}>
                Satellite
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeBtn, mapMode === 'vector' && styles.modeBtnActive]}
              onPress={() => setMapMode('vector')}
            >
              <Ionicons
                name="map"
                size={13}
                color={mapMode === 'vector' ? colors.white : colors.onSurfaceVariant}
              />
              <Text style={[styles.modeBtnText, mapMode === 'vector' && styles.modeBtnTextActive]}>
                India Map
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Map Content Area */}
      <View style={styles.mapViewport}>
        {mapMode === 'vector' ? (
          <IndiaMapCanvas
            activePort={activePort}
            layers={layers}
            onSelectZone={onSelectZone}
            zoom={zoom}
            panOffset={panOffset}
          />
        ) : Platform.OS === 'web' ? (
          <View style={styles.webEmbedContainer}>
            {/* Embedded Google Maps Satellite View */}
            <iframe
              title="Google Maps Port Satellite View"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              src={embedUrl}
            />

            {/* Tactical Floating Reticle & Port Highlight Card Over Google Maps (Hides during map hover/drag) */}
            {!isMapHovered && (
              <View style={styles.overlayOverlay}>
                <View style={styles.gpsBanner}>
                  <Ionicons name="location-sharp" size={16} color="#EA4335" />
                  <View>
                    <Text style={styles.gpsBannerTitle}>
                      📍 PINNED PORT: {activePort.name.toUpperCase()} ({centerLat}° N, {centerLon}° E)
                    </Text>
                    <Text style={styles.gpsBannerSub}>
                      Google Satellite Stream • Zoom: {zoom}x • {activePort.sea}
                    </Text>
                  </View>
                </View>

                {renderRiskLegend()}

                {/* Geofence Overlay Warning with Slow Fade Transition */}
                {layers.geofence && (
                  <Animated.View style={[styles.geofenceBadge, { opacity: alertAnim }]}>
                    <Text style={styles.geofenceBadgeText}>
                      ⚠️ 12 NM TERRITORIAL BORDER WATCH ACTIVE ({activePort.state.toUpperCase()})
                    </Text>
                  </Animated.View>
                )}

                {/* PFZ Zone Hotspots */}
                {layers.pfz && (
                  <TouchableOpacity
                    style={styles.pfzHotspot}
                    onPress={() =>
                      onSelectZone({
                        name: `PFZ-${activePort.name.substring(0, 3).toUpperCase()}-14`,
                        title: `${activePort.name} Deep Swell`,
                        distance: '14.2 NM',
                        bearing: '280° WNW',
                        confidence: 92,
                        sst: '28.4°C',
                        chl: '1.84 mg/m³',
                      })
                    }
                  >
                    <MaterialCommunityIcons name="fish" size={14} color="#00E676" />
                    <Text style={styles.pfzHotspotText}>
                      PFZ-{activePort.name.substring(0, 3).toUpperCase()}-14 (92% CONF)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.nativeImageContainer}>
            <Image source={{ uri: staticMapUrl }} style={styles.staticImage} resizeMode="cover" />
            {!isMapHovered && (
              <>
                <View style={styles.gpsBanner}>
                  <Ionicons name="location-sharp" size={16} color="#EA4335" />
                  <Text style={styles.gpsBannerTitle}>
                    {activePort.name} ({centerLat}° N, {centerLon}° E) • Zoom: {zoom}x
                  </Text>
                </View>
                {renderRiskLegend()}
              </>
            )}
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
  switcherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHighest,
  },
  portLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  portLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurface,
  },
  boldText: {
    fontWeight: '800',
    color: colors.primary,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  modeBtnActive: {
    backgroundColor: colors.primaryContainer,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  modeBtnTextActive: {
    color: colors.white,
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
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  gpsBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gpsBannerSub: {
    fontSize: 10,
    color: '#38BDF8',
    marginTop: 1,
  },
  riskLegendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
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
  geofenceBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'center',
  },
  geofenceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pfzHotspot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 230, 118, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-end',
  },
  pfzHotspotText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#003311',
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
