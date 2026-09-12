import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { pfzAPI } from '../services/api';
import { useUserStore } from '../store/userStore';
import { getCachedBundleForOffline, findNearestZonesOffline, formatRelativeTime } from '../services/offlineService';
import { useNetworkStore } from '../store/networkStore';
import { getScreenText } from '../constants/screenTranslations';

export function PFZScreen({ navigation }: any) {
  const { vesselType, getVesselRangeKm, operatingPort, portInfo, getLanguageInfo } = useUserStore();
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);
  const maxRangeKm = getVesselRangeKm();

  const isOnline = useNetworkStore((s) => s.isOnline);
  const [loading, setLoading] = useState(false);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [offlineAsOf, setOfflineAsOf] = useState<string | null>(null);
  const [selectedInspectZone, setSelectedInspectZone] = useState<any>(null);

  // No fabricated placeholder zones — starts empty and only ever shows real
  // /pfz/nearest data (live) or real cached PFZ geometry (offline fallback).
  const [zones, setZones] = useState<any[]>([]);

  useEffect(() => {
    loadZones();
  }, [operatingPort]);

  const loadZones = async () => {
    setLoading(true);
    try {
      if (!isOnline) throw new Error('No network connection (known offline)');
      const data = await pfzAPI.getNearest(portInfo.latitude, portInfo.longitude);
      if (data && data.length > 0) {
        // Only fields the backend actually computes (see main.py's
        // /pfz/nearest — real Haversine distance, real bearing, real
        // Copernicus SST/chlorophyll lookup when available, real
        // distance-derived confidence). No invented depth, species, or
        // evidence bullets — dataNote carries the backend's own honest note
        // about where the SST/chlorophyll number came from (or that it's
        // unavailable).
        const formatted = data.map((z, idx) => ({
          id: (idx + 1).toString(),
          name: z.name || `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-${(idx + 1) * 6}`,
          subtitle: `${portInfo.name} Sector #${idx + 1}`,
          distance: z.distance,
          bearing: z.bearing,
          estArrival: z.distance != null ? `${Math.round((z.distance / 11) * 60)}m @ 11 kts` : '—',
          sst: z.sst,
          chl: z.chl,
          confidence: z.confidence,
          dataNote: z.dataNote,
        }));
        setZones(formatted);
        setIsOfflineData(false);
      }
    } catch (err) {
      console.error('[PFZScreen] Live /pfz/nearest call failed, trying offline cache:', err);
      // Live call failed — only now fall back to the cached bundle's nearest
      // zones (real PFZ geometry, just no live SST/chlorophyll refresh).
      try {
        const bundle = await getCachedBundleForOffline();
        if (bundle) {
          const nearest = findNearestZonesOffline(bundle, portInfo.latitude, portInfo.longitude, 5);
          if (nearest.length > 0) {
            const formatted = nearest.map((z, idx) => ({
              id: (idx + 1).toString(),
              name: z.name,
              subtitle: `${portInfo.name} Sector #${idx + 1} (cached)`,
              distance: z.distance_km,
              bearing: '—',
              estArrival: `${Math.round((z.distance_km / 11) * 60)}m @ 11 kts`,
              sst: null,
              chl: null,
              confidence: null,
              dataNote: null,
            }));
            setZones(formatted);
            setIsOfflineData(true);
            setOfflineAsOf(bundle.metadata.created);
          }
        }
      } catch {
        // No cached bundle either — leave the existing (static placeholder) zones.
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Vessel Capability & Port Info Bar */}
        <View style={styles.vesselInfoBar}>
          <View style={styles.vesselInfoLeft}>
            <MaterialCommunityIcons name="sail-boat" size={20} color={colors.white} />
            <View>
              <Text style={styles.vesselBarTitle}>
                {vesselType.toUpperCase()} BOAT • {operatingPort.toUpperCase()} PORT ({portInfo.state.toUpperCase()})
              </Text>
              <Text style={styles.vesselBarSub}>{t.pfz.operatingRange}: Max {maxRangeKm} km offshore</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Ionicons name="settings-outline" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroBadge}>
              <MaterialCommunityIcons name="radar" size={16} color={colors.secondaryContainer} />
              <Text style={styles.heroBadgeText}>{operatingPort} • {portInfo.sea}</Text>
            </View>
            {zones.length > 0 && zones[0].distance != null && (
              <View style={styles.nearestBadge}>
                <Text style={styles.nearestText}>{zones[0].distance} {t.pfz.nearestSuffix}</Text>
              </View>
            )}
          </View>

          <View style={styles.heroFooter}>
            <Text style={styles.heroCategory}>{portInfo.region}</Text>
            <Text style={styles.heroTitle}>{portInfo.name} {langInfo.uiText.fishingZones}</Text>
          </View>
        </View>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity style={styles.filterChipActive}>
            <Ionicons name="navigate-outline" size={14} color={colors.white} />
            <Text style={styles.filterTextActive}>{t.pfz.rangeLabel} (≤ {maxRangeKm}km)</Text>
          </TouchableOpacity>
        </ScrollView>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primaryContainer} />
            <Text style={styles.loadingText}>{t.pfz.fetching}</Text>
          </View>
        )}

        {!loading && isOfflineData && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.tertiary} />
            <Text style={styles.offlineBannerText}>
              {t.pfz.offlineNotice} ({formatRelativeTime(offlineAsOf)})
            </Text>
          </View>
        )}

        {/* Ranked PFZ List */}
        {zones.map((zone, index) => {
          const isFeasible = zone.distance <= maxRangeKm;

          return (
            <View key={zone.id} style={styles.zoneCard}>
              <View style={styles.cardTopRow}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{index + 1}</Text>
                </View>
                <View style={styles.titleCol}>
                  <Text style={styles.zoneName}>{zone.name}</Text>
                  <Text style={styles.zoneSub}>{zone.subtitle}</Text>
                </View>
                <View style={styles.confBadge}>
                  <MaterialIcons name="verified" size={16} color={colors.secondary} />
                  <Text style={styles.confText}>
                    {zone.confidence != null ? `${zone.confidence}%` : t.pfz.notAvailable}
                  </Text>
                </View>
              </View>

              {/* Feasibility Range Tag */}
              <View
                style={[
                  styles.feasibilityTag,
                  { backgroundColor: isFeasible ? colors.secondaryContainer : colors.errorContainer },
                ]}
              >
                <Ionicons
                  name={isFeasible ? 'checkmark-circle' : 'alert-circle'}
                  size={14}
                  color={isFeasible ? colors.onSecondaryContainer : colors.onErrorContainer}
                />
                <Text
                  style={[
                    styles.feasibilityText,
                    { color: isFeasible ? colors.onSecondaryContainer : colors.onErrorContainer },
                  ]}
                >
                  {isFeasible
                    ? `${t.pfz.feasible} (${maxRangeKm}km ${vesselType})`
                    : `${t.pfz.beyondRange} (> ${maxRangeKm}km)`}
                </Text>
              </View>

              {/* Distance & Arrival Box */}
              <View style={styles.distBox}>
                <View style={styles.distItem}>
                  <Ionicons name="compass-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={styles.distLabel}>{t.pfz.distance}</Text>
                    <Text style={styles.distVal}>
                      {zone.distance != null ? `${zone.distance} NM` : t.pfz.notAvailable}
                      {zone.bearing ? ` (${zone.bearing})` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.distItem}>
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={styles.distLabel}>{t.pfz.estArrival}</Text>
                    <Text style={styles.distVal}>{zone.estArrival}</Text>
                  </View>
                </View>
              </View>

              {/* Telemetry Row — only real backend fields (SST/chlorophyll from
                  the Copernicus grid when available, null otherwise). No
                  fabricated depth/bathymetry — the backend doesn't provide it. */}
              <View style={styles.telemetryRow}>
                <View style={styles.telemetryCard}>
                  <Text style={styles.telLabel}>{t.pfz.sstTemp}</Text>
                  <Text style={styles.telValue}>{zone.sst != null ? `${zone.sst}°C` : t.pfz.notAvailable}</Text>
                  <Text style={styles.telStatus}>{zone.sst != null ? '' : t.pfz.offlineStatus}</Text>
                </View>
                <View style={styles.telemetryCard}>
                  <Text style={styles.telLabel}>{t.pfz.chlorophyll}</Text>
                  <Text style={styles.telValue}>{zone.chl != null ? `${zone.chl}mg` : t.pfz.notAvailable}</Text>
                  <Text style={styles.telStatus}>{zone.chl != null ? '' : t.pfz.offlineStatus}</Text>
                </View>
              </View>

              {/* Data Source Note — the backend's own honest note on where the
                  SST/chlorophyll reading came from (or that it's unavailable),
                  replacing the previous fabricated "evidence" bullets. */}
              {zone.dataNote && (
                <View style={styles.evidenceBox}>
                  <View style={styles.evidenceHeader}>
                    <MaterialIcons name="insights" size={16} color={colors.primary} />
                    <Text style={styles.evidenceTitle}>{t.pfz.dataSource}</Text>
                  </View>
                  <View style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{zone.dataNote}</Text>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => navigation.navigate('Map')}
                >
                  <Ionicons name="map-outline" size={16} color={colors.white} />
                  <Text style={styles.btnTextPrimary}>{t.pfz.viewOnMap}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => setSelectedInspectZone(zone)}
                >
                  <MaterialCommunityIcons name="waves" size={16} color={colors.primary} />
                  <Text style={styles.btnTextSecondary}>{t.pfz.inspectDetails}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Zone Detail Modal — only real fields, no fabricated depth-layer graphic */}
      {selectedInspectZone && (
        <Modal animationType="slide" transparent visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedInspectZone.name}</Text>
                <TouchableOpacity onPress={() => setSelectedInspectZone(null)}>
                  <Ionicons name="close-circle" size={24} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={styles.modalSpeciesBox}>
                  <Text style={styles.modalLabel}>{t.pfz.distance}</Text>
                  <Text style={styles.modalSpeciesVal}>
                    {selectedInspectZone.distance != null ? `${selectedInspectZone.distance} NM` : t.pfz.notAvailable}
                    {selectedInspectZone.bearing ? ` (${selectedInspectZone.bearing})` : ''}
                  </Text>
                  {selectedInspectZone.confidence != null && (
                    <Text style={styles.modalCatchText}>
                      {t.pfz.catchPotential}:{' '}
                      <Text style={{ color: colors.secondary, fontWeight: '800' }}>
                        {selectedInspectZone.confidence}% CONF
                      </Text>
                    </Text>
                  )}
                </View>

                <View style={styles.telemetryRow}>
                  <View style={styles.telemetryCard}>
                    <Text style={styles.telLabel}>{t.pfz.sstTemp}</Text>
                    <Text style={styles.telValue}>
                      {selectedInspectZone.sst != null ? `${selectedInspectZone.sst}°C` : t.pfz.notAvailable}
                    </Text>
                  </View>
                  <View style={styles.telemetryCard}>
                    <Text style={styles.telLabel}>{t.pfz.chlorophyll}</Text>
                    <Text style={styles.telValue}>
                      {selectedInspectZone.chl != null ? `${selectedInspectZone.chl}mg` : t.pfz.notAvailable}
                    </Text>
                  </View>
                </View>

                {selectedInspectZone.dataNote && (
                  <View style={styles.modalAdvisory}>
                    <Ionicons name="checkmark-done-circle" size={20} color={colors.secondary} />
                    <Text style={styles.modalAdvisoryText}>{selectedInspectZone.dataNote}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  vesselInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryContainer,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  vesselInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vesselBarTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.5,
  },
  vesselBarSub: {
    fontSize: 10,
    color: colors.onPrimaryContainer,
  },
  heroCard: {
    height: 130,
    backgroundColor: colors.inverseSurface,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondaryContainer,
  },
  nearestBadge: {
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nearestText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  heroFooter: {
    gap: 2,
  },
  heroCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondaryContainer,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  filterRow: {
    marginBottom: 16,
  },
  filterChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  filterTextActive: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  loadingText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: colors.tertiaryContainer,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  offlineBannerText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.tertiary,
    flex: 1,
  },
  zoneCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  titleCol: {
    flex: 1,
  },
  zoneName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.onSurface,
  },
  zoneSub: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  confBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.secondaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSecondaryContainer,
  },
  feasibilityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 10,
  },
  feasibilityText: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  distBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  distItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  distVal: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
    fontFamily: 'monospace',
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  telemetryCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    padding: 8,
    borderRadius: 8,
  },
  telLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  telValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  telStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
    marginTop: 2,
  },
  evidenceBox: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  evidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  evidenceTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  bulletText: {
    fontSize: 12,
    color: colors.onSurface,
    flex: 1,
    lineHeight: 16,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  btnPrimary: {
    flex: 1,
    height: 42,
    backgroundColor: colors.primaryContainer,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnTextPrimary: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  btnSecondary: {
    flex: 1,
    height: 42,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnTextSecondary: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  modalSpeciesBox: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  modalSpeciesVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
    marginTop: 2,
  },
  modalCatchText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  graphCanvas: {
    backgroundColor: colors.inverseSurface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 14,
  },
  graphHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inverseOnSurface,
    marginBottom: 4,
  },
  depthLayerSurface: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 10,
    borderRadius: 6,
  },
  depthLayerPelagic: {
    backgroundColor: colors.secondary,
    padding: 12,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pelagicText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },
  depthLayerSeabed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 10,
    borderRadius: 6,
  },
  depthText: {
    fontSize: 11,
    color: colors.inverseOnSurface,
  },
  modalAdvisory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.secondaryContainer,
    padding: 12,
    borderRadius: 10,
  },
  modalAdvisoryText: {
    fontSize: 12,
    color: colors.onSecondaryContainer,
    flex: 1,
    lineHeight: 16,
  },
});
