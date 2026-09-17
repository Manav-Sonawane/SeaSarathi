import React, { useState, useEffect, useMemo } from 'react';
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
import { chatAPI, ChatResponse, Alert, freshnessAPI, DataFreshnessInfo } from '../services/api';
import { getCachedBundleForOffline, buildOfflineChatAnswer, formatRelativeTime } from '../services/offlineService';
import { useNetworkStore } from '../store/networkStore';
import { getScreenText } from '../constants/screenTranslations';
import { LocationSourceBadge } from '../components/LocationSourceBadge';
import {
  getNearbyFisheryCentres,
  LandingCentre,
  SpeciesCatchInfo,
} from '../utils/fisheryService';

export function DashboardScreen({ navigation }: any) {
  const { portInfo, getLanguageInfo, getVesselRangeKm, language, vesselType, riskTolerance, role } =
    useUserStore();
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);
  const vesselRange = getVesselRangeKm();

  // Proximity coastal fishery data lookup based on active port/coordinates
  const fisheryResult = useMemo(() => {
    return getNearbyFisheryCentres(portInfo.latitude, portInfo.longitude, portInfo.name);
  }, [portInfo.latitude, portInfo.longitude, portInfo.name]);

  const [selectedCentreId, setSelectedCentreId] = useState<string>('');

  // When port changes, reset selectedCentreId to the primary landing centre
  useEffect(() => {
    setSelectedCentreId(fisheryResult.primaryCentre.id);
  }, [fisheryResult.primaryCentre.id]);

  const activeLandingCentre = useMemo(() => {
    if (selectedCentreId) {
      const found = fisheryResult.allCentres.find((c: LandingCentre) => c.id === selectedCentreId);
      if (found) return found;
    }
    return fisheryResult.primaryCentre;
  }, [selectedCentreId, fisheryResult]);

  // State to manage collapsible accordion for fish species cards
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  // Expand the first fish card whenever the active landing centre changes
  useEffect(() => {
    if (activeLandingCentre.speciesList.length > 0) {
      setExpandedMap({ [activeLandingCentre.speciesList[0].id]: true });
    }
  }, [activeLandingCentre.id]);

  const toggleFishExpand = (id: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const isOnline = useNetworkStore((s) => s.isOnline);
  const [loading, setLoading] = useState(false);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [offlineAsOf, setOfflineAsOf] = useState<string | null>(null);
  const [conditions, setConditions] = useState<ChatResponse | null>(null);
  const [conditionsLanguage, setConditionsLanguage] = useState<string>(language);
  const [freshness, setFreshness] = useState<DataFreshnessInfo | null>(null);
  const [refreshingData, setRefreshingData] = useState(false);
  const [syncBannerMessage, setSyncBannerMessage] = useState<string | null>(null);

  useEffect(() => {
    loadConditions();
    checkDataFreshness(true);

    const timer = setInterval(() => {
      checkDataFreshness(true);
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [portInfo.name, language]);

  const checkDataFreshness = async (triggerAutoRefresh = true) => {
    try {
      if (!isOnline) return;
      const data = await freshnessAPI.getFreshness(triggerAutoRefresh);
      setFreshness(data);
      if (data.refreshed) {
        setSyncBannerMessage(t.dashboard.autoRefreshedBanner);
        setTimeout(() => setSyncBannerMessage(null), 5000);
      }
    } catch (err) {
      console.warn('[DashboardScreen] Freshness check failed:', err);
    }
  };

  const handleManualReFetch = async () => {
    if (refreshingData) return;
    setRefreshingData(true);
    try {
      const res = await freshnessAPI.refreshData(true);
      if (res.metadata) {
        setFreshness({
          grid_age_hours: res.new_age_hours,
          stale: res.stale,
          max_age_hours: 6.0,
          grid_exists: true,
          metadata: res.metadata,
        });
      }
      setSyncBannerMessage(t.dashboard.manualRefreshBanner);
      setTimeout(() => setSyncBannerMessage(null), 4000);
      await loadConditions();
    } catch (err) {
      console.error('[DashboardScreen] Manual re-fetch failed:', err);
    } finally {
      setRefreshingData(false);
    }
  };

  const loadConditions = async () => {
    setLoading(true);
    try {
      if (!isOnline) throw new Error('No network connection (known offline)');
      const profile = { vessel_type: vesselType, risk_tolerance: riskTolerance, role, language };
      const res = await chatAPI.sendMessage(
        `${langInfo.presets.safety} (${portInfo.name})`,
        portInfo.latitude,
        portInfo.longitude,
        profile
      );
      setConditions(res);
      setConditionsLanguage(language);
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
          setConditionsLanguage(language);
          setIsOfflineData(true);
          setOfflineAsOf(bundle.metadata.created);
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

  // Get localized fisherman safety advisory:
  // If conditions was fetched under a different language or hasn't loaded yet,
  // immediately use the localized advisory for the active language.
  // Once the fresh chat response for the new language arrives, display its recommendation.
  const isMatchingLang = conditionsLanguage === language;
  const safetyAdvisory = (isMatchingLang && conditions?.recommendation)
    ? conditions.recommendation
    : langInfo.getAdvisory(portInfo.name, telemetry.riskLevel, telemetry.windSpeed, telemetry.waveHeight, vesselRange);

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
              <Text style={styles.headerTitle}>{t.dashboard.title}</Text>
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
                {loading ? t.dashboard.syncing : isOfflineData ? t.dashboard.offlineCached : t.dashboard.live}
              </Text>
            </View>
          </View>
        </View>

        {isOfflineData && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.tertiary} />
            <Text style={styles.offlineBannerText}>
              OFFLINE mode (last updated: {formatRelativeTime(offlineAsOf)})
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
          <LocationSourceBadge />
        </View>

        {/* Data Freshness & 6-Hour Auto-Sync Monitor */}
        <View style={styles.freshnessCard}>
          <View style={styles.freshnessCardRow}>
            <View
              style={[
                styles.freshnessIconBox,
                freshness?.stale ? { backgroundColor: '#F59E0B' } : { backgroundColor: colors.primaryContainer },
              ]}
            >
              {refreshingData ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <MaterialCommunityIcons
                  name={freshness?.stale ? 'cloud-refresh' : 'shield-sync'}
                  size={20}
                  color={colors.white}
                />
              )}
            </View>

            <View style={styles.freshnessTextCol}>
              <View style={styles.freshnessTitleRow}>
                <Text style={styles.freshnessTitle}>{t.dashboard.freshnessTitle}</Text>
                <View
                  style={[
                    styles.freshnessBadge,
                    freshness?.stale
                      ? { backgroundColor: '#FEF3C7' }
                      : { backgroundColor: '#DCFCE7' },
                  ]}
                >
                  <Text
                    style={[
                      styles.freshnessBadgeText,
                      freshness?.stale ? { color: '#B45309' } : { color: '#15803D' },
                    ]}
                  >
                    {refreshingData
                      ? t.dashboard.freshnessSyncing
                      : freshness?.stale
                      ? t.dashboard.freshnessStale
                      : t.dashboard.freshnessFresh}
                  </Text>
                </View>
              </View>

              <Text style={styles.freshnessAgeText}>
                {t.dashboard.ageLabel}:{' '}
                <Text style={{ fontWeight: '800', color: colors.onSurface }}>
                  {/* Missing age (null/undefined) means "unknown", not "just
                      refreshed" — showing "Live (0.0h)" here used to claim a
                      real, fresh number when the actual value was unavailable. */}
                  {freshness?.grid_age_hours == null
                    ? t.pfz.notAvailable
                    : freshness.grid_age_hours < 0.1
                    ? t.dashboard.liveAge
                    : freshness.grid_age_hours < 1.0
                    ? `${Math.round(freshness.grid_age_hours * 60)} ${t.dashboard.minAgoSuffix}`
                    : `${freshness.grid_age_hours.toFixed(1)}${t.dashboard.hAgoSuffix}`}
                </Text>
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.reFetchBtn, refreshingData && { opacity: 0.6 }]}
              onPress={handleManualReFetch}
              disabled={refreshingData}
            >
              {refreshingData ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="refresh" size={13} color={colors.primary} />
                  <Text style={styles.reFetchBtnText}>{t.dashboard.reFetch}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {syncBannerMessage && (
            <View style={styles.freshnessBannerToast}>
              <Ionicons name="checkmark-circle" size={14} color="#15803D" />
              <Text style={styles.freshnessBannerToastText}>{syncBannerMessage}</Text>
            </View>
          )}
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
                {isWindGood ? `🟢 ${langInfo.uiText.metricStatuses.gentleBreeze}` : `🔴 ${t.dashboard.strongWindWarning}`}
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
                {isWaveGood ? `🟢 ${langInfo.uiText.metricStatuses.normalSwell}` : `🔴 ${t.dashboard.roughSea}`}
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
                {isRainGood ? `🟢 ${langInfo.uiText.metricStatuses.clearSky}` : `🟠 ${t.dashboard.rainDetected}`}
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
              {telemetry.lightning ? t.dashboard.lightningActive : t.dashboard.lightningNone}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: !telemetry.lightning ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.statusBadgeText, { color: !telemetry.lightning ? '#15803D' : '#B91C1C' }]}>
                {!telemetry.lightning ? `🟢 ${langInfo.uiText.metricStatuses.noLightning}` : `🔴 ${t.dashboard.lightningAlert}`}
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
              {telemetry.cyclone ? t.dashboard.cycloneWarning : t.dashboard.cycloneSafe}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: !telemetry.cyclone ? '#DCFCE7' : '#FEE2E2' }]}>
              <Text style={[styles.statusBadgeText, { color: !telemetry.cyclone ? '#15803D' : '#B91C1C' }]}>
                {!telemetry.cyclone ? `🟢 ${langInfo.uiText.metricStatuses.noCyclone}` : `🔴 ${t.dashboard.cycloneThreat}`}
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
                {telemetry.confidence >= 60 ? `🟢 ${langInfo.uiText.metricStatuses.highCertainty}` : `🟠 ${t.dashboard.lowerCertainty}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Active Warnings — real backend/cached alerts, not decorative */}
        <View style={styles.warningsSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <Text style={styles.sectionTitle}>{t.dashboard.safetyWarnings}</Text>
          </View>
          {warnings.length === 0 ? (
            <View style={styles.noWarningsBox}>
              <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.secondary} />
              <Text style={styles.noWarningsText}>{t.dashboard.noActiveWarnings.replace('{port}', portInfo.name)}</Text>
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
          <Text style={styles.recText}>{loading ? t.dashboard.fetchingConditions : safetyAdvisory}</Text>
        </View>

        {/* Fish Species Available in this Zone Section */}
        <View style={styles.fishSectionHeader}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="fish" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>
              {t.dashboard.speciesGuideTitle} ({activeLandingCentre.name.toUpperCase()})
            </Text>
          </View>
          <Text style={styles.fishCentreSub}>
            📍 {activeLandingCentre.name} ({activeLandingCentre.distanceKm} km away) · {activeLandingCentre.district}, {activeLandingCentre.state} · {activeLandingCentre.fishingZone}
          </Text>
        </View>
        <Text style={styles.fishSectionNote}>
          {t.dashboard.speciesGuideNote}
          {conditions && (conditions.sst_c != null || conditions.chlorophyll_mg_m3 != null) ? (
            <Text style={styles.fishSectionNoteBold}>
              {'  '}{t.dashboard.currentWaterPrefix} {conditions.sst_c != null ? `${conditions.sst_c.toFixed(1)}°C SST` : ''}
              {conditions.sst_c != null && conditions.chlorophyll_mg_m3 != null ? ' · ' : ''}
              {conditions.chlorophyll_mg_m3 != null ? `${conditions.chlorophyll_mg_m3.toFixed(2)} mg/m³ Chl-a` : ''}
            </Text>
          ) : null}
        </Text>

        {/* Proximity Landing Centres Switcher */}
        <View style={styles.proximityBar}>
          <View style={styles.proximityHeaderRow}>
            <MaterialCommunityIcons name="map-marker-radius" size={15} color={colors.primaryContainer} />
            <Text style={styles.proximityHeaderTitle}>
              {t.dashboard.nearestCentreLabel || 'Nearest Landing Centre'} & {t.dashboard.nearbyRegionLabel || 'Nearby Regions'}:
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.proximityChipsRow}
          >
            {/* Primary Centre Chip */}
            <TouchableOpacity
              style={[
                styles.proximityChip,
                activeLandingCentre.id === fisheryResult.primaryCentre.id && styles.proximityChipActive,
              ]}
              onPress={() => setSelectedCentreId(fisheryResult.primaryCentre.id)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="star"
                size={13}
                color={activeLandingCentre.id === fisheryResult.primaryCentre.id ? colors.white : '#F59E0B'}
              />
              <Text
                style={[
                  styles.proximityChipText,
                  activeLandingCentre.id === fisheryResult.primaryCentre.id && styles.proximityChipTextActive,
                ]}
              >
                {fisheryResult.primaryCentre.name} ({fisheryResult.primaryCentre.distanceKm} km)
              </Text>
            </TouchableOpacity>

            {/* Nearby Centres Chips */}
            {fisheryResult.nearbyCentres.map((c: LandingCentre) => {
              const isActive = activeLandingCentre.id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.proximityChip, isActive && styles.proximityChipActive]}
                  onPress={() => setSelectedCentreId(c.id)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name="waves"
                    size={13}
                    color={isActive ? colors.white : colors.primary}
                  />
                  <Text
                    style={[
                      styles.proximityChipText,
                      isActive && styles.proximityChipTextActive,
                    ]}
                  >
                    {c.name} ({c.distanceKm} km)
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Collapsible Accordion List for Fish Species */}
        <View style={styles.fishCardsList}>
          {activeLandingCentre.speciesList.map((fish: SpeciesCatchInfo) => {
            const speciesName = fish.localNames[language] || fish.localNames['en'] || fish.name;
            const isExpanded = !!expandedMap[fish.id];
            const abundanceColor =
              fish.abundance === 'VERY HIGH'
                ? '#15803D'
                : fish.abundance === 'HIGH'
                ? '#0288D1'
                : '#B45309';
            const abundanceLabel =
              fish.abundance === 'VERY HIGH'
                ? t.dashboard.veryHighAbundance
                : fish.abundance === 'HIGH'
                ? t.dashboard.highAbundance
                : t.dashboard.moderateAbundance;

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
                        {abundanceLabel}
                      </Text>
                    </View>

                    <Ionicons
                      name={isExpanded ? 'chevron-up-circle' : 'chevron-down-circle'}
                      size={22}
                      color={colors.primaryContainer}
                    />
                  </View>
                </TouchableOpacity>

                {/* Collapsible Details Container */}
                {isExpanded && (
                  <View style={styles.fishDetailsGrid}>
                    <View style={styles.fishDetailItem}>
                      <Text style={styles.fishDetailLabel}>{t.dashboard.targetZoneDepth}</Text>
                      <Text style={styles.fishDetailValue}>
                        📍 {fish.distance} · 🌊 {fish.depth}
                      </Text>
                    </View>

                    <View style={styles.fishDetailItem}>
                      <Text style={styles.fishDetailLabel}>{t.dashboard.recommendedGear}</Text>
                      <Text style={styles.fishDetailValue}>🕸️ {fish.gear}</Text>
                    </View>

                    <View style={styles.fishDetailItem}>
                      <Text style={styles.fishDetailLabel}>{t.dashboard.peakCatchTime}</Text>
                      <Text style={styles.fishDetailValue}>⏰ {fish.peakTime}</Text>
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
            <Text style={styles.actionBtnTextPrimary}>{t.dashboard.inspectFishingZones}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtnSecondary}
            onPress={() => navigation.navigate('Chat')}
          >
            <MaterialCommunityIcons name="chat-processing-outline" size={18} color={colors.primary} />
            <Text style={styles.actionBtnTextSecondary}>{t.dashboard.askAiAssistant}</Text>
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
    marginBottom: 8,
  },
  fishCentreSub: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryContainer,
    marginTop: 3,
  },
  proximityBar: {
    marginTop: 6,
    marginBottom: 14,
  },
  proximityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  proximityHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.3,
  },
  proximityChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  proximityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  proximityChipActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  proximityChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
  },
  proximityChipTextActive: {
    color: colors.white,
  },
  pricePill: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pricePillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#059669',
  },
  detailsTwoCol: {
    flexDirection: 'row',
    gap: 8,
  },
  fishDetailItemHalf: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    padding: 8,
    borderRadius: 8,
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
  freshnessCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  freshnessCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  freshnessIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freshnessTextCol: {
    flex: 1,
  },
  freshnessTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  freshnessTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
    letterSpacing: 0.4,
  },
  freshnessBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  freshnessBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  freshnessAgeText: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  reFetchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(0,102,153,0.15)',
  },
  reFetchBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  freshnessBannerToast: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  freshnessBannerToastText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
});

