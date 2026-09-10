import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  PanResponder,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

import { useUserStore } from '../store/userStore';

import { GoogleMapContainer } from '../components/GoogleMapContainer';

let MapView: any = null;
let Polygon: any = null;
let Polyline: any = null;
let Marker: any = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Polygon = Maps.Polygon;
    Polyline = Maps.Polyline;
    Marker = Maps.Marker;
  } catch {
    // Native maps fallback
  }
}

export function MapScreen({ navigation }: any) {
  const { operatingPort, portInfo } = useUserStore();

  const [hudOpen, setHudOpen] = useState(false);
  const [zoom, setZoom] = useState(11);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [bearing, setBearing] = useState(285);

  const panOffsetRef = React.useRef(panOffset);
  panOffsetRef.current = panOffset;
  const panStartRef = React.useRef({ x: 0, y: 0 });

  const [layers, setLayers] = useState({
    risk: true,
    pfz: true,
    sst: false,
    wind: true,
    geofence: true,
    bathymetry: true,
  });

  const [selectedZone, setSelectedZone] = useState<any>({
    name: `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-14`,
    title: `${portInfo.name} Swell Bank`,
    distance: '14.2 NM',
    bearing: '280° WNW',
    confidence: 92,
    sst: '28.4°C',
    chl: '1.84 mg/m³',
  });

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onPanResponderGrant: () => {
          panStartRef.current = {
            x: panOffsetRef.current.x,
            y: panOffsetRef.current.y,
          };
        },
        onPanResponderMove: (_, gestureState) => {
          setPanOffset({
            x: panStartRef.current.x + gestureState.dx,
            y: panStartRef.current.y + gestureState.dy,
          });
        },
        onPanResponderRelease: () => {},
        onPanResponderTerminate: () => {},
      }),
    []
  );

  const handleZoomIn = () => setZoom((z) => Math.min(z + 1, 18));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 1, 5));
  const handleRecenter = () => {
    setZoom(11);
    setPanOffset({ x: 0, y: 0 });
    panStartRef.current = { x: 0, y: 0 };
    setBearing(285);
  };
  const handleCompassPress = () => {
    setBearing((prev) => (prev === 285 ? 0 : 285));
  };

  const toggleLayer = (key: keyof typeof layers) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const initialRegion = {
    latitude: portInfo.latitude,
    longitude: portInfo.longitude,
    latitudeDelta: 0.4,
    longitudeDelta: 0.4,
  };

  const pfzPolygon1 = [
    { latitude: portInfo.latitude + 0.05, longitude: portInfo.longitude - 0.1 },
    { latitude: portInfo.latitude + 0.12, longitude: portInfo.longitude - 0.17 },
    { latitude: portInfo.latitude + 0.09, longitude: portInfo.longitude - 0.27 },
    { latitude: portInfo.latitude - 0.01, longitude: portInfo.longitude - 0.2 },
  ];

  const pfzPolygon2 = [
    { latitude: portInfo.latitude - 0.08, longitude: portInfo.longitude - 0.07 },
    { latitude: portInfo.latitude - 0.03, longitude: portInfo.longitude - 0.2 },
    { latitude: portInfo.latitude - 0.13, longitude: portInfo.longitude - 0.25 },
    { latitude: portInfo.latitude - 0.17, longitude: portInfo.longitude - 0.13 },
  ];

  const geofenceLine = [
    { latitude: portInfo.latitude + 0.22, longitude: portInfo.longitude - 0.4 },
    { latitude: portInfo.latitude + 0.02, longitude: portInfo.longitude - 0.33 },
    { latitude: portInfo.latitude - 0.18, longitude: portInfo.longitude - 0.27 },
    { latitude: portInfo.latitude - 0.38, longitude: portInfo.longitude - 0.2 },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      {/* Offline Tactical Banner */}
      <View style={styles.offlineBanner}>
        <View style={styles.offlineBannerLeft}>
          <Ionicons name="cloud-download-outline" size={16} color={colors.secondary} />
          <Text style={styles.offlineBannerText}>
            OFFLINE CACHE: 100% ({operatingPort.toUpperCase()} / {portInfo.sea.toUpperCase()})
          </Text>
        </View>
        <Text style={styles.bathyText}>BATHYMETRY V4.2</Text>
      </View>

      {/* Map Viewport with PanResponder for Drag / Pan Gestures */}
      <View style={styles.mapContainer} {...panResponder.panHandlers}>
        {Platform.OS !== 'web' && MapView ? (
          <MapView
            style={styles.map}
            initialRegion={initialRegion}
            showsUserLocation={false}
          >
            {layers.geofence && Polyline && (
              <Polyline
                coordinates={geofenceLine}
                strokeColor={colors.riskHigh}
                strokeWidth={3}
                lineDashPattern={[8, 4]}
              />
            )}
            {layers.pfz && Polygon && (
              <>
                <Polygon
                  coordinates={pfzPolygon1}
                  fillColor="rgba(0, 200, 100, 0.3)"
                  strokeColor={colors.riskLow}
                  strokeWidth={2}
                  tappable
                  onPress={() =>
                    setSelectedZone({
                      name: `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-14`,
                      title: `${portInfo.name} Deep Swell`,
                      distance: '14.2 NM',
                      bearing: '280° WNW',
                      confidence: 92,
                      sst: '28.4°C',
                      chl: '1.84 mg/m³',
                    })
                  }
                />
                <Polygon
                  coordinates={pfzPolygon2}
                  fillColor="rgba(0, 150, 255, 0.25)"
                  strokeColor={colors.primaryContainer}
                  strokeWidth={2}
                  tappable
                  onPress={() =>
                    setSelectedZone({
                      name: `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-18`,
                      title: `${portInfo.state} Bank Edge`,
                      distance: '21.5 NM',
                      bearing: '240° WSW',
                      confidence: 86,
                      sst: '27.9°C',
                      chl: '1.52 mg/m³',
                    })
                  }
                />
              </>
            )}
            {Marker && (
              <Marker
                coordinate={{ latitude: portInfo.latitude, longitude: portInfo.longitude }}
                title={`MY VESSEL (${operatingPort})`}
                description="8.4 KTS • 285° WNW"
              >
                <View style={styles.vesselMarker}>
                  <MaterialCommunityIcons name="navigation" size={24} color={colors.primaryContainer} />
                </View>
              </Marker>
            )}
          </MapView>
        ) : (
          <GoogleMapContainer
            activePort={portInfo}
            layers={layers}
            onSelectZone={setSelectedZone}
            zoom={zoom}
            panOffset={panOffset}
          />
        )}

        {/* Floating Compass Rose & Controls (Top Left) */}
        <View style={styles.topLeftControls} pointerEvents="auto">
          <TouchableOpacity
            style={styles.compassBox}
            onPress={handleCompassPress}
            activeOpacity={0.8}
          >
            <Text style={styles.compassN}>N</Text>
            <MaterialCommunityIcons
              name="compass-outline"
              size={24}
              color={colors.inversePrimary}
              style={{ transform: [{ rotate: `${bearing}deg` }] }}
            />
            <Text style={styles.compassBearing}>{bearing}°</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={handleZoomIn} activeOpacity={0.7}>
            <Ionicons name="add" size={24} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleZoomOut} activeOpacity={0.7}>
            <Ionicons name="remove" size={24} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.primaryContainer }]}
            onPress={handleRecenter}
            activeOpacity={0.7}
          >
            <Ionicons name="locate" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Floating Layer Controls Drawer (Top Right) */}
        <View style={styles.topRightControls}>
          <TouchableOpacity
            style={styles.hudTriggerBtn}
            onPress={() => setHudOpen(!hudOpen)}
          >
            <Ionicons name="layers-outline" size={18} color={colors.secondaryContainer} />
            <Text style={styles.hudTriggerText}>Layers</Text>
            <Ionicons
              name={hudOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.white}
            />
          </TouchableOpacity>

          {hudOpen && (
            <View style={styles.hudMenu}>
              <Text style={styles.hudTitle}>TACTICAL OVERLAYS</Text>

              <TouchableOpacity
                style={styles.layerOption}
                onPress={() => toggleLayer('pfz')}
              >
                <MaterialCommunityIcons
                  name="fish"
                  size={16}
                  color={layers.pfz ? colors.secondary : colors.gray}
                />
                <Text style={styles.layerText}>PFZ Fishing Zones</Text>
                <Ionicons
                  name={layers.pfz ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={layers.pfz ? colors.primaryContainer : colors.gray}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.layerOption}
                onPress={() => toggleLayer('risk')}
              >
                <MaterialIcons
                  name="gradient"
                  size={16}
                  color={layers.risk ? colors.riskModerate : colors.gray}
                />
                <Text style={styles.layerText}>Risk Heatmap</Text>
                <Ionicons
                  name={layers.risk ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={layers.risk ? colors.primaryContainer : colors.gray}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.layerOption}
                onPress={() => toggleLayer('geofence')}
              >
                <MaterialIcons
                  name="border-clear"
                  size={16}
                  color={layers.geofence ? colors.riskHigh : colors.gray}
                />
                <Text style={styles.layerText}>12 NM Geofence</Text>
                <Ionicons
                  name={layers.geofence ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={layers.geofence ? colors.primaryContainer : colors.gray}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.layerOption}
                onPress={() => toggleLayer('wind')}
              >
                <MaterialCommunityIcons
                  name="weather-windy"
                  size={16}
                  color={layers.wind ? colors.primaryContainer : colors.gray}
                />
                <Text style={styles.layerText}>Wind Flow Streamlines</Text>
                <Ionicons
                  name={layers.wind ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={layers.wind ? colors.primaryContainer : colors.gray}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Selected Zone Bottom Card */}
        {selectedZone && (
          <View style={styles.selectedZoneCard}>
            <View style={styles.zoneCardHeader}>
              <View style={styles.zoneTitleGroup}>
                <Text style={styles.zoneTag}>{selectedZone.name}</Text>
                <Text style={styles.zoneTitle}>{selectedZone.title}</Text>
              </View>
              <View style={styles.zoneConfBadge}>
                <Text style={styles.zoneConfText}>{selectedZone.confidence}% CONF</Text>
              </View>
            </View>

            <View style={styles.zoneMetricsRow}>
              <View style={styles.zoneMetricItem}>
                <Text style={styles.metricLabelText}>DISTANCE</Text>
                <Text style={styles.metricValueText}>{selectedZone.distance}</Text>
              </View>
              <View style={styles.zoneMetricItem}>
                <Text style={styles.metricLabelText}>SST TEMP</Text>
                <Text style={styles.metricValueText}>{selectedZone.sst}</Text>
              </View>
              <View style={styles.zoneMetricItem}>
                <Text style={styles.metricLabelText}>CHLOROPHYLL</Text>
                <Text style={styles.metricValueText}>{selectedZone.chl}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.zoneNavBtn}
              onPress={() => navigation.navigate('PFZ')}
            >
              <Ionicons name="navigate" size={16} color={colors.white} />
              <Text style={styles.zoneNavBtnText}>Inspect Fishing Zone Details</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurface,
  },
  bathyText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  webMapCanvas: {
    flex: 1,
    backgroundColor: colors.inverseSurface,
    position: 'relative',
    overflow: 'hidden',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFill,
    padding: 16,
    justifyContent: 'space-around',
    opacity: 0.5,
  },
  isobath20: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inversePrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.inversePrimary,
    paddingBottom: 4,
  },
  isobath50: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inversePrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.inversePrimary,
    paddingBottom: 4,
  },
  isobath100: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.inversePrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.inversePrimary,
    paddingBottom: 4,
  },
  webGeofenceLine: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    borderBottomWidth: 2,
    borderBottomColor: colors.riskHigh,
    borderStyle: 'dashed',
    alignItems: 'center',
    paddingBottom: 4,
  },
  webGeofenceText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.errorContainer,
    letterSpacing: 1,
  },
  webPfzZone1: {
    position: 'absolute',
    top: 60,
    left: 40,
    width: 220,
    height: 110,
    backgroundColor: 'rgba(0, 200, 100, 0.25)',
    borderWidth: 2,
    borderColor: colors.secondaryContainer,
    borderRadius: 16,
    padding: 10,
  },
  webPfzZone2: {
    position: 'absolute',
    top: 200,
    right: 30,
    width: 200,
    height: 90,
    backgroundColor: 'rgba(0, 100, 255, 0.25)',
    borderWidth: 2,
    borderColor: colors.onPrimaryContainer,
    borderRadius: 16,
    padding: 10,
  },
  webZoneLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  webVesselPoint: {
    position: 'absolute',
    top: 140,
    left: 160,
    alignItems: 'center',
  },
  webVesselTag: {
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  webVesselTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  vesselMarker: {
    backgroundColor: colors.surfaceContainerLowest,
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primaryContainer,
  },
  topLeftControls: {
    position: 'absolute',
    top: 14,
    left: 14,
    gap: 8,
    zIndex: 999,
    elevation: 10,
  },
  compassBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.inverseSurface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  compassN: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.error,
  },
  compassBearing: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.inverseOnSurface,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerLowest,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
  },
  topRightControls: {
    position: 'absolute',
    top: 14,
    right: 14,
    alignItems: 'flex-end',
  },
  hudTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.inverseSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 4,
  },
  hudTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inverseOnSurface,
    textTransform: 'uppercase',
  },
  hudMenu: {
    marginTop: 8,
    width: 220,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 12,
    elevation: 6,
    gap: 8,
  },
  hudTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
  },
  layerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    padding: 8,
    borderRadius: 6,
  },
  layerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurface,
    marginLeft: 6,
  },
  selectedZoneCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  zoneCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  zoneTitleGroup: {
    flex: 1,
  },
  zoneTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryContainer,
  },
  zoneTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
  },
  zoneConfBadge: {
    backgroundColor: colors.secondaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  zoneConfText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onSecondaryContainer,
  },
  zoneMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  zoneMetricItem: {
    alignItems: 'center',
  },
  metricLabelText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  metricValueText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onSurface,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  zoneNavBtn: {
    backgroundColor: colors.primaryContainer,
    height: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  zoneNavBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});
