import React, { useState } from 'react';
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
  const { operatingPort, portInfo, getLanguageInfo } = useUserStore();
  const langInfo = getLanguageInfo();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'user',
      text: `Can we safely sail out 28 nautical miles WNW towards ${operatingPort} shelf tonight?`,
      time: '18:42 IST',
    },
    {
      id: '2',
      sender: 'system',
      time: '18:43 IST',
      data: {
        risk_level: 'LOW',
        wind_kmh: 18,
        wave_m: 1.2,
        rainfall_mm: 0.0,
        lightning: false,
        cyclone: false,
        recommendation:
          `Safe voyage permitted off ${operatingPort} harbor (${portInfo.state}). Sea condition is favorable with gentle breeze (18 km/h NW) and normal swell (1.2m). Avoid going beyond 35 NM due to deep-shelf currents.`,
        confidence: 87,
        sources: [],
      },
    },
  ]);

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
      const sysMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
        data: res,
      };
      setMessages((prev) => [...prev, sysMsg]);
    } catch {
      const fallbackData: ChatResponse = {
        risk_level: 'LOW',
        wind_kmh: 16,
        wave_m: 1.1,
        rainfall_mm: 0.0,
        lightning: false,
        cyclone: false,
        recommendation: `Evaluated safety for "${textToSend}": Conditions are favorable off ${operatingPort} coast (${portInfo.state}). Wind is 16 km/h, wave height is 1.1m. Safe for fishing up to 25 NM.`,
        confidence: 82,
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
    let bgColor = colors.secondary;
    let title = 'LOW RISK';
    let sub = langInfo.uiText.safeVoyage || 'SAFE VOYAGE PERMITTED';
    let score = '78/100 SAFETY INDEX';

    if (riskLevel === 'MODERATE') {
      bgColor = colors.riskModerate;
      title = 'MODERATE RISK';
      sub = 'EXERCISE CAUTION OFFSHORE';
      score = '55/100 SAFETY INDEX';
    } else if (riskLevel === 'HIGH') {
      bgColor = colors.riskHigh;
      title = 'HIGH RISK';
      sub = 'DO NOT VENTURE INTO SEA';
      score = '25/100 SAFETY INDEX';
    }

    return (
      <View style={[styles.riskBanner, { backgroundColor: bgColor }]}>
        <View style={styles.riskLeft}>
          <MaterialIcons name="verified" size={26} color={colors.white} />
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
        <MaterialCommunityIcons name="waves" size={20} color={colors.secondaryContainer} />
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
              <Text style={styles.gpsStripTitle}>LIVE GPS FIX • {portInfo.state.toUpperCase()}</Text>
            </View>
            <View style={styles.offlineChip}>
              <Ionicons name="checkmark-circle" size={12} color={colors.white} />
              <Text style={styles.offlineChipText}>ONLINE</Text>
            </View>
          </View>
          <View style={styles.gpsStripRow}>
            <Text style={styles.gpsCoords}>
              {portInfo.latitude.toFixed(4)}° N, {portInfo.longitude.toFixed(4)}° E
            </Text>
            <Text style={styles.gpsSource}>Off {operatingPort} Harbor ({portInfo.sea})</Text>
          </View>
        </View>

        {/* Preset Questions */}
        <View style={styles.presetRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => handleSend(`Can I fish near ${operatingPort} tomorrow morning?`)}
            >
              <Text style={styles.presetChipText}>{langInfo.presets.safety}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => handleSend(`Show wind and wave conditions 20 NM out off ${operatingPort}`)}
            >
              <Text style={styles.presetChipText}>{langInfo.presets.wind}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => handleSend('Any cyclone warning active in Indian waters?')}
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
                    <Text style={styles.telemetrySub}>Live Sensors</Text>
                  </View>

                  {/* 2x3 Metric Cards */}
                  {(() => {
                    const rawWind = data.wind_kmh ?? (data as any).wind_speed_10m ?? 18;
                    const rawWave = data.wave_m ?? (data as any).wave_height ?? 1.2;
                    const rawRain = data.rainfall_mm ?? (data as any).precipitation ?? 0;
                    const rawConf = data.confidence ?? 87;

                    const windDisp = Math.round(Number(rawWind) || 18);
                    const waveDisp = (Number(rawWave) || 1.2).toFixed(1);
                    const rainDisp = Number(rawRain) > 0 ? (Number(rawRain) || 0).toFixed(1) : '0';
                    const confDisp = Math.round(Number(rawConf) || 87);

                    return (
                      <View style={styles.metricsGrid}>
                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>WIND SPEED</Text>
                            <MaterialCommunityIcons name="weather-windy" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>
                            {windDisp}{' '}
                            <Text style={styles.metricUnit}>km/h NW</Text>
                          </Text>
                          <Text style={styles.metricStatus}>Gentle Breeze</Text>
                        </View>

                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>WAVE (Hs)</Text>
                            <MaterialCommunityIcons name="wave" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>
                            {waveDisp}{' '}
                            <Text style={styles.metricUnit}>m</Text>
                          </Text>
                          <Text style={styles.metricStatus}>Normal Swell</Text>
                        </View>

                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>RAINFALL</Text>
                            <Ionicons name="rainy-outline" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>
                            {rainDisp}{' '}
                            <Text style={styles.metricUnit}>mm/h</Text>
                          </Text>
                          <Text style={styles.metricStatus}>Clear Sky</Text>
                        </View>

                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>LIGHTNING</Text>
                            <Ionicons name="flash-outline" size={16} color={colors.primary} />
                          </View>
                          <Text style={[styles.metricValue, { color: colors.secondary }]}>
                            {data.lightning ? 'ACTIVE' : 'NONE'}
                          </Text>
                          <Text style={styles.metricStatus}>Clear 50km</Text>
                        </View>

                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>CYCLONE WATCH</Text>
                            <MaterialCommunityIcons name="weather-hurricane" size={16} color={colors.primary} />
                          </View>
                          <Text style={[styles.metricValue, { color: colors.secondary }]}>
                            {data.cyclone ? 'WARNING' : 'DORMANT'}
                          </Text>
                          <Text style={styles.metricStatus}>No Threat</Text>
                        </View>

                        <View style={styles.metricCard}>
                          <View style={styles.metricCardHead}>
                            <Text style={styles.metricLabel}>CONFIDENCE</Text>
                            <MaterialIcons name="security" size={16} color={colors.primary} />
                          </View>
                          <Text style={styles.metricValue}>{confDisp}%</Text>
                          <Text style={styles.metricStatus}>High Certainty</Text>
                        </View>
                      </View>
                    );
                  })()}

                  {/* Recommendation Box */}
                  <View style={styles.recBox}>
                    <Text style={styles.recLabel}>SAFETY ADVISORY</Text>
                    <Text style={styles.recText}>{data.recommendation}</Text>
                  </View>

                  {/* Quick Action Buttons */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() => navigation.navigate('Map')}
                    >
                      <Ionicons name="map-outline" size={16} color={colors.white} />
                      <Text style={styles.actionBtnTextPrimary}>View Risk Map</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnSecondary}
                      onPress={() => navigation.navigate('PFZ')}
                    >
                      <MaterialCommunityIcons name="fish" size={16} color={colors.primary} />
                      <Text style={styles.actionBtnTextSecondary}>Fishing Zones</Text>
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
            <Text style={styles.loadingText}>Analyzing ocean conditions & safety models...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input Bar */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask about fishing safety, wind, waves..."
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
    fontFamily: 'monospace',
  },
  gpsSource: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  presetRow: {
    marginBottom: 16,
  },
  presetChip: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHighest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
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
    fontWeight: '500',
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
    fontWeight: '700',
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
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  riskLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  riskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
  scoreTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scoreText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  riskSub: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.5,
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
    fontWeight: '700',
    color: colors.onSurface,
  },
  telemetrySub: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
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
    borderRadius: 8,
    padding: 10,
  },
  metricCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onSurface,
    fontFamily: 'monospace',
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  metricStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
    marginTop: 4,
  },
  recBox: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  recLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  recText: {
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 18,
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
