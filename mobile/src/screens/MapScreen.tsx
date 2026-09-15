import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/userStore';
import { GoogleMapContainer } from '../components/GoogleMapContainer';
import { INDIAN_PORTS } from '../constants/portsAndLanguages';
import { useNetworkStore } from '../store/networkStore';
import { downloadOfflineBundle, formatRelativeTime } from '../services/offlineService';
import { getMapCacheMeta, MapCacheMeta, getCachedPfzZonesDb, getCachedBoundariesDb, CachedPfzZone, CachedBoundary } from '../services/mapCacheDb';
import { geojsonAPI, oceanAPI, RiskHeatmapFeature, RiskHeatmapResponse, GeoJsonFeatureCollection } from '../services/api';
import { geometryToSegments } from '../utils/geoJsonToMap';
import { getScreenText } from '../constants/screenTranslations';

// Static Maps API URLs have a practical length ceiling — cap how many risk
// markers get appended so we never build an oversized/rejected image request
// on the web/fallback path (GoogleMapContainer). Native react-native-maps has
// no such URL limit, but it's kept for the shared nearest-N logic below too.
const MAX_RISK_MARKERS = 40;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

let MapView: any = null;
let Polyline: any = null;
let Marker: any = null;
let Circle: any = null;
let PROVIDER_GOOGLE: any = undefined;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Polyline = Maps.Polyline;
    Marker = Maps.Marker;
    Circle = Maps.Circle;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  } catch {
    // Native maps fallback
  }
}

export function MapScreen({ navigation }: any) {
  const { operatingPort, portInfo, getLanguageInfo } = useUserStore();
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);
  const isOnline = useNetworkStore((s) => s.isOnline);

  // Offline map caching (SQLite via mapCacheDb.ts) — pre-fetch trigger so a
  // fisherman can cache this port's PFZ zones/boundaries/landing centers
  // before losing signal, without having to go find the same button buried
  // in Profile. Downloads the same offline bundle Profile's button does —
  // one shared cache, two entry points to it.
  const [mapCacheMeta, setMapCacheMeta] = useState<MapCacheMeta | null>(null);
  const [cachingMap, setCachingMap] = useState(false);
  const [cacheError, setCacheError] = useState('');

  useEffect(() => {
    getMapCacheMeta().then(setMapCacheMeta);
  }, []);

  const handleCacheMap = async () => {
    if (!isOnline) {
      setCacheError(t.map.needInternetToCache);
      setTimeout(() => setCacheError(''), 3000);
      return;
    }
    setCachingMap(true);
    setCacheError('');
    try {
      await downloadOfflineBundle(portInfo.latitude, portInfo.longitude, 5);
      setMapCacheMeta(await getMapCacheMeta());
    } catch {
      setCacheError(t.map.couldNotCacheMap);
      setTimeout(() => setCacheError(''), 3000);
    } finally {
      setCachingMap(false);
    }
  };

  const [hudOpen, setHudOpen] = useState(false);
  // Owned here (not inside GoogleMapContainer) so its toggle button can sit
  // in the same top-right control column as Cache/Layers, instead of a
  // separate header bar competing with the top-left compass for space.
  const [mapMode, setMapMode] = useState<'satellite' | 'vector'>('satellite');
  const [zoom, setZoom] = useState(11);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [bearing, setBearing] = useState(285);

  // Collapsible bottom zone card state
  const [isZoneCardCollapsed, setIsZoneCardCollapsed] = useState(false);

  const panOffsetRef = useRef(panOffset);
  panOffsetRef.current = panOffset;
  const panStartRef = useRef({ x: 0, y: 0 });

  // Only layers that actually render something (risk circles, PFZ lines,
  // boundary lines) are toggleable. sst/wind/bathymetry were previously
  // present here and in the layer menu but never consumed by any renderer —
  // fake toggles implying features that didn't exist.
  const [layers, setLayers] = useState({
    risk: true,
    pfz: true,
    geofence: true,
    landing: true,
  });

  // Risk heatmap overlay (backend: src/services/risk_heatmap.py via
  // GET /geojson/risk, 30-min server-side cache). Fetched only while the
  // Risk layer toggle is on and only over a live connection — this map
  // screen has no offline fallback for it (nothing cached for it yet), so a
  // failed/offline fetch just means no dots, not a crash or stale display.
  const [riskData, setRiskData] = useState<RiskHeatmapResponse | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState('');

  useEffect(() => {
    if (!layers.risk || !isOnline || riskData || riskLoading) return;
    setRiskLoading(true);
    setRiskError('');
    geojsonAPI
      .getRisk(1.0)
      .then(setRiskData)
      .catch(() => setRiskError(t.map.couldNotLoadRisk))
      .finally(() => setRiskLoading(false));
  }, [layers.risk, isOnline]);

  // Nearest points only — keeps the native Static Maps marker URL short and
  // keeps the overlay relevant to where the fisherman actually is, rather
  // than plotting all ~150-800 EEZ-wide grid points at once.
  // Memoized like pfzFeatures/boundaryFeatures below — without this, the
  // sort+slice reran (and produced new array/object references) on every
  // render, needlessly re-rendering every native risk Circle, rebuilding
  // the web overlay redraw effect, and reloading the native Static-Maps
  // fallback image, on every render rather than only when the underlying
  // risk data or port actually changes.
  const nearestRiskFeatures: RiskHeatmapFeature[] = React.useMemo(
    () =>
      riskData
        ? [...riskData.features]
            .sort(
              (a, b) =>
                haversineKm(portInfo.latitude, portInfo.longitude, a.geometry.coordinates[1], a.geometry.coordinates[0]) -
                haversineKm(portInfo.latitude, portInfo.longitude, b.geometry.coordinates[1], b.geometry.coordinates[0])
            )
            .slice(0, MAX_RISK_MARKERS)
        : [],
    [riskData, portInfo.latitude, portInfo.longitude]
  );

  // Real PFZ zones + maritime boundaries — fetched for EVERY platform now.
  // Native renders them via react-native-maps' <Polyline>; web renders them
  // via the real Google Maps JavaScript API in GoogleMapContainer (no longer
  // the old Embed-iframe approach, which couldn't draw overlays at all).
  // Live fetch first, same convention as Chat/PFZ/Alerts/Dashboard; falls
  // back to the SQLite cache (mapCacheDb.ts, populated by "Cache map for
  // offline" — a no-op returning [] on web, where there's no native SQLite)
  // only if the live call fails or we're already offline.
  const [pfzGeo, setPfzGeo] = useState<GeoJsonFeatureCollection | CachedPfzZone[] | null>(null);
  const [boundariesGeo, setBoundariesGeo] = useState<GeoJsonFeatureCollection | CachedBoundary[] | null>(null);

  useEffect(() => {
    (async () => {
      if (isOnline) {
        try {
          const [pfz, boundaries] = await Promise.all([geojsonAPI.getPFZ(), geojsonAPI.getBoundaries()]);
          setPfzGeo(pfz);
          setBoundariesGeo(boundaries);
          return;
        } catch (err) {
          console.error('[MapScreen] Live geojson fetch failed, trying SQLite cache:', err);
        }
      }
      const [cachedPfz, cachedBoundaries] = await Promise.all([getCachedPfzZonesDb(), getCachedBoundariesDb()]);
      setPfzGeo(cachedPfz);
      setBoundariesGeo(cachedBoundaries);
    })();
  }, [isOnline]);

  // Normalize both possible shapes (live GeoJSON FeatureCollection vs. the
  // SQLite cache's already-flat row array) into one list of {name, geometry}.
  // Memoized on the raw fetch results only — without this, every re-render
  // (e.g. every drag frame, every layer toggle) rebuilt these arrays with new
  // references, which cascaded into recomputing geometryToSegments and
  // remounting every Polyline below.
  const pfzFeatures: { name: string; sector: string; geometry: any }[] = React.useMemo(
    () =>
      !pfzGeo
        ? []
        : Array.isArray(pfzGeo)
          ? pfzGeo.map((z) => ({ name: z.name, sector: z.sector, geometry: z.geometry }))
          : pfzGeo.features.map((f, i) => ({
              name: (f.properties.SECTORNAME || '').trim() || `PFZ-${f.properties.UID ?? i}`,
              sector: (f.properties.SECTORNAME || '').trim(),
              geometry: f.geometry,
            })),
    [pfzGeo]
  );

  const boundaryFeatures: { name: string; geometry: any }[] = React.useMemo(
    () =>
      !boundariesGeo
        ? []
        : Array.isArray(boundariesGeo)
          ? boundariesGeo.map((b) => ({ name: b.name, geometry: b.geometry }))
          : boundariesGeo.features.map((f, i) => ({
              name: f.properties.LINE_NAME || f.properties.GEONAME || `Boundary ${i}`,
              geometry: f.geometry,
            })),
    [boundariesGeo]
  );

  // Pre-flatten geometry → line segments once per data change, instead of
  // inside the render's .map() (which re-ran geometryToSegments on every
  // MapScreen re-render, including every drag frame).
  const boundarySegments = React.useMemo(
    () => boundaryFeatures.map((b) => ({ b, segments: geometryToSegments(b.geometry) })),
    [boundaryFeatures]
  );
  const pfzSegments = React.useMemo(
    () => pfzFeatures.map((z) => ({ z, segments: geometryToSegments(z.geometry) })),
    [pfzFeatures]
  );

  // Fish landing centers — real LANDING-LOCATIONS.geojson (1223 points, see
  // backend/main.py's /geojson/landing), rendered as tappable pins. Fetched
  // once (not port-scoped like risk) since it's a fixed nationwide dataset;
  // same live-first pattern as PFZ/boundaries above, online-only for now
  // (no SQLite fallback yet — matches how the risk layer already behaves).
  const [landingGeo, setLandingGeo] = useState<GeoJsonFeatureCollection | null>(null);
  const [landingError, setLandingError] = useState('');

  useEffect(() => {
    if (!isOnline || landingGeo) return;
    geojsonAPI
      .getLanding()
      .then(setLandingGeo)
      .catch(() => setLandingError(t.map.couldNotLoadLanding));
  }, [isOnline, landingGeo]);

  const landingFeatures: { id: string; name: string; district: string; sector: string; latitude: number; longitude: number }[] =
    React.useMemo(
      () =>
        !landingGeo
          ? []
          : landingGeo.features.map((f, i) => ({
              id: f.properties.LC_UNIQUE_ || `landing-${i}`,
              name: f.properties.LC_NAME || 'Landing Center',
              district: f.properties.DIST_NAME || '',
              sector: f.properties.SECTOR_NAM || '',
              latitude: f.geometry.coordinates[1],
              longitude: f.geometry.coordinates[0],
            })),
      [landingGeo]
    );

  // No fabricated default — the card only appears once the fisherman taps a
  // real PFZ line, boundary, landing pin, or (on the web/Static-Maps path) a
  // PFZ hotspot.
  const [selectedZone, setSelectedZone] = useState<any>(null);

  // Tapping a landing pin shows its real coordinates immediately, then fills
  // in SST/Chlorophyll from the Copernicus grid once the lookup resolves
  // (GET /ocean/point) — never fabricated, and explicitly "loading" in the
  // interim rather than silently blank.
  const handleSelectLandingSite = (site: { name: string; district: string; sector: string; latitude: number; longitude: number }) => {
    const coordsText = `${site.latitude.toFixed(4)}°, ${site.longitude.toFixed(4)}°`;
    setSelectedZone({
      name: site.name,
      title: [site.sector, site.district].filter(Boolean).join(' • ') || t.map.landingCenterTitle,
      distance: `${haversineKm(portInfo.latitude, portInfo.longitude, site.latitude, site.longitude).toFixed(1)} km`,
      coords: coordsText,
      confidence: null,
      sst: isOnline ? t.map.loadingOceanData : t.pfz.notAvailable,
      chl: isOnline ? t.map.loadingOceanData : t.pfz.notAvailable,
    });

    if (!isOnline) return;
    oceanAPI
      .getPoint(site.latitude, site.longitude)
      .then((point) => {
        setSelectedZone((prev: any) =>
          prev && prev.coords === coordsText
            ? {
                ...prev,
                sst: point.available && point.sst_c != null ? `${point.sst_c.toFixed(1)}°C` : t.pfz.notAvailable,
                chl: point.available && point.chlorophyll_mg_m3 != null ? `${point.chlorophyll_mg_m3.toFixed(2)} mg/m³` : t.pfz.notAvailable,
              }
            : prev
        );
      })
      .catch(() => {
        setSelectedZone((prev: any) =>
          prev && prev.coords === coordsText ? { ...prev, sst: t.pfz.notAvailable, chl: t.pfz.notAvailable } : prev
        );
      });
  };

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
          // Native MapView has its own built-in pan/zoom gestures and never
          // reads panOffset — it's only consumed by the web/GoogleMapContainer
          // fallback. Updating it here on every touch-move event was forcing
          // a full MapScreen re-render (and re-computation of every PFZ/
          // boundary segment + re-rasterization of every port marker bitmap)
          // on every frame of a native drag, which is what caused the lag
          // and crashes.
          if (Platform.OS === 'web') {
            setPanOffset({
              x: panStartRef.current.x + gestureState.dx,
              y: panStartRef.current.y + gestureState.dy,
            });
          }
        },
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      {/* Map Viewport with PanResponder Drag Handlers — controls and info
          cards stay on-screen at all times, including while panning/hovering. */}
      <View style={styles.mapContainer} {...panResponder.panHandlers}>
        {Platform.OS !== 'web' && MapView ? (
          <MapView
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            initialRegion={initialRegion}
            showsUserLocation={false}
          >
            {/* Maritime boundaries — real INDIAN-WATER-BOUNDARIES.geojson / INDIA-EEZ.geojson
                line geometry (see backend/main.py's /geojson/boundaries), not a fabricated shape. */}
            {layers.geofence && Polyline &&
              boundarySegments.map(({ b, segments }, i) =>
                segments.map((segment, j) => (
                  <Polyline
                    key={`boundary-${i}-${j}`}
                    coordinates={segment}
                    strokeColor={colors.riskHigh}
                    strokeWidth={2}
                    lineDashPattern={[8, 4]}
                    tappable
                    onPress={() =>
                      setSelectedZone({
                        name: b.name,
                        title: t.map.maritimeBoundaryTitle,
                        distance: '—',
                        bearing: '—',
                        confidence: null,
                        sst: '—',
                        chl: '—',
                      })
                    }
                  />
                ))
              )}

            {/* PFZ zones — real PFZ.geojson MultiLineString transects (52 nationwide,
                see backend/src/utils/geo.py's docstring). Rendered as lines, matching
                the actual geometry type — not fabricated filled polygons. */}
            {layers.pfz && Polyline &&
              pfzSegments.map(({ z, segments }, i) =>
                segments.map((segment, j) => (
                  <Polyline
                    key={`pfz-${i}-${j}`}
                    coordinates={segment}
                    strokeColor={colors.riskLow}
                    strokeWidth={3}
                    tappable
                    onPress={() =>
                      setSelectedZone({
                        name: z.name,
                        title: z.sector || `${portInfo.name} PFZ Sector`,
                        distance: `${haversineKm(portInfo.latitude, portInfo.longitude, segment[0]?.latitude ?? portInfo.latitude, segment[0]?.longitude ?? portInfo.longitude).toFixed(1)} km`,
                        bearing: '—',
                        confidence: null,
                        sst: '—',
                        chl: '—',
                      })
                    }
                  />
                ))
              )}

            {/* Risk heatmap — real risk_heatmap.py data as genuine semi-transparent
                circles (react-native-maps supports this natively; the web/Static-Maps
                fallback in GoogleMapContainer can only approximate with colored pins). */}
            {layers.risk && Circle &&
              nearestRiskFeatures.map((f, i) => (
                <Circle
                  key={`risk-${i}`}
                  center={{ latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0] }}
                  // Softer/smaller than the original 18km, full-opacity fill —
                  // that rendered as one dominating solid blob rather than a
                  // heat "point". Capping opacity keeps it a glow, not a wall.
                  radius={6000}
                  fillColor={`${f.properties.color}${Math.round(Math.min(f.properties.opacity, 0.45) * 255).toString(16).padStart(2, '0')}`}
                  strokeColor={f.properties.color}
                  strokeWidth={0.5}
                />
              ))}

            {/* Fish landing centers — real LANDING-LOCATIONS.geojson pins (see
                backend/main.py's /geojson/landing), tap for coords + live
                SST/Chlorophyll. tracksViewChanges={false} for the same
                perf reason as the port markers below — with ~1223 pins,
                re-rasterizing on every render would be far worse. */}
            {layers.landing && Marker &&
              landingFeatures.map((site) => (
                <Marker
                  key={site.id}
                  coordinate={{ latitude: site.latitude, longitude: site.longitude }}
                  title={site.name}
                  description={[site.sector, site.district].filter(Boolean).join(' • ')}
                  tracksViewChanges={false}
                  onPress={() => handleSelectLandingSite(site)}
                >
                  <View style={styles.landingPin}>
                    <MaterialCommunityIcons name="anchor" size={12} color={colors.onSecondaryContainer} />
                  </View>
                </Marker>
              ))}

            {Marker && (
              <>
                {INDIAN_PORTS.map((port) => (
                  <Marker
                    key={port.id}
                    coordinate={{ latitude: port.latitude, longitude: port.longitude }}
                    title={`📍 ${port.name} Port (${port.state})`}
                    description={`${port.region} • ${port.sea}`}
                    // Custom-icon markers default to tracksViewChanges=true,
                    // which re-rasterizes the marker's bitmap on EVERY
                    // re-render of the map, not just when it actually
                    // changes. With ~10+ static port markers this was the
                    // main cause of the lag/crashes on Android.
                    tracksViewChanges={false}
                  >
                    <View
                      style={[
                        styles.portPin,
                        port.name === portInfo.name && styles.activePortPin,
                      ]}
                    >
                      <Ionicons
                        name="location"
                        size={port.name === portInfo.name ? 26 : 18}
                        color={port.name === portInfo.name ? colors.error : colors.primaryContainer}
                      />
                    </View>
                  </Marker>
                ))}
                <Marker
                  coordinate={{ latitude: portInfo.latitude, longitude: portInfo.longitude }}
                  title={`MY VESSEL (${operatingPort})`}
                  // No description — this marks the operating PORT, not a
                  // live GPS fix (the app has no real vessel-position feed).
                  // A fixed "8.4 KTS • 285° WNW" used to be shown here as if
                  // it were live telemetry, for every port, always.
                  tracksViewChanges={false}
                >
                  <View style={styles.vesselMarker}>
                    <MaterialCommunityIcons name="navigation" size={24} color={colors.primaryContainer} />
                  </View>
                </Marker>
              </>
            )}
          </MapView>
        ) : (
          <GoogleMapContainer
            activePort={portInfo}
            layers={layers}
            onSelectZone={setSelectedZone}
            zoom={zoom}
            panOffset={panOffset}
            riskPoints={nearestRiskFeatures}
            riskSummary={riskData?.metadata.risk_counts ?? null}
            riskLoading={riskLoading}
            riskError={riskError}
            pfzFeatures={pfzFeatures}
            boundaryFeatures={boundaryFeatures}
            landingFeatures={landingFeatures}
            onSelectLandingSite={handleSelectLandingSite}
            mapMode={mapMode}
          />
        )}

        {/* Floating Controls (Top Left) — always on-screen, including while
            panning/hovering the map, so they don't flicker away mid-use. */}
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

          {/* Zoom In (+), Zoom Out (-), and Recenter (locate) */}
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
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: '#071A33', borderWidth: 1, borderColor: '#38BDF8' }]}
            onPress={() => navigation?.navigate('Compass')}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="compass-rose" size={22} color="#38BDF8" />
          </TouchableOpacity>
        </View>

        {/* Floating Layer Controls Drawer (Top Right) — always on-screen */}
        <View style={styles.topRightControls}>
          {/* Satellite/vector map-style toggle — only meaningful on the
                GoogleMapContainer render path (web, or native fallback when
                react-native-maps isn't available); the real native MapView
                has no separate "vector" mode to switch to. */}
            {(Platform.OS === 'web' || !MapView) && (
              <TouchableOpacity
                style={styles.mapModeBtn}
                onPress={() => setMapMode((m) => (m === 'satellite' ? 'vector' : 'satellite'))}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={mapMode === 'satellite' ? 'earth' : 'map'}
                  size={14}
                  color={colors.secondaryContainer}
                />
                <Text style={styles.mapModeBtnText}>
                  {mapMode === 'satellite' ? 'Satellite' : 'India Map'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Offline map cache pre-fetch trigger */}
            <TouchableOpacity
              style={[styles.cacheMapBtn, (cachingMap || !isOnline) && { opacity: 0.7 }]}
              onPress={handleCacheMap}
              disabled={cachingMap}
              activeOpacity={0.8}
            >
              {cachingMap ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons
                  name={mapCacheMeta ? 'checkmark-circle' : 'cloud-download-outline'}
                  size={14}
                  color={mapCacheMeta ? '#4ADE80' : colors.secondaryContainer}
                />
              )}
              <Text style={styles.cacheMapBtnText}>
                {cachingMap
                  ? t.map.cachingMap
                  : !isOnline
                    ? t.map.offlineLabel
                    : mapCacheMeta
                      ? `${t.map.cachedLabel} ${formatRelativeTime(mapCacheMeta.syncedAt)}`
                      : t.map.cacheOffline}
              </Text>
            </TouchableOpacity>

            {cacheError ? (
              <View style={styles.cacheErrorBanner}>
                <Text style={styles.cacheErrorText}>{cacheError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.hudTriggerBtn}
              onPress={() => setHudOpen(!hudOpen)}
            >
              <Ionicons name="layers-outline" size={18} color={colors.secondaryContainer} />
              <Text style={styles.hudTriggerText}>{t.map.layers}</Text>
              <Ionicons
                name={hudOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.white}
              />
            </TouchableOpacity>

            {hudOpen && (
              <View style={styles.hudMenu}>
                <Text style={styles.hudTitle}>{t.map.tacticalOverlays}</Text>

                <TouchableOpacity
                  style={styles.layerOption}
                  onPress={() => toggleLayer('pfz')}
                >
                  <MaterialCommunityIcons
                    name="fish"
                    size={16}
                    color={layers.pfz ? colors.secondary : colors.gray}
                  />
                  <Text style={styles.layerText}>{t.map.pfzZones}</Text>
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
                  <Text style={styles.layerText}>{t.map.riskHeatmap}</Text>
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
                  <Text style={styles.layerText}>{t.map.geofenceLayer}</Text>
                  <Ionicons
                    name={layers.geofence ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={layers.geofence ? colors.primaryContainer : colors.gray}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.layerOption}
                  onPress={() => toggleLayer('landing')}
                >
                  <MaterialCommunityIcons
                    name="anchor"
                    size={16}
                    color={layers.landing ? colors.secondary : colors.gray}
                  />
                  <Text style={styles.layerText}>{t.map.landingCentersLayer}</Text>
                  <Ionicons
                    name={layers.landing ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={layers.landing ? colors.primaryContainer : colors.gray}
                  />
                </TouchableOpacity>
              </View>
            )}
        </View>

        {/* Selected Zone Bottom Card - Collapsible, always on-screen when a zone is selected */}
        {selectedZone && (
          <View style={styles.selectedZoneCard}>
            <TouchableOpacity
              style={[
                styles.zoneCardHeader,
                isZoneCardCollapsed && { marginBottom: 0 },
              ]}
              onPress={() => setIsZoneCardCollapsed(!isZoneCardCollapsed)}
              activeOpacity={0.8}
            >
              <View style={styles.zoneTitleGroup}>
                <Text style={styles.zoneTag}>{selectedZone.name}</Text>
                <Text style={styles.zoneTitle}>{selectedZone.title}</Text>
              </View>

              <View style={styles.headerRightRow}>
                <View style={styles.zoneConfBadge}>
                  <Text style={styles.zoneConfText}>
                    {selectedZone.confidence != null ? `${selectedZone.confidence}% CONF` : t.pfz.notAvailable}
                  </Text>
                </View>
                <Ionicons
                  name={isZoneCardCollapsed ? 'chevron-up-circle' : 'chevron-down-circle'}
                  size={22}
                  color={colors.primaryContainer}
                />
              </View>
            </TouchableOpacity>

            {!isZoneCardCollapsed && (
              <>
                <View style={styles.zoneMetricsRow}>
                  {selectedZone.coords ? (
                    <View style={styles.zoneMetricItem}>
                      <Text style={styles.metricLabelText}>{t.pfz.coordinates}</Text>
                      <Text style={styles.metricValueText}>{selectedZone.coords}</Text>
                    </View>
                  ) : null}
                  <View style={styles.zoneMetricItem}>
                    <Text style={styles.metricLabelText}>{t.pfz.distance}</Text>
                    <Text style={styles.metricValueText}>{selectedZone.distance}</Text>
                  </View>
                  <View style={styles.zoneMetricItem}>
                    <Text style={styles.metricLabelText}>{t.pfz.sstTemp}</Text>
                    <Text style={styles.metricValueText}>{selectedZone.sst}</Text>
                  </View>
                  <View style={styles.zoneMetricItem}>
                    <Text style={styles.metricLabelText}>{t.pfz.chlorophyll}</Text>
                    <Text style={styles.metricValueText}>{selectedZone.chl}</Text>
                  </View>
                </View>

                {!selectedZone.coords && (
                  <TouchableOpacity
                    style={styles.zoneNavBtn}
                    onPress={() => navigation.navigate('PFZ')}
                  >
                    <Ionicons name="navigate" size={16} color={colors.white} />
                    <Text style={styles.zoneNavBtnText}>{t.map.inspectZoneDetails}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
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
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  vesselMarker: {
    backgroundColor: colors.surfaceContainerLowest,
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.primaryContainer,
  },
  portPin: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primaryContainer,
  },
  activePortPin: {
    backgroundColor: '#FFFFFF',
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.error,
    elevation: 4,
  },
  landingPin: {
    backgroundColor: colors.secondaryContainer,
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.onSecondaryContainer,
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
    gap: 8,
  },
  mapModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.inverseSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 4,
  },
  mapModeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inverseOnSurface,
  },
  cacheMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.inverseSurface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 4,
  },
  cacheMapBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inverseOnSurface,
  },
  cacheErrorBanner: {
    backgroundColor: 'rgba(220, 38, 38, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: 220,
  },
  cacheErrorText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
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
    // On wide/web viewports a full-bleed card left the 3-4 metric columns
    // stranded with huge empty gaps between them — cap and center it like a
    // proper card instead of stretching edge-to-edge.
    maxWidth: 460,
    alignSelf: 'center',
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
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 22,
    rowGap: 10,
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  zoneMetricItem: {
    alignItems: 'center',
    minWidth: 72,
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
