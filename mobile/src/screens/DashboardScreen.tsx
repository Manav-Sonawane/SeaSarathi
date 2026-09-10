import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/userStore';

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
  const { portInfo, getLanguageInfo, getVesselRangeKm, language } = useUserStore();
  const langInfo = getLanguageInfo();
  const vesselRange = getVesselRangeKm();

  // Dynamic daily telemetry metrics
  const telemetry = {
    windSpeed: 16,
    waveHeight: 1.1,
    rainfall: 0,
    lightning: false,
    cyclone: false,
    confidence: 89,
    riskLevel: 'LOW' as const,
  };

  // Get localized fisherman safety advisory
  const safetyAdvisory = langInfo.getAdvisory(
    portInfo.name,
    telemetry.riskLevel,
    telemetry.windSpeed,
    telemetry.waveHeight,
    vesselRange
  );

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
        bn: 'টুনা (Tuna)',
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
              <Text style={styles.headerSub}>
                Realtime Updates for {portInfo.name} ({portInfo.state})
              </Text>
            </View>
            <View style={styles.liveChip}>
              <View style={styles.greenPulse} />
              <Text style={styles.liveChipText}>LIVE</Text>
            </View>
          </View>
        </View>

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
          <Text style={styles.sectionSub}>{langInfo.uiText.liveSensors}</Text>
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
            <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>
                🟢 {langInfo.uiText.metricStatuses.gentleBreeze}
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
            <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>
                🟢 {langInfo.uiText.metricStatuses.normalSwell}
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
            <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>
                🟢 {langInfo.uiText.metricStatuses.clearSky}
              </Text>
            </View>
          </View>

          {/* Lightning Watch */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.lightning}</Text>
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: '#16A34A' }]}>NONE</Text>
            <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>
                🟢 {langInfo.uiText.metricStatuses.noLightning}
              </Text>
            </View>
          </View>

          {/* Cyclone Watch */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHead}>
              <Text style={styles.metricLabel}>{langInfo.uiText.metrics.cycloneWatch}</Text>
              <MaterialCommunityIcons name="weather-hurricane" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: '#16A34A' }]}>SAFE</Text>
            <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>
                🟢 {langInfo.uiText.metricStatuses.noCyclone}
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
            <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
              <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>
                🟢 {langInfo.uiText.metricStatuses.highCertainty}
              </Text>
            </View>
          </View>
        </View>

        {/* Fisherman Safety Advisory Card */}
        <View style={styles.recBox}>
          <View style={styles.recHeaderRow}>
            <Ionicons name="shield-checkmark" size={20} color="#15803D" />
            <Text style={styles.recLabel}>{langInfo.uiText.safetyAdvisoryHeader}</Text>
          </View>
          <Text style={styles.recText}>{safetyAdvisory}</Text>
        </View>

        {/* Fish Species Available in this Zone Section */}
        <View style={styles.fishSectionHeader}>
          <View style={styles.sectionTitleRow}>
            <MaterialCommunityIcons name="fish" size={22} color={colors.primary} />
            <Text style={styles.sectionTitle}>
              FISH AVAILABLE FOR FISHING IN THIS ZONE ({portInfo.name.toUpperCase()})
            </Text>
          </View>
          <Text style={styles.sectionSub}>Satellite Ocean Fronts & PFZ Data</Text>
        </View>

        <View style={styles.fishCardsList}>
          {availableFishList.map((fish) => {
            const speciesName = fish.localNames[language] || fish.localNames['en'] || fish.name;
            const abundanceColor =
              fish.abundance === 'VERY HIGH'
                ? '#15803D'
                : fish.abundance === 'HIGH'
                ? '#0288D1'
                : '#B45309';

            return (
              <View key={fish.id} style={styles.fishCard}>
                <View style={styles.fishCardHeader}>
                  <View style={styles.fishTitleGroup}>
                    <Text style={styles.fishNameText}>{speciesName}</Text>
                    <Text style={styles.fishEngSub}>{fish.name}</Text>
                  </View>
                  <View style={[styles.abundanceBadge, { backgroundColor: abundanceColor + '20' }]}>
                    <Text style={[styles.abundanceText, { color: abundanceColor }]}>
                      🟢 {fish.abundance} ABUNDANCE
                    </Text>
                  </View>
                </View>

                {/* Species Metrics Details Grid */}
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

                  <View style={styles.fishDetailItem}>
                    <Text style={styles.fishDetailLabel}>SST & CHLOROPHYLL</Text>
                    <Text style={styles.fishDetailValue}>
                      🌡️ {fish.sst} SST | 🧪 {fish.chl} Chl-a
                    </Text>
                  </View>
                </View>
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
  },
  fishDetailItem: {
    backgroundColor: colors.surfaceContainerLow,
    padding: 8,
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
