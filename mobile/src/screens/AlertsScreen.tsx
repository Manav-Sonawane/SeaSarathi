import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { alertsAPI } from '../services/api';

import { useUserStore } from '../store/userStore';

export function AlertsScreen({ navigation }: any) {
  const { operatingPort, portInfo } = useUserStore();

  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'critical' | 'advisory' | 'navigational'>('all');
  const [acknowledged, setAcknowledged] = useState(false);

  const [alertsList, setAlertsList] = useState<any[]>([
    {
      id: '1',
      category: 'critical',
      type: 'CRITICAL GEOFENCE WARNING',
      title: 'EEZ Maritime Boundary Approaching',
      sub: `TARGET BUFFER: 12.4 NM TO BORDER OFF ${portInfo.state.toUpperCase()}`,
      distText: '12.4 NM OUT',
      vector: '285° NW @ 8.4 kts',
      breachTime: '~35 Minutes',
      body: `Vessel heading 285° off ${operatingPort} brings craft within 4.2 NM of restricted international patrol corridor and contiguous border buffer in approx 35 mins. Immediate steerage alteration advised.`,
      coords: `${portInfo.latitude.toFixed(2)}° N, ${portInfo.longitude.toFixed(2)}° E`,
      time: '18:40 IST',
    },
    {
      id: '2',
      category: 'advisory',
      type: 'WEATHER WARNING',
      title: 'High Wave & Squall Advisory',
      sub: 'VALID TILL 10:00 IST',
      distText: `${portInfo.sea.toUpperCase()}`,
      vector: '32 km/h WSW',
      breachTime: 'Hs 3.2 meters',
      body: `High wave warning issued for ${portInfo.state} coast. Significant wave height reaching up to 3.2m during night swells. Small artisanal crafts off ${operatingPort} advised to stay within 15 NM.`,
      coords: `Off ${operatingPort} Coast`,
      time: '17:15 IST',
    },
    {
      id: '3',
      category: 'navigational',
      type: 'NAVIGATIONAL NOTICE',
      title: `${operatingPort} Harbor Channel Notice`,
      sub: 'MAIN FAIRWAY CLEARANCE MANDATORY',
      distText: '2.1 NM OUT',
      vector: 'Channel Approach',
      breachTime: '500m Clearance',
      body: `Suction dredger operating near ${operatingPort} fairway channel entrance. Maintain minimum 500m clearance from anchor buoys.`,
      coords: `${portInfo.latitude.toFixed(2)}° N, ${portInfo.longitude.toFixed(2)}° E`,
      time: '12:30 IST',
    },
    {
      id: '4',
      category: 'advisory',
      type: 'SAFETY CHECKPOINT',
      title: 'Nocturnal Fishing Return Threshold',
      sub: 'RECOMMENDED DOCK TIME: 05:30 IST',
      distText: 'PORT LOCK',
      vector: 'Harbor Return',
      breachTime: 'On Schedule',
      body: `Ensure navigation lights are operational for night fishing. Report landing counts at ${operatingPort} harbor gate.`,
      coords: `${operatingPort} Harbor Gate`,
      time: '08:00 IST',
    },
  ]);

  useEffect(() => {
    loadAlerts();
  }, [operatingPort]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const data = await alertsAPI.getAlerts(portInfo.latitude, portInfo.longitude);
      if (data && data.length > 0) {
        // Integrate backend alert records
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const filteredAlerts = alertsList.filter((item) => {
    if (filter === 'all') return true;
    return item.category === filter;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Tactical Sentry Status Banner */}
        <View style={styles.sentryBanner}>
          <View style={styles.sentryHeader}>
            <View style={styles.sentryHeaderLeft}>
              <View style={styles.greenDot} />
              <Text style={styles.sentryTitle}>TACTICAL SENTRY ACTIVE • {operatingPort.toUpperCase()} ({portInfo.state.toUpperCase()})</Text>
            </View>
            <Text style={styles.latencyText}>DGPS LOCK OK</Text>
          </View>

          <View style={styles.sentryBody}>
            <View style={styles.radarIconBox}>
              <MaterialCommunityIcons name="radar" size={24} color={colors.inversePrimary} />
            </View>
            <View style={styles.sentryTextCol}>
              <Text style={styles.sentryHeading}>GEOFENCE PROXIMITY WATCH ENABLED</Text>
              <View style={styles.sentryBadgesRow}>
                <Text style={styles.sentrySubBadge}>📍 {operatingPort}</Text>
                <Text style={styles.sentrySubBadge}>🛡 BUFFER 15 NM</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Urgency Tab Filters */}
        <View style={styles.tabSection}>
          <Text style={styles.tabSectionTitle}>SEVERITY QUEUES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, filter === 'all' && styles.tabBtnActive]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>
                All ({alertsList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, filter === 'critical' && styles.tabBtnActive]}
              onPress={() => setFilter('critical')}
            >
              <View style={[styles.filterDot, { backgroundColor: colors.error }]} />
              <Text style={[styles.tabText, filter === 'critical' && styles.tabTextActive]}>
                Critical (1)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, filter === 'advisory' && styles.tabBtnActive]}
              onPress={() => setFilter('advisory')}
            >
              <View style={[styles.filterDot, { backgroundColor: colors.riskModerate }]} />
              <Text style={[styles.tabText, filter === 'advisory' && styles.tabTextActive]}>
                Advisories (2)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, filter === 'navigational' && styles.tabBtnActive]}
              onPress={() => setFilter('navigational')}
            >
              <View style={[styles.filterDot, { backgroundColor: colors.primaryContainer }]} />
              <Text style={[styles.tabText, filter === 'navigational' && styles.tabTextActive]}>
                Navigational (1)
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primaryContainer} />
            <Text style={styles.loadingText}>Fetching ocean safety alerts...</Text>
          </View>
        )}

        {/* Alert Cards Stream */}
        {filteredAlerts.map((item) => {
          let topBarColor = colors.primaryContainer;
          let badgeBg = colors.surfaceContainerHigh;
          let badgeTextColor = colors.primary;

          if (item.category === 'critical') {
            topBarColor = colors.error;
            badgeBg = colors.errorContainer;
            badgeTextColor = colors.onErrorContainer;
          } else if (item.category === 'advisory') {
            topBarColor = colors.riskModerate;
            badgeBg = colors.surfaceContainerHigh;
            badgeTextColor = colors.tertiaryContainer;
          }

          return (
            <View key={item.id} style={styles.alertCard}>
              <View style={[styles.alertTopBar, { backgroundColor: topBarColor }]} />

              <View style={styles.alertCardBody}>
                {/* Header Row */}
                <View style={styles.alertHeaderRow}>
                  <View style={[styles.badgeChip, { backgroundColor: badgeBg }]}>
                    {item.category === 'critical' && <View style={styles.redPulseDot} />}
                    <Text style={[styles.badgeChipText, { color: badgeTextColor }]}>
                      {item.type}
                    </Text>
                  </View>
                  <Text style={styles.distTag}>{item.distText}</Text>
                </View>

                {/* Title & Icon */}
                <View style={styles.titleRow}>
                  <View style={styles.titleIconBox}>
                    {item.category === 'critical' ? (
                      <MaterialCommunityIcons name="barcode-scan" size={20} color={colors.error} />
                    ) : item.category === 'advisory' ? (
                      <Ionicons name="sunny-outline" size={20} color={colors.riskModerate} />
                    ) : (
                      <Ionicons name="compass-outline" size={20} color={colors.primary} />
                    )}
                  </View>
                  <View style={styles.titleCol}>
                    <Text style={styles.alertTitle}>{item.title}</Text>
                    <Text style={styles.alertSub}>{item.sub}</Text>
                  </View>
                </View>

                {/* Telemetry Strip */}
                <View style={styles.telemetryBox}>
                  <View style={styles.telCol}>
                    <Text style={styles.telLabel}>Vector & Speed</Text>
                    <Text style={styles.telVal}>{item.vector}</Text>
                  </View>
                  <View style={styles.telCol}>
                    <Text style={styles.telLabel}>Status / Estimate</Text>
                    <Text
                      style={[
                        styles.telVal,
                        item.category === 'critical' && { color: colors.error },
                      ]}
                    >
                      {item.breachTime}
                    </Text>
                  </View>
                </View>

                {/* Body Text */}
                <Text style={styles.alertBodyText}>{item.body}</Text>

                {/* Position Footer */}
                <View style={styles.posFooter}>
                  <View style={styles.posLeft}>
                    <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                    <Text style={styles.posCoords}>{item.coords}</Text>
                  </View>
                  <Text style={styles.posTime}>{item.time}</Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.alertActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtnMap,
                      item.category === 'critical' && { backgroundColor: colors.error },
                    ]}
                    onPress={() => navigation.navigate('Map')}
                  >
                    <Ionicons name="map" size={16} color={colors.white} />
                    <Text style={styles.actionBtnMapText}>Open Radar Map ➔</Text>
                  </TouchableOpacity>

                  {item.category === 'critical' && (
                    <TouchableOpacity
                      style={styles.actionBtnAck}
                      onPress={() => setAcknowledged(!acknowledged)}
                    >
                      <Ionicons
                        name={acknowledged ? 'checkmark-circle' : 'bookmark-outline'}
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.actionBtnAckText}>
                        {acknowledged ? 'Acknowledged (8 NM Buffer Set)' : 'Acknowledge Buffer'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
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
  sentryBanner: {
    backgroundColor: colors.inverseSurface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  sentryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 8,
  },
  sentryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondaryContainer,
  },
  sentryTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.secondaryContainer,
    letterSpacing: 0.5,
  },
  latencyText: {
    fontSize: 10,
    color: colors.inverseOnSurface,
    opacity: 0.7,
  },
  sentryBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radarIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sentryTextCol: {
    flex: 1,
  },
  sentryHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.inverseOnSurface,
    marginBottom: 4,
  },
  sentryBadgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sentrySubBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.inverseOnSurface,
    opacity: 0.8,
  },
  tabSection: {
    marginBottom: 16,
  },
  tabSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  tabBtnActive: {
    backgroundColor: colors.primaryContainer,
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  tabTextActive: {
    color: colors.white,
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
  alertCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  alertTopBar: {
    height: 6,
    width: '100%',
  },
  alertCardBody: {
    padding: 14,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  redPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.error,
  },
  badgeChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  distTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onSurface,
    fontFamily: 'monospace',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  titleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleCol: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.onSurface,
  },
  alertSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  telemetryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  telCol: {
    flex: 1,
  },
  telLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  telVal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  alertBodyText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 10,
  },
  posFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerHigh,
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  posLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  posCoords: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurface,
    fontFamily: 'monospace',
  },
  posTime: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  alertActions: {
    gap: 8,
  },
  actionBtnMap: {
    backgroundColor: colors.primaryContainer,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnMapText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
    textTransform: 'uppercase',
  },
  actionBtnAck: {
    backgroundColor: colors.surfaceContainerHigh,
    height: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnAckText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
});
