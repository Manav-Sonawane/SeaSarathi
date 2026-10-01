import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp } from 'react-native';

/**
 * Lightweight entrance animation (fade + slide-up) using the built-in
 * Animated API — no new native dependency. Delay is staggered per item via
 * `index` so a list of cards animates in sequence instead of all at once.
 */
export function FadeInView({
  children,
  index = 0,
  style,
  staggerMs = 60,
  durationMs = 320,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
  staggerMs?: number;
  durationMs?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const delay = Math.min(index, 8) * staggerMs; // cap so long lists don't lag
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: durationMs,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
    // index/staggerMs/durationMs are stable for a given card's lifetime in a list
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
