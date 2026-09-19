// Backend the installed app talks to. EXPO_PUBLIC_* values are inlined into the
// JS bundle at BUILD time, so a release APK is pinned to whatever this is when
// it's built — unlike `expo start`, there is no dev-server host to auto-detect
// (see src/services/api.ts). For EAS builds set it with
// `eas env:create` (see ../ANDROID_BUILD.md); for local builds put it in .env.
const API_URL = process.env.EXPO_PUBLIC_API_URL || '';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// A release APK silently pointed at the wrong backend (or none) just shows a
// splash screen that never gets ready — refuse to produce one instead.
const isReleaseEasBuild = ['preview', 'production'].includes(process.env.EAS_BUILD_PROFILE || '');
if (isReleaseEasBuild && !API_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set for this EAS build profile. A release APK cannot auto-detect ' +
      'the backend. Set it with: eas env:create --environment ' +
      `${process.env.EAS_BUILD_PROFILE} --name EXPO_PUBLIC_API_URL --value https://<your-backend> --visibility plaintext`
  );
}
if (isReleaseEasBuild && !GOOGLE_MAPS_API_KEY) {
  console.warn('[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set — the Map screen will render blank on Android.');
}

// Android 9+ blocks plain http:// in release builds. Only relax that when the
// configured backend is actually http (e.g. a LAN IP during testing) — an
// https:// backend (ngrok, deployed server) keeps the safer default.
const usesCleartextTraffic = /^http:\/\//i.test(API_URL);

module.exports = {
  expo: {
    name: "SeaSarathi",
    slug: "seasarathi",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ios: {
      bundleIdentifier: "com.seasarathi.app",
      supportsTablet: true,
      config: {
        googleMapsApiKey: GOOGLE_MAPS_API_KEY
      }
    },
    android: {
      package: "com.seasarathi.app",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png"
      },
      // The per-install device id (userStore.ts) lives in app storage. With
      // backup on, restoring to a new phone would clone it — two devices then
      // share one backend profile.
      allowBackup: false,
      config: {
        googleMaps: {
          apiKey: GOOGLE_MAPS_API_KEY
        }
      }
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-sqlite",
      "expo-font",
      "expo-dev-client",
      [
        "expo-audio",
        {
          microphonePermission: "Allow SeaSarathi to use the microphone to transcribe your voice queries."
        }
      ],
      [
        "expo-location",
        {
          // Foreground only (GPS position for the Compass and "use my current
          // location", plus the compass heading sensor) — nothing needs
          // location while the app is closed, so no background permission.
          locationWhenInUsePermission: "Allow SeaSarathi to use your location to find the nearest port and fishing zones.",
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic
          }
        }
      ]
    ],
    extra: {
      eas: {
        projectId: "161eb535-23e1-40e7-959d-a60e628b14eb"
      }
    }
  }
};
