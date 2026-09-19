import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { newsAPI, ZoneBulletin } from '../services/api';
import { useUserStore } from '../store/userStore';
import { useShallow } from 'zustand/react/shallow';
import { getScreenText } from '../constants/screenTranslations';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Maps a zone id (backend src/services/imd_news_feed.py's ZONES) to the
// state names the app already knows the fisherman's current state by (see
// userStore.ts's portInfo.state), so the feed can default-select the zone
// the fisherman is actually in instead of always opening on the first tab.
const ZONE_STATES: Record<string, string[]> = {
  'gj-mh': ['GUJARAT', 'MAHARASHTRA'],
  'goa-ka-kl': ['GOA', 'KARNATAKA', 'KERALA'],
  'tn-py': ['TAMIL NADU', 'PUDUCHERRY'],
  'ap-od': ['ANDHRA PRADESH', 'ODISHA'],
  'wb': ['WEST BENGAL'],
};
const ZONE_SHORT_LABEL: Record<string, string> = {
  'gj-mh': 'GJ-MH',
  'goa-ka-kl': 'GOA-KA-KL',
  'tn-py': 'TN-PY',
  'ap-od': 'AP-OD',
  'wb': 'WB',
};

function severityColor(sev: string): string {
  if (sev === 'HIGH') return colors.error;
  if (sev === 'MODERATE') return colors.riskModerate;
  return colors.secondary;
}

function formatRelative(iso: string, t: ReturnType<typeof getScreenText>): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  const time = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
  return t.alerts.zonalNewsUpdated.replace('{time}', time);
}

/**
 * Collapsible, navigable multi-zone coastal news feed for the Alerts
 * screen. Backed by GET /news/feed (src/services/imd_news_feed.py) — the
 * same IMD live-feed data already behind the point-based /alerts call,
 * grouped into coastal zones (Gujarat-Maharashtra, Goa-Karnataka-Kerala,
 * etc., the way IMD's own site and other marine forecasters split the
 * coast) and rewritten as short news-anchor-style bulletins rather than
 * raw structured warning data.
 */
export function ZonalNewsFeed({ refreshKey = 0 }: { refreshKey?: number }) {
  const { portInfo, getLanguageInfo } = useUserStore(
    useShallow((s) => ({ portInfo: s.portInfo, getLanguageInfo: s.getLanguageInfo }))
  );
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);

  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [zones, setZones] = useState<ZoneBulletin[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await newsAPI.getFeed();
      setZones(data.zones);
      setActiveZoneId((prev) => {
        if (prev && data.zones.some((z) => z.zone_id === prev)) return prev;
        const stateUpper = (portInfo.state || '').toUpperCase();
        const homeZone = data.zones.find((z) => (ZONE_STATES[z.zone_id] || []).includes(stateUpper));
        return (homeZone || data.zones[0])?.zone_id ?? null;
      });
    } catch (err) {
      console.error('[ZonalNewsFeed] /news/feed failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  // Reload when the parent asks (Alerts refresh) and every 10 minutes, so a
  // screen left open for hours/days never keeps showing an old bulletin.
  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  const activeZone = zones.find((z) => z.zone_id === activeZoneId) || null;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={toggleExpanded} activeOpacity={0.7}>
        <View style={styles.headerLeft}>
          <View style={styles.liveDot} />
          <MaterialCommunityIcons name="newspaper-variant-outline" size={16} color={colors.onSurface} />
          <View>
            <Text style={styles.title}>{t.alerts.zonalNewsTitle}</Text>
            <Text style={styles.subtitle}>{t.alerts.zonalNewsSubtitle}</Text>
          </View>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.onSurfaceVariant} />
      </TouchableOpacity>

      {expanded && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={styles.tabRowContent}>
            {zones.map((z) => {
              const active = z.zone_id === activeZoneId;
              return (
                <TouchableOpacity
                  key={z.zone_id}
                  style={[styles.zoneTab, active && styles.zoneTabActive]}
                  onPress={() => setActiveZoneId(z.zone_id)}
                >
                  <View style={[styles.zoneTabDot, { backgroundColor: severityColor(z.severity) }]} />
                  <Text style={[styles.zoneTabText, active && styles.zoneTabTextActive]}>
                    {ZONE_SHORT_LABEL[z.zone_id] || z.zone_label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {loading && (
            <View style={styles.statusBox}>
              <ActivityIndicator size="small" color={colors.primaryContainer} />
              <Text style={styles.statusText}>{t.alerts.fetching}</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.statusBox}>
              <Text style={styles.errorText}>{t.alerts.zonalNewsLoadFailed}</Text>
              <TouchableOpacity onPress={load} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>{t.alerts.zonalNewsRetry}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && activeZone && (
            <View style={[styles.bulletin, { borderLeftColor: severityColor(activeZone.severity) }]}>
              <View style={styles.bulletinHeaderRow}>
                <Text style={styles.bulletinHeadline}>{activeZone.headline}</Text>
                <View style={[styles.countBadge, { backgroundColor: severityColor(activeZone.severity) }]}>
                  <Text style={styles.countBadgeText}>{activeZone.alert_count}</Text>
                </View>
              </View>
              <Text style={styles.bulletinBody}>{activeZone.body}</Text>
              <Text style={styles.bulletinMeta}>
                {activeZone.alert_count === 0
                  ? t.alerts.zonalNewsNoWarnings
                  : t.alerts.zonalNewsWarningsActive.replace('{count}', String(activeZone.alert_count))}
                {'  •  '}
                {/* When IMD's data was last fetched — not when this text was composed. */}
                {formatRelative(activeZone.imd_checked_at || activeZone.generated_at, t)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.secondary,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onSurface,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  tabRow: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerHigh,
  },
  tabRowContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  zoneTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  zoneTabActive: {
    backgroundColor: colors.primaryContainer,
  },
  zoneTabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  zoneTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  zoneTabTextActive: {
    color: colors.white,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  statusText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerHigh,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  bulletin: {
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 12,
    borderLeftWidth: 3,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 8,
  },
  bulletinHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  bulletinHeadline: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.onSurface,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
  bulletinBody: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.onSurfaceVariant,
    marginBottom: 8,
  },
  bulletinMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
    opacity: 0.8,
  },
});
