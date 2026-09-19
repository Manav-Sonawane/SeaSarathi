import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/DashboardScreen';
import { CompassScreen } from '../screens/CompassScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { MapScreen } from '../screens/MapScreen';
import { PFZScreen } from '../screens/PFZScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { colors } from '../theme/colors';
import { useNetworkStore } from '../store/networkStore';
import { useUserStore } from '../store/userStore';
import { autoResyncIfNeeded } from '../services/offlineService';
import { getScreenText } from '../constants/screenTranslations';
import { StartupSplashScreen } from '../components/StartupSplashScreen';

export type RootTabParamList = {
  Dashboard: undefined;
  Compass: undefined;
  Chat: undefined;
  Map: undefined;
  PFZ: undefined;
  Alerts: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const initListener = useNetworkStore((s) => s.initListener);
  const loadFromBackend = useUserStore((s) => s.loadFromBackend);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const language = useUserStore((s) => s.language);
  const getLanguageInfo = useUserStore((s) => s.getLanguageInfo);
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);
  const wasOnline = useRef(isOnline);
  // Gates only the FIRST post-login render of this app process — once the
  // backend reports ready (or the splash gives up waiting), it never shows
  // again this session, even if the user logs out/in or the network blips.
  const [backendReady, setBackendReady] = useState(false);

  // Start the connectivity listener once for the whole app lifetime.
  useEffect(() => {
    const unsubscribe = initListener();
    return unsubscribe;
  }, []);

  // The user profile is persisted to AsyncStorage, which loads ASYNCHRONOUSLY
  // after first render. Until it finishes, the store still holds its
  // hard-coded defaults (demo user id, isLoggedIn: true) — syncing with the
  // backend or picking a screen based on those would act on the wrong
  // identity (e.g. fetch the demo profile, and briefly flash the main app
  // for someone who is actually logged out).
  const [hydrated, setHydrated] = useState(useUserStore.persist.hasHydrated());
  useEffect(() => {
    // Re-check inside the effect: hydration may have finished between the
    // useState initializer above and this subscription being registered.
    if (useUserStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useUserStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  // Reconcile the local (persisted) profile with the backend's copy once at
  // app start, regardless of which tab the user lands on first — this used
  // to only ever run inside ProfileScreen's own effect, so a cold start
  // landing on any other tab ran on stale/default profile data until the
  // user happened to visit Profile.
  useEffect(() => {
    if (hydrated) loadFromBackend();
  }, [hydrated]);

  // "Return to Shore" (UPDATE.md 3.4): detect offline → online and refresh
  // the offline bundle in the background if one already exists and is due
  // for a refresh (see autoResyncIfNeeded's own staleness/consent guards).
  useEffect(() => {
    if (!wasOnline.current && isOnline) {
      autoResyncIfNeeded();
    }
    wasOnline.current = isOnline;
  }, [isOnline]);

  // Same background as the auth/splash screens so the handoff isn't a flash.
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!isLoggedIn) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {!isOnline && (
          <View style={styles.offlineStrip}>
            <Ionicons name="cloud-offline-outline" size={13} color={colors.white} />
            <Text style={styles.offlineStripText}>No connection — using offline cached data</Text>
          </View>
        )}
        <AuthScreen />
      </View>
    );
  }

  if (!backendReady) {
    return <StartupSplashScreen isOnline={isOnline} onDone={() => setBackendReady(true)} />;
  }

  return (
    <NavigationContainer>
      <View style={{ flex: 1 }}>
        {!isOnline && (
          <View style={styles.offlineStrip}>
            <Ionicons name="cloud-offline-outline" size={13} color={colors.white} />
            <Text style={styles.offlineStripText}>No connection — using offline cached data</Text>
          </View>
        )}
        <Tab.Navigator
          screenOptions={{
            headerShown: true,
            headerTintColor: colors.primary,
            headerStyle: {
              backgroundColor: colors.surfaceContainerLowest,
            },
            headerTitleStyle: {
              fontWeight: '800',
            },
            tabBarShowLabel: false,
            tabBarActiveTintColor: colors.primaryContainer,
            tabBarInactiveTintColor: colors.onSurfaceVariant,
            // 56 = DESIGN.md's bar height; the bottom inset is added on top
            // so the gesture/nav bar (edge-to-edge on Android) never overlaps
            // the tab icons. A hard-coded 56 with no inset put them under it.
            tabBarStyle: {
              backgroundColor: colors.surfaceContainerLowest,
              borderTopColor: colors.surfaceContainerHigh,
              height: 56 + insets.bottom,
              paddingBottom: insets.bottom,
              paddingTop: 0,
            },
          }}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{
              headerShown: false,
              title: t.dashboard.title,
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Compass"
            component={CompassScreen}
            options={{
              title: t.compass.title,
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="compass-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Chat"
            component={ChatScreen}
            options={{
              title: langInfo.uiText.aiTitle,
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="chat-processing-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Map"
            component={MapScreen}
            options={{
              title: langInfo.uiText.viewMap,
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="map-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="PFZ"
            component={PFZScreen}
            options={{
              title: langInfo.uiText.fishingZones,
              tabBarIcon: ({ color, size }) => (
                <MaterialCommunityIcons name="fish" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Alerts"
            component={AlertsScreen}
            options={{
              title: t.dashboard.safetyWarnings,
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="shield-checkmark-outline" size={size} color={color} />
              ),
            }}
          />
          <Tab.Screen
            name="Profile"
            component={ProfileScreen}
            options={{
              title: t.profile.title,
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="person-outline" size={size} color={color} />
              ),
            }}
          />
        </Tab.Navigator>
      </View>
    </NavigationContainer>
  );
}



const styles = StyleSheet.create({
  offlineStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#B45309',
    paddingVertical: 4,
  },
  offlineStripText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.white,
  },
});
