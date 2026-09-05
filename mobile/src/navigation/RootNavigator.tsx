import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ChatScreen } from '../screens/ChatScreen';
import { MapScreen } from '../screens/MapScreen';
import { PFZScreen } from '../screens/PFZScreen';
import { AlertsScreen } from '../screens/AlertsScreen';
import { colors } from '../theme/colors';

export type RootTabParamList = {
  Chat: undefined;
  Map: undefined;
  PFZ: undefined;
  Alerts: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerTintColor: colors.black,
          tabBarActiveTintColor: colors.blue,
          tabBarInactiveTintColor: colors.gray,
        }}
      >
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="PFZ" component={PFZScreen} options={{ title: 'Fishing Zones' }} />
        <Tab.Screen name="Alerts" component={AlertsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
