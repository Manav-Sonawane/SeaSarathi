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

export function PFZScreen({ navigation }: any) {
  const { vesselType, getVesselRangeKm, operatingPort, portInfo, getLanguageInfo } = useUserStore();
  const langInfo = getLanguageInfo();
  const maxRangeKm = getVesselRangeKm();

  const [loading, setLoading] = useState(false);
  const [selectedInspectZone, setSelectedInspectZone] = useState<any>(null);

  const [zones, setZones] = useState<any[]>([
    {
      id: '1',
      name: `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-14`,
      subtitle: `${portInfo.region} Upwelling Sector`,
      distance: 14.2,
      bearing: '280° WNW',
      estArrival: '1h 15m @ 11 kts',
      sst: 28.4,
      chl: 1.84,
      depth: 42,
      confidence: 92,
      targetSpecies: 'Indian Oil Sardine & Mackerel',
      evidence: [
        `Thermal front gradient (ΔT = 1.2°C) off ${portInfo.name}.`,
        'Phytoplankton convergence zone with active pelagic surface baitfish.',
        'High Sardine & Mackerel probability in this sector.',
      ],
    },
    {
      id: '2',
      name: `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-18`,
      subtitle: `${portInfo.state} Shelf Edge`,
      distance: 21.5,
      bearing: '240° WSW',
      estArrival: '1h 55m @ 11 kts',
      sst: 27.9,
      chl: 1.52,
      depth: 38,
      confidence: 86,
      targetSpecies: 'Tuna & Skipjack Shoal',
      evidence: [
        'Chlorophyll bloom boundary detected in high-density area.',
        `Cool upwelling tongue extending 18 NM west of ${portInfo.name}.`,
      ],
    },
    {
      id: '3',
      name: `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-22`,
      subtitle: `${portInfo.sea} Continental Trench`,
      distance: 48.1,
      bearing: '295° NW',
      estArrival: '3h 30m @ 11 kts',
      sst: 28.1,
      chl: 1.35,
      depth: 55,
      confidence: 79,
      targetSpecies: 'Ribbonfish & Anchovy',
      evidence: ['Bathymetric 50m shelf break convergence zone.'],
    },
  ]);

  useEffect(() => {
    loadZones();
  }, [operatingPort]);

  const loadZones = async () => {
    setLoading(true);
    try {
      const data = await pfzAPI.getNearest(portInfo.latitude, portInfo.longitude);
      if (data && data.length > 0) {
        const formatted = data.map((z, idx) => ({
          id: (idx + 1).toString(),
          name: z.name || `PFZ-${portInfo.name.substring(0, 3).toUpperCase()}-${(idx + 1) * 6}`,
          subtitle: `${portInfo.name} Sector #${idx + 1}`,
          distance: z.distance,
          bearing: z.bearing || '280° WNW',
          estArrival: `${Math.round((z.distance / 11) * 60)}m @ 11 kts`,
          sst: z.sst,
          chl: z.chl,
          depth: 42 + idx * 5,
          confidence: z.confidence,
          targetSpecies: 'Pelagic Shoal & Sardines',
          evidence: [
            `SST temperature front optimal at ${z.sst}°C off ${portInfo.name}.`,
            `Chlorophyll concentration dense at ${z.chl} mg/m³.`,
          ],
        }));
        setZones(formatted);
      }
    } catch {
      // Static fallback
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
              <Text style={styles.vesselBarSub}>Operating Range: Max {maxRangeKm} km offshore</Text>
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
              <Text style={styles.heroBadgeText}>{operatingPort} Sector Reticle ({portInfo.sea})</Text>
            </View>
            <View style={styles.nearestBadge}>
              <Text style={styles.nearestText}>14.2 NM NEAREST</Text>
            </View>
          </View>

          <View style={styles.heroFooter}>
            <Text style={styles.heroCategory}>{portInfo.region} Chlorophyll Fronts</Text>
            <Text style={styles.heroTitle}>{portInfo.name} Deep Shelf Swells</Text>
          </View>
        </View>

        {/* Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <TouchableOpacity style={styles.filterChipActive}>
            <Ionicons name="navigate-outline" size={14} color={colors.white} />
            <Text style={styles.filterTextActive}>Range (≤ {maxRangeKm}km)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.filterChip}>
            <MaterialCommunityIcons name="fish" size={14} color={colors.primary} />
            <Text style={styles.filterText}>Sardine / Pelagic</Text>
          </TouchableOpacity>
        </ScrollView>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primaryContainer} />
            <Text style={styles.loadingText}>Fetching ocean productivity zones...</Text>
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
                  <Text style={styles.confText}>{zone.confidence}%</Text>
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
                    ? `FEASIBLE (Within your ${maxRangeKm}km ${vesselType} boat range)`
                    : `BEYOND RANGE (Requires > ${maxRangeKm}km capacity)`}
                </Text>
              </View>

              {/* Distance & Arrival Box */}
              <View style={styles.distBox}>
                <View style={styles.distItem}>
                  <Ionicons name="compass-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={styles.distLabel}>DISTANCE</Text>
                    <Text style={styles.distVal}>
                      {zone.distance} NM ({zone.bearing})
                    </Text>
                  </View>
                </View>
                <View style={styles.distItem}>
                  <Ionicons name="time-outline" size={18} color={colors.primary} />
                  <View>
                    <Text style={styles.distLabel}>EST. ARRIVAL</Text>
                    <Text style={styles.distVal}>{zone.estArrival}</Text>
                  </View>
                </View>
              </View>

              {/* Telemetry Row */}
              <View style={styles.telemetryRow}>
                <View style={styles.telemetryCard}>
                  <Text style={styles.telLabel}>SST TEMP</Text>
                  <Text style={styles.telValue}>{zone.sst}°C</Text>
                  <Text style={styles.telStatus}>Optimal</Text>
                </View>
                <View style={styles.telemetryCard}>
                  <Text style={styles.telLabel}>CHLOROPHYLL</Text>
                  <Text style={styles.telValue}>{zone.chl}mg</Text>
                  <Text style={styles.telStatus}>Rich Bloom</Text>
                </View>
                <View style={styles.telemetryCard}>
                  <Text style={styles.telLabel}>BATHYMETRY</Text>
                  <Text style={styles.telValue}>{zone.depth}m</Text>
                  <Text style={styles.telStatus}>Swell Shelf</Text>
                </View>
              </View>

              {/* Evidence Bullets */}
              <View style={styles.evidenceBox}>
                <View style={styles.evidenceHeader}>
                  <MaterialIcons name="insights" size={16} color={colors.primary} />
                  <Text style={styles.evidenceTitle}>Ocean Biomass Telemetry</Text>
                </View>
                {zone.evidence.map((bullet: string, bIdx: number) => (
                  <View key={bIdx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>

              {/* Action Buttons */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => navigation.navigate('Map')}
                >
                  <Ionicons name="map-outline" size={16} color={colors.white} />
                  <Text style={styles.btnTextPrimary}>View on Map</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => setSelectedInspectZone(zone)}
                >
                  <MaterialCommunityIcons name="waves" size={16} color={colors.primary} />
                  <Text style={styles.btnTextSecondary}>Inspect Thermocline</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Thermocline Modal */}
      {selectedInspectZone && (
        <Modal animationType="slide" transparent visible>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Zone {selectedInspectZone.name} Inspection</Text>
                <TouchableOpacity onPress={() => setSelectedInspectZone(null)}>
                  <Ionicons name="close-circle" size={24} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={styles.modalSpeciesBox}>
                  <Text style={styles.modalLabel}>TARGET SHOAL SPECIES</Text>
                  <Text style={styles.modalSpeciesVal}>{selectedInspectZone.targetSpecies}</Text>
                  <Text style={styles.modalCatchText}>
                    Catch Potential:{' '}
                    <Text style={{ color: colors.secondary, fontWeight: '800' }}>
                      {selectedInspectZone.confidence}% CONF
                    </Text>
                  </Text>
                </View>

                {/* Stratification Profile */}
                <View style={styles.graphCanvas}>
                  <Text style={styles.graphHeaderTitle}>Water Column Stratification (0m - 50m)</Text>

                  <View style={styles.depthLayerSurface}>
                    <Text style={styles.depthText}>
                      0m Surface: {selectedInspectZone.sst}°C (Sunny Mixed Layer)
                    </Text>
                  </View>

                  <View style={styles.depthLayerPelagic}>
                    <Ionicons name="fish-outline" size={16} color={colors.white} />
                    <Text style={styles.pelagicText}>18m - 32m ACTIVE PELAGIC FEEDING ZONE</Text>
                  </View>

                  <View style={styles.depthLayerSeabed}>
                    <Text style={styles.depthText}>42m Seabed Shelf: 23.1°C (Continental Slope)</Text>
                  </View>
                </View>

                <View style={styles.modalAdvisory}>
                  <Ionicons name="checkmark-done-circle" size={20} color={colors.secondary} />
                  <Text style={styles.modalAdvisoryText}>
                    Optimal nocturnal schooling window:{' '}
                    <Text style={{ fontWeight: '800' }}>21:30 - 04:30 IST</Text>. Surface drift
                    aligns with purse seine casting arc.
                  </Text>
                </View>
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
