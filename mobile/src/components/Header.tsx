import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface HeaderProps {
  subtitle: string;
}

export function Header({ subtitle }: HeaderProps) {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.topRow}>
        <View style={styles.brandGroup}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="anchor" size={22} color={colors.white} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.brandTitle}>SeaSarathi</Text>
            <Text style={styles.brandSubtitle}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.gpsBadge}>
          <View style={styles.pulseDot} />
          <Text style={styles.gpsText}>GPS LOCK</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.locationGroup}>
          <Ionicons name="location-sharp" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.locationText}>Kochi Harbor 9.93°N, 76.26°E</Text>
        </View>

        <View style={styles.cacheGroup}>
          <Ionicons name="cloud-done" size={14} color={colors.secondary} />
          <Text style={styles.cacheText}>CACHE OK</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: colors.surfaceContainerLowest,
    paddingTop: 48,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerHigh,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleGroup: {
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    lineHeight: 20,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.secondaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.secondary,
  },
  gpsText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSecondaryContainer,
    letterSpacing: 0.5,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  cacheGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cacheText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
  },
});
