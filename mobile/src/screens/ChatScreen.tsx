import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { chatAPI, ChatResponse } from '../services/api';
import { useUserStore } from '../store/userStore';

interface Message {
  id: string;
  sender: 'user' | 'system';
  text?: string;
  time: string;
  data?: ChatResponse;
}

export function ChatScreen({ navigation }: any) {
  const { operatingPort, portInfo, getLanguageInfo, getVesselRangeKm, language } = useUserStore();
  const langInfo = getLanguageInfo();
  const vesselRange = getVesselRangeKm();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  // Generate localized initial welcome message whenever language or port changes
  useEffect(() => {
    const initialAdv = langInfo.getAdvisory(portInfo.name, 'LOW', 16, 1.1, vesselRange);

    const initialMsgs: Message[] = [
      {
        id: '1',
        sender: 'user',
        text: `${langInfo.presets.safety} (${portInfo.name})`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
      },
      {
        id: '2',
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
        data: {
          risk_level: 'LOW',
          wind_kmh: 16,
          wave_m: 1.1,
          rainfall_mm: 0.0,
          lightning: false,
          cyclone: false,
          recommendation: initialAdv,
          confidence: 89,
          sources: [],
        },
      },
    ];

    setMessages(initialMsgs);
  }, [language, portInfo.name, vesselRange]);

  const handleSend = async (userText?: string) => {
    const textToSend = userText || query;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    try {
      const res = await chatAPI.sendMessage(textToSend, portInfo.latitude, portInfo.longitude);
      // Enhance backend response with localized advisory text in the selected language
      const localizedAdv = langInfo.getAdvisory(
        portInfo.name,
        res.risk_level,
        res.wind_kmh,
        res.wave_m,
        vesselRange
      );

      const sysMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
        data: {
          ...res,
          recommendation: localizedAdv || res.recommendation,
        },
      };
      setMessages((prev) => [...prev, sysMsg]);
    } catch {
      const fallbackAdv = langInfo.getAdvisory(portInfo.name, 'LOW', 16, 1.1, vesselRange);
      const fallbackData: ChatResponse = {
        risk_level: 'LOW',
        wind_kmh: 16,
        wave_m: 1.1,
        rainfall_mm: 0.0,
        lightning: false,
        cyclone: false,
        recommendation: fallbackAdv,
        confidence: 85,
        sources: [],
      };
      const sysMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
        data: fallbackData,
      };
      setMessages((prev) => [...prev, sysMsg]);
    } finally {
      setLoading(false);
    }
  };

  const renderRiskBadge = (riskLevel: string) => {
    let bgColor = '#16A34A'; // Green for LOW risk
    let title = 'LOW RISK';
    let sub = langInfo.uiText.safeVoyage;
    let score = '92/100 SAFETY INDEX';
    let iconName = 'verified';

    if (riskLevel === 'MODERATE') {
      bgColor = '#D97706'; // Amber for MODERATE
      title = 'MODERATE RISK';
      sub = langInfo.uiText.moderateRisk;
      score = '60/100 SAFETY INDEX';
      iconName = 'warning';
    } else if (riskLevel === 'HIGH') {
      bgColor = '#DC2626'; // Red for HIGH risk
      title = 'HIGH RISK';
      sub = langInfo.uiText.highRisk;
      score = '25/100 SAFETY INDEX';
      iconName = 'error';
    }

    return (
      <View style={[styles.riskBanner, { backgroundColor: bgColor }]}>
        <View style={styles.riskLeft}>
          <MaterialIcons name={iconName as any} size={28} color={colors.white} />
          <View>
            <View style={styles.riskTitleRow}>
              <Text style={styles.riskTitle}>{title}</Text>
              <View style={styles.scoreTag}>
                <Text style={styles.scoreText}>{score}</Text>
              </View>
            </View>
            <Text style={styles.riskSub}>{sub}</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="waves" size={24} color="rgba(255,255,255,0.8)" />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* GPS Location Strip */}
        <View style={styles.gpsStrip}>
          <View style={styles.gpsStripRow}>
            <View style={styles.gpsIconRow}>
              <MaterialCommunityIcons name="satellite-variant" size={18} color={colors.primaryContainer} />
              <Text style={styles.gpsStripTitle}>
                {langInfo.uiText.liveGps} • {portInfo.state.toUpperCase()}
              </Text>
            </View>
            <View style={styles.offlineChip}>
              <Ionicons name="checkmark-circle" size={12} color={colors.white} />
              <Text style={styles.offlineChipText}>ONLINE</Text>
            </View>
          </View>
          <View style={styles.gpsStripRow}>
            <Text style={styles.gpsCoords}>
              📍 {portInfo.name} ({portInfo.latitude.toFixed(4)}° N, {portInfo.longitude.toFixed(4)}° E)
            </Text>
            <Text style={styles.gpsSource}>{portInfo.sea}</Text>
          </View>
        </View>

        {/* Preset Questions */}
        <View style={styles.presetRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => handleSend(`${langInfo.presets.safety} (${portInfo.name})`)}
            >
              <Text style={styles.presetChipText}>{langInfo.presets.safety}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => handleSend(`${langInfo.presets.wind} (${portInfo.name})`)}
            >
              <Text style={styles.presetChipText}>{langInfo.presets.wind}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => handleSend(langInfo.presets.cyclone)}
            >
              <Text style={styles.presetChipText}>{langInfo.presets.cyclone}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Message Stream */}
        {messages.map((msg) => {
          if (msg.sender === 'user') {
            return (
              <View key={msg.id} style={styles.userBubbleWrapper}>
                <View style={styles.userBubble}>
                  <Text style={styles.userText}>{msg.text}</Text>
                </View>
                <View style={styles.msgFooter}>
                  <Text style={styles.msgTime}>You • {msg.time}</Text>
                  <Ionicons name="checkmark-done" size={14} color={colors.secondary} />
                </View>
              </View>
            );
          } else {
            const data = msg.data!;
            return (
              <View key={msg.id} style={styles.systemWrapper}>
                <View style={styles.aiHeader}>
                  <View style={styles.aiAvatar}>
                    <MaterialCommunityIcons name="anchor" size={16} color={colors.white} />
                  </View>
                  <Text style={styles.aiTitle}>{langInfo.uiText.aiTitle}</Text>
                </View>

                <View style={styles.cardContainer}>
                  {renderRiskBadge(data.risk_level)}

                  {/* Telemetry Header */}
                  <View style={styles.telemetryHeader}>
                    <View style={styles.telemetryTitleRow}>
                      <MaterialCommunityIcons name="speedometer" size={18} color={colors.primary} />
                      <Text style={styles.telemetryTitle}>{langInfo.uiText.oceanConditions}</Text>
                    </View>
                    <Text style={styles.telemetrySub}>{langInfo.uiText.liveSensors}</Text>
                  </View>

                  {/* 2x3 Metric Cards with Color-Coded Condition Badges */}
                  {(() => {
                    const rawWind = data.wind_kmh ?? 16;
                    const rawWave = data.wave_m ?? 1.1;
                    const rawRain = data.rainfall_mm ?? 0;
                    const rawConf = data.confidence ?? 89;

                    const windDisp = Math.round(Number(rawWind) || 16);
                    const waveDisp = (Number(rawWave) || 1.1).toFixed(1);
                    const rainDisp = Number(rawRain) > 0 ? (Number(rawRain) || 0).toFixed(1) : '0';
                    const confDisp = Math.round(Number(rawConf) || 89);

                    // Condition Badge Color Helpers
                    const isWindGood = windDisp < 25;
                    const isWaveGood = Number(waveDisp) <= 1.5;
                    const isRainGood = Number(rainDisp) === 0;

                    return (
                      <View style={styles.metricsGrid}>
                        {/* Wind Metric */}
                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>{langInfo.uiText.metrics.windSpeed}</Text>
                            <MaterialCommunityIcons name="weather-windy" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>
                            {windDisp} <Text style={styles.metricUnit}>km/h</Text>
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: isWindGood ? '#DCFCE7' : '#FEE2E2' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: isWindGood ? '#15803D' : '#B91C1C' },
                              ]}
                            >
                              {isWindGood
                                ? `🟢 ${langInfo.uiText.metricStatuses.gentleBreeze}`
                                : '🔴 Strong Wind Warning'}
                            </Text>
                          </View>
                        </View>

                        {/* Wave Metric */}
                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>{langInfo.uiText.metrics.waveHeight}</Text>
                            <MaterialCommunityIcons name="wave" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>
                            {waveDisp} <Text style={styles.metricUnit}>m</Text>
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: isWaveGood ? '#DCFCE7' : '#FEE2E2' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: isWaveGood ? '#15803D' : '#B91C1C' },
                              ]}
                            >
                              {isWaveGood
                                ? `🟢 ${langInfo.uiText.metricStatuses.normalSwell}`
                                : '🔴 Rough Sea (>1.5m)'}
                            </Text>
                          </View>
                        </View>

                        {/* Rainfall Metric */}
                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>{langInfo.uiText.metrics.rainfall}</Text>
                            <Ionicons name="rainy-outline" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>
                            {rainDisp} <Text style={styles.metricUnit}>mm/h</Text>
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: isRainGood ? '#DCFCE7' : '#FEF3C7' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: isRainGood ? '#15803D' : '#B45309' },
                              ]}
                            >
                              {isRainGood
                                ? `🟢 ${langInfo.uiText.metricStatuses.clearSky}`
                                : '🟠 Moderate Rain'}
                            </Text>
                          </View>
                        </View>

                        {/* Lightning Metric */}
                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>{langInfo.uiText.metrics.lightning}</Text>
                            <Ionicons name="flash-outline" size={16} color={colors.primary} />
                          </View>
                          <Text style={[styles.metricValue, { color: data.lightning ? '#DC2626' : '#16A34A' }]}>
                            {data.lightning ? 'ACTIVE' : 'NONE'}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: !data.lightning ? '#DCFCE7' : '#FEE2E2' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: !data.lightning ? '#15803D' : '#B91C1C' },
                              ]}
                            >
                              {!data.lightning
                                ? `🟢 ${langInfo.uiText.metricStatuses.noLightning}`
                                : '🔴 Lightning Alert'}
                            </Text>
                          </View>
                        </View>

                        {/* Cyclone Watch Metric */}
                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>{langInfo.uiText.metrics.cycloneWatch}</Text>
                            <MaterialCommunityIcons name="weather-hurricane" size={16} color={colors.primary} />
                          </View>
                          <Text style={[styles.metricValue, { color: data.cyclone ? '#DC2626' : '#16A34A' }]}>
                            {data.cyclone ? 'WARNING' : 'SAFE'}
                          </Text>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: !data.cyclone ? '#DCFCE7' : '#FEE2E2' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: !data.cyclone ? '#15803D' : '#B91C1C' },
                              ]}
                            >
                              {!data.cyclone
                                ? `🟢 ${langInfo.uiText.metricStatuses.noCyclone}`
                                : '🔴 Cyclone Threat'}
                            </Text>
                          </View>
                        </View>

                        {/* Catch Confidence Metric */}
                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>{langInfo.uiText.metrics.confidence}</Text>
                            <MaterialIcons name="security" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>{confDisp}%</Text>
                          <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
                            <Text style={[styles.statusBadgeText, { color: '#15803D' }]}>
                              🟢 {langInfo.uiText.metricStatuses.highCertainty}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Fisherman-Friendly High-Visibility Advisory Card */}
                  <View style={styles.recBox}>
                    <View style={styles.recHeaderRow}>
                      <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
                      <Text style={styles.recLabel}>{langInfo.uiText.safetyAdvisoryHeader}</Text>
                    </View>
                    <Text style={styles.recText}>{data.recommendation}</Text>
                  </View>

                  {/* Quick Action Navigation Buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() => navigation.navigate('Map')}
                    >
                      <Ionicons name="map-outline" size={16} color={colors.white} />
                      <Text style={styles.actionBtnTextPrimary}>{langInfo.uiText.viewMap}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnSecondary}
                      onPress={() => navigation.navigate('PFZ')}
                    >
                      <MaterialCommunityIcons name="fish" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnTextSecondary}>{langInfo.uiText.fishingZones}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }
        })}

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primaryContainer} />
            <Text style={styles.loadingText}>Fetching localized ocean conditions...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input Bar with Localized Placeholder */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={langInfo.uiText.askPlaceholder}
          placeholderTextColor={colors.onSurfaceVariant}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => handleSend()}
        />
        <TouchableOpacity style={styles.sendButton} onPress={() => handleSend()}>
          <Ionicons name="send" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
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
  gpsStrip: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
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
    letterSpacing: 0.5,
  },
  offlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  offlineChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  gpsCoords: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurface,
  },
  gpsSource: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  presetRow: {
    marginBottom: 16,
  },
  presetChip: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1.5,
    borderColor: colors.primaryContainer,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  userBubbleWrapper: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    marginBottom: 16,
  },
  userBubble: {
    backgroundColor: colors.primaryContainer,
    padding: 14,
    borderRadius: 14,
    borderTopRightRadius: 2,
  },
  userText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    lineHeight: 20,
  },
  msgFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  msgTime: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  systemWrapper: {
    width: '100%',
    marginBottom: 20,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  cardContainer: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  riskBanner: {
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  riskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  riskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.white,
  },
  scoreTag: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scoreText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  riskSub: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  telemetryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  telemetryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  telemetryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.onSurface,
  },
  telemetrySub: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
  },
  metricCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.onSurface,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  statusBadge: {
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
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
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  recHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  recLabel: {
    fontSize: 11,
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
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: colors.primaryContainer,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnTextPrimary: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  actionBtnSecondary: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnTextSecondary: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  input: {
    flex: 1,
    height: 46,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 23,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.onSurface,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
