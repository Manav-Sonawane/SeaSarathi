import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { MapScreen } from '../screens/MapScreen';
import { PFZScreen } from '../screens/PFZScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors } from '../theme/colors';
import { useNetworkStore } from '../store/networkStore';
import { autoResyncIfNeeded } from '../services/offlineService';

export type RootTabParamList = {
  Dashboard: undefined;
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
  const wasOnline = useRef(isOnline);

  // Start the connectivity listener once for the whole app lifetime.
  useEffect(() => {
    const unsubscribe = initListener();
    return unsubscribe;
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

  return (
    <NavigationContainer>
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
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            title: 'AI Chat',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="chat-processing-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{
            title: 'Marine Map',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="PFZ"
          component={PFZScreen}
          options={{
            title: 'Fishing Zones',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="fish" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Alerts"
          component={AlertsScreen}
          options={{
            title: 'Safety Alerts',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="shield-checkmark-outline" size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            title: 'User Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
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
