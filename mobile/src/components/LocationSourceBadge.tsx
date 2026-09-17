import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/userStore';
import { getScreenText } from '../constants/screenTranslations';
import { useShallow } from 'zustand/react/shallow';

/**
 * Makes it visible on-screen which location is actually driving what a
 * fisherman sees, wherever it's dropped in (Dashboard/Alerts/Chat headers).
 *
 * Why this exists: `portInfo` (what every screen's chat/alerts/map/PFZ call
 * reads) silently resolves to `currentLocation ?? homePortInfo` — a real
 * GPS-bound Current Location always overrides the deliberately-selected
 * Home Port for every real-time query (see userStore.ts). That's the
 * correct safety behavior (a fisherman physically in Mumbai needs Mumbai's
 * storm data, not a port he's merely registered under 400km away), but
 * without this badge that switch was invisible outside the Profile screen —
 * nothing told him *which* location's data he was actually looking at.
 */
export function LocationSourceBadge() {
  const { currentLocation, portInfo } = useUserStore(
    useShallow((s) => ({ currentLocation: s.currentLocation, portInfo: s.portInfo }))
  );
  const langCode = useUserStore((s) => s.getLanguageInfo().code);
  const t = getScreenText(langCode);

  const isCurrentLocation = currentLocation !== null;
  const label = (isCurrentLocation ? t.common.showingCurrentLocation : t.common.showingHomePort).replace(
    '{name}',
    portInfo.name
  );

  return (
    <View style={[styles.badge, isCurrentLocation ? styles.badgeCurrent : styles.badgeHome]}>
      <Ionicons
        name={isCurrentLocation ? 'navigate' : 'location'}
        size={12}
        color={isCurrentLocation ? colors.secondary : colors.onSurfaceVariant}
      />
      <Text style={[styles.badgeText, isCurrentLocation && styles.badgeTextCurrent]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeHome: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.surfaceContainerHigh,
  },
  badgeCurrent: {
    backgroundColor: colors.secondaryContainer,
    borderColor: colors.secondary,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  badgeTextCurrent: {
    color: colors.onSecondaryContainer,
  },
});
