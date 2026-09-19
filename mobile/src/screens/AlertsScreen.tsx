import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { alertsAPI, Alert, ImdStatus } from '../services/api';

import { useUserStore } from '../store/userStore';
import { useShallow } from 'zustand/react/shallow';
import { getCachedBundleForOffline, buildOfflineAlerts, formatRelativeTime } from '../services/offlineService';
import { useNetworkStore } from '../store/networkStore';
import { getScreenText } from '../constants/screenTranslations';
import { LocationSourceBadge } from '../components/LocationSourceBadge';
import { ZonalNewsFeed } from '../components/ZonalNewsFeed';
import { fillText } from '../utils/formatText';

// Static example card shown only until the first /alerts response (live or
// cached) arrives, so the screen isn't empty on first paint.
const PLACEHOLDER_ALERTS = (portInfo: any, operatingPort: string, fetchingText: string) => [
  {
    id: '1',
    category: 'navigational' as const,
    type: 'INFO',
    title: fetchingText,
    sub: `${operatingPort.toUpperCase()} (${portInfo.state.toUpperCase()})`,
    distText: '—',
    vector: '—',
    breachTime: '—',
    body: '',
    coords: `${portInfo.latitude.toFixed(2)}° N, ${portInfo.longitude.toFixed(2)}° E`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
  },
];

// "3 min ago" / "2 h ago" / "1 d ago" for an age in minutes.
function formatAge(t: ReturnType<typeof getScreenText>, minutes: number | null | undefined): string {
  if (minutes == null) return t.alerts.ageUnknown;
  if (minutes < 1) return t.alerts.ageJustNow;
  if (minutes < 60) return fillText(t.alerts.ageMinutes, { n: Math.round(minutes) });
  if (minutes < 60 * 48) return fillText(t.alerts.ageHours, { n: Math.round(minutes / 60) });
  return fillText(t.alerts.ageDays, { n: Math.round(minutes / 1440) });
}

// Reload alerts this often while the screen is open, and whenever the tab is
// re-opened — a screen left open must never keep showing hours-old alerts.
const AUTO_REFRESH_MS = 10 * 60 * 1000;
const MIN_RELOAD_GAP_MS = 20 * 1000;

function severityToCategory(severity: string): 'critical' | 'advisory' | 'navigational' {
  if (severity === 'HIGH') return 'critical';
  if (severity === 'MODERATE') return 'advisory';
  return 'navigational';
}

// IMD's fisherman-warning PDFs state wind/wave conditions as free text
// ("35 kmph to 45 kmph", "2.5 to 3.5 m") rather than a parsed number — the
// LLM extractor (backend/src/services/imd_fisherman_scraper.py) is
// deliberately told never to convert/round these itself, since a wrong
// converted number is worse than showing the source's own wording.
const IMD_SOURCES = new Set(['imd-fisherman-warning', 'imd-cyclone-warning', 'imd-sea-area-bulletin']);

const finiteOrNull = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

// The backend (and the offline recompute) only produce English text for its
// own weather/geofence alerts. Those messages are fixed templates around a few
// numbers that are also in `metadata`, so rebuild them in the user's language
// from that. Anything else — notably free-text IMD bulletins, which are IMD's
// own wording — keeps the server's message.
function localizedMessage(a: Alert, t: ReturnType<typeof getScreenText>): string {
  const meta = a.metadata || {};
  const A = t.alerts;
  const wind = finiteOrNull(meta.wind_speed_10m);
  const gust = finiteOrNull(meta.wind_gusts_10m);
  const rain = finiteOrNull(meta.precipitation_mm);
  const vis = finiteOrNull(meta.visibility_m);
  const wave = finiteOrNull(meta.wave_height_m);
  const dist = finiteOrNull(meta.distance_km);
  const boundary = meta.boundary != null ? String(meta.boundary) : null;

  let text: string | null = null;
  switch (a.type) {
    case 'HIGH_WIND':
      if (wind != null && gust != null) text = fillText(A.msgHighWind, { wind: Math.round(wind), gust: Math.round(gust) });
      break;
    case 'MODERATE_WIND':
      if (wind != null) text = fillText(A.msgModerateWind, { wind: Math.round(wind) });
      break;
    case 'HEAVY_RAIN':
      if (rain != null) text = fillText(A.msgHeavyRain, { rain: Math.round(rain) });
      break;
    case 'LOW_VISIBILITY':
      if (vis != null) text = fillText(A.msgLowVisibility, { vis: (vis / 1000).toFixed(1) });
      break;
    case 'THUNDERSTORM':
      text = A.msgThunderstorm;
      break;
    case 'DANGEROUS_WAVES':
      if (wave != null) text = fillText(A.msgDangerousWaves, { wave: wave.toFixed(1) });
      break;
    case 'HIGH_WAVES':
      if (wave != null) text = fillText(A.msgHighWaves, { wave: wave.toFixed(1) });
      break;
    case 'GEOFENCE_DANGER':
      if (dist != null && boundary) text = fillText(A.msgGeofenceDanger, { dist: dist.toFixed(1), boundary });
      break;
    case 'GEOFENCE_WARNING':
      if (dist != null && boundary) text = fillText(A.msgGeofenceWarning, { dist: dist.toFixed(1), boundary });
      break;
    case 'INTERNATIONAL_WATERS':
      text = A.msgInternationalWaters;
      break;
    case 'SYSTEM':
      text = A.msgSystem;
      break;
  }
  if (text == null) return a.message;
  // Offline-recomputed alerts carry a "[cached]" tag in the English message.
  return a.source === 'offline-cache' ? `${text} [${t.profile.cachedSuffix}]` : text;
}

function alertToCard(a: Alert, idx: number, portInfo: any, t: ReturnType<typeof getScreenText>) {
  const category = severityToCategory(a.severity);
  const meta = a.metadata || {};
  
  // Distance tag: e.g. "0 km (Port)" or "15 km" or "Maritime Border"
  let distance = t.alerts.distAtPort;
  if (meta.distance_km != null) {
    const d = Number(meta.distance_km);
    distance = d === 0 ? t.alerts.distAtPort : `${d.toFixed(1)} km`;
  } else if (a.source === 'geofence' || a.source === 'geofence-cache') {
    distance = t.alerts.maritimeBorder;
  }

  // Falls back to the raw backend code (readable, just untranslated) for
  // any alert type not yet in alertTypes — never crashes on a new one.
  const typeLabel = t.alerts.alertTypes[a.type] || t.alerts.imdAlertTypes[a.type] || a.type.replace(/_/g, ' ');

  // Wind speed display: checks numeric wind speed, gusts, or wind_conditions text
  let windVal = '—';
  if (meta.wind_speed_10m != null) {
    windVal = `${Math.round(Number(meta.wind_speed_10m))} km/h`;
  } else if (meta.wind_gusts_10m != null) {
    windVal = `${Math.round(Number(meta.wind_gusts_10m))} km/h`;
  } else if (meta.wind_conditions && a.source === 'imd-fisherman-warning') {
    windVal = String(meta.wind_conditions);
  } else if (meta.wind_conditions) {
    const match = String(meta.wind_conditions).match(/\d+(?:-\d+)?\s*(?:kmph|km\/h|knots|kts)/i);
    windVal = match ? match[0].replace(/kmph/i, 'km/h') : String(meta.wind_conditions).slice(0, 16);
  }

  // Status / Wave Height display
  // meta.status is backend English text; statusLabels maps the known ones and
  // anything else (e.g. IMD's own status wording) is shown as sent.
  const statusLabel = (s: string) => t.alerts.statusLabels[s] || s;
  let statusVal = '—';
  if (meta.wave_height_m != null) {
    statusVal = fillText(t.alerts.waveHeight, { n: Number(meta.wave_height_m).toFixed(1) });
  } else if (meta.wave_or_swell_conditions) {
    statusVal = String(meta.wave_or_swell_conditions);
  } else if (meta.status) {
    statusVal = statusLabel(String(meta.status));
  } else if (a.severity === 'HIGH') {
    statusVal = statusLabel('Critical Risk');
  } else if (a.severity === 'MODERATE') {
    statusVal = statusLabel('Caution');
  }

  const isImd = IMD_SOURCES.has(a.source || '');
  const detailRows: { label: string; text: string }[] = Array.isArray(meta.detail_rows) ? (meta.detail_rows as any[]) : [];

  return {
    id: `${a.type}-${idx}`,
    category,
    type: typeLabel,
    title: typeLabel,
    sub: a.source === 'geofence' || a.source === 'geofence-cache'
      ? `${t.alerts.boundaryPrefix} ${meta.boundary || t.alerts.unknownBoundary}`
      : isImd
      ? String(meta.region_label || meta.sea_area || meta.region_name || 'IMD')
      : t.alerts.weatherAdvisory,
    distText: distance,
    vector: windVal,
    breachTime: statusVal,
    // IMD alerts: the server's machine translation when it has one, with the
    // original English kept alongside (bodyOriginal) so the source wording of
    // a safety warning is always visible. Other alerts are rebuilt locally.
    body: a.message_translated || localizedMessage(a, t),
    bodyOriginal: a.message_translated ? a.message : '',
    coords: `${portInfo.latitude.toFixed(2)}° N, ${portInfo.longitude.toFixed(2)}° E`,
    // For IMD alerts show WHEN IMD issued the bulletin, not the phone's clock —
    // otherwise an old bulletin looks like it was just published.
    time: meta.issued_at_text
      ? fillText(t.alerts.imdIssuedCard, { text: String(meta.issued_at_text) })
      : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST',
    detailTitle: meta.detail_title ? String(meta.detail_title) : '',
    detailRows,
  };
}

export function AlertsScreen({ navigation }: any) {
  const { operatingPort, portInfo, getLanguageInfo } = useUserStore(
    useShallow((s) => ({ operatingPort: s.operatingPort, portInfo: s.portInfo, getLanguageInfo: s.getLanguageInfo }))
  );
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);

  const isOnline = useNetworkStore((s) => s.isOnline);
  const [loading, setLoading] = useState(false);
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [offlineAsOf, setOfflineAsOf] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'critical' | 'advisory' | 'navigational'>('all');
  // Per-alert, not a single shared boolean — that used to make acknowledging
  // one critical alert flip the "Acknowledged" label on every critical
  // alert card at once.
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  const [alertsList, setAlertsList] = useState<any[]>(PLACEHOLDER_ALERTS(portInfo, operatingPort, t.alerts.fetching));
  // How current the IMD data behind the cards is (null = offline/cached or not loaded yet).
  const [imdStatus, setImdStatus] = useState<ImdStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastLoadRef = useRef(0);

  useEffect(() => {
    loadAlerts(true);
    // Also re-run on language change — alertToCard translates the type/sub
    // labels using `t`, so switching language without changing port would
    // otherwise leave already-loaded cards showing the old language.
  }, [operatingPort, langInfo.code]);

  // Refetch whenever this tab is (re)opened and every 10 minutes while it is
  // open. Before this the screen fetched once at mount and never again.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => loadAlerts());
    const timer = setInterval(() => loadAlerts(true), AUTO_REFRESH_MS);
    return () => {
      unsubscribe?.();
      clearInterval(timer);
    };
  }, [operatingPort, langInfo.code, isOnline]);

  const manualRefresh = () => {
    setRefreshKey((k) => k + 1); // also reloads the zonal news feed
    loadAlerts(true);
  };

  const loadAlerts = async (force = false) => {
    // Skip if we just loaded (the focus event also fires right after mount).
    if (!force && Date.now() - lastLoadRef.current < MIN_RELOAD_GAP_MS) return;
    lastLoadRef.current = Date.now();
    setLoading(true);
    try {
      if (!isOnline) throw new Error('No network connection (known offline)');
      const { alerts: data, imdStatus: status } = await alertsAPI.getAlertsWithStatus(portInfo.latitude, portInfo.longitude, langInfo.code);
      // Show the backend's real alert list as-is (empty list = no active alerts,
      // which is a valid, meaningful result — not treated as a failure).
      setAlertsList(data.map((a, idx) => alertToCard(a, idx, portInfo, t)));
      setImdStatus(status);
      setIsOfflineData(false);
    } catch (err) {
      setImdStatus(null); // nothing live to describe — the offline banner takes over below
      console.error('[AlertsScreen] Live /alerts call failed, trying offline cache:', err);
      try {
        const bundle = await getCachedBundleForOffline();
        if (bundle) {
          const offlineAlerts = buildOfflineAlerts(bundle, portInfo.latitude, portInfo.longitude);
          setAlertsList(offlineAlerts.map((a, idx) => alertToCard(a as unknown as Alert, idx, portInfo, t)));
          setIsOfflineData(true);
          setOfflineAsOf(bundle.metadata.created);
        }
      } catch {
        // No cached bundle either — leave the placeholder cards showing.
      }
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
              <Text style={styles.sentryTitle}>{t.alerts.sentryActive} • {operatingPort.toUpperCase()} ({portInfo.state.toUpperCase()})</Text>
            </View>
          </View>

          <View style={styles.sentryBody}>
            <View style={styles.radarIconBox}>
              <MaterialCommunityIcons name="radar" size={24} color={colors.inversePrimary} />
            </View>
            <View style={styles.sentryTextCol}>
              <Text style={styles.sentryHeading}>{t.alerts.geofenceWatch}</Text>
              <View style={styles.sentryBadgesRow}>
                <Text style={styles.sentrySubBadge}>📍 {operatingPort}</Text>
              </View>
              <LocationSourceBadge />
            </View>
          </View>
        </View>

        {/* Zonal Coastal News Feed */}
        <ZonalNewsFeed refreshKey={refreshKey} />

        {/* Urgency Tab Filters */}
        <View style={styles.tabSection}>
          <Text style={styles.tabSectionTitle}>{t.alerts.severityQueues}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, filter === 'all' && styles.tabBtnActive]}
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>
                {t.alerts.all} ({alertsList.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, filter === 'critical' && styles.tabBtnActive]}
              onPress={() => setFilter('critical')}
            >
              <View style={[styles.filterDot, { backgroundColor: colors.error }]} />
              <Text style={[styles.tabText, filter === 'critical' && styles.tabTextActive]}>
                {t.alerts.critical} ({alertsList.filter((a) => a.category === 'critical').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, filter === 'advisory' && styles.tabBtnActive]}
              onPress={() => setFilter('advisory')}
            >
              <View style={[styles.filterDot, { backgroundColor: colors.riskModerate }]} />
              <Text style={[styles.tabText, filter === 'advisory' && styles.tabTextActive]}>
                {t.alerts.advisories} ({alertsList.filter((a) => a.category === 'advisory').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, filter === 'navigational' && styles.tabBtnActive]}
              onPress={() => setFilter('navigational')}
            >
              <View style={[styles.filterDot, { backgroundColor: colors.primaryContainer }]} />
              <Text style={[styles.tabText, filter === 'navigational' && styles.tabTextActive]}>
                {t.alerts.navigational} ({alertsList.filter((a) => a.category === 'navigational').length})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={colors.primaryContainer} />
            <Text style={styles.loadingText}>{t.alerts.fetching}</Text>
          </View>
        )}

        {!loading && isOfflineData && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.tertiary} />
            <Text style={styles.offlineBannerText}>
              {t.alerts.offlineNotice} ({formatRelativeTime(offlineAsOf)})
            </Text>
          </View>
        )}

        {/* IMD data freshness — always explicit when online */}
        {!isOfflineData && imdStatus && (() => {
          const b = imdStatus.bulletin;
          const refreshFailed = !!imdStatus.last_error || !!imdStatus.stale;
          const expired = b?.status === 'expired';
          const warn = refreshFailed || expired || b?.status === 'unknown';
          return (
            <View style={[styles.imdBanner, warn ? styles.imdBannerWarn : styles.imdBannerOk]}>
              <Ionicons
                name={warn ? 'warning-outline' : 'checkmark-circle-outline'}
                size={16}
                color={warn ? colors.tertiary : colors.secondary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.imdBannerTitle, { color: warn ? colors.tertiary : colors.secondary }]}>
                  {fillText(refreshFailed ? t.alerts.imdRefreshFailed : t.alerts.imdChecked, {
                    age: formatAge(t, imdStatus.age_minutes),
                  })}
                </Text>
                {b ? (
                  <Text style={styles.imdBannerText}>
                    {[
                      `${t.alerts.imdBulletinLabel}: ${
                        b.region_label ? fillText(t.alerts.imdRegion, { region: b.region_label.split(',')[0] }) + ' · ' : ''
                      }${fillText(t.alerts.imdIssuedLabel, { text: b.issued_at_text })}`,
                      b.valid_until_text ? fillText(t.alerts.imdValidUntil, { text: b.valid_until_text }) : null,
                      expired ? t.alerts.imdExpired : b.status === 'unknown' ? t.alerts.imdUnverified : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                ) : (
                  <Text style={styles.imdBannerText}>{t.alerts.imdNoBulletin}</Text>
                )}
                {!!imdStatus.last_error && <Text style={styles.imdBannerText}>{imdStatus.last_error}</Text>}
              </View>
              <TouchableOpacity onPress={manualRefresh} disabled={loading} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="refresh" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
          );
        })()}

        {!loading && !isOfflineData && filteredAlerts.length === 0 && (
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-circle-outline" size={20} color={colors.secondary} />
            <Text style={styles.emptyText}>{t.alerts.noActive}</Text>
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
                    <Text style={styles.telLabel}>{t.alerts.vectorSpeed}</Text>
                    <Text style={styles.telVal}>{item.vector}</Text>
                  </View>
                  <View style={styles.telCol}>
                    <Text style={styles.telLabel}>{t.alerts.statusEstimate}</Text>
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
                {!!item.bodyOriginal && <Text style={styles.alertBodyOriginal}>EN: {item.bodyOriginal}</Text>}

                {/* IMD detail: per-day wind/gust for open-sea areas, per-district swell */}
                {item.detailRows && item.detailRows.length > 0 && (
                  <View style={styles.detailBox}>
                    {!!item.detailTitle && <Text style={styles.detailTitle}>{item.detailTitle}</Text>}
                    {item.detailRows.map((row: { label: string; text: string }, i: number) => (
                      <View key={i} style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{row.label}</Text>
                        <Text style={styles.detailText}>{row.text}</Text>
                      </View>
                    ))}
                  </View>
                )}

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
                    <Text style={styles.actionBtnMapText}>{t.alerts.openMap}</Text>
                  </TouchableOpacity>

                  {item.category === 'critical' && (
                    <TouchableOpacity
                      style={styles.actionBtnAck}
                      onPress={() =>
                        setAcknowledgedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })
                      }
                    >
                      <Ionicons
                        name={acknowledgedIds.has(item.id) ? 'checkmark-circle' : 'bookmark-outline'}
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.actionBtnAckText}>
                        {acknowledgedIds.has(item.id) ? t.alerts.acknowledged : t.alerts.acknowledgeBuffer}
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
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.secondaryContainer,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
    flex: 1,
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
  alertBodyOriginal: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    opacity: 0.8,
    lineHeight: 16,
    marginTop: -4,
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
  imdBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  imdBannerOk: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
  },
  imdBannerWarn: {
    backgroundColor: '#FFF7E6',
    borderColor: colors.tertiaryContainer,
  },
  imdBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
  },
  imdBannerText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  detailBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 6,
  },
  detailTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailRow: {
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: 6,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 2,
  },
  detailText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
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
