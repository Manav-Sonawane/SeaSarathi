module.exports = {
  expo: {
    name: "SeaSarathi",
    slug: "seasarathi",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
      }
    },
    android: {
      package: "com.seasarathi.app",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE"
      },
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      }
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-sqlite",
      "expo-font",
      "expo-dev-client"
    ],
    extra: {
      eas: {
        projectId: "161eb535-23e1-40e7-959d-a60e628b14eb"
      }
    }
  }
};
