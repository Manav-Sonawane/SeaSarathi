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
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { colors } from '../theme/colors';
import { chatAPI, ChatResponse, voiceAPI } from '../services/api';
import { useUserStore } from '../store/userStore';
import { getCachedBundleForOffline, buildOfflineChatAnswer, formatRelativeTime } from '../services/offlineService';
import { useNetworkStore } from '../store/networkStore';
import { detectQueryLanguage, bcp47ToAppLanguage } from '../utils/languageDetection';
import { INDIAN_LANGUAGES } from '../constants/portsAndLanguages';
import { getScreenText } from '../constants/screenTranslations';
import { playTtsClips } from '../services/voiceService';

interface Message {
  id: string;
  sender: 'user' | 'system';
  text?: string;
  time: string;
  data?: ChatResponse & { offline?: boolean; bundle_created_at?: string };
  language?: string; // App language code this message's text/recommendation is in — used for TTS
}

export function ChatScreen({ navigation }: any) {
  const { operatingPort, portInfo, getLanguageInfo, getVesselRangeKm, language, vesselType, riskTolerance, role } = useUserStore();
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);
  const vesselRange = getVesselRangeKm();
  const isOnline = useNetworkStore((s) => s.isOnline);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  // Voice input (STT) — record with expo-audio, upload to backend's
  // /voice/stt (Sarvam saaras:v3), fill the transcript in as the query.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // prepareToRecordAsync() must only be called once per recorder instance —
  // calling it again after a stop() throws "AudioRecorder has already been
  // prepared" (confirmed on-device). record() alone works fine on later
  // presses since the recorder stays prepared for its whole lifetime here.
  const hasPreparedRecorderRef = React.useRef(false);

  // Voice output (TTS) — which message's advisory is currently being
  // synthesized/played, so only one plays at a time and the button can show
  // a loading/playing state.
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Guards state updates after an await against firing once this screen has
  // unmounted (e.g. the user navigates away mid-recording, mid-transcription,
  // or mid-playback) — React logs a warning for a setState on an unmounted
  // component, and without this a stale update could also clobber whatever
  // the next-mounted instance of this screen is doing.
  const isMountedRef = React.useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleMicPress = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri || !isMountedRef.current) return;
        setTranscribing(true);
        try {
          const ext = Platform.OS === 'web' ? 'webm' : 'm4a';
          const mime = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';
          // No language hint — let Sarvam auto-detect purely from audio.
          // Hinting with the profile's saved language biased both the
          // transcription AND the returned language_code toward that language
          // even when a different one was actually spoken (e.g. Marathi
          // getting hinted/tagged as Hindi because the profile was set to
          // Hindi) — auto-detect is what makes bcp47ToAppLanguage() below
          // trustworthy.
          const result = await voiceAPI.stt(uri, `voice.${ext}`, mime);
          if (isMountedRef.current && result.transcript?.trim()) {
            handleSend(result.transcript.trim(), bcp47ToAppLanguage(result.language_code) || undefined);
          }
        } finally {
          if (isMountedRef.current) setTranscribing(false);
        }
      } catch (err) {
        console.error('[ChatScreen] Speech-to-text failed:', err);
        if (isMountedRef.current) setTranscribing(false);
      }
      return;
    }

    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      console.warn('[ChatScreen] Microphone permission denied');
      return;
    }
    if (!isMountedRef.current) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    if (!isMountedRef.current) return;
    if (!hasPreparedRecorderRef.current) {
      await recorder.prepareToRecordAsync();
      hasPreparedRecorderRef.current = true;
    }
    if (!isMountedRef.current) return;
    recorder.record();
    setIsRecording(true);
  };

  const handleSpeakPress = async (msg: Message) => {
    if (!msg.data?.recommendation || speakingMessageId) return;
    setSpeakingMessageId(msg.id);
    try {
      const result = await voiceAPI.tts(msg.data.recommendation, msg.language || language);
      if (!isMountedRef.current) return;
      await playTtsClips(result.audios);
    } catch (err) {
      console.error('[ChatScreen] Text-to-speech failed:', err);
    } finally {
      if (isMountedRef.current) setSpeakingMessageId(null);
    }
  };

  // Seed the localized welcome message — but only while the conversation is
  // still empty. This used to unconditionally reset `messages` whenever
  // language/port/vesselRange changed, which meant a fisherman mid-chat who
  // simply switched vessel type (which changes vesselRange) or home port in
  // Profile would come back to find their entire conversation wiped. Now it
  // only (re-)seeds the greeting for a fresh/never-touched chat — e.g. right
  // after first mount, or if the language changes before the user has sent
  // anything — and leaves an in-progress conversation alone.
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length > 0) return prev;

      const initialAdv = langInfo.getAdvisory(portInfo.name, 'LOW', 16, 1.1, vesselRange);
      return [
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
          language: langInfo.code,
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
            sst_c: null,
            chlorophyll_mg_m3: null,
            alerts: [],
          },
        },
      ];
    });
  }, [language, portInfo.name, vesselRange]);

  const handleSend = async (userText?: string, overrideLanguage?: string) => {
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

    // Respond in whatever language this message was actually in — not
    // necessarily the profile's saved default (a fisherman might type one
    // question in Malayalam and the next in English). For voice input,
    // `overrideLanguage` carries Sarvam STT's own audio-detected language
    // (see handleMicPress) instead of re-guessing from the transcript text —
    // script-based detection can't tell Hindi and Marathi apart (same
    // Devanagari script), but Sarvam heard which one was actually spoken.
    const queryLanguage = overrideLanguage || detectQueryLanguage(textToSend);
    const queryLangInfo = INDIAN_LANGUAGES.find((l) => l.code === queryLanguage) || langInfo;

    try {
      // Known offline (UPDATE.md 3.4 "automatic switch to offline mode") —
      // skip straight to the cached fallback instead of waiting out a 60s
      // request timeout on a connection we already know has no signal.
      if (!isOnline) throw new Error('No network connection (known offline)');

      const profile = { vessel_type: vesselType, risk_tolerance: riskTolerance, role, language: queryLanguage };
      const res = await chatAPI.sendMessage(textToSend, portInfo.latitude, portInfo.longitude, profile);

      const sysMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
        language: queryLanguage,
        // Show the backend's actual (Sarvam-generated) recommendation as-is.
        // Only fall back to the static localized template if the backend
        // returned no text at all (e.g. an empty string) — and even then,
        // in the language the query was actually typed in.
        data: {
          ...res,
          recommendation:
            res.recommendation ||
            queryLangInfo.getAdvisory(portInfo.name, res.risk_level, res.wind_kmh, res.wave_m, vesselRange),
        },
      };
      setMessages((prev) => [...prev, sysMsg]);
    } catch (err) {
      console.error('[ChatScreen] Live /chat call failed, trying offline cache:', err);

      // Live backend call failed — only now do we reach for the cached bundle.
      // A successful backend response is never touched or replaced by this path.
      let fallbackData: ChatResponse & { offline?: boolean };
      try {
        const bundle = await getCachedBundleForOffline();
        if (bundle) {
          const offlineAnswer = buildOfflineChatAnswer(
            bundle,
            portInfo.latitude,
            portInfo.longitude,
            portInfo.name
          );
          fallbackData = offlineAnswer;
        } else {
          throw new Error('No offline bundle cached');
        }
      } catch {
        // No cached bundle either — last resort is the old static template,
        // clearly not real data.
        fallbackData = {
          risk_level: 'LOW',
          wind_kmh: 16,
          wave_m: 1.1,
          rainfall_mm: 0.0,
          lightning: false,
          cyclone: false,
          recommendation: queryLangInfo.getAdvisory(portInfo.name, 'LOW', 16, 1.1, vesselRange),
          confidence: 85,
          sources: [],
          sst_c: null,
          chlorophyll_mg_m3: null,
          alerts: [],
        };
      }

      const sysMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'system',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
        language: queryLanguage,
        data: fallbackData,
      };
      setMessages((prev) => [...prev, sysMsg]);
    } finally {
      setLoading(false);
    }
  };

  const renderRiskBadge = (riskLevel: string, confidence?: number) => {
    let bgColor = '#16A34A'; // Green for LOW risk
    let title = t.chat.lowRisk;
    let sub = langInfo.uiText.safeVoyage;
    let score = `${confidence ?? 92}${t.chat.safetyIndexSuffix}`;
    let iconName = 'verified';

    if (riskLevel === 'MODERATE') {
      bgColor = '#D97706'; // Amber for MODERATE
      title = t.chat.moderateRisk;
      sub = langInfo.uiText.moderateRisk;
      score = `${confidence ?? 60}${t.chat.safetyIndexSuffix}`;
      iconName = 'warning';
    } else if (riskLevel === 'HIGH') {
      bgColor = '#DC2626'; // Red for HIGH risk
      title = t.chat.highRisk;
      sub = langInfo.uiText.highRisk;
      score = `${confidence ?? 25}${t.chat.safetyIndexSuffix}`;
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
              <Text style={styles.offlineChipText}>{t.chat.onlineLabel}</Text>
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

            <TouchableOpacity
              style={[styles.presetChip, { borderColor: colors.primary, backgroundColor: 'rgba(0,102,153,0.08)' }]}
              onPress={() => handleSend(t.chat.freshnessQuery)}
            >
              <MaterialCommunityIcons name="clock-check-outline" size={14} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={[styles.presetChipText, { color: colors.primary, fontWeight: '700' }]}>
                {t.chat.freshnessButtonLabel}
              </Text>
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
                  <Text style={styles.msgTime}>{t.chat.youLabel} • {msg.time}</Text>
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
                  <TouchableOpacity
                    style={styles.speakButton}
                    onPress={() => handleSpeakPress(msg)}
                    disabled={speakingMessageId !== null}
                  >
                    {speakingMessageId === msg.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="volume-high-outline" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.cardContainer}>
                  {data.offline && (
                    <View style={styles.offlineBanner}>
                      <Ionicons name="cloud-offline-outline" size={14} color={colors.tertiary} />
                      <Text style={styles.offlineBannerText}>
                        {t.chat.offlineModePrefix} {formatRelativeTime(data.bundle_created_at)})
                      </Text>
                    </View>
                  )}

                  {renderRiskBadge(data.risk_level, data.confidence)}

                  {data.data_freshness && (
                    <View
                      style={[
                        styles.freshnessChatPill,
                        data.data_freshness.refreshed
                          ? { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }
                          : { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={data.data_freshness.refreshed ? 'cloud-refresh' : 'shield-check'}
                        size={14}
                        color={data.data_freshness.refreshed ? '#B45309' : '#15803D'}
                      />
                      <Text
                        style={[
                          styles.freshnessChatPillText,
                          data.data_freshness.refreshed ? { color: '#B45309' } : { color: '#166534' },
                        ]}
                      >
                        {/* grid_age_hours (not age_hours — that field never
                            existed on the real API response, a pre-existing
                            type error) missing means "unknown", not "just
                            refreshed"; same for point_count. */}
                        {t.dashboard.ageLabel}: {data.data_freshness.grid_age_hours != null ? `${data.data_freshness.grid_age_hours.toFixed(1)}${t.dashboard.hAgoSuffix}` : t.pfz.notAvailable}
                        {data.data_freshness.refreshed ? ` • ${t.chat.autoRefreshedLabel}` : ` • ${t.dashboard.freshnessFresh}`}
                        {' • '}
                        {data.data_freshness.metadata?.point_count ?? t.pfz.notAvailable} {t.dashboard.marinePoints}
                      </Text>
                    </View>
                  )}

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
            <Text style={styles.loadingText}>{t.chat.loadingText}</Text>
          </View>
        )}
      </ScrollView>

      {/* Input Bar with Localized Placeholder */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={
            isRecording ? t.voice.listening : transcribing ? t.voice.transcribing : langInfo.uiText.askPlaceholder
          }
          placeholderTextColor={colors.onSurfaceVariant}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => handleSend()}
          editable={!isRecording && !transcribing}
        />
        <TouchableOpacity
          style={[styles.micButton, isRecording && styles.micButtonActive]}
          onPress={handleMicPress}
          disabled={transcribing}
        >
          {transcribing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={18} color={colors.white} />
          )}
        </TouchableOpacity>
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
    flex: 1,
  },
  speakButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
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
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: colors.tertiaryContainer,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  offlineBannerText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.tertiary,
    flex: 1,
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
    fontWeight: '800',
    color: colors.primary,
  },
  freshnessChatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  freshnessChatPillText: {
    fontSize: 11,
    fontWeight: '700',
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
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: {
    backgroundColor: colors.error,
  },
});
