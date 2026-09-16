import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { INDIAN_PORTS, INDIAN_LANGUAGES, PortInfo, LanguageInfo, landingSiteToPortInfo } from '../constants/portsAndLanguages';
import { profileAPI, landingAPI } from '../services/api';

export type VesselType = 'small' | 'medium' | 'large' | 'union';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type UserRole = 'fisherman' | 'union_leader';

const DEVICE_ID_FILENAME = 'seasarathi_device_id.txt';

// device_id doubles as this app's only access-control boundary: there's no
// separate auth layer, so POST/DELETE /profile trust whoever supplies the
// right device_id (see main.py's docstring on those endpoints). That makes
// it worth making hard to guess, not just unique — a single short
// Math.random() segment plus a timestamp (roughly guessable from an
// install date) wasn't. Concatenating multiple independent Math.random()
// draws isn't cryptographically secure, but at this length it's well
// beyond brute-forcing for what's actually at stake here (vessel prefs,
// no payment/PII) — matching the threat model, not overbuilding it with a
// full crypto RNG that would need a new native dependency and EAS rebuild.
function generateDeviceId(): string {
  const segment = () => Math.random().toString(36).substring(2, 10);
  return `device_${segment()}${segment()}${segment()}_${Date.now()}`;
}

// CRITICAL FIX: this used to check `window.localStorage` unconditionally and
// fall back to a single hardcoded constant ('device_seasarathi_default_01')
// whenever that check failed — which is EVERY native launch, since `window`
// never exists in React Native. Every real Android/iOS install was writing
// to the exact same backend profile record, overwriting whoever saved last.
//
// Fix: web keeps localStorage (synchronous, the right tool there). Native
// persists to a file via expo-file-system's synchronous API — chosen over
// AsyncStorage specifically because it's synchronous, so a real per-install
// ID is available immediately at store creation with no async race to
// reason about (AsyncStorage would require the store to start with a
// throwaway ID and swap it in later, risking an early syncWithBackend()
// call using the wrong one).
const getDeviceId = (): string => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      let id = window.localStorage.getItem('seasarathi_device_id');
      if (!id) {
        id = generateDeviceId();
        window.localStorage.setItem('seasarathi_device_id', id);
      }
      return id;
    } catch {
      // Fall through to file-based storage below.
    }
  }

  try {
    const file = new File(Paths.document, DEVICE_ID_FILENAME);
    if (file.exists) {
      const existing = file.textSync().trim();
      if (existing) return existing;
    }
    const id = generateDeviceId();
    file.write(id);
    return id;
  } catch {
    // Filesystem unavailable (shouldn't happen in practice) — at least
    // unique per app launch rather than a constant shared by every install.
    return generateDeviceId();
  }
};

/**
 * Two distinct, deliberately-separated location concepts:
 *
 * 1. HOME PORT (`homePort`/`homePortInfo`) — the fisherman's deliberately
 *    SELECTED official port from the ~20 curated major ports (Kochi, Mumbai
 *    Sassoon Dock, Veraval, etc. — see INDIAN_PORTS). Stable, only changes
 *    when the fisherman explicitly picks a different one in Profile or at
 *    sign-up. This is what gets registered with the backend (`operating_port`)
 *    and used for identity (Marine Fisher ID generation is keyed off it) —
 *    it should NOT silently change just because the phone's GPS moved.
 *
 * 2. CURRENT LOCATION (`currentLocation`) — the fisherman's real GPS/browser-
 *    geolocation position, bound to the nearest of all ~1223 real landing
 *    locations (not just the curated 20) via GET /landing/nearest. Optional
 *    (null until the fisherman taps "Use My Current Location"), ephemeral in
 *    intent (expected to be refreshed/re-bound as they actually move), and
 *    never touches `homePort`.
 *
 * `operatingPort`/`portInfo` remain the EFFECTIVE location every existing
 * consumer (chat, map, alerts, PFZ) already reads for "where is this
 * fisherman right now" — kept as the resolved value of
 * `currentLocation ?? homePortInfo` rather than renaming it everywhere,
 * which would have meant touching every screen for no functional gain.
 * Setting a home port always also updates the effective location (and
 * clears any stale current-location binding, since picking a port IS
 * telling the app "treat me as being here" — see setOperatingPort);
 * binding a current location updates the effective location without ever
 * touching the home port.
 */
export interface UserProfileState {
  deviceId: string;
  userId: string;
  userName: string;
  vesselType: VesselType;
  riskTolerance: RiskTolerance;
  homePort: string;
  homePortInfo: PortInfo;
  currentLocation: PortInfo | null;
  operatingPort: string;
  portInfo: PortInfo;
  role: UserRole;
  language: string;
  isLoggedIn: boolean;
  isBackendSynced: boolean;

  setUserId: (userId: string) => void;
  setUserName: (userName: string) => void;
  setVesselType: (vessel: VesselType) => void;
  setRiskTolerance: (risk: RiskTolerance) => void;
  // Sets the HOME PORT (from the curated major-port list) — also clears any
  // active current-location binding, since deliberately picking a port is
  // the fisherman telling the app to go back to using it as "where I am".
  setOperatingPort: (portName: string) => void;
  // Binds real GPS/geolocation coordinates to the nearest of all ~1223
  // landing locations as the CURRENT LOCATION — leaves homePort untouched.
  setCurrentLocationFromCoords: (latitude: number, longitude: number) => Promise<{ success: boolean; portInfo?: PortInfo; error?: string }>;
  // Drops the current-location binding; effective location reverts to the home port.
  clearCurrentLocation: () => void;
  setRole: (role: UserRole) => void;
  setLanguage: (langCode: string) => void;
  getVesselRangeKm: () => number;
  getLanguageInfo: () => LanguageInfo;
  loginWithProfile: (profile: any) => void;
  logout: () => void;
  signUp: (params: {
    name: string;
    operatingPort: string;
    vesselType: VesselType;
    role: UserRole;
    language: string;
    riskTolerance: RiskTolerance;
    password?: string;
  }) => Promise<{ success: boolean; userId?: string; error?: string }>;
  syncWithBackend: () => Promise<boolean>;
  loadFromBackend: () => Promise<boolean>;
}

const defaultPort = INDIAN_PORTS.find((p) => p.name === 'Kochi') || INDIAN_PORTS[0];

// Home port resolution is deliberately simple — always one of the curated
// major ports, looked up by name. Unlike current-location, it never needs
// coordinate reconstruction from `extra`: the name alone is enough since
// INDIAN_PORTS is a fixed, known list.
function resolveHomePort(operatingPort: string): PortInfo {
  return INDIAN_PORTS.find((p) => p.name.toLowerCase() === operatingPort.toLowerCase()) || INDIAN_PORTS[0];
}

// Current-location IS reconstructed from raw lat/lon (persisted in the
// backend profile's `extra` bag) because it can be any of ~1223 real
// landing locations, not just a name in a fixed list.
function resolveCurrentLocation(extra?: Record<string, any> | null): PortInfo | null {
  const lat = extra?.current_location_latitude;
  const lon = extra?.current_location_longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return landingSiteToPortInfo({
    name: extra?.current_location_name || 'Current Location',
    sector: extra?.current_location_sector || '',
    district: extra?.current_location_district || '',
    latitude: lat,
    longitude: lon,
  });
}

// Always sent on every profile save (not just when current-location is
// set) — extra_json is fully REPLACED, not merged, on every backend save
// (see backend/src/db/profile_db.py's upsert_profile docstring), so
// omitting this on an unrelated update (e.g. just changing risk tolerance)
// would silently wipe a previously-bound current location. Explicit nulls
// when there's no current-location binding, so a stale one from a prior
// save gets cleared rather than lingering.
function buildCurrentLocationExtra(currentLocation: PortInfo | null): Record<string, any> {
  if (!currentLocation) {
    return {
      current_location_latitude: null,
      current_location_longitude: null,
      current_location_name: null,
      current_location_district: null,
      current_location_sector: null,
    };
  }
  return {
    current_location_latitude: currentLocation.latitude,
    current_location_longitude: currentLocation.longitude,
    current_location_name: currentLocation.name,
    current_location_district: currentLocation.region,
    current_location_sector: currentLocation.state,
  };
}

// Persisted locally (AsyncStorage) so a cold start — especially offline,
// where there's no backend to load from at all — comes back with the
// fisherman's real saved vessel/port/language instead of silently
// resetting to these hardcoded defaults (medium boat, Kochi, English)
// every single launch. loadFromBackend() (called once at RootNavigator
// mount) still reconciles with the server afterwards whenever online, so
// this is a local cache of the last-known-good profile, not the source of
// truth.
export const useUserStore = create<UserProfileState>()(
  persist(
    (set, get) => ({
      deviceId: getDeviceId(),
      userId: 'USR-KOC-4821',
      userName: 'Ramesh Kumar',
      vesselType: 'medium',
      riskTolerance: 'moderate',
      homePort: 'Kochi',
      homePortInfo: defaultPort,
      currentLocation: null,
      operatingPort: 'Kochi',
      portInfo: defaultPort,
      role: 'fisherman',
      language: 'en',
      isLoggedIn: true,
      isBackendSynced: false,

      setUserId: (userId) => set({ userId }),
      setUserName: (userName) => set({ userName }),
      setVesselType: (vesselType) => set({ vesselType }),
      setRiskTolerance: (riskTolerance) => set({ riskTolerance }),
      setOperatingPort: (portName) => {
        const found = resolveHomePort(portName);
        // Picking a home port is a deliberate "I'm operating from here now"
        // action — clear any stale GPS-derived current-location binding so
        // it doesn't silently keep overriding the port the fisherman just chose.
        set({ homePort: found.name, homePortInfo: found, currentLocation: null, operatingPort: found.name, portInfo: found });
      },
      // Binds the fisherman's real GPS/browser-geolocation position to
      // their actual nearest landing location — searched across all 1223
      // points in LANDING-LOCATIONS.geojson (GET /landing/nearest), not
      // just the ~20 curated major ports in INDIAN_PORTS. Matters most for
      // the ~40 real landing locations sitting in the ~200km gap between
      // Gujarat's southernmost major port and Mumbai's northernmost one —
      // a fisherman operating from one of those was previously forced to
      // pick a major port potentially 100km+ from where they actually are.
      // Does NOT touch homePort/homePortInfo.
      setCurrentLocationFromCoords: async (latitude, longitude) => {
        try {
          const sites = await landingAPI.getNearest(latitude, longitude, 1);
          if (!sites.length) return { success: false, error: 'No landing location found nearby' };
          const location = landingSiteToPortInfo(sites[0]);
          set({ currentLocation: location, operatingPort: location.name, portInfo: location });
          return { success: true, portInfo: location };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Could not resolve location' };
        }
      },
      clearCurrentLocation: () => {
        const { homePortInfo } = get();
        set({ currentLocation: null, operatingPort: homePortInfo.name, portInfo: homePortInfo });
      },
      setRole: (role) => set({ role }),
      setLanguage: (language) => set({ language }),

      loginWithProfile: (profile) => {
        const homePortInfo = resolveHomePort(profile.operating_port);
        const currentLocation = resolveCurrentLocation(profile.extra);
        const effective = currentLocation || homePortInfo;
        set({
          userId: profile.user_id || '',
          userName: profile.name || 'Fisherman',
          deviceId: profile.device_id || get().deviceId,
          vesselType: (profile.vessel_type as VesselType) || 'medium',
          riskTolerance: (profile.risk_tolerance as RiskTolerance) || 'moderate',
          homePort: homePortInfo.name,
          homePortInfo,
          currentLocation,
          operatingPort: effective.name,
          portInfo: effective,
          role: (profile.role as UserRole) || 'fisherman',
          language: profile.language || 'en',
          isLoggedIn: true,
          isBackendSynced: true,
        });
      },

      logout: () => {
        set({ isLoggedIn: false });
      },

      signUp: async (params) => {
        const { deviceId } = get();
        const homePortInfo = resolveHomePort(params.operatingPort);
        try {
          const res = await profileAPI.upsertProfile({
            device_id: deviceId,
            name: params.name,
            password: params.password || 'SeaSarathi@2026',
            operating_port: homePortInfo.name,
            vessel_type: params.vesselType,
            role: params.role,
            language: params.language,
            risk_tolerance: params.riskTolerance,
            // No current-location binding exists yet at sign-up time.
            extra: buildCurrentLocationExtra(null),
          });

          set({
            userId: res.user_id,
            userName: res.name,
            vesselType: res.vessel_type as VesselType,
            riskTolerance: res.risk_tolerance as RiskTolerance,
            homePort: homePortInfo.name,
            homePortInfo,
            currentLocation: null,
            operatingPort: homePortInfo.name,
            portInfo: homePortInfo,
            role: res.role as UserRole,
            language: res.language,
            isLoggedIn: true,
            isBackendSynced: true,
          });
          return { success: true, userId: res.user_id };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Sign up failed' };
        }
      },

      getVesselRangeKm: () => {
        const { vesselType } = get();
        switch (vesselType) {
          case 'small':
            return 9;
          case 'medium':
            return 22;
          case 'large':
            return 370;
          case 'union':
            return 500;
          default:
            return 22;
        }
      },

      getLanguageInfo: () => {
        const { language } = get();
        return INDIAN_LANGUAGES.find((l) => l.code === language) || INDIAN_LANGUAGES[0];
      },

      syncWithBackend: async () => {
        const { deviceId, userId, userName, vesselType, riskTolerance, homePort, currentLocation, role, language } = get();
        try {
          const res = await profileAPI.upsertProfile({
            device_id: deviceId,
            user_id: userId || undefined,
            name: userName,
            vessel_type: vesselType,
            risk_tolerance: riskTolerance,
            // The backend's operating_port is the HOME PORT (identity),
            // never the ephemeral current-location.
            operating_port: homePort,
            role: role,
            language: language,
            extra: buildCurrentLocationExtra(currentLocation),
          });
          set({
            userId: res.user_id,
            userName: res.name,
            isBackendSynced: true,
          });
          return true;
        } catch {
          set({ isBackendSynced: false });
          return false;
        }
      },

      loadFromBackend: async () => {
        const { deviceId, userId } = get();
        const identifier = userId || deviceId;
        try {
          const profile = await profileAPI.getProfile(identifier);
          if (profile) {
            const homePortInfo = resolveHomePort(profile.operating_port);
            const currentLocation = resolveCurrentLocation(profile.extra);
            const effective = currentLocation || homePortInfo;
            set({
              userId: profile.user_id,
              userName: profile.name,
              vesselType: profile.vessel_type as VesselType,
              riskTolerance: profile.risk_tolerance as RiskTolerance,
              homePort: homePortInfo.name,
              homePortInfo,
              currentLocation,
              operatingPort: effective.name,
              portInfo: effective,
              role: profile.role as UserRole,
              language: profile.language,
              isBackendSynced: true,
            });
            return true;
          }
        } catch {
          // Backend not reached or profile not yet created
        }
        return false;
      },
    }),
    {
      name: 'seasarathi-user-profile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        userId: state.userId,
        userName: state.userName,
        vesselType: state.vesselType,
        riskTolerance: state.riskTolerance,
        homePort: state.homePort,
        homePortInfo: state.homePortInfo,
        currentLocation: state.currentLocation,
        operatingPort: state.operatingPort,
        portInfo: state.portInfo,
        role: state.role,
        language: state.language,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);
