import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Marine Map</Text>
      <Text style={styles.body}>
        PFZ zones, risk heatmap, and geofence layers will render here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.black,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: colors.darkGray,
  },
});
