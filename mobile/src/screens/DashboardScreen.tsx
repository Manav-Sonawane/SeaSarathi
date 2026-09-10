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
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/userStore';
import { chatAPI, ChatResponse, Alert } from '../services/api';
import { getCachedBundleForOffline, buildOfflineChatAnswer } from '../services/offlineService';

interface FishAvailability {
  id: string;
  name: string;
  localNames: Record<string, string>;
  abundance: 'VERY HIGH' | 'HIGH' | 'MODERATE';
  distance: string;
  depth: string;
  peakTime: string;
  gear: string;
  sst: string;
  chl: string;
}

export function DashboardScreen({ navigation }: any) {
  const { portInfo, getLanguageInfo, getVesselRangeKm, language, vesselType, riskTolerance, role } =
    useUserStore();
  const langInfo = getLanguageInfo();
  const vesselRange = getVesselRangeKm();

  // State to manage collapsible accordion for fish species cards (default 1st fish expanded)
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({ '1': true });

  const toggleFishExpand = (id: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const [loading, setLoading] = useState(false);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [conditions, setConditions] = useState<ChatResponse | null>(null);

  useEffect(() => {
    loadConditions();
  }, [portInfo.name]);

  const loadConditions = async () => {
    setLoading(true);
    try {
      const profile = { vessel_type: vesselType, risk_tolerance: riskTolerance, role, language };
      const res = await chatAPI.sendMessage(
        `${langInfo.presets.safety} (${portInfo.name})`,
        portInfo.latitude,
        portInfo.longitude,
        profile
      );
      setConditions(res);
      setIsOfflineData(false);
    } catch (err) {
      console.error('[DashboardScreen] Live /chat call failed, trying offline cache:', err);
      try {
        const bundle = await getCachedBundleForOffline();
        if (bundle) {
          const offlineAnswer = buildOfflineChatAnswer(
            bundle,
            portInfo.latitude,
            portInfo.longitude,
            portInfo.name
          );
          setConditions(offlineAnswer);
          setIsOfflineData(true);
        }
      } catch {
        // No cached bundle either — leave whatever was last shown (or null on first load).
      }
    } finally {
      setLoading(false);
    }
  };

  // Real values once fetched; sensible neutral placeholders while first loading.
  const telemetry = {
    windSpeed: conditions?.wind_kmh ?? 0,
    waveHeight: conditions?.wave_m ?? 0,
    rainfall: conditions?.rainfall_mm ?? 0,
    lightning: conditions?.lightning ?? false,
    cyclone: conditions?.cyclone ?? false,
    confidence: conditions?.confidence ?? 0,
    riskLevel: conditions?.risk_level ?? 'LOW',
  };
  const isWindGood = telemetry.windSpeed < 25;
  const isWaveGood = telemetry.waveHeight <= 1.5;
  const isRainGood = telemetry.rainfall === 0;
  const warnings: Alert[] = conditions?.alerts ?? [];

  // Get localized fisherman safety advisory — only used while conditions
  // haven't loaded yet; once loaded, the real backend recommendation is shown.
  const safetyAdvisory = conditions?.recommendation
    || langInfo.getAdvisory(portInfo.name, telemetry.riskLevel, telemetry.windSpeed, telemetry.waveHeight, vesselRange);

  // Region-specific fish species dataset
  const availableFishList: FishAvailability[] = [
    {
      id: '1',
      name: 'Indian Oil Sardine',
      localNames: {
        en: 'Indian Oil Sardine',
        ml: 'മത്തി (Mathi)',
        ta: 'மத்தி (Mathi)',
        te: 'సార్డైన్ (Sardine)',
        bn: 'তারলি (Tarali)',
        gu: 'તરલી (Tarali)',
        mr: 'तारली (Tarli)',
        or: 'ତାରଲି (Tarali)',
        kn: 'ತಾರಲಿ (Tarali)',
        hi: 'तारली (Tarli)',
      },
      abundance: 'VERY HIGH',
      distance: '12 - 22 NM',
      depth: '15 - 30m',
      peakTime: '04:00 - 08:30 IST (Dawn)',
      gear: 'Ring Seine / Purse Seine (32mm)',
      sst: '28.2°C',
      chl: '1.84 mg/m³',
    },
    {
      id: '2',
      name: 'Indian Mackerel',
      localNames: {
        en: 'Indian Mackerel',
        ml: 'അയില (Ayila)',
        ta: 'கானாங்கெளுத்தி (Kanangeluthi)',
        te: 'కానాగర్త (Kanagartha)',
        bn: 'বাংড়া (Bangda)',
        gu: 'બંગડા (Bangda)',
        mr: 'बांगडा (Bangda)',
        or: 'ବାଂଗଡ଼ା (Bangada)',
        kn: 'ಬಂಗ್ಡೆ (Bangude)',
        hi: 'बांगड़ा (Bangda)',
      },
      abundance: 'HIGH',
      distance: '8 - 18 NM',
      depth: '20 - 40m',
      peakTime: '05:00 - 10:00 IST',
      gear: 'Surface Gillnet / Driftnet',
      sst: '28.0°C',
      chl: '1.65 mg/m³',
    },
    {
      id: '3',
      name: 'Yellowfin Tuna',
      localNames: {
        en: 'Yellowfin Tuna',
        ml: 'ചൂള / സൂത (Choora)',
        ta: 'சூரை (Soorai)',
        te: 'తున్నా (Tunna)',
        bn: 'টুના (Tuna)',
        gu: 'ટુના (Tuna)',
        mr: 'कुप्पा (Kuppa)',
        or: 'ଟୁନା (Tuna)',
        kn: 'ಟ್ಯೂನಾ (Tuna)',
        hi: 'ट्यूना (Tuna)',
      },
      abundance: 'HIGH',
      distance: '18 - 35 NM',
      depth: '40 - 90m',
      peakTime: '03:30 - 09:00 IST',
      gear: 'Hooks & Lines / Longline',
      sst: '27.8°C',
      chl: '1.45 mg/m³',
    },
    {
      id: '4',
      name: 'Silver Pomfret',
      localNames: {
        en: 'Silver Pomfret',
        ml: 'ആവോലി (Aavoli)',
        ta: 'வௌவால் (Vavval)',
        te: 'చందమామ (Chandamama)',
        bn: 'রুপচাঁদা (Rupchanda)',
        gu: 'વિજળ (Vijal)',
        mr: 'पापलेट (Paplet)',
        or: 'ରୂପଚାନ୍ଦା (Rupachanda)',
        kn: 'ಮಾಂಜಿ (Manji)',
        hi: 'पापलेट (Paplet)',
      },
      abundance: 'MODERATE',
      distance: '15 - 28 NM',
      depth: '25 - 50m',
      peakTime: '17:00 - 21:00 IST (Dusk)',
      gear: 'Bottom Trawl / Drift Gillnet',
      sst: '28.4°C',
      chl: '1.72 mg/m³',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Daily Dashboard Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconBox}>
              <MaterialCommunityIcons name="view-dashboard" size={24} color={colors.white} />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.headerTitle}>DAILY MARINE DASHBOARD</Text>
            </View>
            <View
              style={[
                styles.liveChip,
                isOfflineData && { backgroundColor: 'rgba(180,83,9,0.35)' },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <View style={[styles.greenPulse, isOfflineData && { backgroundColor: '#FCD34D' }]} />
              )}
              <Text style={styles.liveChipText}>
                {loading ? 'SYNCING' : isOfflineData ? 'OFFLINE (CACHED)' : 'LIVE'}
              </Text>
            </View>
          </View>
        </View>

        {isOfflineData && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.tertiary} />
            <Text style={styles.offlineBannerText}>
              Showing last downloaded data, not a live reading — reconnect to refresh.
            </Text>
          </View>
        )}

        {/* GPS Location & Sea Fix Strip */}
        <View style={styles.gpsStrip}>
          <View style={styles.gpsStripRow}>
            <View style={styles.gpsIconRow}>
              <MaterialCommunityIcons name="satellite-variant" size={18} color={colors.primaryContainer} />
              <Text style={styles.gpsStripTitle}>
                {langInfo.uiText.liveGps} • {portInfo.state.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.seaBadge}>{portInfo.sea}</Text>
          </View>
          <Text style={styles.gpsCoords}>
            📍 {portInfo.name} Harbor ({portInfo.latitude.toFixed(4)}° N, {portInfo.longitude.toFixed(4)}° E)
          </Text>
        </View>

        {/* Telemetry Header */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="speedometer" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>{langInfo.uiText.oceanConditions}</Text>
          </View>
        </View>

        {/* 2x3 Metric Cards with Color-Coded Condition Badges */}
        <View style={styles.metricsGrid}>
          {/* Wind Speed */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.windSpeed}</Text>
              <MaterialCommunityIcons name="weather-windy" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricValue}>
              {telemetry.windSpeed} <Text style={styles.metricUnit}>km/h</Text>
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: isWindGood ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.statusBadgeText, { color: isWindGood ? '#15803D' : '#B91C1C' }]}>
                {isWindGood ? `🟢 ${langInfo.uiText.metricStatuses.gentleBreeze}` : '🔴 Strong Wind Warning'}
              </Text>
            </View>
          </View>

          {/* Wave Height */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.waveHeight}</Text>
              <MaterialCommunityIcons name="wave" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricValue}>
              {telemetry.waveHeight} <Text style={styles.metricUnit}>m</Text>
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: isWaveGood ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.statusBadgeText, { color: isWaveGood ? '#15803D' : '#B91C1C' }]}>
                {isWaveGood ? `🟢 ${langInfo.uiText.metricStatuses.normalSwell}` : '🔴 Rough Sea (>1.5m)'}
              </Text>
            </View>
          </View>

          {/* Rainfall */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.rainfall}</Text>
              <Ionicons name="rainy-outline" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricValue}>
              {telemetry.rainfall} <Text style={styles.metricUnit}>mm/h</Text>
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: isRainGood ? '#DCFCE7' : '#FEF3C7' }]}>
              <Text style={[styles.statusBadgeText, { color: isRainGood ? '#15803D' : '#B45309' }]}>
                {isRainGood ? `🟢 ${langInfo.uiText.metricStatuses.clearSky}` : '🟠 Rain Detected'}
              </Text>
            </View>
          </View>

          {/* Lightning Watch */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.lightning}</Text>
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: telemetry.lightning ? '#DC2626' : '#16A34A' }]}>
              {telemetry.lightning ? 'ACTIVE' : 'NONE'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: !telemetry.lightning ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.statusBadgeText, { color: !telemetry.lightning ? '#15803D' : '#B91C1C' }]}>
                {!telemetry.lightning ? `🟢 ${langInfo.uiText.metricStatuses.noLightning}` : '🔴 Lightning Alert'}
              </Text>
            </View>
          </View>

          {/* Cyclone Watch */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.cycloneWatch}</Text>
              <MaterialCommunityIcons name="weather-hurricane" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: telemetry.cyclone ? '#DC2626' : '#16A34A' }]}>
              {telemetry.cyclone ? 'WARNING' : 'SAFE'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: !telemetry.cyclone ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.statusBadgeText, { color: !telemetry.cyclone ? '#15803D' : '#B91C1C' }]}>
                {!telemetry.cyclone ? `🟢 ${langInfo.uiText.metricStatuses.noCyclone}` : '🔴 Cyclone Threat'}
              </Text>
            </View>
          </View>

          {/* Catch Confidence */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.confidence}</Text>
              <MaterialIcons name="security" size={18} color={colors.primary} />
            </View>
            <Text style={styles.metricValue}>{telemetry.confidence}%</Text>
            <View style={[styles.statusBadge, { backgroundColor: telemetry.confidence >= 60 ? '#DCFCE7' : '#FEF3C7' }]}>
              <Text style={[styles.statusBadgeText, { color: telemetry.confidence >= 60 ? '#15803D' : '#B45309' }]}>
                {telemetry.confidence >= 60 ? `🟢 ${langInfo.uiText.metricStatuses.highCertainty}` : '🟠 Lower Certainty'}
              </Text>
            </View>
          </View>
        </View>

        {/* Active Warnings — real backend/cached alerts, not decorative */}
        <View style={styles.warningsSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <Text style={styles.sectionTitle}>SAFETY WARNINGS</Text>
          </View>
          {warnings.length === 0 ? (
            <View style={styles.noWarningsBox}>
              <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.secondary} />
              <Text style={styles.noWarningsText}>No active warnings for {portInfo.name} right now.</Text>
            </View>
          ) : (
            warnings.map((w, idx) => {
              const sevColor = w.severity === 'HIGH' ? colors.error : w.severity === 'MODERATE' ? colors.riskModerate : colors.primaryContainer;
              return (
                <View key={idx} style={[styles.warningCard, { borderLeftColor: sevColor }]}>
                  <Text style={[styles.warningType, { color: sevColor }]}>{w.type.replace(/_/g, ' ')}</Text>
                  <Text style={styles.warningMessage}>{w.message}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Fisherman Safety Advisory Card */}
        <View
          style={[
            styles.recBox,
            telemetry.riskLevel === 'HIGH' && styles.recBoxHigh,
            telemetry.riskLevel === 'MODERATE' && styles.recBoxModerate,
          ]}
        >
          <View style={styles.recHeaderRow}>
            <Ionicons
              name="shield-checkmark"
              size={20}
              color={telemetry.riskLevel === 'HIGH' ? '#B91C1C' : telemetry.riskLevel === 'MODERATE' ? '#B45309' : '#15803D'}
            />
            <Text
              style={[
                styles.recLabel,
                telemetry.riskLevel === 'HIGH' && { color: '#B91C1C' },
                telemetry.riskLevel === 'MODERATE' && { color: '#B45309' },
              ]}
            >
              {langInfo.uiText.safetyAdvisoryHeader}
            </Text>
          </View>
          <Text style={styles.recText}>{loading ? 'Fetching current conditions…' : safetyAdvisory}</Text>
        </View>

        {/* Fish Species Available in this Zone Section */}
        <View style={styles.fishSectionHeader}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="fish" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>
              REGIONAL SPECIES GUIDE ({portInfo.name.toUpperCase()})
            </Text>
          </View>
        </View>
        <Text style={styles.fishSectionNote}>
          Typical species, gear, and season for this coast — general reference, not a live catch feed.
          {conditions && (conditions.sst_c != null || conditions.chlorophyll_mg_m3 != null) ? (
            <Text style={styles.fishSectionNoteBold}>
              {'  '}Current water: {conditions.sst_c != null ? `${conditions.sst_c.toFixed(1)}°C SST` : ''}
              {conditions.sst_c != null && conditions.chlorophyll_mg_m3 != null ? ' · ' : ''}
              {conditions.chlorophyll_mg_m3 != null ? `${conditions.chlorophyll_mg_m3.toFixed(2)} mg/m³ Chl-a` : ''}
            </Text>
          ) : null}
        </Text>

        {/* Collapsible Accordion List for Fish Species */}
        <View style={styles.fishCardsList}>
          {availableFishList.map((fish) => {
            const speciesName = fish.localNames[language] || fish.localNames['en'] || fish.name;
            const isExpanded = !!expandedMap[fish.id];
            const abundanceColor =
              fish.abundance === 'VERY HIGH'
                ? '#15803D'
                : fish.abundance === 'HIGH'
                ? '#0288D1'
                : '#B45309';

            return (
              <View key={fish.id} style={styles.fishCard}>
                {/* Clickable Header for Collapsible Accordion */}
                <TouchableOpacity
                  style={[
                    styles.fishCardHeader,
                    !isExpanded && { borderBottomWidth: 0, paddingBottom: 0, marginBottom: 0 },
                  ]}
                  onPress={() => toggleFishExpand(fish.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.fishTitleGroup}>
                    <Text style={styles.fishNameText}>{speciesName}</Text>
                    <Text style={styles.fishEngSub}>{fish.name}</Text>
                  </View>

                  <View style={styles.headerRightRow}>
                    <View style={[styles.abundanceBadge, { backgroundColor: abundanceColor + '20' }]}>
                      <Text style={[styles.abundanceText, { color: abundanceColor }]}>
                        TYPICAL: {fish.abundance}
                      </Text>
                    </View>

                    <Ionicons
                      name={isExpanded ? 'chevron-up-circle' : 'chevron-down-circle'}
                      size={24}
                      color={colors.primaryContainer}
                    />
                  </View>
                </TouchableOpacity>

                {/* Collapsible Details Container */}
                {isExpanded && (
                  <View style={styles.fishDetailsGrid}>
                    <View style={styles.fishDetailItem}>
                      <Text style={styles.fishDetailLabel}>TARGET ZONE & DEPTH</Text>
                      <Text style={styles.fishDetailValue}>
                        📍 {fish.distance} | 🌊 {fish.depth}
                      </Text>
                    </View>

                    <View style={styles.fishDetailItem}>
                      <Text style={styles.fishDetailLabel}>PEAK CATCH TIME</Text>
                      <Text style={styles.fishDetailValue}>⏰ {fish.peakTime}</Text>
                    </View>

                    <View style={styles.fishDetailItem}>
                      <Text style={styles.fishDetailLabel}>RECOMMENDED GEAR</Text>
                      <Text style={styles.fishDetailValue}>🕸️ {fish.gear}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Quick Navigation Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtnPrimary}
            onPress={() => navigation.navigate('PFZ')}
          >
            <MaterialCommunityIcons name="fish" size={18} color={colors.white} />
            <Text style={styles.actionBtnTextPrimary}>Inspect Fishing Zones</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => navigation.navigate('Chat')}
          >
            <MaterialCommunityIcons name="chat-processing-outline" size={18} color={colors.primary} />
            <Text style={styles.actionBtnTextSecondary}>Ask AI Assistant</Text>
          </TouchableOpacity>
        </View>
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
    paddingBottom: 28,
  },
  headerCard: {
    backgroundColor: colors.primaryContainer,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  greenPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  liveChipText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.white,
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
  warningsSection: {
    marginBottom: 16,
  },
  noWarningsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.secondaryContainer,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  noWarningsText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
    flex: 1,
  },
  warningCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 10,
    marginTop: 8,
    elevation: 2,
  },
  warningType: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  warningMessage: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
  },
  fishSectionNote: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
    lineHeight: 16,
  },
  fishSectionNoteBold: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  gpsStrip: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  gpsStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  gpsIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gpsStripTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  seaBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryContainer,
  },
  gpsCoords: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.onSurface,
    letterSpacing: 0.3,
  },
  sectionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  metricCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.onSurface,
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  statusBadge: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  recBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  recBoxModerate: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  recBoxHigh: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  recHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  recLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  recText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#14532D',
    lineHeight: 22,
  },
  fishSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fishCardsList: {
    gap: 12,
    marginBottom: 20,
  },
  fishCard: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.surfaceContainerHighest,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  fishCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
    paddingBottom: 10,
    marginBottom: 10,
  },
  fishTitleGroup: {
    flex: 1,
  },
  fishNameText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.onSurface,
  },
  fishEngSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryContainer,
    marginTop: 1,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  abundanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  abundanceText: {
    fontSize: 10,
    fontWeight: '900',
  },
  fishDetailsGrid: {
    gap: 8,
    marginTop: 6,
  },
  fishDetailItem: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 8,
  },
  fishDetailLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  fishDetailValue: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: colors.primaryContainer,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnTextPrimary: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    height: 46,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnTextSecondary: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
});
