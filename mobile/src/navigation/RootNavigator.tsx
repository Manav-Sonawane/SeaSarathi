import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
  const isOnline = useNetworkStore((s) => s.isOnline);
  const initListener = useNetworkStore((s) => s.initListener);
  const loadFromBackend = useUserStore((s) => s.loadFromBackend);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const language = useUserStore((s) => s.language);
  const getLanguageInfo = useUserStore((s) => s.getLanguageInfo);
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);
  const wasOnline = useRef(isOnline);

  // Start the connectivity listener once for the whole app lifetime.
  useEffect(() => {
    const unsubscribe = initListener();
    return unsubscribe;
  }, []);

  // Reconcile the local (persisted) profile with the backend's copy once at
  // app start, regardless of which tab the user lands on first — this used
  // to only ever run inside ProfileScreen's own effect, so a cold start
  // landing on any other tab ran on stale/default profile data until the
  // user happened to visit Profile.
  useEffect(() => {
    loadFromBackend();
  }, []);

  // "Return to Shore" (UPDATE.md 3.4): detect offline → online and refresh
  // the offline bundle in the background if one already exists and is due
  // for a refresh (see autoResyncIfNeeded's own staleness/consent guards).
  useEffect(() => {
    if (!wasOnline.current && isOnline) {
      autoResyncIfNeeded();
    }
    wasOnline.current = isOnline;
  }, [isOnline]);

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
            tabBarStyle: {
              backgroundColor: colors.surfaceContainerLowest,
              borderTopColor: colors.surfaceContainerHigh,
              height: 56,
              paddingBottom: 0,
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
