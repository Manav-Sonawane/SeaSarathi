import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useUserStore } from '../store/userStore';

/**
 * Red-tinted, touch-transparent overlay for night fishing — the same
 * convention used on ship bridges and in aviation cockpits: red light
 * preserves scotopic (night) vision far better than white light, so a
 * fisherman checking the app on deck at 3am doesn't blow out their eyes.
 */
export function NightModeOverlay() {
  const nightMode = useUserStore((s) => s.nightMode);
  if (!nightMode) return null;
  return <View style={styles.overlay} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(120, 0, 0, 0.5)',
    zIndex: 9999,
    elevation: 9999, // Android draws by elevation, not just zIndex
  },
});
