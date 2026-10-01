import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { NightModeOverlay } from './src/components/NightModeOverlay';

export default function App() {
  // Android draws edge-to-edge (behind the status + gesture bars), so every
  // screen needs real insets — SafeAreaProvider supplies them to
  // react-native-safe-area-context's SafeAreaView / useSafeAreaInsets.
  return (
    <SafeAreaProvider>
      <RootNavigator />
      <NightModeOverlay />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
