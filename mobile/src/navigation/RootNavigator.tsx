import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ChatScreen } from '../screens/ChatScreen';
import { MapScreen } from '../screens/MapScreen';
import { PFZScreen } from '../screens/PFZScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { colors } from '../theme/colors';

export type RootTabParamList = {
  Chat: undefined;
  Map: undefined;
  PFZ: undefined;
  Alerts: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
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
          tabBarActiveTintColor: colors.primaryContainer,
          tabBarInactiveTintColor: colors.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: colors.surfaceContainerLowest,
            borderTopColor: colors.surfaceContainerHigh,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
          },
        }}
      >
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
