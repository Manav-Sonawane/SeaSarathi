import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { healthAPI, API_BASE_URL } from '../services/api';

const POLL_INTERVAL_MS = 3000;
// Copernicus grid fetch is ~90s on a genuinely cold start (see backend
// src/utils/data_freshness.py) — 20 polls at 3s gives ~60s before this
// gives up and lets the fisherman in anyway with a "still loading" notice.
// This is a safety app: it must never trap someone on a splash screen
// indefinitely just because a background fetch is slow or the network
// hiccups.
const MAX_POLLS = 20;

/**
 * Gates the main app behind the backend's /health/ready check so screens
 * don't render silently-null telemetry (0 wind, 0 waves, "SAFE") during the
 * backend's Copernicus grid cold-start fetch and look like a bug rather
 * than "still loading". Skips itself entirely when offline — the app's
 * offline-cache path is a fully supported experience that doesn't need the
 * live backend at all.
 */
export function StartupSplashScreen({
  isOnline,
  onDone,
}: {
  isOnline: boolean;
  onDone: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [imdStatus, setImdStatus] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      onDone();
      return;
    }
    cancelled.current = false;

    const poll = async (n: number) => {
      if (cancelled.current) return;
      try {
        const info = await healthAPI.getReadiness();
        setImdStatus(`${info.imd.sources_cached}/${info.imd.sources_total}`);
        if (info.ready) {
          onDone();
          return;
        }
      } catch {
        // Backend unreachable — treat exactly like "not ready yet" and keep
        // polling; only the attempt cap below decides when to give up.
      }
      if (cancelled.current) return;
      if (n + 1 >= MAX_POLLS) {
        setGaveUp(true);
        return;
      }
      setAttempt(n + 1);
      setTimeout(() => poll(n + 1), POLL_INTERVAL_MS);
    };

    poll(0);
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  if (!isOnline) return null;

  return (
    <View style={styles.container}>
      <View style={styles.iconBox}>
        <MaterialCommunityIcons name="waves-arrow-up" size={40} color={colors.white} />
      </View>
      <Text style={styles.title}>SeaSarathi</Text>
      <Text style={styles.subtitle}>Loading live marine data…</Text>

      {!gaveUp ? (
        <>
          <ActivityIndicator size="large" color={colors.primaryContainer} style={styles.spinner} />
          <Text style={styles.detail}>Fetching SST / chlorophyll grid{attempt > 0 ? ` (attempt ${attempt + 1})` : ''}</Text>
          {imdStatus && <Text style={styles.detailMuted}>IMD live feeds: {imdStatus} ready</Text>}
        </>
      ) : (
        <>
          <Text style={styles.detail}>Taking longer than usual — you can continue with partial data.</Text>
          <Text style={styles.detailMuted}>Backend: {API_BASE_URL || 'NOT CONFIGURED (build has no EXPO_PUBLIC_API_URL)'}</Text>
          <TouchableOpacity style={styles.continueBtn} onPress={onDone}>
            <Text style={styles.continueBtnText}>Continue anyway</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.inverseSurface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 32,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.inverseOnSurface,
    opacity: 0.85,
    marginBottom: 20,
  },
  spinner: {
    marginBottom: 16,
  },
  detail: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.inverseOnSurface,
    textAlign: 'center',
    opacity: 0.8,
  },
  detailMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inverseOnSurface,
    opacity: 0.55,
    marginTop: 4,
  },
  continueBtn: {
    marginTop: 16,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  continueBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
  },
});
